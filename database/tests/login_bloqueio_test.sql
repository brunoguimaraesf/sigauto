-- RN29/RNF-SE04: reservas atômicas, bloqueio durável e privilégio só do backend.
-- Executar após 32_login_bloqueio_persistente.sql com ON_ERROR_STOP=1.
BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_hash constant text := repeat('a', 64);
  v_id uuid;
  v_result record;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_i integer;
  v_tabelas integer;
  v_funcao oid;
BEGIN
  SELECT count(*) INTO v_tabelas
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('login_tentativa', 'login_tentativa_reserva');
  IF v_tabelas <> 2 THEN RAISE EXCEPTION 'Migração não deixou exatamente as duas tabelas esperadas'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'registrar_tentativa_login') <> 1
     OR (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'
          AND indexname IN ('idx_login_tentativa_atualizado_em', 'idx_login_tentativa_reserva_chave')) <> 2 THEN
    RAISE EXCEPTION 'Objetos duplicados/ausentes; reaplicação não está idempotente';
  END IF;
  SELECT p.oid INTO v_funcao
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'registrar_tentativa_login'
     AND pg_get_function_identity_arguments(p.oid) = 'p_chave text, p_operacao text, p_limite integer, p_duracao_segundos integer, p_reserva uuid';
  IF v_funcao IS NULL OR NOT has_function_privilege('service_role', v_funcao, 'EXECUTE')
     OR has_function_privilege('anon', v_funcao, 'EXECUTE')
     OR has_function_privilege('authenticated', v_funcao, 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC ausente ou privilégios fora do esperado';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.login_tentativa'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.login_tentativa_reserva'::regclass)
     OR has_table_privilege('anon', 'public.login_tentativa', 'SELECT')
     OR has_table_privilege('authenticated', 'public.login_tentativa', 'SELECT')
     OR has_table_privilege('anon', 'public.login_tentativa_reserva', 'SELECT')
     OR has_table_privilege('authenticated', 'public.login_tentativa_reserva', 'SELECT') THEN
    RAISE EXCEPTION 'RLS ou isolamento das tabelas está incorreto';
  END IF;

  -- Simula requisições simultâneas: as cinco reservas cabem; a sexta é negada
  -- antes de chamar GoTrue, mesmo sem nenhuma falha já finalizada.
  FOR v_i IN 1..5 LOOP
    v_id := md5('reserva-concorrente-' || v_i)::uuid;
    v_ids := array_append(v_ids, v_id);
    SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'reservar', 5, 900, v_id);
    IF NOT v_result.permitido OR NOT v_result.reserva_confirmada THEN
      RAISE EXCEPTION 'Reserva % deveria ter sido admitida', v_i;
    END IF;
  END LOOP;
  v_id := md5('reserva-concorrente-6')::uuid;
  SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'reservar', 5, 900, v_id);
  IF v_result.permitido OR v_result.reserva_confirmada OR v_result.bloqueado_ate <= now() THEN
    RAISE EXCEPTION 'Sexta reserva concorrente não foi recusada com bloqueio';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'falha', 5, 900, v_id);
    IF NOT v_result.reserva_confirmada THEN RAISE EXCEPTION 'Falha não consumiu sua reserva'; END IF;
  END LOOP;
  SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'consultar', 5, 900, NULL);
  IF v_result.tentativas <> 5 OR v_result.bloqueado_ate <= now() THEN
    RAISE EXCEPTION 'Quinta falha não persistiu o bloqueio';
  END IF;

  -- Ao expirar, a próxima tentativa volta a reservar e começa a série do zero.
  UPDATE public.login_tentativa SET bloqueado_ate = now() - interval '1 second' WHERE chave_hash = v_hash;
  v_id := md5('apos-expiracao')::uuid;
  SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'reservar', 5, 900, v_id);
  IF NOT v_result.permitido OR NOT v_result.reserva_confirmada OR v_result.tentativas <> 0 THEN
    RAISE EXCEPTION 'Bloqueio expirado não liberou nova série';
  END IF;
  SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'liberar', 5, 900, v_id);
  IF NOT v_result.reserva_confirmada THEN RAISE EXCEPTION 'Reserva cancelada não foi liberada'; END IF;

  -- Uma falha seguida de credencial válida zera apenas o contador; repetir a
  -- finalização antiga não pode contar outra falha.
  v_id := md5('tentativa-invalida')::uuid;
  SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'reservar', 5, 900, v_id);
  SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'falha', 5, 900, v_id);
  v_id := md5('tentativa-valida')::uuid;
  SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'reservar', 5, 900, v_id);
  SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'sucesso', 5, 900, v_id);
  IF NOT v_result.reserva_confirmada OR v_result.tentativas <> 0 OR v_result.bloqueado_ate IS NOT NULL THEN
    RAISE EXCEPTION 'Login válido não resetou as falhas';
  END IF;
  v_id := md5('tentativa-invalida')::uuid;
  SELECT * INTO v_result FROM public.registrar_tentativa_login(v_hash, 'falha', 5, 900, v_id);
  IF v_result.reserva_confirmada OR v_result.tentativas <> 0 THEN
    RAISE EXCEPTION 'Finalização duplicada alterou o contador';
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.registrar_tentativa_login(repeat('b', 64), 'consultar', 5, 900, NULL);
    RAISE EXCEPTION 'anon executou a RPC de bloqueio';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.login_tentativa;
    RAISE EXCEPTION 'anon leu a tabela de bloqueio';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.registrar_tentativa_login(repeat('b', 64), 'consultar', 5, 900, NULL);
    RAISE EXCEPTION 'authenticated executou a RPC de bloqueio';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.login_tentativa_reserva;
    RAISE EXCEPTION 'authenticated leu as reservas de bloqueio';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK;
