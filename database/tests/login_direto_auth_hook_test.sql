-- RN29/QA-11: o hook nativo limita também o grant direto do Supabase Auth.
BEGIN;

DO $$
DECLARE
  v_id uuid := '11111111-1111-4111-8111-111111111111';
  v_resultado jsonb;
  v_i integer;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.login_tentativa_auth'::regclass)
     OR NOT EXISTS (
       SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'login_tentativa_auth'
          AND policyname = 'pol_login_tentativa_auth_hook'
     )
     OR has_function_privilege('anon', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('supabase_auth_admin', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.login_tentativa_auth', 'SELECT')
     OR has_table_privilege('authenticated', 'public.login_tentativa_auth', 'SELECT')
     OR NOT has_table_privilege('supabase_auth_admin', 'public.login_tentativa_auth', 'SELECT') THEN
    RAISE EXCEPTION 'Privilégios do hook estão incorretos';
  END IF;

  DELETE FROM public.login_tentativa_auth WHERE id_usuario = v_id;

  FOR v_i IN 1..4 LOOP
    v_resultado := public.hook_password_verification_attempt(
      jsonb_build_object('user_id', v_id, 'valid', false)
    );
    IF v_resultado->>'decision' <> 'continue' THEN
      RAISE EXCEPTION 'Tentativa inválida % foi bloqueada antes do limite: %', v_i, v_resultado;
    END IF;
  END LOOP;

  v_resultado := public.hook_password_verification_attempt(
    jsonb_build_object('user_id', v_id, 'valid', false)
  );
  IF v_resultado#>>'{error,http_code}' <> '429' THEN
    RAISE EXCEPTION 'Quinta falha não iniciou bloqueio: %', v_resultado;
  END IF;

  v_resultado := public.hook_password_verification_attempt(
    jsonb_build_object('user_id', v_id, 'valid', true)
  );
  IF v_resultado#>>'{error,http_code}' <> '429' THEN
    RAISE EXCEPTION 'Senha correta contornou bloqueio ativo: %', v_resultado;
  END IF;

  UPDATE public.login_tentativa_auth
     SET bloqueado_ate = now() - interval '1 second'
   WHERE id_usuario = v_id;
  v_resultado := public.hook_password_verification_attempt(
    jsonb_build_object('user_id', v_id, 'valid', true)
  );
  IF v_resultado->>'decision' <> 'continue' THEN
    RAISE EXCEPTION 'Login não recuperou após expiração: %', v_resultado;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.login_tentativa_auth
     WHERE id_usuario = v_id AND (tentativas <> 0 OR bloqueado_ate IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Sucesso não zerou o estado do hook';
  END IF;
END;
$$;

ROLLBACK;
