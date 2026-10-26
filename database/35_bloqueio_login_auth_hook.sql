-- =============================================================================
-- SIGAuto - 35_bloqueio_login_auth_hook.sql
--
-- Fecha o bypass QA-11 no Supabase Auth local/self-hosted: toda tentativa de
-- senha, inclusive POST direto em /auth/v1/token, passa pelo hook nativo do
-- GoTrue. O fluxo Express continua mantendo o bloqueio por e-mail da RN29; este
-- segundo contador impede que o endpoint público do provedor contorne o limite.
--
-- Em Supabase hospedado, Password Verification Hook exige plano compatível.
-- Projetos sem o hook devem manter o CAPTCHA nativo do Auth ativado.
--
-- Transacional e idempotente.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.login_tentativa_auth (
  id_usuario uuid PRIMARY KEY,
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  bloqueado_ate timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.login_tentativa_auth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_login_tentativa_auth_hook ON public.login_tentativa_auth;
CREATE POLICY pol_login_tentativa_auth_hook ON public.login_tentativa_auth
  FOR ALL TO supabase_auth_admin
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.login_tentativa_auth FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_tentativa_auth TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.hook_password_verification_attempt(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id_usuario uuid;
  v_senha_valida boolean;
  v_tentativas integer;
  v_bloqueado_ate timestamptz;
BEGIN
  BEGIN
    v_id_usuario := (event->>'user_id')::uuid;
    v_senha_valida := (event->>'valid')::boolean;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object('http_code', 400, 'message', 'Tentativa de autenticação inválida.')
    );
  END;

  IF v_id_usuario IS NULL OR v_senha_valida IS NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object('http_code', 400, 'message', 'Tentativa de autenticação inválida.')
    );
  END IF;

  INSERT INTO public.login_tentativa_auth (id_usuario)
  VALUES (v_id_usuario)
  ON CONFLICT (id_usuario) DO NOTHING;

  SELECT tentativas, bloqueado_ate
    INTO v_tentativas, v_bloqueado_ate
    FROM public.login_tentativa_auth
   WHERE id_usuario = v_id_usuario
   FOR UPDATE;

  IF v_bloqueado_ate IS NOT NULL AND v_bloqueado_ate > now() THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 429,
        'message', 'Muitas tentativas incorretas. Aguarde antes de tentar novamente.'
      )
    );
  END IF;

  IF v_bloqueado_ate IS NOT NULL THEN
    v_tentativas := 0;
    v_bloqueado_ate := NULL;
  END IF;

  IF v_senha_valida THEN
    UPDATE public.login_tentativa_auth
       SET tentativas = 0, bloqueado_ate = NULL, atualizado_em = now()
     WHERE id_usuario = v_id_usuario;
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  v_tentativas := v_tentativas + 1;
  IF v_tentativas >= 5 THEN
    v_bloqueado_ate := now() + interval '15 minutes';
  END IF;

  UPDATE public.login_tentativa_auth
     SET tentativas = v_tentativas,
         bloqueado_ate = v_bloqueado_ate,
         atualizado_em = now()
   WHERE id_usuario = v_id_usuario;

  IF v_bloqueado_ate IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 429,
        'message', 'Muitas tentativas incorretas. Aguarde antes de tentar novamente.'
      )
    );
  END IF;

  RETURN jsonb_build_object('decision', 'continue');
END;
$$;

REVOKE ALL ON FUNCTION public.hook_password_verification_attempt(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb)
  TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.login_tentativa_auth'::regclass)
     OR has_table_privilege('anon', 'public.login_tentativa_auth', 'SELECT')
     OR has_table_privilege('authenticated', 'public.login_tentativa_auth', 'SELECT')
     OR has_table_privilege('service_role', 'public.login_tentativa_auth', 'SELECT')
     OR NOT has_table_privilege('supabase_auth_admin', 'public.login_tentativa_auth', 'SELECT')
     OR has_function_privilege('anon', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('supabase_auth_admin', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Falha na pós-condição do hook de bloqueio de login';
  END IF;
END;
$$;

COMMIT;
