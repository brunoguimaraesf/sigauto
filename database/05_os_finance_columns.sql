-- =============================================================================
-- SIGAuto - Colunas financeiras e itens da Ordem de Servico
-- Execute este arquivo no SQL Editor do Supabase se o banco ja foi criado.
-- =============================================================================

ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS valor_servicos DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_pecas DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS servicos_itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pecas_itens JSONB NOT NULL DEFAULT '[]'::jsonb;

