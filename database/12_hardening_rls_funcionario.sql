-- =============================================================================
-- 12_hardening_rls_funcionario.sql
-- Descricao: Corrige 2 achados de seguranca (revisao Strix) sobre o modelo
-- normalizado do arquivo 11:
--   Finding 1: WITH CHECK fraco em pol_os_mecanico_update permitia ao mecanico
--              reatribuir a OS a outro funcionario. Agora o WITH CHECK trava a
--              identidade (id_mecanico tem que continuar sendo o do proprio).
--   Finding 2: funcionario tinha SELECT liberado a todos (USING true), expondo
--              a comissao. Agora a leitura direta e restrita a gestor + o
--              proprio; nomes/cargos ficam disponiveis via a view
--              funcionario_publico (sem campos de comissao) para os dropdowns
--              e a resolucao de nomes nas telas.
--
-- ORDEM DE DEPLOY: rode este script SO DEPOIS de publicar o frontend que le a
-- lista geral de funcionarios pela view funcionario_publico (senao os selects
-- de mecanico/atendente ficariam vazios para nao-gestores).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------- Finding 1
DROP POLICY IF EXISTS pol_os_mecanico_update ON ordem_servico;
CREATE POLICY pol_os_mecanico_update ON ordem_servico
  FOR UPDATE TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico IN (SELECT id FROM funcionario WHERE id_usuario = auth.uid())
  )
  WITH CHECK (
    fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico IN (SELECT id FROM funcionario WHERE id_usuario = auth.uid())
  );

-- ---------------------------------------------------------------- Finding 2
-- Leitura direta da tabela: so gestor (gestao/relatorios) e o proprio.
DROP POLICY IF EXISTS pol_func_select ON funcionario;
CREATE POLICY pol_func_select ON funcionario
  FOR SELECT TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor' OR id_usuario = auth.uid());

-- View publica com campos NAO sensiveis (sem comissao), para dropdowns e
-- resolucao de nomes. E uma view SECURITY DEFINER (security_invoker desligado,
-- o padrao) — expoe de proposito apenas colunas seguras a qualquer autenticado.
DROP VIEW IF EXISTS funcionario_publico;
CREATE VIEW funcionario_publico AS
  SELECT id, nome, cargo, id_usuario, ativo
  FROM funcionario;

COMMENT ON VIEW funcionario_publico IS
  'Campos publicos do funcionario (sem comissao) para dropdowns/relatorios de nomes; a comissao fica na tabela funcionario, restrita a gestor + o proprio.';

GRANT SELECT ON funcionario_publico TO authenticated;

COMMIT;
