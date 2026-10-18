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
  v_clientes_esperados int;
  v_clientes_ids uuid[];
  v_clientes_observados uuid[];
  v_comissoes_proprias int;
  v_cnt       int;
  v_cnt_com   int;
BEGIN
  -- IDs coletados como owner (antes de trocar de role — depois o RLS bloquearia)
  -- Prefere um mecanico com OS para que o teste da policy de clientes nao
  -- passe de forma vacua com 0 esperado e 0 observado.
  SELECT u.id INTO v_mec
    FROM usuario u
    LEFT JOIN funcionario f ON f.id_usuario = u.id AND f.ativo
    LEFT JOIN ordem_servico o ON o.id_mecanico = f.id
   WHERE u.perfil = 'mecanico' AND u.ativo
   GROUP BY u.id
   ORDER BY count(o.id) DESC
   LIMIT 1;
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

    SELECT count(DISTINCT v.id_cliente) INTO v_clientes_esperados
      FROM ordem_servico o
      JOIN funcionario f ON f.id = o.id_mecanico
      JOIN veiculo v ON v.id = o.id_veiculo
     WHERE f.id_usuario = v_mec;

    SELECT COALESCE(array_agg(DISTINCT v.id_cliente ORDER BY v.id_cliente), ARRAY[]::uuid[])
      INTO v_clientes_ids
      FROM ordem_servico o
      JOIN funcionario f ON f.id = o.id_mecanico
      JOIN veiculo v ON v.id = o.id_veiculo
     WHERE f.id_usuario = v_mec;

    SELECT count(*) INTO v_comissoes_proprias
      FROM os_comissao c
      JOIN funcionario f ON f.id = c.id_funcionario
     WHERE f.id_usuario = v_mec;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_mec, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    -- OS: mecanico so ve as suas
    SELECT count(*) INTO v_cnt FROM ordem_servico;
    IF v_cnt <> v_esperado THEN RAISE EXCEPTION 'FALHA mecanico: deveria ver % OS (as suas), viu %', v_esperado, v_cnt; END IF;

    -- Clientes: somente os proprietarios dos veiculos das suas OS. Esta
    -- assercao cobre a troca usuario.id -> funcionario.id da migracao 11.
    SELECT count(*) INTO v_cnt FROM cliente;
    IF v_cnt <> v_clientes_esperados THEN
      RAISE EXCEPTION 'FALHA mecanico: deveria ver % clientes das suas OS, viu %', v_clientes_esperados, v_cnt;
    END IF;
    SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[]) INTO v_clientes_observados FROM cliente;
    IF v_clientes_observados IS DISTINCT FROM v_clientes_ids THEN
      RAISE EXCEPTION 'FALHA mecanico: conjunto de clientes incorreto. Esperado %, observado %', v_clientes_ids, v_clientes_observados;
    END IF;

    -- Estoque: mecanico nao gerencia estoque -> nao deve ver (0)
    SELECT count(*) INTO v_cnt FROM item_estoque;
    IF v_cnt <> 0 THEN RAISE EXCEPTION 'FALHA mecanico: nao deveria ver estoque, viu %', v_cnt; END IF;

    -- Comissao (Strix Finding 2): mecanico NAO deveria ler comissao de outros.
    SELECT count(*) INTO v_cnt FROM funcionario;
    IF v_cnt > 1 THEN
      RAISE EXCEPTION 'FALHA mecanico: enxerga % funcionarios com dados de comissao.', v_cnt;
    END IF;

    SELECT count(*) INTO v_cnt_com FROM os_comissao;
    IF v_cnt_com <> v_comissoes_proprias THEN
      RAISE EXCEPTION 'FALHA mecanico: deveria ver % snapshots proprios, viu %.', v_comissoes_proprias, v_cnt_com;
    END IF;

    RESET ROLE;
    RAISE NOTICE 'OK mecanico: OS (%) e clientes (%) restritos as suas atribuicoes, sem acesso a estoque.', v_esperado, v_clientes_esperados;
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
    RAISE NOTICE 'OK atendente: acesso operacional a % clientes e as OS.', v_total_cli;
  END IF;

  RAISE NOTICE '=== RLS MATRIX: todos os invariantes de seguranca passaram ===';
END $$;

ROLLBACK;
