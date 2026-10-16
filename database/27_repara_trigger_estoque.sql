-- =============================================================================
-- 27_repara_trigger_estoque.sql
-- Garante que cada INSERT no ledger altere o saldo e reconcilia movimentos
-- automaticos de OS que foram gravados enquanto o trigger estava ausente.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

-- Evita INSERT concorrente entre a decisao de reconciliar e a instalacao do
-- trigger. A ordem segue o fluxo normal (ledger -> item) para reduzir risco de
-- deadlock com uma finalizacao que ja esteja em andamento.
LOCK TABLE public.movimentacao_estoque IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.item_estoque IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.fn_update_estoque_quantidade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_saldo_atual NUMERIC(10,2);
BEGIN
  SELECT quantidade INTO v_saldo_atual
    FROM public.item_estoque
   WHERE id = NEW.id_item
   FOR UPDATE;

  IF v_saldo_atual IS NULL THEN
    RAISE EXCEPTION 'Item de estoque nao encontrado: %', NEW.id_item;
  END IF;
  IF NEW.tipo = 'saida' AND v_saldo_atual < NEW.quantidade THEN
    RAISE EXCEPTION 'Saldo insuficiente para o item "%". Saldo atual: %, quantidade solicitada: %',
      (SELECT nome FROM public.item_estoque WHERE id = NEW.id_item),
      v_saldo_atual,
      NEW.quantidade
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.movimentacao_estoque', 'on', true);
  IF NEW.tipo = 'saida' THEN
    UPDATE public.item_estoque
       SET quantidade = quantidade - NEW.quantidade
     WHERE id = NEW.id_item;
  ELSIF NEW.tipo = 'entrada' THEN
    UPDATE public.item_estoque
       SET quantidade = quantidade + NEW.quantidade
     WHERE id = NEW.id_item;
  ELSE
    UPDATE public.item_estoque
       SET quantidade = NEW.quantidade
     WHERE id = NEW.id_item;
  END IF;
  PERFORM set_config('app.movimentacao_estoque', 'off', true);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_update_estoque_quantidade()
  FROM PUBLIC, anon, authenticated;

-- Os movimentos com origem `os` so passaram a existir na migracao 22. No banco
-- afetado, o trigger nunca esteve instalado nesse periodo: todos os movimentos
-- automaticos foram conferidos contra o saldo e estao pendentes. Em instalacao
-- saudavel o trigger ja existe, entao nada e reaplicado. A propria migracao e
-- idempotente: depois da primeira execucao o trigger existe e o ramo e pulado.
DO $$
DECLARE
  v_trigger_ativo BOOLEAN;
  v_saldos_invalidos INTEGER;
  v_itens_reconciliados INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.movimentacao_estoque'::regclass
       AND tgname = 'trg_movimentacao_atualiza_estoque'
       AND tgenabled <> 'D'
       AND NOT tgisinternal
  ) INTO v_trigger_ativo;

  IF v_trigger_ativo THEN
    RAISE NOTICE 'Trigger de saldo ja estava ativo; nenhum movimento foi reaplicado.';
    RETURN;
  END IF;

  WITH pendentes AS (
    SELECT m.id_item,
           round(sum(CASE
             WHEN m.tipo = 'entrada' THEN m.quantidade
             WHEN m.tipo = 'saida' THEN -m.quantidade
             ELSE 0
           END), 2) AS delta
      FROM public.movimentacao_estoque m
     WHERE m.origem = 'os'
     GROUP BY m.id_item
  )
  SELECT count(*) INTO v_saldos_invalidos
    FROM pendentes p
    JOIN public.item_estoque ie ON ie.id = p.id_item
   WHERE ie.quantidade + p.delta < 0;

  IF v_saldos_invalidos > 0 THEN
    RAISE EXCEPTION
      'Reconciliacao abortada: % item(ns) ficariam com saldo negativo.',
      v_saldos_invalidos;
  END IF;

  PERFORM set_config('app.movimentacao_estoque', 'on', true);

  WITH pendentes AS (
    SELECT m.id_item,
           round(sum(CASE
             WHEN m.tipo = 'entrada' THEN m.quantidade
             WHEN m.tipo = 'saida' THEN -m.quantidade
             ELSE 0
           END), 2) AS delta
      FROM public.movimentacao_estoque m
     WHERE m.origem = 'os'
     GROUP BY m.id_item
  )
  UPDATE public.item_estoque ie
     SET quantidade = ie.quantidade + p.delta
    FROM pendentes p
   WHERE ie.id = p.id_item
     AND p.delta <> 0;

  GET DIAGNOSTICS v_itens_reconciliados = ROW_COUNT;
  PERFORM set_config('app.movimentacao_estoque', 'off', true);

  RAISE NOTICE 'Itens de estoque reconciliados: %', v_itens_reconciliados;
END;
$$;

DROP TRIGGER IF EXISTS trg_movimentacao_atualiza_estoque
  ON public.movimentacao_estoque;
CREATE TRIGGER trg_movimentacao_atualiza_estoque
  AFTER INSERT ON public.movimentacao_estoque
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_estoque_quantidade();

-- Restaura tambem a projecao do historico, que nao aparece no cache do
-- PostgREST do banco publicado. Nenhum dado de login e exposto.
CREATE OR REPLACE VIEW public.historico_movimentacao_estoque AS
SELECT m.id,
       m.id_item,
       ie.codigo AS item_codigo,
       ie.nome AS item_nome,
       ie.unidade AS item_unidade,
       m.tipo,
       m.quantidade,
       m.motivo,
       m.data_hora,
       m.origem,
       m.id_os,
       os.numero_os,
       u.nome AS responsavel_nome
  FROM public.movimentacao_estoque m
  LEFT JOIN public.item_estoque ie ON ie.id = m.id_item
  LEFT JOIN public.ordem_servico os ON os.id = m.id_os
  LEFT JOIN public.usuario u ON u.id = m.id_usuario
 WHERE public.fn_perfil_usuario_atual() IN ('gestor', 'atendente');

COMMENT ON VIEW public.historico_movimentacao_estoque IS
  'Historico operacional de estoque com item, OS e nome do responsavel, sem dados sensiveis do usuario.';
REVOKE ALL ON public.historico_movimentacao_estoque FROM PUBLIC, anon;
GRANT SELECT ON public.historico_movimentacao_estoque TO authenticated, service_role;

DO $$
DECLARE
  v_trigger_ativo BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.movimentacao_estoque'::regclass
       AND tgname = 'trg_movimentacao_atualiza_estoque'
       AND tgenabled <> 'D'
       AND NOT tgisinternal
  ) INTO v_trigger_ativo;

  IF NOT v_trigger_ativo THEN
    RAISE EXCEPTION 'Pos-condicao falhou: trigger de saldo ausente ou desativado.';
  END IF;
  IF has_table_privilege('anon', 'public.historico_movimentacao_estoque', 'SELECT') THEN
    RAISE EXCEPTION 'Pos-condicao falhou: anon pode ler o historico de estoque.';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
