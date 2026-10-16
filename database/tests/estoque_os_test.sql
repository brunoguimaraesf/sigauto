-- =============================================================================
-- estoque_os_test.sql — integracao da baixa automatica da ordem de servico
-- Executado contra o Supabase efemero da CI depois das fixtures E2E.
-- Tudo roda em transacao e termina com ROLLBACK.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_gestor UUID;
  v_atendente UUID;
  v_item UUID;
  v_os UUID;
  v_os_sem_saldo UUID := 'f1000000-0000-4000-8000-000000000099';
  v_veiculo UUID;
  v_saldo_inicial NUMERIC(10,2);
  v_saldo NUMERIC(10,2);
  v_movimentos INTEGER;
  v_status status_os;
  v_linhas INTEGER;
  v_bloqueado BOOLEAN;
  v_trigger_ativo BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.movimentacao_estoque'::regclass
       AND tgname = 'trg_movimentacao_atualiza_estoque'
       AND tgenabled <> 'D'
       AND NOT tgisinternal
  ) INTO v_trigger_ativo;
  IF NOT v_trigger_ativo THEN
    RAISE EXCEPTION 'FALHA infraestrutura: trigger do ledger ausente ou desativado';
  END IF;

  SELECT id INTO STRICT v_gestor FROM public.usuario WHERE email = 'gestor@sigauto.com';
  SELECT id INTO STRICT v_atendente FROM public.usuario WHERE email = 'atendente@sigauto.com';
  SELECT id, quantidade INTO STRICT v_item, v_saldo_inicial
    FROM public.item_estoque WHERE codigo = 'FIL-001';
  SELECT id, id_veiculo INTO STRICT v_os, v_veiculo
    FROM public.ordem_servico WHERE numero_os = 9001;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM public.finalizar_ordem_servico(v_os, 'valor', 0, NULL, 'pix', 'Teste de baixa');

  SELECT quantidade INTO v_saldo FROM public.item_estoque WHERE id = v_item;
  IF v_saldo <> v_saldo_inicial - 1 THEN
    RAISE EXCEPTION 'FALHA baixa: saldo esperado %, observado %', v_saldo_inicial - 1, v_saldo;
  END IF;

  SELECT count(*) INTO v_movimentos
    FROM public.movimentacao_estoque
   WHERE id_os = v_os AND id_item = v_item AND origem = 'os' AND tipo = 'saida';
  IF v_movimentos <> 1 THEN
    RAISE EXCEPTION 'FALHA historico: esperado 1 movimento automatico, observado %', v_movimentos;
  END IF;

  SELECT count(*) INTO v_linhas FROM public.os_comissao WHERE id_os = v_os;
  IF v_linhas <> 2 THEN
    RAISE EXCEPTION 'FALHA comissao: encerramento deveria criar 2 snapshots, criou %', v_linhas;
  END IF;

  -- Itens de OS concluida nao podem ser alterados pelo REST autenticado.
  UPDATE public.os_peca SET quantidade = quantidade + 1 WHERE id_os = v_os;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'FALHA imutabilidade: alterou % peca(s) de OS concluida', v_linhas;
  END IF;

  -- Nem gestor pode reescrever o snapshot historico.
  v_bloqueado := false;
  BEGIN
    UPDATE public.os_comissao SET valor = valor + 1 WHERE id_os = v_os;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    v_bloqueado := v_linhas = 0;
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA imutabilidade: snapshot de comissao foi editado';
  END IF;

  -- Movimento manual nao pode falsificar o usuario responsavel.
  v_bloqueado := false;
  BEGIN
    INSERT INTO public.movimentacao_estoque
      (id_item, id_usuario, tipo, quantidade, motivo, origem)
    VALUES (v_item, v_atendente, 'entrada', 1, 'Tentativa forjada', 'manual');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA autoria: movimento aceitou usuario diferente de auth.uid()';
  END IF;

  -- Repetir a mesma requisicao nao pode baixar novamente nem mudar o ledger.
  PERFORM public.finalizar_ordem_servico(v_os, 'valor', 0, NULL, 'pix', 'Teste repetido');
  SELECT quantidade INTO v_saldo FROM public.item_estoque WHERE id = v_item;
  SELECT count(*) INTO v_movimentos FROM public.movimentacao_estoque WHERE id_os = v_os;
  IF v_saldo <> v_saldo_inicial - 1 OR v_movimentos <> 1 THEN
    RAISE EXCEPTION 'FALHA idempotencia: saldo %, movimentos %', v_saldo, v_movimentos;
  END IF;

  -- Reabrir e concluir sem alterar pecas nao baixa uma segunda vez.
  UPDATE public.ordem_servico SET status = 'em_andamento' WHERE id = v_os;
  PERFORM public.finalizar_ordem_servico(v_os, 'valor', 0, NULL, 'pix', 'Reconclusao');
  SELECT quantidade INTO v_saldo FROM public.item_estoque WHERE id = v_item;
  SELECT count(*) INTO v_movimentos FROM public.movimentacao_estoque WHERE id_os = v_os;
  IF v_saldo <> v_saldo_inicial - 1 OR v_movimentos <> 1 THEN
    RAISE EXCEPTION 'FALHA reconclusao: saldo %, movimentos %', v_saldo, v_movimentos;
  END IF;

  RESET ROLE;

  INSERT INTO public.ordem_servico
    (id, numero_os, id_veiculo, id_usuario, descricao, status)
  VALUES
    (v_os_sem_saldo, 9099, v_veiculo, v_gestor, 'Teste transacional sem saldo', 'aberta');
  INSERT INTO public.os_peca (id_os, id_item, descricao, quantidade, valor_unitario)
  VALUES (v_os_sem_saldo, v_item, 'Filtro de Oleo', v_saldo_inicial + 100, 45);

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.finalizar_ordem_servico(v_os_sem_saldo, 'valor', 0, NULL, 'pix', NULL);
    RAISE EXCEPTION 'FALHA saldo: finalizacao deveria ter sido recusada';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN NULL;
  END;

  SELECT status INTO v_status FROM public.ordem_servico WHERE id = v_os_sem_saldo;
  SELECT quantidade INTO v_saldo FROM public.item_estoque WHERE id = v_item;
  SELECT count(*) INTO v_movimentos FROM public.movimentacao_estoque WHERE id_os = v_os_sem_saldo;
  IF v_status <> 'aberta' OR v_saldo <> v_saldo_inicial - 1 OR v_movimentos <> 0 THEN
    RAISE EXCEPTION 'FALHA atomicidade: status %, saldo %, movimentos %', v_status, v_saldo, v_movimentos;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'OK estoque: baixa atomica, historico e idempotencia validados.';
END $$;

ROLLBACK;
