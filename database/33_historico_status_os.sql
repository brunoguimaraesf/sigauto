-- RN / medicao operacional: registra cada entrada/alteracao de status da OS.
-- Sem backfill: estados anteriores a esta migracao nao sao inferidos.
BEGIN;
SET LOCAL search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS public.historico_status_os (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_os UUID NOT NULL REFERENCES public.ordem_servico(id),
  status_anterior public.status_os,
  status_novo public.status_os NOT NULL,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  id_autor UUID,
  CONSTRAINT historico_status_os_transicao_valida CHECK (
    (status_anterior IS NULL AND status_novo IS NOT NULL)
    OR (status_anterior IS NOT NULL AND status_anterior IS DISTINCT FROM status_novo)
  )
);

COMMENT ON TABLE public.historico_status_os IS
  'Ledger append-only de transicoes de status observadas apos a migracao 33; nao representa o historico anterior.';
COMMENT ON COLUMN public.historico_status_os.status_anterior IS
  'NULL somente para a criacao da OS, cujo status inicial fica registrado.';
COMMENT ON COLUMN public.historico_status_os.id_autor IS
  'auth.uid() da operacao que causou a transicao; NULL para operacoes sem identidade autenticada.';

CREATE INDEX IF NOT EXISTS idx_historico_status_os_os_tempo
  ON public.historico_status_os (id_os, ocorrido_em, id);

ALTER TABLE public.historico_status_os ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_historico_status_os_select ON public.historico_status_os;
CREATE POLICY pol_historico_status_os_select ON public.historico_status_os
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
      FROM public.ordem_servico os
     WHERE os.id = historico_status_os.id_os
  ));

REVOKE ALL ON public.historico_status_os FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.historico_status_os TO authenticated, service_role;
REVOKE ALL ON SEQUENCE public.historico_status_os_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_registrar_status_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_status_os
      (id_os, status_anterior, status_novo, ocorrido_em, id_autor)
    VALUES (NEW.id, NULL, NEW.status, clock_timestamp(), auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.historico_status_os
      (id_os, status_anterior, status_novo, ocorrido_em, id_autor)
    VALUES (NEW.id, OLD.status, NEW.status, clock_timestamp(), auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_registrar_status_os() IS
  'Registra status inicial e cada mudanca observada na OS, inclusive operacoes por RPC.';
REVOKE ALL ON FUNCTION public.fn_registrar_status_os() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_os_registrar_status_insert ON public.ordem_servico;
CREATE TRIGGER trg_os_registrar_status_insert
  AFTER INSERT ON public.ordem_servico
  FOR EACH ROW EXECUTE FUNCTION public.fn_registrar_status_os();

DROP TRIGGER IF EXISTS trg_os_registrar_status_update ON public.ordem_servico;
CREATE TRIGGER trg_os_registrar_status_update
  AFTER UPDATE OF status ON public.ordem_servico
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_registrar_status_os();

CREATE OR REPLACE VIEW public.duracao_etapa_os
WITH (security_invoker = true)
AS
SELECT h.id,
       h.id_os,
       h.status_anterior,
       h.status_novo,
       h.ocorrido_em AS inicio_etapa,
       lead(h.ocorrido_em) OVER (
         PARTITION BY h.id_os ORDER BY h.ocorrido_em, h.id
       ) AS fim_etapa,
       COALESCE(
         lead(h.ocorrido_em) OVER (
           PARTITION BY h.id_os ORDER BY h.ocorrido_em, h.id
         ),
         clock_timestamp()
       ) - h.ocorrido_em AS duracao_etapa,
       h.id_autor
  FROM public.historico_status_os h;

COMMENT ON VIEW public.duracao_etapa_os IS
  'Uma linha por etapa observada; etapa atual mede ate o relogio do banco no momento da leitura. Historico anterior a migracao 33 nao e estimado.';
REVOKE ALL ON public.duracao_etapa_os FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.duracao_etapa_os TO authenticated, service_role;

DO $postcondition$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.historico_status_os'::regclass) THEN
    RAISE EXCEPTION 'Pos-condicao falhou: RLS desativado no historico de status.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.historico_status_os'::regclass
       AND polname = 'pol_historico_status_os_select'
       AND polcmd = 'r' AND polroles = ARRAY['authenticated'::regrole::oid]
  ) THEN
    RAISE EXCEPTION 'Pos-condicao falhou: policy de leitura do historico ausente.';
  END IF;
  IF has_table_privilege('authenticated', 'public.historico_status_os', 'INSERT')
     OR has_table_privilege('authenticated', 'public.historico_status_os', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.historico_status_os', 'DELETE')
     OR has_table_privilege('service_role', 'public.historico_status_os', 'INSERT')
     OR has_table_privilege('service_role', 'public.historico_status_os', 'UPDATE')
     OR has_table_privilege('service_role', 'public.historico_status_os', 'DELETE')
     OR has_table_privilege('anon', 'public.historico_status_os', 'SELECT') THEN
    RAISE EXCEPTION 'Pos-condicao falhou: grants diretos inseguros no historico.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.ordem_servico'::regclass
       AND tgname = 'trg_os_registrar_status_insert' AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.ordem_servico'::regclass
       AND tgname = 'trg_os_registrar_status_update' AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Pos-condicao falhou: triggers de historico nao instalados.';
  END IF;
  IF to_regclass('public.duracao_etapa_os') IS NULL THEN
    RAISE EXCEPTION 'Pos-condicao falhou: view de duracao por etapa ausente.';
  END IF;
END;
$postcondition$;

COMMIT;
