-- RF11 / RN39: mensagens antigas não registram o perfil que autorizou a resposta.
-- Uma conta rebaixada não pode recuperar respostas financeiras antigas, nem pelo
-- PostgREST direto. A conversa atual permanece na memória do cliente; INSERT pelo
-- backend e a persistência de todas as conversas continuam funcionando.
-- Aplicar após 29. Não modifica nem apaga conteúdo histórico.
BEGIN;
SET LOCAL search_path = public, pg_catalog;

ALTER TABLE public.mensagem_chatbot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_chatbot_self_select ON public.mensagem_chatbot;
CREATE POLICY pol_chatbot_self_select ON public.mensagem_chatbot
  FOR SELECT TO authenticated
  USING (id_usuario = auth.uid() AND public.fn_perfil_usuario_atual() = 'gestor');

-- Restritiva: outra policy permissiva (inclusive a antiga self_select) não pode
-- reabrir a leitura a não gestores. service_role mantém seu BYPASSRLS.
DROP POLICY IF EXISTS pol_chatbot_leitura_gestor ON public.mensagem_chatbot;
CREATE POLICY pol_chatbot_leitura_gestor ON public.mensagem_chatbot
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.fn_perfil_usuario_atual() = 'gestor');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'mensagem_chatbot' AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.mensagem_chatbot'::regclass
      AND p.polname = 'pol_chatbot_leitura_gestor'
      AND p.polcmd = 'r' AND NOT p.polpermissive
      AND p.polroles = ARRAY['authenticated'::regrole::oid]
      AND pg_get_expr(p.polqual, p.polrelid) LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) THEN
    RAISE EXCEPTION 'RN39: histórico do chatbot sem proteção restritiva para gestor.';
  END IF;
END;
$$;
COMMIT;
