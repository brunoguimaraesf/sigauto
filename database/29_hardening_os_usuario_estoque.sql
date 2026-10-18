-- =============================================================================
-- 29_hardening_os_usuario_estoque.sql
-- Fecha os vetores A-05 a A-10 da auditoria: escrita de colunas protegidas da
-- OS, cancelamento com estorno, auto-reativacao de usuario, allowlist do RPC de
-- OS e ajuste arbitrario de estoque. Transacional e idempotente.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

-- -----------------------------------------------------------------------------
-- A-05/A-06: guard future-safe do cabecalho da OS.
--
-- A comparacao por JSONB faz colunas adicionadas no futuro nascerem bloqueadas
-- para mecanico e, em OS encerrada, para atendente. `atualizado_em` e excluido
-- porque outro trigger o atualiza automaticamente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_atualizacao_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $guard$
DECLARE
  v_perfil public.perfil_usuario := public.fn_perfil_usuario_atual();
  v_cancelamento_interno BOOLEAN :=
    current_setting('app.cancelamento_os', true) IS NOT DISTINCT FROM 'on';
  v_snapshot_interno BOOLEAN :=
    current_setting('app.snapshot_comissao_os', true) IS NOT DISTINCT FROM 'on';
BEGIN
  -- A autoria e imutavel depois da criacao, inclusive para gestor e RPCs.
  IF NEW.id_usuario IS DISTINCT FROM OLD.id_usuario THEN
    RAISE EXCEPTION 'O usuario que registrou a OS nao pode ser alterado.'
      USING ERRCODE = '42501';
  END IF;

  -- As comissoes escalares so podem ser sincronizadas pela funcao interna que
  -- cria o snapshot. Escrita REST/RPC direta e recusada para qualquer perfil.
  IF (NEW.valor_comissao_mecanico IS DISTINCT FROM OLD.valor_comissao_mecanico
      OR NEW.valor_comissao_atendente IS DISTINCT FROM OLD.valor_comissao_atendente)
     AND NOT v_snapshot_interno THEN
    RAISE EXCEPTION 'As comissoes da OS sao definidas no encerramento.'
      USING ERRCODE = '42501';
  END IF;

  IF v_perfil = 'mecanico' THEN
    IF OLD.status IN ('concluida', 'cancelada')
       AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Mecanico nao pode reabrir uma OS encerrada.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('aberta', 'em_andamento', 'aguardando_peca') THEN
      RAISE EXCEPTION 'Mecanico pode usar somente status operacionais.'
        USING ERRCODE = '42501';
    END IF;

    -- Restaura silenciosamente toda coluna fora da allowlist operacional. A
    -- base OLD torna a regra segura para colunas que forem criadas no futuro.
    IF (to_jsonb(NEW) - ARRAY['diagnostico', 'observacoes', 'status', 'atualizado_em'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['diagnostico', 'observacoes', 'status', 'atualizado_em']) THEN
      NEW := jsonb_populate_record(
        OLD,
        jsonb_build_object(
          'diagnostico', NEW.diagnostico,
          'observacoes', NEW.observacoes,
          'status', NEW.status,
          'atualizado_em', NEW.atualizado_em
        )
      );
    END IF;
  ELSIF v_perfil = 'atendente'
        AND OLD.status IN ('concluida', 'cancelada')
        AND NOT v_cancelamento_interno THEN
    -- Em OS encerrada o atendente apenas reabre pelo status. Totais, desconto,
    -- pagamento, comissoes, encerramento e qualquer coluna futura ficam
    -- congelados. O gestor continua podendo corrigir o cabecalho.
    IF (to_jsonb(NEW) - ARRAY['status', 'atualizado_em'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'atualizado_em']) THEN
      RAISE EXCEPTION 'Atendente pode alterar somente o status de uma OS encerrada.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$guard$;

COMMENT ON FUNCTION public.fn_guard_atualizacao_os() IS
  'A-05/A-06: protege autoria, comissoes e cabecalho encerrado; limita mecanico por allowlist future-safe.';

REVOKE ALL ON FUNCTION public.fn_guard_atualizacao_os()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_os_guard_atualizacao ON public.ordem_servico;
CREATE TRIGGER trg_os_guard_atualizacao
  BEFORE UPDATE ON public.ordem_servico
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_atualizacao_os();

-- A-07: concluir e cancelar sao transicoes exclusivamente transacionais.
CREATE OR REPLACE FUNCTION public.fn_guard_finalizacao_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $guard$
BEGIN
  IF NEW.status = 'concluida'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND current_setting('app.finalizacao_os', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Finalize a OS pela operacao transacional de encerramento.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'cancelada'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND current_setting('app.cancelamento_os', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Cancele a OS pela operacao transacional de cancelamento.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$guard$;

COMMENT ON FUNCTION public.fn_guard_finalizacao_os() IS
  'Exige os RPCs transacionais para toda transicao a concluida ou cancelada.';

REVOKE ALL ON FUNCTION public.fn_guard_finalizacao_os()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_os_guard_finalizacao ON public.ordem_servico;
CREATE TRIGGER trg_os_guard_finalizacao
  BEFORE UPDATE OF status ON public.ordem_servico
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_finalizacao_os();

-- O snapshot e o unico caminho autorizado a atualizar as comissoes escalares.
-- A flag e local a transacao e nao e exposta como RPC.
CREATE OR REPLACE FUNCTION public.fn_snapshot_comissoes_os(
  p_id_os UUID,
  p_valor_servicos NUMERIC,
  p_valor_pecas NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $snapshot$
BEGIN
  DELETE FROM public.os_comissao WHERE id_os = p_id_os;

  INSERT INTO public.os_comissao
    (id_os, papel, id_funcionario, nome, percentual, sobre_servicos,
     sobre_pecas, base_servicos, base_pecas, valor)
  SELECT p_id_os,
         papel.nome,
         f.id,
         f.nome,
         f.comissao_percentual,
         f.comissao_sobre_servicos,
         f.comissao_sobre_pecas,
         CASE WHEN f.comissao_sobre_servicos THEN COALESCE(p_valor_servicos, 0) ELSE 0 END,
         CASE WHEN f.comissao_sobre_pecas THEN COALESCE(p_valor_pecas, 0) ELSE 0 END,
         round((
           CASE WHEN f.comissao_sobre_servicos THEN COALESCE(p_valor_servicos, 0) ELSE 0 END
           + CASE WHEN f.comissao_sobre_pecas THEN COALESCE(p_valor_pecas, 0) ELSE 0 END
         ) * f.comissao_percentual / 100, 2)
    FROM public.ordem_servico os
   CROSS JOIN (VALUES ('mecanico'), ('atendente')) AS papel(nome)
    JOIN public.funcionario f
      ON f.id = CASE WHEN papel.nome = 'mecanico' THEN os.id_mecanico ELSE os.id_atendente END
   WHERE os.id = p_id_os;

  PERFORM set_config('app.snapshot_comissao_os', 'on', true);
  UPDATE public.ordem_servico os
     SET valor_comissao_mecanico = COALESCE((
           SELECT c.valor FROM public.os_comissao c
            WHERE c.id_os = p_id_os AND c.papel = 'mecanico'
         ), 0),
         valor_comissao_atendente = COALESCE((
           SELECT c.valor FROM public.os_comissao c
            WHERE c.id_os = p_id_os AND c.papel = 'atendente'
         ), 0)
   WHERE os.id = p_id_os;
  PERFORM set_config('app.snapshot_comissao_os', 'off', true);
END;
$snapshot$;

COMMENT ON FUNCTION public.fn_snapshot_comissoes_os(UUID, NUMERIC, NUMERIC) IS
  'Snapshot interno e atomico das comissoes no encerramento da OS.';

REVOKE ALL ON FUNCTION public.fn_snapshot_comissoes_os(UUID, NUMERIC, NUMERIC)
  FROM PUBLIC, anon, authenticated;

-- Estorna exatamente o saldo ainda registrado em os_baixa_estoque. Repetir a
-- chamada encontra quantidade zero e nao cria outro movimento.
CREATE OR REPLACE FUNCTION public.cancelar_ordem_servico(p_id_os UUID)
RETURNS SETOF public.ordem_servico
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $cancelar$
DECLARE
  v_os public.ordem_servico%ROWTYPE;
  v_usuario UUID := auth.uid();
  v_item RECORD;
BEGIN
  IF COALESCE(public.fn_perfil_usuario_atual()::text, '') NOT IN ('gestor', 'atendente') THEN
    RAISE EXCEPTION 'Perfil sem permissao para cancelar OS.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_os
    FROM public.ordem_servico
   WHERE id = p_id_os
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de servico nao encontrada.' USING ERRCODE = 'P0002';
  END IF;

  FOR v_item IN
    SELECT b.id_item, b.quantidade_baixada
      FROM public.os_baixa_estoque b
     WHERE b.id_os = p_id_os
       AND b.quantidade_baixada > 0
     ORDER BY b.id_item
     FOR UPDATE
  LOOP
    PERFORM 1
      FROM public.item_estoque
     WHERE id = v_item.id_item
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item de estoque da OS nao encontrado: %', v_item.id_item
        USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.movimentacao_estoque
      (id_item, id_os, id_usuario, tipo, quantidade, motivo, origem)
    VALUES
      (v_item.id_item, p_id_os, v_usuario, 'entrada', v_item.quantidade_baixada,
       left('Estorno do cancelamento da OS #' || COALESCE(v_os.numero_os::text, p_id_os::text), 100),
       'os');

    UPDATE public.os_baixa_estoque
       SET quantidade_baixada = 0,
           atualizado_em = now()
     WHERE id_os = p_id_os
       AND id_item = v_item.id_item;
  END LOOP;

  IF v_os.status IS DISTINCT FROM 'cancelada'::public.status_os THEN
    PERFORM set_config('app.cancelamento_os', 'on', true);
    UPDATE public.ordem_servico
       SET status = 'cancelada',
           data_encerramento = now(),
           atualizado_em = now()
     WHERE id = p_id_os;
    PERFORM set_config('app.cancelamento_os', 'off', true);
  END IF;

  RETURN QUERY SELECT * FROM public.ordem_servico WHERE id = p_id_os;
END;
$cancelar$;

COMMENT ON FUNCTION public.cancelar_ordem_servico(UUID) IS
  'A-07: cancela a OS e estorna pelo ledger a baixa pendente, atomicamente e de forma idempotente.';

REVOKE ALL ON FUNCTION public.cancelar_ordem_servico(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_ordem_servico(UUID)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- A-08: conta inativa nao consegue satisfazer USING e perfil/ativo do proprio
-- registro permanecem iguais aos valores anteriores.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS pol_usuario_self_update ON public.usuario;
CREATE POLICY pol_usuario_self_update ON public.usuario
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    AND public.fn_perfil_usuario_atual() IS NOT NULL
  )
  WITH CHECK (
    id = auth.uid()
    AND perfil = (SELECT u.perfil FROM public.usuario u WHERE u.id = auth.uid())
    AND ativo = (SELECT u.ativo FROM public.usuario u WHERE u.id = auth.uid())
  );

COMMENT ON POLICY pol_usuario_self_update ON public.usuario IS
  'A-08: autoedicao exige conta ativa e nao permite mudar perfil nem ativo.';

-- -----------------------------------------------------------------------------
-- A-09: substitui o RPC sem autoria/comissoes na allowlist nem no UPDATE.
-- As tres chaves sao removidas antes da validacao para manter compatibilidade
-- durante o rollout com clientes que ainda as enviem.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_ordem_servico_com_itens(
  p_id_os UUID,
  p_dados JSONB,
  p_servicos JSONB DEFAULT NULL,
  p_pecas JSONB DEFAULT NULL
)
RETURNS SETOF public.ordem_servico
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $salvar$
DECLARE
  v_os public.ordem_servico%ROWTYPE;
  v_perfil public.perfil_usuario := public.fn_perfil_usuario_atual();
  v_dados JSONB := COALESCE(p_dados, '{}'::jsonb)
    - ARRAY['id_usuario', 'valor_comissao_mecanico', 'valor_comissao_atendente'];
  v_chaves TEXT[];
BEGIN
  IF v_perfil IS NULL OR v_perfil NOT IN ('gestor', 'atendente', 'mecanico') THEN
    RAISE EXCEPTION 'Perfil sem permissao para alterar OS.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_os FROM public.ordem_servico WHERE id = p_id_os FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de servico nao encontrada.' USING ERRCODE = 'P0002';
  END IF;

  -- Durante o rollout o cliente anterior ainda envia campos de fechamento ao
  -- reabrir. Para atendente, conserva somente o status: o guard do cabecalho
  -- continua fail-closed e os valores historicos permanecem imutaveis.
  IF v_perfil = 'atendente' AND v_os.status IN ('concluida', 'cancelada') THEN
    v_dados := CASE
      WHEN v_dados ? 'status' THEN jsonb_build_object('status', v_dados->'status')
      ELSE '{}'::jsonb
    END;
  END IF;

  SELECT array_agg(key) INTO v_chaves FROM jsonb_object_keys(v_dados) AS key;
  IF v_perfil = 'mecanico' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.funcionario f
       WHERE f.id = v_os.id_mecanico AND f.id_usuario = auth.uid() AND f.ativo
    ) THEN
      RAISE EXCEPTION 'A OS nao esta atribuida ao mecanico autenticado.' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(v_chaves, ARRAY[]::TEXT[]) <@
         ARRAY['diagnostico', 'observacoes', 'status']::TEXT[] IS NOT TRUE
       OR p_servicos IS NOT NULL OR p_pecas IS NOT NULL THEN
      RAISE EXCEPTION 'Mecanico pode alterar somente diagnostico, observacoes e andamento.'
        USING ERRCODE = '42501';
    END IF;
    IF v_os.status IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Somente gestor ou atendente pode reabrir uma OS encerrada.'
        USING ERRCODE = '42501';
    END IF;
    IF v_dados ? 'status'
       AND (v_dados->>'status') NOT IN ('aberta', 'em_andamento', 'aguardando_peca') THEN
      RAISE EXCEPTION 'Status nao permitido ao mecanico.' USING ERRCODE = '42501';
    END IF;
  ELSIF COALESCE(v_chaves, ARRAY[]::TEXT[]) <@ ARRAY[
    'id_veiculo', 'id_mecanico', 'id_atendente', 'descricao', 'diagnostico',
    'status', 'prioridade', 'data_abertura', 'data_encerramento', 'km_entrada',
    'valor_total', 'forma_pagamento', 'observacoes', 'observacoes_finais',
    'desconto_tipo', 'desconto_valor', 'desconto_percentual', 'valor_servicos',
    'valor_pecas'
  ]::TEXT[] IS NOT TRUE THEN
    RAISE EXCEPTION 'Campo nao permitido na atualizacao da OS.' USING ERRCODE = '22023';
  END IF;

  IF (p_servicos IS NOT NULL OR p_pecas IS NOT NULL)
     AND v_os.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Reabra a OS antes de alterar seus itens.' USING ERRCODE = 'P0001';
  END IF;

  IF v_dados ? 'status'
     AND (v_dados->>'status') = 'concluida'
     AND v_os.status IS DISTINCT FROM 'concluida'::public.status_os THEN
    RAISE EXCEPTION 'Finalize a OS pela operacao transacional de encerramento.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_dados ? 'status'
     AND (v_dados->>'status') = 'cancelada'
     AND v_os.status IS DISTINCT FROM 'cancelada'::public.status_os THEN
    RAISE EXCEPTION 'Cancele a OS pela operacao transacional de cancelamento.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.ordem_servico os SET
    id_veiculo = CASE WHEN v_dados ? 'id_veiculo' THEN (v_dados->>'id_veiculo')::uuid ELSE os.id_veiculo END,
    id_mecanico = CASE WHEN v_dados ? 'id_mecanico' THEN NULLIF(v_dados->>'id_mecanico', '')::uuid ELSE os.id_mecanico END,
    id_atendente = CASE WHEN v_dados ? 'id_atendente' THEN NULLIF(v_dados->>'id_atendente', '')::uuid ELSE os.id_atendente END,
    descricao = CASE WHEN v_dados ? 'descricao' THEN v_dados->>'descricao' ELSE os.descricao END,
    diagnostico = CASE WHEN v_dados ? 'diagnostico' THEN v_dados->>'diagnostico' ELSE os.diagnostico END,
    status = CASE WHEN v_dados ? 'status' THEN (v_dados->>'status')::public.status_os ELSE os.status END,
    prioridade = CASE WHEN v_dados ? 'prioridade' THEN v_dados->>'prioridade' ELSE os.prioridade END,
    data_abertura = CASE WHEN v_dados ? 'data_abertura' THEN (v_dados->>'data_abertura')::timestamptz ELSE os.data_abertura END,
    data_encerramento = CASE WHEN v_dados ? 'data_encerramento' THEN NULLIF(v_dados->>'data_encerramento', '')::timestamptz ELSE os.data_encerramento END,
    km_entrada = CASE WHEN v_dados ? 'km_entrada' THEN NULLIF(v_dados->>'km_entrada', '')::integer ELSE os.km_entrada END,
    valor_total = CASE WHEN v_dados ? 'valor_total' THEN COALESCE((v_dados->>'valor_total')::numeric, 0) ELSE os.valor_total END,
    forma_pagamento = CASE WHEN v_dados ? 'forma_pagamento' THEN v_dados->>'forma_pagamento' ELSE os.forma_pagamento END,
    observacoes = CASE WHEN v_dados ? 'observacoes' THEN v_dados->>'observacoes' ELSE os.observacoes END,
    observacoes_finais = CASE WHEN v_dados ? 'observacoes_finais' THEN v_dados->>'observacoes_finais' ELSE os.observacoes_finais END,
    desconto_tipo = CASE WHEN v_dados ? 'desconto_tipo' THEN v_dados->>'desconto_tipo' ELSE os.desconto_tipo END,
    desconto_valor = CASE WHEN v_dados ? 'desconto_valor' THEN COALESCE((v_dados->>'desconto_valor')::numeric, 0) ELSE os.desconto_valor END,
    desconto_percentual = CASE WHEN v_dados ? 'desconto_percentual' THEN NULLIF(v_dados->>'desconto_percentual', '')::numeric ELSE os.desconto_percentual END,
    valor_servicos = CASE WHEN v_dados ? 'valor_servicos' THEN COALESCE((v_dados->>'valor_servicos')::numeric, 0) ELSE os.valor_servicos END,
    valor_pecas = CASE WHEN v_dados ? 'valor_pecas' THEN COALESCE((v_dados->>'valor_pecas')::numeric, 0) ELSE os.valor_pecas END,
    atualizado_em = now()
  WHERE os.id = p_id_os;

  IF p_servicos IS NOT NULL THEN
    DELETE FROM public.os_servico WHERE id_os = p_id_os;
    INSERT INTO public.os_servico (id_os, id_servico, descricao, quantidade, valor_unitario)
    SELECT p_id_os, x.id_servico, left(COALESCE(NULLIF(x.descricao, ''), 'Servico'), 200),
           x.quantidade, x.valor_unitario
      FROM jsonb_to_recordset(p_servicos) AS x(
        id_servico uuid, descricao text, quantidade numeric, valor_unitario numeric
      );
  END IF;

  IF p_pecas IS NOT NULL THEN
    DELETE FROM public.os_peca WHERE id_os = p_id_os;
    INSERT INTO public.os_peca (id_os, id_item, descricao, quantidade, valor_unitario)
    SELECT p_id_os, x.id_item, left(COALESCE(NULLIF(x.descricao, ''), 'Peca'), 200),
           x.quantidade, x.valor_unitario
      FROM jsonb_to_recordset(p_pecas) AS x(
        id_item uuid, descricao text, quantidade numeric, valor_unitario numeric
      );
  END IF;

  RETURN QUERY SELECT * FROM public.ordem_servico WHERE id = p_id_os;
END;
$salvar$;

COMMENT ON FUNCTION public.salvar_ordem_servico_com_itens(UUID, JSONB, JSONB, JSONB) IS
  'Atualiza OS e itens atomicamente; ignora autoria/comissoes enviadas pelo cliente.';

REVOKE ALL ON FUNCTION public.salvar_ordem_servico_com_itens(UUID, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_ordem_servico_com_itens(UUID, JSONB, JSONB, JSONB)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- A-10: somente gestor pode usar ajuste (saldo absoluto). Entrada e saida
-- manuais permanecem disponiveis ao atendente com autoria e motivo validos.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS pol_mov_operacional_insert ON public.movimentacao_estoque;
CREATE POLICY pol_mov_operacional_insert ON public.movimentacao_estoque
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_perfil_usuario_atual() IN ('gestor', 'atendente')
    AND id_usuario = auth.uid()
    AND origem = 'manual'
    AND id_os IS NULL
    AND NULLIF(btrim(motivo), '') IS NOT NULL
    AND (
      tipo <> 'ajuste'
      OR public.fn_perfil_usuario_atual() = 'gestor'
    )
  );

-- FKs que ainda nao tinham indice proprio.
CREATE INDEX IF NOT EXISTS idx_os_comissao_funcionario
  ON public.os_comissao(id_funcionario);
CREATE INDEX IF NOT EXISTS idx_os_baixa_estoque_item
  ON public.os_baixa_estoque(id_item);

-- -----------------------------------------------------------------------------
-- Allowlist global de SECURITY DEFINER executavel por authenticated.
-- Toda funcao da aplicacao perde PUBLIC/anon; authenticated conserva somente
-- os seis RPCs/helpers explicitamente necessarios.
-- -----------------------------------------------------------------------------
DO $privilegios$
DECLARE
  v_allowlist regprocedure[] := ARRAY[
    'public.fn_perfil_usuario_atual()'::regprocedure,
    'public.finalizar_ordem_servico(uuid,character varying,numeric,numeric,character varying,text)'::regprocedure,
    'public.salvar_ordem_servico_com_itens(uuid,jsonb,jsonb,jsonb)'::regprocedure,
    'public.criar_ordem_servico_com_itens(jsonb,jsonb,jsonb)'::regprocedure,
    'public.salvar_cliente_com_endereco(uuid,jsonb,jsonb,boolean)'::regprocedure,
    'public.cancelar_ordem_servico(uuid)'::regprocedure
  ];
  v_funcao regprocedure;
BEGIN
  FOR v_funcao IN
    SELECT p.oid::regprocedure
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND NOT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_depend d
          WHERE d.classid = 'pg_catalog.pg_proc'::regclass
            AND d.objid = p.oid
            AND d.refclassid = 'pg_catalog.pg_extension'::regclass
            AND d.deptype = 'e'
       )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      v_funcao
    );
    IF v_funcao = ANY(v_allowlist) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_funcao);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_funcao);
    END IF;
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, pg_catalog',
      v_funcao
    );
  END LOOP;
