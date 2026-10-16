-- =============================================================================
-- 26_enforcement_os_estoque.sql
-- Fase restritiva, aplicada somente depois do frontend que usa os RPCs das
-- migracoes 22/23. Fecha os caminhos REST que poderiam contornar a baixa,
-- alterar itens concluidos ou editar o ledger.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

-- Ledger append-only. Correcao e um novo movimento compensatorio.
DROP POLICY IF EXISTS pol_mov_gestor_all ON public.movimentacao_estoque;
DROP POLICY IF EXISTS pol_mov_atendente_select ON public.movimentacao_estoque;
DROP POLICY IF EXISTS pol_mov_atendente_insert ON public.movimentacao_estoque;
DROP POLICY IF EXISTS pol_mov_atendente_update ON public.movimentacao_estoque;
DROP POLICY IF EXISTS pol_mov_operacional_select ON public.movimentacao_estoque;
DROP POLICY IF EXISTS pol_mov_operacional_insert ON public.movimentacao_estoque;

CREATE POLICY pol_mov_operacional_select ON public.movimentacao_estoque
  FOR SELECT TO authenticated
  USING (public.fn_perfil_usuario_atual() IN ('gestor', 'atendente'));

CREATE POLICY pol_mov_operacional_insert ON public.movimentacao_estoque
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_perfil_usuario_atual() IN ('gestor', 'atendente')
    AND id_usuario = auth.uid()
    AND origem = 'manual'
    AND id_os IS NULL
    AND NULLIF(btrim(motivo), '') IS NOT NULL
  );

-- Inserir/concluir por REST simples contornaria a operacao transacional.
DROP POLICY IF EXISTS pol_os_insert_nao_concluida ON public.ordem_servico;
CREATE POLICY pol_os_insert_nao_concluida ON public.ordem_servico
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (status <> 'concluida');

DROP TRIGGER IF EXISTS trg_item_estoque_guard_saldo ON public.item_estoque;
CREATE TRIGGER trg_item_estoque_guard_saldo
  BEFORE UPDATE OF quantidade ON public.item_estoque
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_saldo_estoque();

DROP TRIGGER IF EXISTS trg_os_guard_finalizacao ON public.ordem_servico;
CREATE TRIGGER trg_os_guard_finalizacao
  BEFORE UPDATE OF status ON public.ordem_servico
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_finalizacao_os();

-- Mesmo gestor/atendente nao pode editar itens enquanto a OS esta concluida
-- ou cancelada. O RPC de salvamento tambem valida isso, em defesa em camadas.
DROP POLICY IF EXISTS pol_os_servico_editavel_insert ON public.os_servico;
CREATE POLICY pol_os_servico_editavel_insert ON public.os_servico
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ordem_servico os
     WHERE os.id = os_servico.id_os
       AND os.status NOT IN ('concluida', 'cancelada')
  ));

DROP POLICY IF EXISTS pol_os_servico_editavel_update ON public.os_servico;
CREATE POLICY pol_os_servico_editavel_update ON public.os_servico
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ordem_servico os
     WHERE os.id = os_servico.id_os
       AND os.status NOT IN ('concluida', 'cancelada')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ordem_servico os
     WHERE os.id = os_servico.id_os
       AND os.status NOT IN ('concluida', 'cancelada')
  ));

DROP POLICY IF EXISTS pol_os_servico_editavel_delete ON public.os_servico;
CREATE POLICY pol_os_servico_editavel_delete ON public.os_servico
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ordem_servico os
     WHERE os.id = os_servico.id_os
       AND os.status NOT IN ('concluida', 'cancelada')
  ));

DROP POLICY IF EXISTS pol_os_peca_editavel_insert ON public.os_peca;
CREATE POLICY pol_os_peca_editavel_insert ON public.os_peca
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ordem_servico os
     WHERE os.id = os_peca.id_os
       AND os.status NOT IN ('concluida', 'cancelada')
  ));

DROP POLICY IF EXISTS pol_os_peca_editavel_update ON public.os_peca;
CREATE POLICY pol_os_peca_editavel_update ON public.os_peca
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ordem_servico os
     WHERE os.id = os_peca.id_os
       AND os.status NOT IN ('concluida', 'cancelada')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ordem_servico os
     WHERE os.id = os_peca.id_os
       AND os.status NOT IN ('concluida', 'cancelada')
  ));

DROP POLICY IF EXISTS pol_os_peca_editavel_delete ON public.os_peca;
CREATE POLICY pol_os_peca_editavel_delete ON public.os_peca
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ordem_servico os
     WHERE os.id = os_peca.id_os
       AND os.status NOT IN ('concluida', 'cancelada')
  ));

COMMIT;
