-- =============================================================================
-- regras_negocio_servidor_test.sql — regressao da migracao 34 (QA-01 a QA-06)
--
-- Afirma no banco as regras que antes valiam so na tela: RN15 (queixa >= 10),
-- RN16 (OS nasce Aberta), RN09 (numero so do sistema), RN04 (datas do banco),
-- RN45 (nome e preco do servico) e RN46 (servico inativo fora da OS).
-- Cada recusa precisa vir com o SQLSTATE esperado: erro de RLS, funcao
-- renomeada ou coluna ausente reprovam em vez de contar como regra imposta.
-- Acumula as falhas e reprova no fim com a lista.
--
-- SOMENTE em banco descartavel: o ROLLBACK desfaz linhas, mas nao devolve
-- valores de sequencia (numero_os). Exige `sigauto.ambiente_teste=on`, ex.:
--   PGOPTIONS='-c sigauto.ambiente_teste=on' psql "$DATABASE_URL" -f ...
-- Usa as fixtures do E2E e termina com ROLLBACK.
-- =============================================================================
BEGIN;
DO $$
DECLARE
  v_gestor UUID;
  v_atendente UUID;
  v_veiculo UUID;
  v_os UUID;
  v_os_aberta UUID;
  v_num INTEGER;
  v_num_a INTEGER;
  v_num_b INTEGER;
  v_seq_antes BIGINT;
  v_seq_depois BIGINT;
  v_linhas INTEGER;
  v_criado TIMESTAMPTZ;
  v_status public.status_os;
  v_servico_inativo UUID;
  v_servico_ativo UUID;
  v_estado TEXT;
  v_falhas TEXT[] := ARRAY[]::TEXT[];
  v_perfil TEXT;
  v_usuario UUID;
