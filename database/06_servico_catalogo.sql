-- =============================================================================
-- SIGAuto - Catalogo de servicos
-- Arquivo: 06_servico_catalogo.sql
-- Descricao: Cria a tabela usada para pesquisar/adicionar servicos na OS
-- =============================================================================

CREATE TABLE IF NOT EXISTS servico_catalogo (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          VARCHAR(120)  NOT NULL,
  descricao     TEXT,
  preco         DECIMAL(10,2) NOT NULL DEFAULT 0,
  ativo         BOOLEAN       NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servico_catalogo_nome
  ON servico_catalogo(nome)
  WHERE ativo = true;

DROP TRIGGER IF EXISTS trg_servico_catalogo_atualizado_em ON servico_catalogo;
CREATE TRIGGER trg_servico_catalogo_atualizado_em
  BEFORE UPDATE ON servico_catalogo
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

COMMENT ON TABLE servico_catalogo IS 'Catalogo de servicos que podem ser adicionados as ordens de servico';
COMMENT ON COLUMN servico_catalogo.preco IS 'Valor base do servico';