END;
$privilegios$;

-- -----------------------------------------------------------------------------
-- Pos-condicoes: qualquer aplicacao parcial aborta a transacao inteira.
-- -----------------------------------------------------------------------------
DO $pos_condicoes$
DECLARE
  v_allowlist regprocedure[] := ARRAY[
    'public.fn_perfil_usuario_atual()'::regprocedure,
    'public.finalizar_ordem_servico(uuid,character varying,numeric,numeric,character varying,text)'::regprocedure,
    'public.salvar_ordem_servico_com_itens(uuid,jsonb,jsonb,jsonb)'::regprocedure,
    'public.criar_ordem_servico_com_itens(jsonb,jsonb,jsonb)'::regprocedure,
    'public.salvar_cliente_com_endereco(uuid,jsonb,jsonb,boolean)'::regprocedure,
    'public.cancelar_ordem_servico(uuid)'::regprocedure
  ];
  v_funcao regprocedure;
  v_extras TEXT;
  v_anon TEXT;
  v_public TEXT;
  v_search_path TEXT;
  v_views_anon TEXT;
  v_views_escrita_auth TEXT;
  v_usando TEXT;
  v_check TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.ordem_servico'::regclass
       AND tgname = 'trg_os_guard_atualizacao'
       AND tgenabled <> 'D'
       AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.ordem_servico'::regclass
       AND tgname = 'trg_os_guard_finalizacao'
       AND tgenabled <> 'D'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Pos-condicao falhou: guards da OS ausentes ou desativados.';
  END IF;

  SELECT qual, with_check INTO v_usando, v_check
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'usuario'
     AND policyname = 'pol_usuario_self_update';
  IF v_usando IS NULL
     OR v_usando NOT LIKE '%fn_perfil_usuario_atual() IS NOT NULL%'
     OR v_check IS NULL
     OR v_check NOT LIKE '%perfil%'
     OR v_check NOT LIKE '%ativo%' THEN
    RAISE EXCEPTION 'Pos-condicao falhou: pol_usuario_self_update nao fixa perfil/ativo de conta ativa.';
  END IF;

  SELECT with_check INTO v_check
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'movimentacao_estoque'
     AND policyname = 'pol_mov_operacional_insert';
  IF v_check IS NULL
     OR v_check NOT LIKE '%ajuste%'
     OR v_check NOT LIKE '%gestor%' THEN
    RAISE EXCEPTION 'Pos-condicao falhou: ajuste de estoque nao esta restrito a gestor.';
  END IF;

  IF to_regclass('public.idx_os_comissao_funcionario') IS NULL
     OR to_regclass('public.idx_os_baixa_estoque_item') IS NULL THEN
    RAISE EXCEPTION 'Pos-condicao falhou: indices das FKs ausentes.';
  END IF;

  FOREACH v_funcao IN ARRAY v_allowlist LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid = v_funcao
         AND p.prosecdef
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION
        'Pos-condicao falhou: funcao permitida nao e SECURITY DEFINER executavel por authenticated: %',
        v_funcao;
    END IF;
  END LOOP;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_extras
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND NOT (p.oid::regprocedure = ANY(v_allowlist))
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.classid = 'pg_catalog.pg_proc'::regclass
          AND d.objid = p.oid
          AND d.refclassid = 'pg_catalog.pg_extension'::regclass
          AND d.deptype = 'e'
     )
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_extras IS NOT NULL THEN
    RAISE EXCEPTION 'Pos-condicao falhou: SECURITY DEFINER fora da allowlist para authenticated: %', v_extras;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_anon
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
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION 'Pos-condicao falhou: SECURITY DEFINER executavel por anon: %', v_anon;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_public
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND acl.grantee = 0
     AND acl.privilege_type = 'EXECUTE'
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.classid = 'pg_catalog.pg_proc'::regclass
          AND d.objid = p.oid
          AND d.refclassid = 'pg_catalog.pg_extension'::regclass
          AND d.deptype = 'e'
     );
  IF v_public IS NOT NULL THEN
    RAISE EXCEPTION 'Pos-condicao falhou: SECURITY DEFINER executavel por PUBLIC: %', v_public;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_search_path
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
     AND NOT (
       COALESCE(p.proconfig, ARRAY[]::TEXT[])
       @> ARRAY['search_path=public, pg_catalog']::TEXT[]
     );
  IF v_search_path IS NOT NULL THEN
    RAISE EXCEPTION 'Pos-condicao falhou: SECURITY DEFINER sem search_path fixo: %', v_search_path;
  END IF;

  -- Views e materialized views nao sao protegidas pelo RLS das tabelas-base
  -- quando executam com os direitos do dono. Nenhuma projecao propria de
  -- `public` pode ficar legivel por anon.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_views_anon
    FROM pg_catalog.pg_class c
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
     AND has_table_privilege('anon', c.oid, 'SELECT');
  IF v_views_anon IS NOT NULL THEN
    RAISE EXCEPTION 'Pos-condicao falhou: views de public legiveis por anon: %', v_views_anon;
  END IF;

  -- Uma view comum sem security_invoker usa o dono para acessar a tabela-base;
  -- escrita nela contornaria integralmente as policies de RLS.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_views_escrita_auth
    FROM pg_catalog.pg_class c
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
     );
  IF v_views_escrita_auth IS NOT NULL THEN
    RAISE EXCEPTION
      'Pos-condicao falhou: authenticated pode escrever em views que ignoram RLS: %',
      v_views_escrita_auth;
  END IF;
END;
$pos_condicoes$;

NOTIFY pgrst, 'reload schema';

COMMIT;
