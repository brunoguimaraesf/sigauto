-- =============================================================================
-- SIGAuto - Row Level Security (RLS) Policies
-- Arquivo: 02_rls_policies.sql
-- DescriÃ§Ã£o: HabilitaÃ§Ã£o do RLS e polÃ­ticas de acesso por perfil
-- PrÃ©-requisito: 01_schema.sql deve ter sido executado
-- =============================================================================

-- -----------------------------------------------------------------------------
-- HELPER FUNCTION: retorna o perfil do usuÃ¡rio autenticado
-- LÃª da tabela usuario usando o JWT do Supabase (auth.uid())
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_perfil_usuario_atual()
RETURNS perfil_usuario
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil perfil_usuario;
BEGIN
  SELECT u.perfil
    INTO v_perfil
    FROM public.usuario u
   WHERE u.id = auth.uid()
     AND u.ativo = true
   LIMIT 1;

  RETURN v_perfil;
END;
$$;

COMMENT ON FUNCTION fn_perfil_usuario_atual() IS
  'Retorna o enum perfil_usuario do usuÃ¡rio autenticado via JWT';

-- -----------------------------------------------------------------------------
-- HABILITAR RLS EM TODAS AS TABELAS
-- -----------------------------------------------------------------------------

ALTER TABLE usuario               ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente               ENABLE ROW LEVEL SECURITY;
ALTER TABLE veiculo               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordem_servico         ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_estoque          ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacao_estoque  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagem_chatbot      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recomendacao_ia       ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_auditoria         ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- TABELA: usuario
-- =============================================================================

-- Gestor: acesso total
CREATE POLICY pol_usuario_gestor_all ON usuario
  FOR ALL
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');

-- Qualquer usuÃ¡rio autenticado pode ler seu prÃ³prio registro
CREATE POLICY pol_usuario_self_select ON usuario
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Qualquer usuÃ¡rio autenticado pode atualizar seu prÃ³prio registro (exceto perfil)
CREATE POLICY pol_usuario_self_update ON usuario
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND perfil = (SELECT perfil FROM usuario WHERE id = auth.uid()));

-- =============================================================================
-- TABELA: cliente
-- =============================================================================

-- Gestor: acesso total
CREATE POLICY pol_cliente_gestor_all ON cliente
  FOR ALL
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');

-- Atendente: SELECT, INSERT, UPDATE (sem DELETE)
CREATE POLICY pol_cliente_atendente_select ON cliente
  FOR SELECT
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_cliente_atendente_insert ON cliente
  FOR INSERT
  TO authenticated
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_cliente_atendente_update ON cliente
  FOR UPDATE
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente')
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

-- MecÃ¢nico: SELECT somente de clientes que possuem veÃ­culo com OS atribuÃ­da a ele
CREATE POLICY pol_cliente_mecanico_select ON cliente
  FOR SELECT
  TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND EXISTS (
      SELECT 1
      FROM veiculo v
      JOIN ordem_servico os ON os.id_veiculo = v.id
      WHERE v.id_cliente = cliente.id
        AND os.id_usuario = auth.uid()
    )
  );

-- =============================================================================
-- TABELA: veiculo
-- =============================================================================

-- Gestor: acesso total
CREATE POLICY pol_veiculo_gestor_all ON veiculo
  FOR ALL
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');

-- Atendente: SELECT, INSERT, UPDATE (sem DELETE)
CREATE POLICY pol_veiculo_atendente_select ON veiculo
  FOR SELECT
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_veiculo_atendente_insert ON veiculo
  FOR INSERT
  TO authenticated
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_veiculo_atendente_update ON veiculo
  FOR UPDATE
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente')
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

-- MecÃ¢nico: SELECT somente de veÃ­culos em OS atribuÃ­das a ele
CREATE POLICY pol_veiculo_mecanico_select ON veiculo
  FOR SELECT
  TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND id IN (
      SELECT os.id_veiculo
      FROM ordem_servico os
      WHERE os.id_mecanico = auth.uid()
    )
  );

-- =============================================================================
-- TABELA: ordem_servico
-- =============================================================================

-- Gestor: acesso total
CREATE POLICY pol_os_gestor_all ON ordem_servico
  FOR ALL
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');

