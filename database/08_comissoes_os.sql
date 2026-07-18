-- =============================================================================
-- SIGAuto - Comissoes em ordens de servico
-- Arquivo: 08_comissoes_os.sql
-- Descricao: Adiciona percentuais de comissao em usuarios e responsaveis na OS
-- =============================================================================

ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS comissao_percentual DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_sobre_servicos BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comissao_sobre_pecas BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE usuario
  DROP CONSTRAINT IF EXISTS chk_usuario_comissao_percentual;

ALTER TABLE usuario
  ADD CONSTRAINT chk_usuario_comissao_percentual
  CHECK (comissao_percentual >= 0 AND comissao_percentual <= 100);

ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS id_mecanico UUID REFERENCES usuario(id),
  ADD COLUMN IF NOT EXISTS id_atendente UUID REFERENCES usuario(id),
  ADD COLUMN IF NOT EXISTS valor_comissao_mecanico DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_comissao_atendente DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_detalhes JSONB DEFAULT NULL;

UPDATE ordem_servico
   SET id_atendente = COALESCE(id_atendente, id_usuario)
 WHERE id_atendente IS NULL;

CREATE INDEX IF NOT EXISTS idx_os_id_mecanico ON ordem_servico(id_mecanico);
CREATE INDEX IF NOT EXISTS idx_os_id_atendente ON ordem_servico(id_atendente);

DROP POLICY IF EXISTS pol_cliente_mecanico_select ON public.cliente;
CREATE POLICY pol_cliente_mecanico_select ON public.cliente
  FOR SELECT
  TO authenticated
  USING (
    public.fn_perfil_usuario_atual() = 'mecanico'
    AND EXISTS (
      SELECT 1
      FROM public.veiculo v
      JOIN public.ordem_servico os ON os.id_veiculo = v.id
      WHERE v.id_cliente = cliente.id
        AND os.id_mecanico = auth.uid()
    )
  );

DROP POLICY IF EXISTS pol_veiculo_mecanico_select ON public.veiculo;
CREATE POLICY pol_veiculo_mecanico_select ON public.veiculo
  FOR SELECT
  TO authenticated
  USING (
    public.fn_perfil_usuario_atual() = 'mecanico'
    AND id IN (
      SELECT os.id_veiculo
      FROM public.ordem_servico os
      WHERE os.id_mecanico = auth.uid()
    )
  );

DROP POLICY IF EXISTS pol_os_mecanico_select ON public.ordem_servico;
CREATE POLICY pol_os_mecanico_select ON public.ordem_servico
  FOR SELECT
  TO authenticated
  USING (
    public.fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico = auth.uid()
  );

DROP POLICY IF EXISTS pol_os_mecanico_update ON public.ordem_servico;
CREATE POLICY pol_os_mecanico_update ON public.ordem_servico
  FOR UPDATE
  TO authenticated
  USING (
    public.fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico = auth.uid()
  )
  WITH CHECK (
    public.fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico = auth.uid()
  );

COMMENT ON COLUMN usuario.comissao_percentual IS 'Percentual de comissao usado para atendentes e mecanicos';
COMMENT ON COLUMN usuario.comissao_sobre_servicos IS 'Indica se a comissao incide sobre servicos da OS';
COMMENT ON COLUMN usuario.comissao_sobre_pecas IS 'Indica se a comissao incide sobre pecas e produtos da OS';
COMMENT ON COLUMN ordem_servico.id_mecanico IS 'Mecanico responsavel pela OS';
COMMENT ON COLUMN ordem_servico.id_atendente IS 'Atendente responsavel pela OS';
COMMENT ON COLUMN ordem_servico.valor_comissao_mecanico IS 'Valor calculado da comissao do mecanico no fechamento da OS';
COMMENT ON COLUMN ordem_servico.valor_comissao_atendente IS 'Valor calculado da comissao do atendente no fechamento da OS';
COMMENT ON COLUMN ordem_servico.comissao_detalhes IS 'Snapshot das bases, percentuais e valores de comissao da OS';
