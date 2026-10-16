-- =============================================================================
-- 21_os_desconto_observacoes.sql
-- Persiste o desconto informado no encerramento e as observacoes finais da OS.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

ALTER TABLE public.ordem_servico
  ADD COLUMN IF NOT EXISTS desconto_tipo VARCHAR(10),
  ADD COLUMN IF NOT EXISTS desconto_valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_percentual NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS observacoes_finais TEXT;

-- OS historicas: o percentual original nao pode ser inferido com seguranca.
-- Preserva-se apenas o valor monetario efetivamente abatido.
WITH subtotais AS (
  SELECT os.id,
         COALESCE((SELECT sum(s.quantidade * s.valor_unitario) FROM public.os_servico s WHERE s.id_os = os.id), 0)
       + COALESCE((SELECT sum(p.quantidade * p.valor_unitario) FROM public.os_peca p WHERE p.id_os = os.id), 0) AS subtotal
    FROM public.ordem_servico os
)
UPDATE public.ordem_servico os
   SET desconto_tipo = 'valor',
       desconto_valor = round(GREATEST(st.subtotal - COALESCE(os.valor_total, 0), 0), 2)
  FROM subtotais st
 WHERE st.id = os.id
   AND os.status = 'concluida'
   AND os.desconto_tipo IS NULL
   AND st.subtotal > COALESCE(os.valor_total, 0);

DO $$ BEGIN
  ALTER TABLE public.ordem_servico
    ADD CONSTRAINT chk_os_desconto_tipo
    CHECK (desconto_tipo IS NULL OR desconto_tipo IN ('pct', 'valor'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ordem_servico
    ADD CONSTRAINT chk_os_desconto_valor
    CHECK (desconto_valor >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ordem_servico
    ADD CONSTRAINT chk_os_desconto_percentual
    CHECK (desconto_percentual IS NULL OR desconto_percentual BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ordem_servico
    ADD CONSTRAINT chk_os_desconto_consistente
    CHECK (
      (desconto_tipo IS NOT NULL AND desconto_tipo = 'pct' AND desconto_percentual IS NOT NULL)
      OR (desconto_tipo IS NOT NULL AND desconto_tipo = 'valor' AND desconto_percentual IS NULL)
      OR (desconto_tipo IS NULL AND desconto_valor = 0 AND desconto_percentual IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.ordem_servico.desconto_tipo IS 'Forma informada no fechamento: pct ou valor.';
COMMENT ON COLUMN public.ordem_servico.desconto_valor IS 'Valor monetario efetivamente abatido do subtotal.';
COMMENT ON COLUMN public.ordem_servico.desconto_percentual IS 'Percentual informado quando desconto_tipo = pct.';
COMMENT ON COLUMN public.ordem_servico.observacoes_finais IS 'Garantia, recomendacoes e observacoes entregues no encerramento.';

COMMIT;