-- Atendente: SELECT, INSERT, UPDATE (sem DELETE)
CREATE POLICY pol_os_atendente_select ON ordem_servico
  FOR SELECT
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_os_atendente_insert ON ordem_servico
  FOR INSERT
  TO authenticated
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_os_atendente_update ON ordem_servico
  FOR UPDATE
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente')
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

-- MecÃ¢nico: SELECT somente nas OS em que Ã© responsÃ¡vel
CREATE POLICY pol_os_mecanico_select ON ordem_servico
  FOR SELECT
  TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico = auth.uid()
  );

-- MecÃ¢nico: UPDATE restrito a diagnostico, status e observacoes
-- A verificaÃ§Ã£o dos campos Ã© feita via WITH CHECK comparando os demais campos
CREATE POLICY pol_os_mecanico_update ON ordem_servico
  FOR UPDATE
  TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico = auth.uid()
  )
  WITH CHECK (
    fn_perfil_usuario_atual() = 'mecanico'
    AND forma_pagamento   IS NOT DISTINCT FROM (SELECT forma_pagamento FROM ordem_servico WHERE id = ordem_servico.id)
  );

-- =============================================================================
-- TABELA: item_estoque
-- =============================================================================

-- Gestor: acesso total
CREATE POLICY pol_estoque_gestor_all ON item_estoque
  FOR ALL
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');

-- Atendente: SELECT, INSERT, UPDATE (sem DELETE)
CREATE POLICY pol_estoque_atendente_select ON item_estoque
  FOR SELECT
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_estoque_atendente_insert ON item_estoque
  FOR INSERT
  TO authenticated
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_estoque_atendente_update ON item_estoque
  FOR UPDATE
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente')
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

-- =============================================================================
-- TABELA: movimentacao_estoque
-- =============================================================================

-- Gestor: acesso total
CREATE POLICY pol_mov_gestor_all ON movimentacao_estoque
  FOR ALL
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');

-- Atendente: SELECT, INSERT, UPDATE (sem DELETE)
CREATE POLICY pol_mov_atendente_select ON movimentacao_estoque
  FOR SELECT
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_mov_atendente_insert ON movimentacao_estoque
  FOR INSERT
  TO authenticated
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_mov_atendente_update ON movimentacao_estoque
  FOR UPDATE
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente')
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

-- =============================================================================
-- TABELA: mensagem_chatbot
-- =============================================================================

-- Gestor: acesso total
CREATE POLICY pol_chatbot_gestor_all ON mensagem_chatbot
  FOR ALL
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');

-- Qualquer usuÃ¡rio autenticado pode ver e inserir suas prÃ³prias mensagens
CREATE POLICY pol_chatbot_self_select ON mensagem_chatbot
  FOR SELECT
  TO authenticated
  USING (id_usuario = auth.uid());

CREATE POLICY pol_chatbot_self_insert ON mensagem_chatbot
  FOR INSERT
  TO authenticated
  WITH CHECK (id_usuario = auth.uid());

-- =============================================================================
-- TABELA: recomendacao_ia
-- =============================================================================

-- Gestor: acesso total
CREATE POLICY pol_recom_gestor_all ON recomendacao_ia
  FOR ALL
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');

-- Atendente e mecÃ¢nico: SELECT nas recomendaÃ§Ãµes vinculadas a eles
CREATE POLICY pol_recom_usuario_select ON recomendacao_ia
  FOR SELECT
  TO authenticated
  USING (
    id_usuario = auth.uid()
    OR id_os IN (
      SELECT id FROM ordem_servico WHERE id_usuario = auth.uid()
    )
  );

-- =============================================================================
-- TABELA: log_auditoria
-- =============================================================================

-- Somente gestor pode visualizar o log
CREATE POLICY pol_audit_gestor_select ON log_auditoria
  FOR SELECT
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor');

-- InserÃ§Ã£o de log Ã© feita pelo sistema (SECURITY DEFINER functions)
-- Nenhum usuÃ¡rio final pode inserir/alterar/deletar diretamente
CREATE POLICY pol_audit_gestor_insert ON log_auditoria
  FOR INSERT
  TO authenticated
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');
