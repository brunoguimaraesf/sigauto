-- =============================================================================
-- 15_custo_item_estoque.sql
-- Descricao: Acrescenta `item_estoque.custo`, que o DERS exige desde o RF09 mas
--   nunca existiu no banco.
--
--   O RF09 (Quadro 13 - campos da tela) especifica "Custo unitario (R$)" e
--   "Preco de venda (R$)", e a RN35 diz que "a margem do item e calculada
--   automaticamente a partir do custo unitario e do preco de venda informados".
--   O schema, porem, so tinha `preco_unit` (o preco de venda).
--
--   Consequencia pratica, que esta migracao conserta: a tela de estoque JA
--   enviava o campo. Em react-app/src/pages/Estoque/ListaEstoque.jsx, o payload
--   de criar (linha 88) e de editar (linha 81) inclui `custo`, e a linha 74 le
--   `item.custo` ao abrir o formulario. Como a coluna nao existia, o PostgREST
--   recusava a escrita (coluna desconhecida) e o custo nunca voltava preenchido.
--
--   A MARGEM NAO E COLUNA: ela e derivada de custo e preco_unit e calculada na
--   tela (ListaEstoque.jsx). Nao crie coluna nem campo gerado para ela.
--
--   RLS: `item_estoque` ja tem RLS habilitado desde o 02_rls_policies.sql, e as
--   policies valem por linha, nao por coluna. Coluna nova nao precisa de policy
--   nova.
--
-- Script IDEMPOTENTE e TRANSACIONAL. Nao remove nada: nao ha Fase 2.
-- =============================================================================

BEGIN;

-- Fixa a resolucao de nomes para esta transacao. Sem isto, rodar o script numa
-- sessao com `search_path = staging, public` aplicaria os ALTER em
-- `staging.item_estoque` enquanto o guard de idempotencia inspeciona
-- `public.item_estoque` — a coluna iria para a tabela errada. Mesma disciplina
-- que a migracao 14 impos as funcoes.
SET LOCAL search_path = public, pg_catalog;

-- -----------------------------------------------------------------------------
-- 1) COLUNA
--    ANULAVEL, de proposito: NULL significa "custo nao informado" e 0 significa
--    "custo zero" (peca de brinde, bonificacao). Um `NOT NULL DEFAULT 0` funde os
--    dois sentidos e nao ha como separar depois:
--      - o Quadro 28 do RF09 marca "Custo unitario (R$)" como Obrigatorio = Nao;
--      - `preco_unit` (01_schema.sql:231) tambem e anulavel, e as duas pontas do
--        calculo de margem precisam da mesma semantica para "nao informado";
--      - margem sobre custo 0 e divisao por zero em qualquer agregacao futura
--        fora da tela de estoque (relatorio, SQL, painel de IA).
-- -----------------------------------------------------------------------------

ALTER TABLE public.item_estoque
  ADD COLUMN IF NOT EXISTS custo DECIMAL(10,2);

COMMENT ON COLUMN item_estoque.custo IS
  'Custo unitario de aquisicao da peca (RF09/RN35). NULL = nao informado; 0 = custo zero. A margem e derivada de preco_unit e custo, e calculada na aplicacao.';

-- -----------------------------------------------------------------------------
-- 2) RESTRICAO
--    Valor monetario nao pode ser negativo. Tolerante a NULL de proposito:
--    `custo IS NULL OR custo >= 0`, porque NULL e "nao informado", nao um valor
--    invalido. (Sem o `IS NULL`, `NULL >= 0` avalia como unknown e a restricao
--    passaria de qualquer forma — explicitar diz a intencao a quem le.)
--
--    NOTA: `preco_unit` NAO tem restricao equivalente (01_schema.sql:231), ou
--    seja o preco de venda aceita negativo hoje. Corrigido na migracao 17 — em
--    script proprio, porque validar linha existente pode falhar por causa de
--    dado, e isso nao pode abortar o hardening de seguranca da 16.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'item_estoque_custo_nao_negativo'
       AND conrelid = 'public.item_estoque'::regclass
  ) THEN
    ALTER TABLE public.item_estoque
      ADD CONSTRAINT item_estoque_custo_nao_negativo
      CHECK (custo IS NULL OR custo >= 0);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3) POS-CONDICAO
--    `ADD COLUMN IF NOT EXISTS` pula em silencio se a coluna ja existir com
--    OUTRO tipo — cenario plausivel, porque a tela ja enviava o campo e alguem
--    pode te-la criado a mao no SQL Editor para destravar o PostgREST. Sem esta
--    checagem o script terminaria com "Success" e o schema real ficaria diferente
--    do pretendido, sem ninguem notar.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_tipo      text;
  v_precisao  int;
  v_escala    int;
  v_anulavel  text;
BEGIN
  SELECT data_type, numeric_precision, numeric_scale, is_nullable
    INTO v_tipo, v_precisao, v_escala, v_anulavel
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'item_estoque'
     AND column_name  = 'custo';

  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'item_estoque.custo nao foi criada';
  END IF;

  -- `IS DISTINCT FROM`, nao `<>`: a forma mais provavel de alguem ter criado a
  -- coluna a mao e `ADD COLUMN custo numeric;` SEM precisao/escala. Ai
  -- `numeric_scale` vem NULL, `NULL <> 2` avalia como *unknown*, `IF unknown`
  -- NAO dispara, e o guarda terminava com "Success" tendo validado nada —
  -- exatamente o cenario que motiva este bloco. `IS DISTINCT FROM` trata NULL
  -- como valor e acusa.
  IF v_tipo IS DISTINCT FROM 'numeric'
     OR v_precisao IS DISTINCT FROM 10
     OR v_escala IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'item_estoque.custo com tipo inesperado: %(%,%); esperado numeric(10,2)',
      v_tipo, v_precisao, v_escala;
  END IF;

  -- A coluna tem de ser ANULAVEL: e o que separa "custo nao informado" (NULL) de
  -- "custo zero" (0). Um `NOT NULL DEFAULT 0` preexistente — a versao anterior
  -- DESTE script, se alguem a tiver rodado antes — passaria pelas checagens de
  -- tipo acima e mataria essa semantica sem aviso.
  IF v_anulavel IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'item_estoque.custo esta NOT NULL; deveria ser anulavel (NULL = custo nao informado). '
                    'Se a versao antiga desta migracao foi aplicada, rode: '
                    'ALTER TABLE item_estoque ALTER COLUMN custo DROP NOT NULL, ALTER COLUMN custo DROP DEFAULT;';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICACAO (rode depois, fora da transacao)
--
--   -- a coluna existe, com o tipo e o default esperados?
--   SELECT column_name, data_type, numeric_precision, numeric_scale,
--          is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'item_estoque' AND column_name = 'custo';
--
--   -- a restricao esta ativa?
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.item_estoque'::regclass
--      AND conname = 'item_estoque_custo_nao_negativo';
--
-- Depois, na aplicacao: cadastre um item de estoque informando custo e preco de
-- venda, salve, reabra o formulario e confirme que o custo voltou preenchido e
-- que a margem aparece. Era exatamente isso que falhava antes desta migracao.
-- =============================================================================
