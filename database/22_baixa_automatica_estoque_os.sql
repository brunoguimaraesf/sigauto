-- =============================================================================
-- 22_baixa_automatica_estoque_os.sql
-- Fecha a OS e baixa as pecas do estoque na mesma transacao. Toda alteracao de
-- saldo passa pelo ledger movimentacao_estoque, com usuario, motivo e OS.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

-- LT, MT e KG admitem fracao; alinha estoque e movimento ao NUMERIC de os_peca.
-- A view e a funcao dependem do tipo antigo e precisam ser recriadas na mesma
-- transacao, preservando o filtro de usuario ativo e os REVOKE de seguranca.
DROP VIEW IF EXISTS public.item_estoque_publico;
DROP FUNCTION IF EXISTS public.get_estoque_critico();

ALTER TABLE public.item_estoque
  ALTER COLUMN quantidade TYPE NUMERIC(10,2) USING quantidade::numeric,
  ALTER COLUMN qtd_minima TYPE NUMERIC(10,2) USING qtd_minima::numeric;
ALTER TABLE public.movimentacao_estoque
  ALTER COLUMN quantidade TYPE NUMERIC(10,2) USING quantidade::numeric;

CREATE VIEW public.item_estoque_publico AS
  SELECT
    id, codigo, nome, descricao, unidade,
    quantidade, qtd_minima, preco_unit,
    ativo, criado_em, atualizado_em
  FROM public.item_estoque
  WHERE public.fn_perfil_usuario_atual() IS NOT NULL;

COMMENT ON VIEW public.item_estoque_publico IS
  'Estoque sem custo para perfis autenticados ativos; ignora RLS por design e permanece fechado a anon.';

REVOKE ALL ON public.item_estoque_publico FROM PUBLIC;
REVOKE ALL ON public.item_estoque_publico FROM anon;
GRANT SELECT ON public.item_estoque_publico TO authenticated;
GRANT SELECT ON public.item_estoque_publico TO service_role;

