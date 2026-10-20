-- RF12 / RN26 / RN39: o painel é gerencial também na leitura direta via RLS.
-- A policy legada permitia ao autor ou responsável pela OS ler recomendações
-- financeiras depois de perder o perfil gestor. Nenhum histórico é apagado.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
ALTER TABLE public.recomendacao_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_recom_leitura_gestor ON public.recomendacao_ia;
CREATE POLICY pol_recom_leitura_gestor ON public.recomendacao_ia
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.fn_perfil_usuario_atual() = 'gestor');
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.recomendacao_ia'::regclass
      AND p.polname = 'pol_recom_leitura_gestor'
      AND p.polcmd = 'r' AND NOT p.polpermissive
      AND p.polroles = ARRAY['authenticated'::regrole::oid]
      AND pg_get_expr(p.polqual, p.polrelid) LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) THEN
    RAISE EXCEPTION 'RN26/RN39: recomendações sem gate restritivo de leitura do gestor.';
  END IF;
END;
$$;
COMMIT;
