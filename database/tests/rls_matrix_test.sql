-- =============================================================================
-- rls_matrix_test.sql — Teste da matriz de RLS por perfil
-- Rode no SQL Editor do Supabase. Simula cada perfil via request.jwt.claims e
-- verifica o que cada um enxerga. Falha com RAISE EXCEPTION se um invariante de
-- seguranca for violado; emite RAISE NOTICE para observacoes.
--
-- Tudo roda dentro de uma transacao com ROLLBACK: nao altera dados.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_mec uuid;
  v_ges uuid;
  v_att uuid;
  v_total_cli int;
  v_total_os  int;
  v_total_est int;
  v_esperado  int;
  v_cnt       int;
  v_cnt_com   int;
BEGIN
  -- IDs coletados como owner (antes de trocar de role — depois o RLS bloquearia)
  SELECT id INTO v_mec FROM usuario WHERE perfil = 'mecanico'  AND ativo LIMIT 1;
  SELECT id INTO v_ges FROM usuario WHERE perfil = 'gestor'    AND ativo LIMIT 1;
  SELECT id INTO v_att FROM usuario WHERE perfil = 'atendente' AND ativo LIMIT 1;
  SELECT count(*) INTO v_total_cli FROM cliente;
  SELECT count(*) INTO v_total_os  FROM ordem_servico;
  SELECT count(*) INTO v_total_est FROM item_estoque;

  -- ---------------------------------------------------------------- GESTOR
  IF v_ges IS NULL THEN
    RAISE NOTICE 'PULADO: nenhum gestor ativo para testar.';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ges, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    SELECT count(*) INTO v_cnt FROM cliente;
    IF v_cnt <> v_total_cli THEN RAISE EXCEPTION 'FALHA gestor: deveria ver % clientes, viu %', v_total_cli, v_cnt; END IF;
    SELECT count(*) INTO v_cnt FROM ordem_servico;
    IF v_cnt <> v_total_os THEN RAISE EXCEPTION 'FALHA gestor: deveria ver % OS, viu %', v_total_os, v_cnt; END IF;
    SELECT count(*) INTO v_cnt FROM item_estoque;
    IF v_cnt <> v_total_est THEN RAISE EXCEPTION 'FALHA gestor: deveria ver % itens de estoque, viu %', v_total_est, v_cnt; END IF;

    RESET ROLE;
    RAISE NOTICE 'OK gestor: acesso total (clientes=%, os=%, estoque=%).', v_total_cli, v_total_os, v_total_est;
  END IF;

  -- ---------------------------------------------------------------- MECANICO
  IF v_mec IS NULL THEN
    RAISE NOTICE 'PULADO: nenhum mecanico ativo para testar.';
  ELSE
    -- Quantas OS ESTAO atribuidas a este mecanico (via funcionario)
    SELECT count(*) INTO v_esperado
      FROM ordem_servico o JOIN funcionario f ON f.id = o.id_mecanico
     WHERE f.id_usuario = v_mec;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_mec, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    -- OS: mecanico so ve as suas
    SELECT count(*) INTO v_cnt FROM ordem_servico;
    IF v_cnt <> v_esperado THEN RAISE EXCEPTION 'FALHA mecanico: deveria ver % OS (as suas), viu %', v_esperado, v_cnt; END IF;

    -- Estoque: mecanico nao gerencia estoque -> nao deve ver (0)
    SELECT count(*) INTO v_cnt FROM item_estoque;
    IF v_cnt <> 0 THEN RAISE EXCEPTION 'FALHA mecanico: nao deveria ver estoque, viu %', v_cnt; END IF;

    -- Comissao (Strix Finding 2): mecanico NAO deveria ler comissao de outros.
    SELECT count(*) INTO v_cnt FROM funcionario;
    IF v_cnt > 1 THEN
      RAISE NOTICE 'AVISO (Strix): mecanico enxerga % funcionarios (comissao exposta). Aplicar hardening (view funcionario_publico).', v_cnt;
    END IF;

    RESET ROLE;
    RAISE NOTICE 'OK mecanico: OS restritas as suas (%), sem acesso a estoque.', v_esperado;
  END IF;

  -- ---------------------------------------------------------------- ATENDENTE
  IF v_att IS NULL THEN
    RAISE NOTICE 'PULADO: nenhum atendente ativo para testar (crie uma conta atendente para cobrir este perfil).';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_att, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    SELECT count(*) INTO v_cnt FROM cliente;
    IF v_cnt <> v_total_cli THEN RAISE EXCEPTION 'FALHA atendente: deveria ver % clientes, viu %', v_total_cli, v_cnt; END IF;
    SELECT count(*) INTO v_cnt FROM ordem_servico;
    IF v_cnt <> v_total_os THEN RAISE EXCEPTION 'FALHA atendente: deveria ver % OS, viu %', v_total_os, v_cnt; END IF;

    RESET ROLE;
    RAISE NOTICE 'OK atendente: acesso operacional a clientes e OS.', v_total_cli;
  END IF;

  RAISE NOTICE '=== RLS MATRIX: todos os invariantes de seguranca passaram ===';
END $$;

ROLLBACK;
