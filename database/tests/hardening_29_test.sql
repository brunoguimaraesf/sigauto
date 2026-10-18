-- =============================================================================
-- hardening_29_test.sql — regressao dos achados A-05 a A-10
-- Executado contra o Supabase efemero depois das fixtures E2E.
-- Tudo roda em uma transacao e termina com ROLLBACK.
-- =============================================================================

BEGIN;

DO $teste$
DECLARE
  v_gestor UUID;
  v_atendente UUID;
  v_mecanico UUID;
  v_func_atendente UUID;
  v_os_aberta UUID;
  v_os_concluida UUID;
  v_item UUID;
  v_descricao TEXT;
  v_diagnostico TEXT;
  v_observacoes TEXT;
  v_prioridade TEXT;
  v_id_atendente UUID;
  v_id_usuario UUID;
  v_comissao_mecanico NUMERIC;
  v_comissao_atendente NUMERIC;
  v_status public.status_os;
  v_data_encerramento TIMESTAMPTZ;
  v_saldo NUMERIC(10,2);
  v_saldo_antes NUMERIC(10,2);
  v_baixado NUMERIC(10,2);
  v_movimentos INTEGER;
  v_movimentos_antes INTEGER;
  v_itens_estornados INTEGER;
  v_linhas INTEGER;
  v_bloqueado BOOLEAN;
  v_cabecalho JSONB;
  v_cabecalho_depois JSONB;
  v_snapshot JSONB;
  v_snapshot_depois JSONB;
  v_perfil public.perfil_usuario;
  v_ativo BOOLEAN;
  v_funcoes_auth TEXT[];
