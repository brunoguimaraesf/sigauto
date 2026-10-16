-- =============================================================================
-- 24_remocao_legados_os_usuario.sql
-- Remove JSONs de itens/comissao da OS e campos de comissao do usuario depois
-- dos backfills relacionais. Falha antes do DROP se detectar perda potencial.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

-- Repete os backfills somente enquanto as colunas legadas existirem. O SQL
-- dinamico permite reaplicar o arquivo com seguranca depois dos DROP COLUMN.
DO $$
DECLARE
  v_servicos_divergentes BOOLEAN := false;
  v_pecas_divergentes BOOLEAN := false;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ordem_servico' AND column_name = 'servicos_itens') THEN
    EXECUTE $sql$
      INSERT INTO public.os_servico (id_os, id_servico, descricao, quantidade, valor_unitario)
      SELECT os.id,
             (SELECT sc.id FROM public.servico_catalogo sc WHERE lower(sc.nome) = lower(item->>'descricao') LIMIT 1),
             COALESCE(NULLIF(item->>'descricao', ''), 'Servico'),
             GREATEST(COALESCE(NULLIF(item->>'quantidade','')::numeric, 1), 0.01),
             COALESCE(NULLIF(item->>'valor_unitario','')::numeric, NULLIF(item->>'valor','')::numeric, 0)
        FROM public.ordem_servico os
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(os.servicos_itens) = 'array' THEN os.servicos_itens ELSE '[]'::jsonb END
       ) AS item
       WHERE NOT EXISTS (SELECT 1 FROM public.os_servico x WHERE x.id_os = os.id)
    $sql$;

    EXECUTE $check$
      SELECT EXISTS (
        WITH json_rows AS (
          SELECT os.id AS id_os,
                 lower(btrim(COALESCE(NULLIF(item->>'descricao',''),'Servico'))) AS descricao,
                 GREATEST(COALESCE(NULLIF(item->>'quantidade','')::numeric,1),0.01) AS quantidade,
                 COALESCE(NULLIF(item->>'valor_unitario','')::numeric,NULLIF(item->>'valor','')::numeric,0) AS valor_unitario
            FROM public.ordem_servico os
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(os.servicos_itens)='array' THEN os.servicos_itens ELSE '[]'::jsonb END
           ) item
        ), rel_rows AS (
          SELECT id_os, lower(btrim(descricao)), quantidade, valor_unitario FROM public.os_servico
        )
        SELECT 1 FROM (
          SELECT * FROM json_rows EXCEPT ALL SELECT * FROM rel_rows
        ) diferencas
      )
    $check$ INTO STRICT v_servicos_divergentes;
    IF v_servicos_divergentes THEN
      RAISE EXCEPTION 'Remocao abortada: servicos JSON e relacionais nao sao equivalentes.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ordem_servico' AND column_name = 'pecas_itens') THEN
    EXECUTE $sql$
      INSERT INTO public.os_peca (id_os, id_item, descricao, quantidade, valor_unitario)
      SELECT os.id,
             (SELECT ie.id FROM public.item_estoque ie WHERE lower(ie.nome) = lower(item->>'descricao') LIMIT 1),
             COALESCE(NULLIF(item->>'descricao', ''), 'Peca'),
             GREATEST(COALESCE(NULLIF(item->>'quantidade','')::numeric, 1), 0.01),
             COALESCE(NULLIF(item->>'valor_unitario','')::numeric, NULLIF(item->>'valor','')::numeric, 0)
        FROM public.ordem_servico os
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(os.pecas_itens) = 'array' THEN os.pecas_itens ELSE '[]'::jsonb END
       ) AS item
       WHERE NOT EXISTS (SELECT 1 FROM public.os_peca x WHERE x.id_os = os.id)
    $sql$;

    EXECUTE $check$
      SELECT EXISTS (
        WITH json_rows AS (
          SELECT os.id AS id_os,
                 lower(btrim(COALESCE(NULLIF(item->>'descricao',''),'Peca'))) AS descricao,
                 GREATEST(COALESCE(NULLIF(item->>'quantidade','')::numeric,1),0.01) AS quantidade,
                 COALESCE(NULLIF(item->>'valor_unitario','')::numeric,NULLIF(item->>'valor','')::numeric,0) AS valor_unitario
            FROM public.ordem_servico os
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(os.pecas_itens)='array' THEN os.pecas_itens ELSE '[]'::jsonb END
           ) item
        ), rel_rows AS (
          SELECT id_os, lower(btrim(descricao)), quantidade, valor_unitario FROM public.os_peca
        )
        SELECT 1 FROM (
          SELECT * FROM json_rows EXCEPT ALL SELECT * FROM rel_rows
        ) diferencas
      )
    $check$ INTO STRICT v_pecas_divergentes;
    IF v_pecas_divergentes THEN
      RAISE EXCEPTION 'Remocao abortada: pecas JSON e relacionais nao sao equivalentes.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ordem_servico' AND column_name = 'comissao_detalhes') THEN
    IF EXISTS (
      SELECT 1 FROM public.ordem_servico os
       WHERE os.comissao_detalhes IS NOT NULL
         AND jsonb_typeof(os.comissao_detalhes) = 'object'
         AND EXISTS (
           SELECT 1
             FROM jsonb_each(os.comissao_detalhes) papel
            WHERE papel.key IN ('mecanico', 'atendente')
              AND jsonb_typeof(papel.value) = 'object'
              AND NOT EXISTS (
                SELECT 1 FROM public.os_comissao c
                 WHERE c.id_os = os.id AND c.papel = papel.key
              )
         )
    ) THEN
      RAISE EXCEPTION 'Remocao abortada: ha snapshot JSON sem linha em os_comissao.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuario' AND column_name = 'comissao_percentual') THEN
    INSERT INTO public.funcionario
      (nome, cargo, comissao_percentual, comissao_sobre_servicos, comissao_sobre_pecas, id_usuario, ativo)
    SELECT u.nome, u.perfil::text::cargo_funcionario, u.comissao_percentual,
           u.comissao_sobre_servicos, u.comissao_sobre_pecas, u.id, u.ativo
      FROM public.usuario u
     WHERE NOT EXISTS (SELECT 1 FROM public.funcionario f WHERE f.id_usuario = u.id);
  END IF;
END;
$$;

ALTER TABLE public.ordem_servico
  DROP COLUMN IF EXISTS servicos_itens,
  DROP COLUMN IF EXISTS pecas_itens,
  DROP COLUMN IF EXISTS comissao_detalhes;

ALTER TABLE public.usuario
  DROP COLUMN IF EXISTS comissao_percentual,
  DROP COLUMN IF EXISTS comissao_sobre_servicos,
  DROP COLUMN IF EXISTS comissao_sobre_pecas;

COMMIT;
