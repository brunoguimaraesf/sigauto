-- =============================================================================
-- 14_hardening_advisor.sql
-- Descricao: Corrige os achados do Security/Performance Advisor do Supabase.
--
--   1) CRITICO — funcoes SECURITY DEFINER executaveis por qualquer um via RPC.
--      A role `anon` (chave publica, presente no bundle do frontend) conseguia
--      chamar /rest/v1/rpc/get_dashboard_stats e get_relatorio_faturamento e ler
--      dados do negocio SEM login, passando por cima do RLS. O app nao chama
--      nenhuma dessas funcoes por RPC, entao o EXECUTE e revogado.
--      - Relatorios e auditoria: revogados de PUBLIC/anon/authenticated
--        (service_role mantem acesso).
--      - Funcoes de trigger: revogadas (trigger nao depende de EXECUTE do
--        usuario que dispara).
--      - fn_perfil_usuario_atual: revogada so de anon. `authenticated` PRECISA
--        dela, pois as policies de RLS a chamam; ela devolve apenas o perfil do
--        proprio usuario.
--   2) search_path fixo nas funcoes (evita sequestro de funcao por search_path).
--   3) Indices nas chaves estrangeiras sem cobertura (performance).
--
--   Mantido de proposito: a view funcionario_publico e SECURITY DEFINER por
--   design (expoe so id/nome/cargo, sem comissao — ver 12_hardening).
--
-- Script IDEMPOTENTE e TRANSACIONAL.
-- =============================================================================

BEGIN;

-- 1) EXECUTE -------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_estoque_critico()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_servicos_frequentes()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_relatorio_faturamento(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_registra_log_auditoria(varchar, varchar, uuid, jsonb, jsonb, varchar) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_handle_new_auth_user()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_estoque_quantidade() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_perfil_usuario_atual() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_perfil_usuario_atual() TO authenticated;

-- 2) search_path fixo ----------------------------------------------------------
ALTER FUNCTION public.get_dashboard_stats()                          SET search_path = public;
ALTER FUNCTION public.get_estoque_critico()                          SET search_path = public;
ALTER FUNCTION public.get_servicos_frequentes()                      SET search_path = public;
ALTER FUNCTION public.get_relatorio_faturamento(timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.fn_registra_log_auditoria(varchar, varchar, uuid, jsonb, jsonb, varchar) SET search_path = public;
ALTER FUNCTION public.fn_update_estoque_quantidade()                 SET search_path = public;
ALTER FUNCTION public.fn_set_atualizado_em()                         SET search_path = public;
ALTER FUNCTION public.fn_normaliza_endereco()                        SET search_path = public;

-- 3) Indices em FKs sem cobertura -----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mov_id_usuario      ON public.movimentacao_estoque (id_usuario);
CREATE INDEX IF NOT EXISTS idx_os_peca_id_item     ON public.os_peca (id_item);
CREATE INDEX IF NOT EXISTS idx_os_servico_id_serv  ON public.os_servico (id_servico);
CREATE INDEX IF NOT EXISTS idx_recom_id_usuario    ON public.recomendacao_ia (id_usuario);

COMMIT;