BEGIN
  SELECT id INTO STRICT v_gestor
    FROM public.usuario WHERE email = 'gestor@sigauto.com';
  SELECT id INTO STRICT v_atendente
    FROM public.usuario WHERE email = 'atendente@sigauto.com';
  SELECT id INTO STRICT v_mecanico
    FROM public.usuario WHERE email = 'mecanico@sigauto.com';
  SELECT id INTO STRICT v_func_atendente
    FROM public.funcionario WHERE id_usuario = v_atendente;
  SELECT id INTO STRICT v_os_aberta
    FROM public.ordem_servico WHERE numero_os = 9001;
  SELECT id INTO STRICT v_os_concluida
    FROM public.ordem_servico WHERE numero_os = 9002;
  SELECT id INTO STRICT v_item
    FROM public.item_estoque WHERE codigo = 'FIL-001';

  -- ---------------------------------------------------------------- A-05
  SELECT descricao, prioridade, id_atendente
    INTO v_descricao, v_prioridade, v_id_atendente
    FROM public.ordem_servico WHERE id = v_os_aberta;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_mecanico, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;

  UPDATE public.ordem_servico
     SET diagnostico = 'Diagnostico permitido A-05',
         observacoes = 'Observacao permitida A-05',
         descricao = 'ATAQUE A-05',
         prioridade = 'urgente',
         id_atendente = NULL
   WHERE id = v_os_aberta;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'FALHA A-05: mecanico nao atualizou a propria OS.';
  END IF;

  SELECT descricao, diagnostico, observacoes, prioridade, id_atendente
    INTO v_descricao, v_diagnostico, v_observacoes, v_prioridade, v_id_atendente
    FROM public.ordem_servico WHERE id = v_os_aberta;
  IF v_descricao = 'ATAQUE A-05'
     OR v_prioridade = 'urgente'
     OR v_id_atendente IS NULL
     OR v_diagnostico <> 'Diagnostico permitido A-05'
     OR v_observacoes <> 'Observacao permitida A-05' THEN
    RAISE EXCEPTION 'FALHA A-05: allowlist do mecanico nao restaurou campos protegidos.';
  END IF;

  UPDATE public.ordem_servico SET status = 'em_andamento' WHERE id = v_os_aberta;
  SELECT status INTO v_status FROM public.ordem_servico WHERE id = v_os_aberta;
  IF v_status <> 'em_andamento' THEN
    RAISE EXCEPTION 'FALHA A-05: mecanico nao conseguiu usar status operacional.';
  END IF;

  v_bloqueado := false;
  BEGIN
    UPDATE public.ordem_servico SET status = 'concluida' WHERE id = v_os_aberta;
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'P0001' THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA A-05: mecanico concluiu OS diretamente.';
  END IF;

  v_bloqueado := false;
  BEGIN
    UPDATE public.ordem_servico SET status = 'cancelada' WHERE id = v_os_aberta;
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'P0001' THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA A-05/A-07: mecanico cancelou OS diretamente.';
  END IF;

  v_bloqueado := false;
  BEGIN
    UPDATE public.ordem_servico SET status = 'em_andamento' WHERE id = v_os_concluida;
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA A-05: mecanico reabriu OS encerrada.';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'OK A-05: mecanico limitado a diagnostico, observacoes e status operacional.';

  -- ---------------------------------------------------------- A-09 + REST
  SELECT id_usuario, valor_comissao_mecanico, valor_comissao_atendente
    INTO v_id_usuario, v_comissao_mecanico, v_comissao_atendente
    FROM public.ordem_servico WHERE id = v_os_aberta;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_gestor, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;

  PERFORM public.salvar_ordem_servico_com_itens(
    v_os_aberta,
    jsonb_build_object(
      'descricao', 'Atualizacao permitida A-09',
      'id_usuario', v_atendente,
      'valor_comissao_mecanico', 99999,
      'valor_comissao_atendente', 99999
    ),
    NULL,
    NULL
  );

  SELECT descricao, id_usuario, valor_comissao_mecanico, valor_comissao_atendente
    INTO v_descricao, v_id_usuario, v_comissao_mecanico, v_comissao_atendente
    FROM public.ordem_servico WHERE id = v_os_aberta;
  IF v_descricao <> 'Atualizacao permitida A-09'
     OR v_id_usuario <> v_gestor
     OR v_comissao_mecanico <> 0
     OR v_comissao_atendente <> 0 THEN
    RAISE EXCEPTION 'FALHA A-09: RPC aceitou autoria/comissao enviada pelo cliente.';
  END IF;

  v_bloqueado := false;
  BEGIN
    UPDATE public.ordem_servico SET id_usuario = v_atendente WHERE id = v_os_aberta;
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA REST: id_usuario da OS foi alterado diretamente.';
  END IF;

  v_bloqueado := false;
  BEGIN
    UPDATE public.ordem_servico
       SET valor_comissao_mecanico = 99999,
           valor_comissao_atendente = 99999
     WHERE id = v_os_aberta;
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA REST: comissoes da OS foram alteradas diretamente.';
  END IF;

  -- Gestor pode corrigir o cabecalho encerrado, exceto campos protegidos.
  UPDATE public.ordem_servico
     SET descricao = 'Cabecalho corrigido pelo gestor'
   WHERE id = v_os_concluida;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'FALHA A-06: gestor nao corrigiu cabecalho encerrado.';
  END IF;

  -- Cancelamento direto e bloqueado inclusive para gestor.
  v_bloqueado := false;
  BEGIN
    UPDATE public.ordem_servico SET status = 'cancelada' WHERE id = v_os_concluida;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA A-07: gestor cancelou OS concluida sem RPC.';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'OK A-09/REST: RPC filtra autoria/comissoes e REST bloqueia campos protegidos.';

  -- ---------------------------------------------------------------- A-07
  SELECT quantidade INTO v_saldo_antes
    FROM public.item_estoque WHERE id = v_item;
  SELECT COALESCE(sum(quantidade_baixada), 0), count(*) FILTER (WHERE quantidade_baixada > 0)
    INTO v_baixado, v_itens_estornados
    FROM public.os_baixa_estoque WHERE id_os = v_os_concluida;
  SELECT count(*) INTO v_movimentos_antes
    FROM public.movimentacao_estoque WHERE id_os = v_os_concluida;
  SELECT to_jsonb(os) - ARRAY['status', 'data_encerramento', 'atualizado_em']
    INTO v_cabecalho
    FROM public.ordem_servico os WHERE id = v_os_concluida;
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.papel), '[]'::jsonb)
    INTO v_snapshot
    FROM public.os_comissao c WHERE c.id_os = v_os_concluida;

  SET LOCAL ROLE authenticated;
  PERFORM public.cancelar_ordem_servico(v_os_concluida);
  RESET ROLE;

  SELECT quantidade INTO v_saldo FROM public.item_estoque WHERE id = v_item;
  SELECT count(*) INTO v_movimentos
    FROM public.movimentacao_estoque WHERE id_os = v_os_concluida;
  SELECT status, data_encerramento,
         to_jsonb(os) - ARRAY['status', 'data_encerramento', 'atualizado_em']
    INTO v_status, v_data_encerramento, v_cabecalho_depois
    FROM public.ordem_servico os WHERE id = v_os_concluida;
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.papel), '[]'::jsonb)
    INTO v_snapshot_depois
    FROM public.os_comissao c WHERE c.id_os = v_os_concluida;

  IF v_status <> 'cancelada'
     OR v_data_encerramento IS NULL
     OR v_saldo <> v_saldo_antes + v_baixado
     OR v_movimentos <> v_movimentos_antes + v_itens_estornados
     OR EXISTS (
       SELECT 1 FROM public.os_baixa_estoque
        WHERE id_os = v_os_concluida AND quantidade_baixada <> 0
     )
     OR v_cabecalho_depois IS DISTINCT FROM v_cabecalho
     OR v_snapshot_depois IS DISTINCT FROM v_snapshot THEN
    RAISE EXCEPTION 'FALHA A-07: cancelamento nao estornou/preservou dados corretamente.';
  END IF;

  -- Segunda chamada nao muda saldo, ledger, snapshot nem totais.
  v_saldo_antes := v_saldo;
  v_movimentos_antes := v_movimentos;
  SET LOCAL ROLE authenticated;
  PERFORM public.cancelar_ordem_servico(v_os_concluida);
  RESET ROLE;
  SELECT quantidade INTO v_saldo FROM public.item_estoque WHERE id = v_item;
  SELECT count(*) INTO v_movimentos
    FROM public.movimentacao_estoque WHERE id_os = v_os_concluida;
  IF v_saldo <> v_saldo_antes OR v_movimentos <> v_movimentos_antes THEN
    RAISE EXCEPTION 'FALHA A-07: cancelamento repetido duplicou o estorno.';
  END IF;
  RAISE NOTICE 'OK A-07: cancelamento transacional estorna uma vez e preserva snapshot/totais.';

  -- ---------------------------------------------------------------- A-06
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_atendente, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;

  v_bloqueado := false;
  BEGIN
    UPDATE public.ordem_servico
       SET valor_total = valor_total + 1,
           desconto_valor = desconto_valor + 1,
           forma_pagamento = 'dinheiro',
           data_encerramento = now() - interval '1 day'
     WHERE id = v_os_concluida;
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA A-06: atendente alterou cabecalho monetario encerrado.';
  END IF;

  SELECT to_jsonb(os) - ARRAY['status', 'atualizado_em']
    INTO v_cabecalho
    FROM public.ordem_servico os WHERE id = v_os_concluida;
  PERFORM * FROM public.salvar_ordem_servico_com_itens(
    v_os_concluida,
    jsonb_build_object(
      'status', 'em_andamento',
      'valor_total', 99999,
      'forma_pagamento', 'dinheiro',
      'data_encerramento', NULL
    ),
    NULL,
    NULL
  );
  RESET ROLE;
  SELECT status,
         to_jsonb(os) - ARRAY['status', 'atualizado_em']
    INTO v_status, v_cabecalho_depois
    FROM public.ordem_servico os WHERE id = v_os_concluida;
  IF v_status <> 'em_andamento' THEN
    RAISE EXCEPTION 'FALHA A-06: status da reabertura nao foi persistido.';
  END IF;
  IF v_cabecalho_depois IS DISTINCT FROM v_cabecalho THEN
    RAISE EXCEPTION 'FALHA A-06: RPC de reabertura alterou campos historicos do atendente.';
  END IF;
  RAISE NOTICE 'OK A-06: atendente nao altera cabecalho encerrado e pode reabrir por status.';

  -- ---------------------------------------------------------------- A-10
  SELECT quantidade INTO v_saldo_antes
    FROM public.item_estoque WHERE id = v_item;
  SET LOCAL ROLE authenticated;
  v_bloqueado := false;
  BEGIN
    INSERT INTO public.movimentacao_estoque
      (id_item, id_usuario, tipo, quantidade, motivo, origem)
    VALUES
      (v_item, v_atendente, 'ajuste', 99999, 'Exploracao A-10', 'manual');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA A-10: atendente inseriu ajuste absoluto.';
  END IF;

  INSERT INTO public.movimentacao_estoque
    (id_item, id_usuario, tipo, quantidade, motivo, origem)
  VALUES
    (v_item, v_atendente, 'entrada', 1, 'Entrada permitida A-10', 'manual');
  RESET ROLE;
  SELECT quantidade INTO v_saldo FROM public.item_estoque WHERE id = v_item;
  IF v_saldo <> v_saldo_antes + 1 THEN
    RAISE EXCEPTION 'FALHA A-10: entrada operacional do atendente nao atualizou saldo.';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_gestor, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
  INSERT INTO public.movimentacao_estoque
    (id_item, id_usuario, tipo, quantidade, motivo, origem)
  VALUES
    (v_item, v_gestor, 'ajuste', v_saldo_antes + 5, 'Ajuste permitido A-10', 'manual');
  RESET ROLE;
  SELECT quantidade INTO v_saldo FROM public.item_estoque WHERE id = v_item;
  IF v_saldo <> v_saldo_antes + 5 THEN
    RAISE EXCEPTION 'FALHA A-10: ajuste do gestor nao definiu saldo absoluto.';
  END IF;
  RAISE NOTICE 'OK A-10: ajuste e exclusivo do gestor; entrada do atendente permanece permitida.';

  -- ---------------------------------------------------------------- A-08
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_atendente, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
  UPDATE public.usuario SET telefone = '(64) 90000-0029' WHERE id = v_atendente;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'FALHA A-08: autoedicao de campo permitido foi bloqueada.';
  END IF;

  v_bloqueado := false;
  BEGIN
    UPDATE public.usuario SET perfil = 'gestor' WHERE id = v_atendente;
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA A-08: usuario alterou o proprio perfil.';
  END IF;
  RESET ROLE;

  UPDATE public.usuario SET ativo = false WHERE id = v_mecanico;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_mecanico, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
  UPDATE public.usuario SET ativo = true WHERE id = v_mecanico;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RESET ROLE;

  SELECT perfil INTO v_perfil FROM public.usuario WHERE id = v_atendente;
  SELECT ativo INTO v_ativo FROM public.usuario WHERE id = v_mecanico;
  IF v_linhas <> 0 OR v_perfil <> 'atendente' OR v_ativo THEN
    RAISE EXCEPTION 'FALHA A-08: perfil/ativo proprio foi alterado indevidamente.';
  END IF;
  RAISE NOTICE 'OK A-08: autoedicao permitida sem escalacao nem reativacao.';

  -- Allowlist exata de SECURITY DEFINER para authenticated e bloqueio de anon.
  SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
    INTO v_funcoes_auth
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.classid = 'pg_catalog.pg_proc'::regclass
          AND d.objid = p.oid
          AND d.refclassid = 'pg_catalog.pg_extension'::regclass
          AND d.deptype = 'e'
     )
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_funcoes_auth IS DISTINCT FROM ARRAY[
    'cancelar_ordem_servico(uuid)',
    'criar_ordem_servico_com_itens(jsonb,jsonb,jsonb)',
    'finalizar_ordem_servico(uuid,character varying,numeric,numeric,character varying,text)',
    'fn_perfil_usuario_atual()',
    'salvar_cliente_com_endereco(uuid,jsonb,jsonb,boolean)',
    'salvar_ordem_servico_com_itens(uuid,jsonb,jsonb,jsonb)'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'FALHA allowlist SECURITY DEFINER: %', v_funcoes_auth;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend d
         WHERE d.classid = 'pg_catalog.pg_proc'::regclass
           AND d.objid = p.oid
           AND d.refclassid = 'pg_catalog.pg_extension'::regclass
           AND d.deptype = 'e'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'FALHA privilegios: anon executa SECURITY DEFINER da aplicacao.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm')
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend d
         WHERE d.classid = 'pg_catalog.pg_class'::regclass
           AND d.objid = c.oid
           AND d.refclassid = 'pg_catalog.pg_extension'::regclass
           AND d.deptype = 'e'
      )
      AND has_table_privilege('anon', c.oid, 'SELECT')
  ) THEN
    RAISE EXCEPTION 'FALHA views: anon pode ler view/materialized view de public.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND COALESCE(
        (
          SELECT option_value::BOOLEAN
            FROM pg_catalog.pg_options_to_table(c.reloptions)
           WHERE option_name = 'security_invoker'
        ),
        false
      ) = false
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend d
         WHERE d.classid = 'pg_catalog.pg_class'::regclass
           AND d.objid = c.oid
           AND d.refclassid = 'pg_catalog.pg_extension'::regclass
           AND d.deptype = 'e'
      )
      AND (
        has_table_privilege('authenticated', c.oid, 'INSERT')
        OR has_table_privilege('authenticated', c.oid, 'UPDATE')
        OR has_table_privilege('authenticated', c.oid, 'DELETE')
      )
  ) THEN
    RAISE EXCEPTION 'FALHA views: authenticated pode escrever em view que ignora RLS.';
  END IF;

  IF to_regclass('public.idx_os_comissao_funcionario') IS NULL
     OR to_regclass('public.idx_os_baixa_estoque_item') IS NULL THEN
    RAISE EXCEPTION 'FALHA indices: FKs da comissao/baixa continuam sem indice.';
  END IF;
  RAISE NOTICE 'OK privilegios/views/indices: allowlists exatas, anon bloqueado e FKs indexadas.';

  RAISE NOTICE '=== HARDENING 29: todos os caminhos de exploracao e permitidos passaram ===';
END;
$teste$;

ROLLBACK;
