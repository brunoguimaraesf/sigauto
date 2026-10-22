BEGIN;

CREATE TABLE IF NOT EXISTS public.login_tentativa (
  chave_hash text PRIMARY KEY CHECK (chave_hash ~ '^[0-9a-f]{64}$'),
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  bloqueado_ate timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_tentativa_atualizado_em
  ON public.login_tentativa (atualizado_em);

CREATE TABLE IF NOT EXISTS public.login_tentativa_reserva (
  id uuid PRIMARY KEY,
  chave_hash text NOT NULL REFERENCES public.login_tentativa (chave_hash) ON DELETE CASCADE,
  expira_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_tentativa_reserva_chave
  ON public.login_tentativa_reserva (chave_hash, expira_em);

ALTER TABLE public.login_tentativa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_tentativa_reserva ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.login_tentativa FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.login_tentativa_reserva FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_tentativa TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_tentativa_reserva TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_tentativa_login(
  p_chave text,
  p_operacao text,
  p_limite integer DEFAULT 5,
  p_duracao_segundos integer DEFAULT 900,
  p_reserva uuid DEFAULT NULL
)
RETURNS TABLE (permitido boolean, tentativas integer, bloqueado_ate timestamptz, reserva_confirmada boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_tentativas integer;
  v_bloqueado_ate timestamptz;
  v_reservas integer;
  v_reservas_expiradas integer;
  v_reserva_removida uuid;
BEGIN
  IF p_chave IS NULL OR p_chave !~ '^[0-9a-f]{64}$'
     OR p_operacao IS NULL OR p_operacao NOT IN ('consultar', 'reservar', 'falha', 'sucesso', 'liberar')
     OR p_limite IS NULL OR p_limite < 1 OR p_limite > 20
     OR p_duracao_segundos IS NULL OR p_duracao_segundos < 60 OR p_duracao_segundos > 86400
     OR (p_operacao IN ('reservar', 'falha', 'sucesso', 'liberar') AND p_reserva IS NULL) THEN
    RAISE EXCEPTION 'Parâmetros inválidos para controle de login';
  END IF;

  -- Hashes inativos expiram; a limpeza ocorre sob tráfego normal sem job externo.
  DELETE FROM public.login_tentativa l
   WHERE l.ctid IN (
     SELECT antiga.ctid
       FROM public.login_tentativa antiga
      WHERE antiga.atualizado_em < now() - interval '30 days'
      ORDER BY antiga.atualizado_em
      LIMIT 100
      FOR UPDATE SKIP LOCKED
   );

  IF p_operacao IN ('reservar', 'falha', 'sucesso', 'liberar') THEN
    INSERT INTO public.login_tentativa (chave_hash) VALUES (p_chave)
    ON CONFLICT (chave_hash) DO NOTHING;
  END IF;

  SELECT l.tentativas, l.bloqueado_ate
    INTO v_tentativas, v_bloqueado_ate
    FROM public.login_tentativa AS l
   WHERE l.chave_hash = p_chave
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT true, 0, NULL::timestamptz, false;
    RETURN;
  END IF;

  IF p_operacao = 'reservar' THEN
    IF v_bloqueado_ate IS NOT NULL AND v_bloqueado_ate > now() THEN
      RETURN QUERY SELECT false, v_tentativas, v_bloqueado_ate, false;
      RETURN;
    ELSIF v_bloqueado_ate IS NOT NULL THEN
      v_tentativas := 0;
      v_bloqueado_ate := NULL;
    END IF;

    WITH removidas AS (
      DELETE FROM public.login_tentativa_reserva r
       WHERE r.chave_hash = p_chave AND r.expira_em <= now()
       RETURNING 1
    ) SELECT count(*)::integer INTO v_reservas_expiradas FROM removidas;
    v_tentativas := v_tentativas + v_reservas_expiradas;
    IF v_tentativas >= p_limite THEN
      v_bloqueado_ate := now() + make_interval(secs => p_duracao_segundos);
    END IF;
    UPDATE public.login_tentativa l
       SET tentativas = v_tentativas, bloqueado_ate = v_bloqueado_ate, atualizado_em = now()
     WHERE l.chave_hash = p_chave;

    IF v_bloqueado_ate IS NOT NULL AND v_bloqueado_ate > now() THEN
      RETURN QUERY SELECT false, v_tentativas, v_bloqueado_ate, false;
      RETURN;
    END IF;

    SELECT count(*)::integer INTO v_reservas
      FROM public.login_tentativa_reserva r WHERE r.chave_hash = p_chave;
    IF v_tentativas + v_reservas >= p_limite THEN
      v_bloqueado_ate := now() + make_interval(secs => p_duracao_segundos);
      UPDATE public.login_tentativa l SET bloqueado_ate = v_bloqueado_ate, atualizado_em = now()
       WHERE l.chave_hash = p_chave;
      RETURN QUERY SELECT false, v_tentativas, v_bloqueado_ate, false;
      RETURN;
    END IF;

    INSERT INTO public.login_tentativa_reserva (id, chave_hash, expira_em)
    VALUES (p_reserva, p_chave, now() + interval '60 seconds');
    IF v_tentativas + v_reservas + 1 >= p_limite THEN
      v_bloqueado_ate := now() + make_interval(secs => p_duracao_segundos);
      UPDATE public.login_tentativa l SET bloqueado_ate = v_bloqueado_ate, atualizado_em = now()
       WHERE l.chave_hash = p_chave;
    END IF;
    RETURN QUERY SELECT true, v_tentativas, v_bloqueado_ate, true;
    RETURN;
  END IF;

  DELETE FROM public.login_tentativa_reserva r
   WHERE r.id = p_reserva AND r.chave_hash = p_chave
   RETURNING r.id INTO v_reserva_removida;
  IF v_reserva_removida IS NULL THEN
    SELECT count(*)::integer INTO v_reservas
      FROM public.login_tentativa_reserva r WHERE r.chave_hash = p_chave;
    RETURN QUERY SELECT false, v_tentativas, v_bloqueado_ate, false;
    RETURN;
  END IF;

  IF p_operacao = 'sucesso' THEN
    UPDATE public.login_tentativa l
       SET tentativas = 0, bloqueado_ate = NULL, atualizado_em = now()
     WHERE l.chave_hash = p_chave;
    RETURN QUERY SELECT true, 0, NULL::timestamptz, true;
    RETURN;
  END IF;

  IF p_operacao = 'falha' THEN
    IF v_bloqueado_ate IS NOT NULL AND v_bloqueado_ate <= now() THEN
      v_tentativas := 0;
      v_bloqueado_ate := NULL;
    END IF;
    v_tentativas := v_tentativas + 1;
    IF v_tentativas >= p_limite THEN
      v_bloqueado_ate := now() + make_interval(secs => p_duracao_segundos);
    END IF;
  ELSIF p_operacao = 'liberar' THEN
    SELECT count(*)::integer INTO v_reservas
      FROM public.login_tentativa_reserva r WHERE r.chave_hash = p_chave;
    IF v_tentativas + v_reservas < p_limite THEN
      v_bloqueado_ate := NULL;
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_reservas
    FROM public.login_tentativa_reserva r WHERE r.chave_hash = p_chave;
  IF p_operacao = 'falha' AND v_tentativas + v_reservas >= p_limite
     AND (v_bloqueado_ate IS NULL OR v_bloqueado_ate <= now()) THEN
    v_bloqueado_ate := now() + make_interval(secs => p_duracao_segundos);
  END IF;

  IF p_operacao IN ('falha', 'liberar') THEN
    UPDATE public.login_tentativa
       SET tentativas = v_tentativas,
           bloqueado_ate = v_bloqueado_ate,
           atualizado_em = now()
     WHERE chave_hash = p_chave;
  END IF;

  RETURN QUERY SELECT true, v_tentativas, v_bloqueado_ate, true;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_tentativa_login(text, text, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_tentativa_login(text, text, integer, integer, uuid) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'login_tentativa' AND c.relrowsecurity
  ) OR has_table_privilege('anon', 'public.login_tentativa', 'SELECT')
    OR NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'login_tentativa_reserva' AND c.relrowsecurity
    )
    OR has_table_privilege('authenticated', 'public.login_tentativa', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.login_tentativa', 'SELECT')
    OR has_table_privilege('anon', 'public.login_tentativa_reserva', 'SELECT')
    OR has_table_privilege('authenticated', 'public.login_tentativa_reserva', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.login_tentativa_reserva', 'SELECT')
    OR has_function_privilege('anon', 'public.registrar_tentativa_login(text,text,integer,integer,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.registrar_tentativa_login(text,text,integer,integer,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.registrar_tentativa_login(text,text,integer,integer,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Falha na pós-condição de segurança do bloqueio de login';
  END IF;
END;
$$;

COMMIT;