CREATE FUNCTION public.get_estoque_critico()
RETURNS TABLE (
  item_id UUID,
  codigo TEXT,
  nome TEXT,
  unidade TEXT,
  quantidade NUMERIC,
  qtd_minima NUMERIC,
  deficit NUMERIC,
  preco_unit NUMERIC,
  custo_reposicao NUMERIC,
  nivel TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ie.id,
    ie.codigo::TEXT,
    ie.nome::TEXT,
    ie.unidade::TEXT,
    ie.quantidade,
    ie.qtd_minima,
    ie.qtd_minima - ie.quantidade,
    ie.preco_unit,
    ie.preco_unit * (ie.qtd_minima - ie.quantidade),
    CASE WHEN ie.quantidade = 0 THEN 'CRÍTICO' ELSE 'BAIXO' END
  FROM public.item_estoque ie
  WHERE ie.ativo = true
    AND ie.quantidade < ie.qtd_minima
  ORDER BY ie.quantidade ASC, ie.qtd_minima DESC;
END;
$$;

COMMENT ON FUNCTION public.get_estoque_critico() IS
  'Lista itens abaixo do minimo, com quantidades fracionarias e custo estimado de reposicao.';

REVOKE ALL ON FUNCTION public.get_estoque_critico() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.movimentacao_estoque
  ADD COLUMN IF NOT EXISTS origem VARCHAR(20) NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  ALTER TABLE public.movimentacao_estoque
    ADD CONSTRAINT chk_movimentacao_origem
    CHECK (origem IN ('manual', 'os'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.os_baixa_estoque (
  id_os               UUID NOT NULL REFERENCES public.ordem_servico(id) ON DELETE CASCADE,
  id_item             UUID NOT NULL REFERENCES public.item_estoque(id),
  quantidade_baixada  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantidade_baixada >= 0),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_os, id_item)
);

COMMENT ON TABLE public.os_baixa_estoque IS
  'Estado idempotente da baixa por OS/item; o historico contabil permanece em movimentacao_estoque.';

ALTER TABLE public.os_baixa_estoque ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.os_baixa_estoque FROM PUBLIC;
REVOKE ALL ON public.os_baixa_estoque FROM anon;
REVOKE ALL ON public.os_baixa_estoque FROM authenticated;

-- Baseline conservador para OS historicas: antes desta migracao a baixa era
-- manual. Registrar a quantidade como ja reconciliada impede uma reabertura de
-- descontar tudo novamente. Nao se inventa movimento retroativo sem usuario.
INSERT INTO public.os_baixa_estoque (id_os, id_item, quantidade_baixada)
SELECT os.id, p.id_item, round(sum(p.quantidade), 2)
  FROM public.ordem_servico os
  JOIN public.os_peca p ON p.id_os = os.id
 WHERE os.status = 'concluida'
   AND p.id_item IS NOT NULL
 GROUP BY os.id, p.id_item
ON CONFLICT (id_os, id_item) DO NOTHING;

-- Projecao segura do ledger. A view resolve nomes com direito do dono, mas so
-- responde a perfis operacionais ativos e nunca expoe e-mail ou outros dados.
DROP VIEW IF EXISTS public.historico_movimentacao_estoque;
CREATE VIEW public.historico_movimentacao_estoque AS
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

-- O trigger do ledger e o unico caminho autorizado para mudar o saldo.
CREATE OR REPLACE FUNCTION public.fn_guard_saldo_estoque()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.quantidade IS DISTINCT FROM OLD.quantidade
     AND current_setting('app.movimentacao_estoque', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Altere o saldo por uma movimentacao de estoque.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_guard_saldo_estoque() FROM PUBLIC, anon, authenticated;

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
      (SELECT nome FROM public.item_estoque WHERE id = NEW.id_item), v_saldo_atual, NEW.quantidade
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.movimentacao_estoque', 'on', true);
  IF NEW.tipo = 'saida' THEN
    UPDATE public.item_estoque SET quantidade = quantidade - NEW.quantidade WHERE id = NEW.id_item;
  ELSIF NEW.tipo = 'entrada' THEN
    UPDATE public.item_estoque SET quantidade = quantidade + NEW.quantidade WHERE id = NEW.id_item;
  ELSE
    UPDATE public.item_estoque SET quantidade = NEW.quantidade WHERE id = NEW.id_item;
  END IF;
  PERFORM set_config('app.movimentacao_estoque', 'off', true);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_update_estoque_quantidade() FROM PUBLIC, anon, authenticated;

-- Impede concluir por PATCH simples e contornar a transacao de baixa.
CREATE OR REPLACE FUNCTION public.fn_guard_finalizacao_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.status = 'concluida'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND current_setting('app.finalizacao_os', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Finalize a OS pela operacao transacional de encerramento.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_guard_finalizacao_os() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalizar_ordem_servico(
  p_id_os UUID,
  p_desconto_tipo VARCHAR,
  p_desconto_valor NUMERIC,
  p_desconto_percentual NUMERIC,
  p_forma_pagamento VARCHAR,
  p_observacoes_finais TEXT DEFAULT NULL
)
RETURNS SETOF public.ordem_servico
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_os public.ordem_servico%ROWTYPE;
  v_usuario UUID := auth.uid();
  v_servicos NUMERIC(10,2);
  v_pecas NUMERIC(10,2);
  v_subtotal NUMERIC(10,2);
  v_desconto NUMERIC(10,2);
  v_item RECORD;
  v_anterior NUMERIC(10,2);
  v_delta NUMERIC(10,2);
BEGIN
  IF COALESCE(public.fn_perfil_usuario_atual()::text, '') NOT IN ('gestor', 'atendente') THEN
    RAISE EXCEPTION 'Perfil sem permissao para finalizar OS.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_os FROM public.ordem_servico WHERE id = p_id_os FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de servico nao encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF v_os.status = 'cancelada' THEN RAISE EXCEPTION 'Uma OS cancelada nao pode ser finalizada.' USING ERRCODE = 'P0001'; END IF;
  -- Duplo clique ou repeticao da mesma requisicao nao altera novamente a data
  -- nem gera outro movimento. Para recalcular, a OS precisa ser reaberta.
  IF v_os.status = 'concluida' THEN
    RETURN QUERY SELECT * FROM public.ordem_servico WHERE id = p_id_os;
    RETURN;
  END IF;
  IF p_forma_pagamento IS NULL OR btrim(p_forma_pagamento) = '' THEN
    RAISE EXCEPTION 'Informe a forma de pagamento.' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(round(sum(quantidade * valor_unitario), 2), 0)
    INTO v_servicos FROM public.os_servico WHERE id_os = p_id_os;
  SELECT COALESCE(round(sum(quantidade * valor_unitario), 2), 0)
    INTO v_pecas FROM public.os_peca WHERE id_os = p_id_os;
  v_subtotal := v_servicos + v_pecas;

  IF p_desconto_tipo = 'pct' THEN
    IF p_desconto_percentual IS NULL OR p_desconto_percentual < 0 OR p_desconto_percentual > 100 THEN
      RAISE EXCEPTION 'Percentual de desconto invalido.' USING ERRCODE = 'P0001';
    END IF;
    v_desconto := round(v_subtotal * p_desconto_percentual / 100, 2);
  ELSIF p_desconto_tipo = 'valor' THEN
    v_desconto := round(COALESCE(p_desconto_valor, 0), 2);
  ELSE
    RAISE EXCEPTION 'Tipo de desconto invalido.' USING ERRCODE = 'P0001';
  END IF;
  IF v_desconto < 0 OR v_desconto > v_subtotal THEN
    RAISE EXCEPTION 'O desconto nao pode superar o subtotal da OS.' USING ERRCODE = 'P0001';
  END IF;

  -- A funcao e criada pela migracao 23, aplicada antes da publicacao do
  -- frontend que chama este RPC. EXECUTE dinamico mantem a migracao 22
  -- aditiva e aplicavel antes da criacao da tabela de snapshot.
  EXECUTE 'SELECT public.fn_snapshot_comissoes_os($1, $2, $3)'
    USING p_id_os, v_servicos, v_pecas;

  -- Ajusta apenas a diferenca entre a composicao atual e o que ja foi baixado.
  FOR v_item IN
    SELECT p.id_item, round(sum(p.quantidade), 2) AS desejada
      FROM public.os_peca p
     WHERE p.id_os = p_id_os AND p.id_item IS NOT NULL
     GROUP BY p.id_item
     ORDER BY p.id_item
  LOOP
    PERFORM 1 FROM public.item_estoque WHERE id = v_item.id_item FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item de estoque da OS nao encontrado: %', v_item.id_item; END IF;

    SELECT quantidade_baixada INTO v_anterior
      FROM public.os_baixa_estoque
     WHERE id_os = p_id_os AND id_item = v_item.id_item
     FOR UPDATE;
    v_anterior := COALESCE(v_anterior, 0);
    v_delta := v_item.desejada - v_anterior;

    IF v_delta > 0 THEN
      INSERT INTO public.movimentacao_estoque (id_item, id_os, id_usuario, tipo, quantidade, motivo, origem)
      VALUES (v_item.id_item, p_id_os, v_usuario, 'saida', v_delta,
              left('Baixa automatica da OS #' || COALESCE(v_os.numero_os::text, p_id_os::text), 100), 'os');
    ELSIF v_delta < 0 THEN
      INSERT INTO public.movimentacao_estoque (id_item, id_os, id_usuario, tipo, quantidade, motivo, origem)
      VALUES (v_item.id_item, p_id_os, v_usuario, 'entrada', abs(v_delta),
              left('Devolucao por ajuste da OS #' || COALESCE(v_os.numero_os::text, p_id_os::text), 100), 'os');
    END IF;

    INSERT INTO public.os_baixa_estoque (id_os, id_item, quantidade_baixada, atualizado_em)
    VALUES (p_id_os, v_item.id_item, v_item.desejada, now())
    ON CONFLICT (id_os, id_item) DO UPDATE
      SET quantidade_baixada = EXCLUDED.quantidade_baixada, atualizado_em = now();
  END LOOP;

  -- Pecas removidas depois de uma reabertura devolvem o saldo na reconclusao.
  FOR v_item IN
    SELECT b.id_item, b.quantidade_baixada
      FROM public.os_baixa_estoque b
     WHERE b.id_os = p_id_os AND b.quantidade_baixada > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.os_peca p
          WHERE p.id_os = p_id_os AND p.id_item = b.id_item
       )
     FOR UPDATE
  LOOP
    INSERT INTO public.movimentacao_estoque (id_item, id_os, id_usuario, tipo, quantidade, motivo, origem)
    VALUES (v_item.id_item, p_id_os, v_usuario, 'entrada', v_item.quantidade_baixada,
            left('Devolucao de peca removida da OS #' || COALESCE(v_os.numero_os::text, p_id_os::text), 100), 'os');
    UPDATE public.os_baixa_estoque
       SET quantidade_baixada = 0, atualizado_em = now()
     WHERE id_os = p_id_os AND id_item = v_item.id_item;
  END LOOP;

  PERFORM set_config('app.finalizacao_os', 'on', true);
  UPDATE public.ordem_servico
     SET status = 'concluida',
         valor_servicos = v_servicos,
         valor_pecas = v_pecas,
         desconto_tipo = p_desconto_tipo,
         desconto_valor = v_desconto,
         desconto_percentual = CASE WHEN p_desconto_tipo = 'pct' THEN p_desconto_percentual ELSE NULL END,
         valor_total = round(v_subtotal - v_desconto, 2),
         forma_pagamento = p_forma_pagamento,
         observacoes_finais = NULLIF(btrim(COALESCE(p_observacoes_finais, '')), ''),
         data_encerramento = now(),
         atualizado_em = now()
   WHERE id = p_id_os;
  PERFORM set_config('app.finalizacao_os', 'off', true);

  RETURN QUERY SELECT * FROM public.ordem_servico WHERE id = p_id_os;
END;
$$;

COMMENT ON FUNCTION public.finalizar_ordem_servico(UUID, VARCHAR, NUMERIC, NUMERIC, VARCHAR, TEXT) IS
  'Finaliza a OS e ajusta a baixa de estoque por diferenca, atomicamente e de forma idempotente.';

REVOKE ALL ON FUNCTION public.finalizar_ordem_servico(UUID, VARCHAR, NUMERIC, NUMERIC, VARCHAR, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_ordem_servico(UUID, VARCHAR, NUMERIC, NUMERIC, VARCHAR, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalizar_ordem_servico(UUID, VARCHAR, NUMERIC, NUMERIC, VARCHAR, TEXT) TO authenticated;

COMMIT;