BEGIN
  IF current_setting('sigauto.ambiente_teste', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Recusado: defina sigauto.ambiente_teste=on apenas em banco descartavel.';
  END IF;

  SELECT id INTO STRICT v_gestor FROM public.usuario WHERE email = 'gestor@sigauto.com';
  SELECT id INTO STRICT v_atendente FROM public.usuario WHERE email = 'atendente@sigauto.com';
  SELECT id INTO v_veiculo FROM public.veiculo ORDER BY id LIMIT 1;
  IF v_veiculo IS NULL THEN
    RAISE EXCEPTION 'Fixture de veiculo ausente; teste nao executado.';
  END IF;

  -- Fixtures criadas como owner: um servico inativo, um ativo, e uma OS aberta
  -- que ja contem o ativo (inativado logo depois) para o caso RN46 permitido.
  INSERT INTO public.servico_catalogo (nome, preco, ativo) VALUES ('QA servico inativo', 50, false)
  RETURNING id INTO v_servico_inativo;
  INSERT INTO public.servico_catalogo (nome, preco, ativo) VALUES ('QA servico ja na OS', 40, true)
  RETURNING id INTO v_servico_ativo;
  INSERT INTO public.ordem_servico (id_veiculo, id_usuario, descricao, status)
  VALUES (v_veiculo, v_gestor, 'OS aberta da regressao 34', 'aberta')
  RETURNING id INTO v_os_aberta;
  INSERT INTO public.os_servico (id_os, id_servico, descricao, quantidade, valor_unitario)
  VALUES (v_os_aberta, v_servico_ativo, 'Ja estava', 1, 40);
  UPDATE public.servico_catalogo SET ativo = false WHERE id = v_servico_ativo;

  IF has_table_privilege('anon', 'public.ordem_servico', 'INSERT') THEN
    v_falhas := v_falhas || 'QA-03 RN09: anon ainda possui GRANT INSERT em ordem_servico'::text;
  END IF;

  -- ------------------------------------------- INSERT direto, os dois perfis
  FOREACH v_perfil IN ARRAY ARRAY['atendente', 'gestor'] LOOP
    v_usuario := CASE v_perfil WHEN 'gestor' THEN v_gestor ELSE v_atendente END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    -- QA-01 · RN15
    BEGIN
      INSERT INTO public.ordem_servico (id_veiculo, id_usuario, descricao)
      VALUES (v_veiculo, v_usuario, 'curta');
      v_falhas := v_falhas || format('QA-01 RN15 (%s): INSERT aceitou queixa de 5 caracteres', v_perfil);
    EXCEPTION
      WHEN check_violation THEN NULL;
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
        v_falhas := v_falhas || format('QA-01 RN15 (%s): erro inesperado %s: %s', v_perfil, v_estado, SQLERRM);
    END;

    -- QA-02 · RN16
    BEGIN
      INSERT INTO public.ordem_servico (id_veiculo, id_usuario, descricao, status)
      VALUES (v_veiculo, v_usuario, 'Queixa valida para RN16', 'em_andamento');
      v_falhas := v_falhas || format('QA-02 RN16 (%s): INSERT criou OS em_andamento', v_perfil);
    EXCEPTION
      WHEN check_violation THEN NULL;
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
        v_falhas := v_falhas || format('QA-02 RN16 (%s): erro inesperado %s: %s', v_perfil, v_estado, SQLERRM);
    END;

    -- QA-03 · RN09: numero enviado e descartado; QA-04 · RN04: datas do banco.
    BEGIN
      INSERT INTO public.ordem_servico (id_veiculo, id_usuario, descricao, numero_os, criado_em, atualizado_em)
      VALUES (v_veiculo, v_usuario, 'Queixa valida para RN09', 987654, '2000-01-01', '2000-01-01')
      RETURNING numero_os, criado_em INTO v_num, v_criado;
      IF v_num IS NOT DISTINCT FROM 987654 THEN
        v_falhas := v_falhas || format('QA-03 RN09 (%s): INSERT gravou numero_os escolhido pelo cliente', v_perfil);
      END IF;
      IF v_criado IS DISTINCT FROM now() THEN
        v_falhas := v_falhas || format('QA-04 RN04 (%s): INSERT gravou criado_em %s', v_perfil, v_criado);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-03/04 (%s): INSERT valido recusado %s: %s', v_perfil, v_estado, SQLERRM);
    END;
  END LOOP;

  -- ---------------------------------------------------------- atendente, RPC
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_atendente, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- QA-01 · RN15 pelo RPC: 9 caracteres e vazio recusados; 10 aceito.
  BEGIN
    PERFORM public.criar_ordem_servico_com_itens(jsonb_build_object('id_veiculo', v_veiculo, 'descricao', '123456789'));
    v_falhas := v_falhas || 'QA-01 RN15: RPC criou OS com queixa de 9 caracteres'::text;
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-01 RN15 RPC 9: erro inesperado %s: %s', v_estado, SQLERRM);
  END;
  BEGIN
    PERFORM public.criar_ordem_servico_com_itens(jsonb_build_object('id_veiculo', v_veiculo, 'descricao', ''));
    v_falhas := v_falhas || 'QA-01 RN15: RPC criou OS com queixa vazia'::text;
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-01 RN15 RPC vazio: erro inesperado %s: %s', v_estado, SQLERRM);
  END;

  BEGIN
    PERFORM public.criar_ordem_servico_com_itens(jsonb_build_object('id_veiculo', v_veiculo));
    v_falhas := v_falhas || 'QA-01 RN15: RPC criou OS sem a chave descricao'::text;
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-01 RN15 RPC sem descricao: erro inesperado %s: %s', v_estado, SQLERRM);
  END;

  -- RN15/RN09: a validacao antecede nextval; falha nao queima numero.
  SELECT last_value INTO v_seq_antes FROM public.ordem_servico_numero_os_seq;
  BEGIN
    INSERT INTO public.ordem_servico (id_veiculo, id_usuario, descricao)
    VALUES (v_veiculo, v_atendente, 'curta');
    v_falhas := v_falhas || 'QA-01 RN15: INSERT curto aceito no teste da sequencia'::text;
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-01/03 sequencia: erro inesperado %s: %s', v_estado, SQLERRM);
  END;
  SELECT last_value INTO v_seq_depois FROM public.ordem_servico_numero_os_seq;
  IF v_seq_depois IS DISTINCT FROM v_seq_antes THEN
    v_falhas := v_falhas || format(
      'QA-03 RN09: queixa curta avancou a sequencia de %s para %s', v_seq_antes, v_seq_depois
    );
  END IF;

  -- RN16: status enviado na criacao e descartado; a OS permanece aberta.
  BEGIN
    SELECT id, status INTO v_os, v_status
      FROM public.criar_ordem_servico_com_itens(
        jsonb_build_object(
          'id_veiculo', v_veiculo,
          'descricao', 'Queixa valida com status forjado',
          'status', 'em_andamento'
        )
      );
    IF v_status IS DISTINCT FROM 'aberta'::public.status_os THEN
      v_falhas := v_falhas || format('QA-02 RN16: RPC preservou status forjado %s', v_status);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
    v_falhas := v_falhas || format('QA-02 RN16 RPC: erro inesperado %s: %s', v_estado, SQLERRM);
  END;

  -- RN09: duas criacoes seguidas pelo RPC recebem numeros consecutivos; o
  -- trigger nao pode consumir dois valores da sequencia por OS.
  BEGIN
    SELECT numero_os INTO v_num_a FROM public.criar_ordem_servico_com_itens(
      jsonb_build_object('id_veiculo', v_veiculo, 'descricao', '1234567890'));
    SELECT numero_os INTO v_num_b FROM public.criar_ordem_servico_com_itens(
      jsonb_build_object('id_veiculo', v_veiculo, 'descricao', 'Luz de injecao acesa', 'numero_os', 1));
    IF v_num_a IS NULL OR v_num_b IS DISTINCT FROM v_num_a + 1 THEN
      v_falhas := v_falhas || format('QA-03 RN09: numeracao do RPC nao consecutiva (%s, %s)', v_num_a, v_num_b);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
    v_falhas := v_falhas || format('QA-01/03: RPC valido recusado %s: %s', v_estado, SQLERRM);
  END;

  -- QA-06 · RN46: escrita direta em os_servico tambem recusa inativo novo.
  BEGIN
    INSERT INTO public.os_servico (id_os, id_servico, descricao, quantidade, valor_unitario)
    VALUES (v_os_aberta, v_servico_inativo, 'Inativo direto', 1, 50);
    v_falhas := v_falhas || 'QA-06 RN46: INSERT direto incluiu servico inativo na OS'::text;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'RN46:%' THEN
        v_falhas := v_falhas || format('QA-06 RN46 direto: recusa com mensagem inesperada: %s', SQLERRM);
      END IF;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-06 RN46 direto: erro inesperado %s: %s', v_estado, SQLERRM);
  END;

  -- QA-06 · RN46: servico inativo novo recusado pelo RPC...
  BEGIN
    PERFORM public.criar_ordem_servico_com_itens(
      jsonb_build_object('id_veiculo', v_veiculo, 'descricao', 'Revisao com servico inativo'),
      jsonb_build_array(jsonb_build_object('id_servico', v_servico_inativo, 'descricao', 'Inativo',
                                           'quantidade', 1, 'valor_unitario', 50)));
    v_falhas := v_falhas || 'QA-06 RN46: RPC incluiu servico inativo na OS'::text;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'RN46:%' THEN
        v_falhas := v_falhas || format('QA-06 RN46: recusa com mensagem inesperada: %s', SQLERRM);
      END IF;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-06 RN46: erro inesperado %s: %s', v_estado, SQLERRM);
  END;
  -- ...mas o que ja estava na OS antes de ser inativado continua regravavel.
  BEGIN
    PERFORM public.salvar_ordem_servico_com_itens(v_os_aberta, '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('id_servico', v_servico_ativo, 'descricao', 'Ja estava',
                                           'quantidade', 1, 'valor_unitario', 40)));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
    v_falhas := v_falhas || format('QA-06 RN46: servico que ja estava na OS foi recusado %s: %s', v_estado, SQLERRM);
  END;

  -- ------------------------------------------------------------------ gestor
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- QA-03 · RN09: UPDATE de numero recusado (a OS existe e e visivel ao gestor).
  BEGIN
    UPDATE public.ordem_servico SET numero_os = numero_os + 500000 WHERE id = v_os_aberta;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    v_falhas := v_falhas || format('QA-03 RN09: gestor alterou numero_os (%s linha)', v_linhas);
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-03 RN09 UPDATE: erro inesperado %s: %s', v_estado, SQLERRM);
  END;

  -- QA-01 · RN15 na alteracao da queixa.
  BEGIN
    UPDATE public.ordem_servico SET descricao = 'curta' WHERE id = v_os_aberta;
    v_falhas := v_falhas || 'QA-01 RN15: UPDATE encurtou a queixa'::text;
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-01 RN15 UPDATE: erro inesperado %s: %s', v_estado, SQLERRM);
  END;

  -- QA-04 · RN04: criado_em imutavel no UPDATE.
  UPDATE public.servico_catalogo SET criado_em = '2000-01-01', nome = 'QA servico inativo 2'
   WHERE id = v_servico_inativo RETURNING criado_em INTO v_criado;
  IF v_criado IS NOT DISTINCT FROM '2000-01-01'::timestamptz OR v_criado IS NULL THEN
    v_falhas := v_falhas || format('QA-04 RN04: UPDATE reescreveu criado_em (%s)', v_criado);
  END IF;

  -- QA-05 · RN45: nome em branco e preco omitido recusados.
  BEGIN
    INSERT INTO public.servico_catalogo (nome, preco) VALUES ('   ', 10);
    v_falhas := v_falhas || 'QA-05 RN45: servico com nome em branco aceito'::text;
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-05 RN45 nome: erro inesperado %s: %s', v_estado, SQLERRM);
  END;
  BEGIN
    INSERT INTO public.servico_catalogo (nome) VALUES ('Servico sem preco');
    v_falhas := v_falhas || 'QA-05 RN45: servico sem preco informado aceito'::text;
  EXCEPTION
    WHEN not_null_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-05 RN45 preco: erro inesperado %s: %s', v_estado, SQLERRM);
  END;
  BEGIN
    INSERT INTO public.servico_catalogo (nome, preco) VALUES ('Servico com preco negativo', -1);
    v_falhas := v_falhas || 'QA-05 RN45: servico com preco negativo aceito'::text;
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-05 RN45 preco negativo: erro inesperado %s: %s', v_estado, SQLERRM);
  END;

  -- `anon` nao pode escrever no cabecalho nem alcancar a geracao da sequencia.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.ordem_servico (id_veiculo, id_usuario, descricao)
    VALUES (v_veiculo, v_atendente, 'Tentativa anon bloqueada');
    v_falhas := v_falhas || 'QA-03 RN09: anon inseriu diretamente em ordem_servico'::text;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
      v_falhas := v_falhas || format('QA-03 RN09 anon: erro inesperado %s: %s', v_estado, SQLERRM);
  END;

  RESET ROLE;

  IF cardinality(v_falhas) > 0 THEN
    RAISE EXCEPTION E'REPROVADO: % falha(s) nas regras de negocio do servidor:\n  - %',
      cardinality(v_falhas), array_to_string(v_falhas, E'\n  - ');
  END IF;
  RAISE NOTICE 'OK: RN04, RN09, RN15, RN16, RN45 e RN46 impostas no servidor (migracao 34).';
END;
$$;
ROLLBACK;
