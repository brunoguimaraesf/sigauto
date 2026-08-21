-- =============================================================================
-- 09_fix_recomendacao_ia.sql
-- Alinha a tabela recomendacao_ia ao que o backend (iaController.analisar) grava.
-- O controller insere um blob de análise (dados_analisados) + as recomendações
-- (recomendacoes) em JSONB, e NÃO preenche tipo/conteudo.
-- Migração não-destrutiva: mantém colunas, índice (id_os) e políticas RLS.
-- Rode no SQL Editor do Supabase.
-- =============================================================================

-- 1. Colunas que o backend grava/lê
ALTER TABLE recomendacao_ia
  ADD COLUMN IF NOT EXISTS dados_analisados JSONB,
  ADD COLUMN IF NOT EXISTS recomendacoes    JSONB;

-- 2. Tornar opcionais as colunas do desenho antigo (o controller não as envia)
ALTER TABLE recomendacao_ia ALTER COLUMN tipo     DROP NOT NULL;
ALTER TABLE recomendacao_ia ALTER COLUMN conteudo DROP NOT NULL;

-- 3. Forçar o PostgREST (Supabase) a recarregar o cache de schema
NOTIFY pgrst, 'reload schema';
