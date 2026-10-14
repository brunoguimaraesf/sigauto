-- =============================================================================
-- 17_check_preco_unit.sql
-- Descricao: acrescenta a restricao de nao-negatividade que falta em
--   `item_estoque.preco_unit`.
--
-- POR QUE EM SCRIPT SEPARADO DA 16
--   `ADD CONSTRAINT ... CHECK` valida as linhas que JA existem. Uma unica linha
--   com `preco_unit < 0` faz o `ALTER TABLE` falhar e a transacao inteira rolar
--   atras. Se isso estivesse junto do hardening da 16, um dado ruim abortaria a
--   correcao de SEGURANCA (os REVOKE de `EXECUTE`), e a mensagem de erro
--   pareceria "o script falhou" em vez de "voce continua vulneravel".
--   Correcao de dado e correcao de seguranca nao compartilham transacao.
--
-- CONTEXTO
--   O comentario da migracao 15 dizia "mesmo criterio do preco" ao criar o CHECK
--   de `custo` — mas `preco_unit` (01_schema.sql:231) nunca teve restricao
--   alguma e aceita valor negativo ate hoje. O formulario bloqueia pelo
--   `min={0}` do input, entao o risco e dado inserido por fora da tela.
--
--   Tolerante a NULL, pelo mesmo motivo da 15: NULL e "nao informado", nao valor
--   invalido.
--
-- Script IDEMPOTENTE e TRANSACIONAL. Nao remove nada.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

-- -----------------------------------------------------------------------------
-- 1) PRE-CHECK EXPLICITO
--    Falha com mensagem util ANTES do ALTER, em vez de deixar o PostgreSQL
--    reclamar de violacao de restricao sem dizer quais linhas.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_ruins bigint;
BEGIN
  SELECT count(*) INTO v_ruins FROM public.item_estoque WHERE preco_unit < 0;

  IF v_ruins > 0 THEN
    RAISE EXCEPTION
      '% item(ns) de estoque com preco_unit negativo. Corrija antes: SELECT id, codigo, preco_unit FROM item_estoque WHERE preco_unit < 0;',
      v_ruins;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) RESTRICAO
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'item_estoque_preco_nao_negativo'
       AND conrelid = 'public.item_estoque'::regclass
  ) THEN
    ALTER TABLE public.item_estoque
      ADD CONSTRAINT item_estoque_preco_nao_negativo
      CHECK (preco_unit IS NULL OR preco_unit >= 0);
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICACAO (rode depois, fora da transacao)
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.item_estoque'::regclass
--      AND conname = 'item_estoque_preco_nao_negativo';
-- =============================================================================
