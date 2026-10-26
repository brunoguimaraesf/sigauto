-- =============================================================================
-- regras_negocio_test.sql — RN04, RN09, RN16, RN31, RN36, RN45 e RN48 no banco
--
-- Verifica as clausulas que o schema e os RPCs impõem, chamando como
-- `authenticated` com o perfil de cada regra. As regras fechadas pela migracao
-- 34 tem regressao propria em regras_negocio_servidor_test.sql.
--
-- SOMENTE em banco descartavel: o ROLLBACK nao devolve valores de sequencia
-- (numero_os). Exige `sigauto.ambiente_teste=on`, ex.:
--   PGOPTIONS='-c sigauto.ambiente_teste=on' psql "$DATABASE_URL" -f ...
-- Usa as fixtures do E2E e termina com ROLLBACK.
-- =============================================================================
BEGIN;
DO $$
DECLARE
  v_gestor UUID;
  v_atendente UUID;
  v_veiculo UUID;
  v_item UUID;
  v_os_a UUID;
  v_os_b UUID;
  v_num_a INTEGER;
  v_num_b INTEGER;
  v_status public.status_os;
  v_status_anterior public.status_os;
  v_criado TIMESTAMPTZ;
  v_atualizado TIMESTAMPTZ;
  v_func_a UUID;
  v_func_b UUID;
  v_unidade TEXT;
  v_bloqueado BOOLEAN;
