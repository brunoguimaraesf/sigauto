-- =============================================================================
-- 25_remocao_endereco_legado.sql
-- Remove cliente.endereco sem interpretar texto livre. Quando ainda nao ha
-- endereco estruturado significativo, preserva o texto integralmente em
-- endereco.ponto_referencia para posterior revisao pela oficina.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

ALTER TABLE public.endereco
  ALTER COLUMN ponto_referencia TYPE VARCHAR(255);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cliente' AND column_name = 'endereco'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.endereco (id_cliente, ponto_referencia)
      SELECT c.id, btrim(c.endereco)
        FROM public.cliente c
       WHERE NULLIF(btrim(c.endereco), '') IS NOT NULL
      ON CONFLICT (id_cliente) DO UPDATE
        SET ponto_referencia = EXCLUDED.ponto_referencia
      WHERE NULLIF(btrim(public.endereco.cep), '') IS NULL
        AND NULLIF(btrim(public.endereco.logradouro), '') IS NULL
        AND NULLIF(btrim(public.endereco.numero), '') IS NULL
        AND NULLIF(btrim(public.endereco.complemento), '') IS NULL
        AND NULLIF(btrim(public.endereco.bairro), '') IS NULL
        AND NULLIF(btrim(public.endereco.cidade), '') IS NULL
        AND NULLIF(btrim(public.endereco.uf), '') IS NULL
        AND NULLIF(btrim(public.endereco.ponto_referencia), '') IS NULL
    $sql$;
  END IF;
END;
$$;

DO $$
DECLARE
  v_pendentes INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'cliente'
       AND column_name = 'endereco'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_pendentes
    FROM public.cliente c
   WHERE NULLIF(btrim(c.endereco), '') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.endereco e
        WHERE e.id_cliente = c.id
          AND COALESCE(
            NULLIF(btrim(e.cep), ''), NULLIF(btrim(e.logradouro), ''),
            NULLIF(btrim(e.numero), ''), NULLIF(btrim(e.complemento), ''),
            NULLIF(btrim(e.bairro), ''), NULLIF(btrim(e.cidade), ''),
            NULLIF(btrim(e.uf), ''), NULLIF(btrim(e.ponto_referencia), '')
          ) IS NOT NULL
     );

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION
      'Remocao abortada: % cliente(s) ainda possuem endereco legado sem representacao preservada.',
      v_pendentes;
  END IF;
END;
$$;

ALTER TABLE public.cliente DROP COLUMN IF EXISTS endereco;

COMMIT;
