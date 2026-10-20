-- RF11 / RN39: leitura direta, perda de perfil e policy permissiva não reabrem
-- histórico financeiro. Fixtures locais existentes; nenhuma alteração é mantida.
BEGIN;
DO $$
DECLARE
  v_gestor uuid;
  v_atendente uuid;
  v_mecanico uuid;
  v_mensagem uuid;
  v_recomendacao uuid;
  v_count integer;
  v_usuario uuid;
BEGIN
  SELECT id INTO v_gestor FROM public.usuario WHERE perfil = 'gestor' AND ativo LIMIT 1;
  SELECT id INTO v_atendente FROM public.usuario WHERE perfil = 'atendente' AND ativo LIMIT 1;
  SELECT id INTO v_mecanico FROM public.usuario WHERE perfil = 'mecanico' AND ativo LIMIT 1;
  IF v_gestor IS NULL OR v_atendente IS NULL OR v_mecanico IS NULL THEN
    RAISE EXCEPTION 'Fixtures dos três perfis ausentes; RN39 não pode passar sem execução.';
  END IF;

  INSERT INTO public.mensagem_chatbot (id_usuario, remetente, conteudo)
    VALUES (v_gestor, 'chatbot', 'SENTINELA_FINANCEIRA_RN39') RETURNING id INTO v_mensagem;
  INSERT INTO public.recomendacao_ia (id_usuario, recomendacoes)
    VALUES (v_gestor, '{"sentinela":"FINANCEIRO_RN26"}'::jsonb) RETURNING id INTO v_recomendacao;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.mensagem_chatbot WHERE id = v_mensagem;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Gestor perdeu leitura autorizada.'; END IF;
  SELECT count(*) INTO v_count FROM public.recomendacao_ia WHERE id = v_recomendacao;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Gestor perdeu leitura do painel.'; END IF;
  RESET ROLE;

  -- A mesma identidade perde a permissão imediatamente ao ser rebaixada.
  UPDATE public.usuario SET perfil = 'atendente' WHERE id = v_gestor;
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.mensagem_chatbot WHERE id = v_mensagem;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Conta rebaixada leu resposta financeira antiga.'; END IF;
  SELECT count(*) INTO v_count FROM public.recomendacao_ia WHERE id = v_recomendacao;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Conta rebaixada leu recomendação financeira antiga.'; END IF;
  RESET ROLE;
  UPDATE public.usuario SET perfil = 'gestor' WHERE id = v_gestor;

  -- Mesmo com autoria própria e outra policy permissiva, o gate deve prevalecer.
  CREATE POLICY teste_chatbot_leitura_permissiva ON public.mensagem_chatbot
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY teste_painel_leitura_permissiva ON public.recomendacao_ia
    FOR SELECT TO authenticated USING (true);
  FOREACH v_usuario IN ARRAY ARRAY[v_atendente, v_mecanico] LOOP
    INSERT INTO public.mensagem_chatbot (id_usuario, remetente, conteudo)
      VALUES (v_usuario, 'chatbot', 'SENTINELA_PROPRIA_RN39') RETURNING id INTO v_mensagem;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_count FROM public.mensagem_chatbot;
    IF v_count <> 0 THEN RAISE EXCEPTION 'Não gestor leu histórico mesmo com gate restritivo.'; END IF;
    SELECT count(*) INTO v_count FROM public.recomendacao_ia;
    IF v_count <> 0 THEN RAISE EXCEPTION 'Não gestor leu painel com policy permissiva concorrente.'; END IF;
    RESET ROLE;
  END LOOP;

  -- Inativar também revoga o acesso histórico do gestor.
  UPDATE public.usuario SET ativo = false WHERE id = v_gestor;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.mensagem_chatbot;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Gestor inativo leu histórico financeiro.'; END IF;
  SELECT count(*) INTO v_count FROM public.recomendacao_ia;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Gestor inativo leu painel financeiro.'; END IF;
  RESET ROLE;
  RAISE NOTICE 'OK RN39: histórico gestor-only, rebaixamento, inativação e policy permissiva conferidos.';
END;
$$;
ROLLBACK;