BEGIN
  IF current_setting('sigauto.ambiente_teste', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Recusado: defina sigauto.ambiente_teste=on apenas em banco descartavel.';
  END IF;
  SELECT id INTO STRICT v_gestor FROM public.usuario WHERE email = 'gestor@sigauto.com';
  SELECT id INTO STRICT v_atendente FROM public.usuario WHERE email = 'atendente@sigauto.com';
  SELECT id INTO v_veiculo FROM public.veiculo ORDER BY id LIMIT 1;
  IF v_veiculo IS NULL THEN
    RAISE EXCEPTION 'Fixture de veiculo ausente; teste de regras nao executado.';
  END IF;

  -- ---------------------------------------------------------------- gestor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- RN04: criacao e ultima alteracao preenchidas pelo banco; o UPDATE ignora
  -- o atualizado_em enviado pelo cliente.
  INSERT INTO public.item_estoque (codigo, nome, unidade, quantidade, qtd_minima, preco_unit)
  VALUES ('QA-RN-04', 'Item RN04', 'UN', 0, 1, 1)
  RETURNING id, criado_em, atualizado_em INTO v_item, v_criado, v_atualizado;
  IF v_criado IS DISTINCT FROM now() OR v_atualizado IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'FALHA RN04: datas de criacao nao preenchidas pelo banco (%, %).', v_criado, v_atualizado;
  END IF;
  UPDATE public.item_estoque SET nome = 'Item RN04 alterado', atualizado_em = '2000-01-01'
   WHERE id = v_item RETURNING atualizado_em INTO v_atualizado;
  IF v_atualizado IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'FALHA RN04: atualizado_em aceitou valor do cliente (%).', v_atualizado;
  END IF;

  -- RN31: codigo de estoque repetido e recusado.
  v_bloqueado := false;
  BEGIN
    INSERT INTO public.item_estoque (codigo, nome, unidade, quantidade, qtd_minima, preco_unit)
    VALUES ('QA-RN-04', 'Duplicado', 'UN', 0, 1, 1);
  EXCEPTION WHEN unique_violation THEN v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN RAISE EXCEPTION 'FALHA RN31: codigo duplicado aceito.'; END IF;

  -- RN36: as seis unidades aceitas e nenhuma outra (inclusive caixa baixa).
  FOREACH v_unidade IN ARRAY ARRAY['UN', 'PC', 'LT', 'MT', 'KG', 'CX'] LOOP
    INSERT INTO public.item_estoque (codigo, nome, unidade, quantidade, qtd_minima, preco_unit)
    VALUES ('QA-RN-36-' || v_unidade, 'Unidade ' || v_unidade, v_unidade, 0, 1, 1);
  END LOOP;
  FOREACH v_unidade IN ARRAY ARRAY['un', 'GL', 'M2', ''] LOOP
    v_bloqueado := false;
    BEGIN
      INSERT INTO public.item_estoque (codigo, nome, unidade, quantidade, qtd_minima, preco_unit)
      VALUES ('QA-RN-36-X' || v_unidade, 'Unidade invalida', v_unidade, 0, 1, 1);
    EXCEPTION WHEN check_violation THEN v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN RAISE EXCEPTION 'FALHA RN36: unidade "%" aceita.', v_unidade; END IF;
  END LOOP;

  -- RN45: servico sem nome ou sem preco base e recusado.
  v_bloqueado := false;
  BEGIN
    INSERT INTO public.servico_catalogo (nome, preco) VALUES (NULL, 10);
  EXCEPTION WHEN not_null_violation THEN v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN RAISE EXCEPTION 'FALHA RN45: servico sem nome aceito.'; END IF;
  v_bloqueado := false;
  BEGIN
    INSERT INTO public.servico_catalogo (nome, preco) VALUES ('Servico RN45', NULL);
  EXCEPTION WHEN not_null_violation THEN v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN RAISE EXCEPTION 'FALHA RN45: servico com preco nulo aceito.'; END IF;
  v_bloqueado := false;
  BEGIN
    INSERT INTO public.servico_catalogo (nome) VALUES ('Servico RN45 sem preco');
  EXCEPTION WHEN not_null_violation THEN v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN RAISE EXCEPTION 'FALHA RN45: servico sem preco informado aceito (DEFAULT silencioso).'; END IF;

  -- RN48: um usuario nao pode ser vinculado a dois funcionarios, nem por
  -- INSERT nem por UPDATE.
  INSERT INTO public.funcionario (nome, cargo) VALUES ('QA RN48 A', 'mecanico') RETURNING id INTO v_func_a;
  INSERT INTO public.funcionario (nome, cargo) VALUES ('QA RN48 B', 'mecanico') RETURNING id INTO v_func_b;
  UPDATE public.funcionario SET id_usuario = NULL WHERE id_usuario = v_atendente;
  UPDATE public.funcionario SET id_usuario = v_atendente WHERE id = v_func_a;
  v_bloqueado := false;
  BEGIN
    UPDATE public.funcionario SET id_usuario = v_atendente WHERE id = v_func_b;
  EXCEPTION WHEN unique_violation THEN v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN RAISE EXCEPTION 'FALHA RN48: usuario vinculado a dois funcionarios por UPDATE.'; END IF;
  v_bloqueado := false;
  BEGIN
    INSERT INTO public.funcionario (nome, cargo, id_usuario) VALUES ('QA RN48 C', 'mecanico', v_atendente);
  EXCEPTION WHEN unique_violation THEN v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN RAISE EXCEPTION 'FALHA RN48: usuario vinculado a dois funcionarios por INSERT.'; END IF;

  -- ------------------------------------------------------------- atendente
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_atendente, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- RN09: numero gerado pelo banco, sequencial, e o RPC descarta o numero
  -- enviado pelo cliente.
  SELECT id, numero_os INTO v_os_a, v_num_a
    FROM public.criar_ordem_servico_com_itens(jsonb_build_object(
      'id_veiculo', v_veiculo, 'descricao', 'Ruido ao frear na roda dianteira', 'numero_os', 1));
  SELECT id, numero_os INTO v_os_b, v_num_b
    FROM public.criar_ordem_servico_com_itens(jsonb_build_object(
      'id_veiculo', v_veiculo, 'descricao', 'Luz de injecao acesa no painel'));
  IF v_num_a IS NULL OR v_num_b IS NULL OR v_num_a = 1 OR v_num_b <= v_num_a THEN
    RAISE EXCEPTION 'FALHA RN09: numeracao nao sequencial ou aceitou o numero do cliente (% , %).', v_num_a, v_num_b;
  END IF;
  v_bloqueado := false;
  BEGIN
    PERFORM public.salvar_ordem_servico_com_itens(v_os_a, jsonb_build_object('numero_os', 5));
  EXCEPTION WHEN invalid_parameter_value THEN v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN RAISE EXCEPTION 'FALHA RN09: RPC de atualizacao aceitou numero_os.'; END IF;
  IF (SELECT numero_os FROM public.ordem_servico WHERE id = v_os_a) IS DISTINCT FROM v_num_a THEN
    RAISE EXCEPTION 'FALHA RN09: numero_os alterado pelo RPC.';
  END IF;

  -- RN16: OS criada pelo RPC sem status nasce Aberta, e o ledger registra
  -- Aberta como primeira transicao.
  SELECT status INTO v_status FROM public.ordem_servico WHERE id = v_os_b;
  IF v_status IS DISTINCT FROM 'aberta' THEN
    RAISE EXCEPTION 'FALHA RN16: OS criada com status %.', v_status;
  END IF;
  SELECT status_anterior, status_novo INTO v_status_anterior, v_status
    FROM public.historico_status_os WHERE id_os = v_os_b ORDER BY id LIMIT 1;
  IF v_status_anterior IS NOT NULL OR v_status IS DISTINCT FROM 'aberta' THEN
    RAISE EXCEPTION 'FALHA RN16: primeira transicao registrada foi % -> %.', v_status_anterior, v_status;
  END IF;

  RAISE NOTICE 'OK: RN04, RN09, RN16, RN31, RN36, RN45 e RN48 conferidas no banco.';
END;
$$;
ROLLBACK;
