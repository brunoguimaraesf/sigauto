-- =============================================================================
-- 18_configuracao_oficina.sql
-- Descricao: cria o cadastro singleton da oficina e o bucket privado usado
--   pelo logotipo exibido na ordem de servico.
--
-- CONTRATO DE ACESSO
--   - configuracao_oficina: qualquer usuario autenticado le; somente gestor
--     insere, altera ou remove; anon nao recebe privilegio algum.
--   - logos-oficina: qualquer usuario autenticado le os objetos; somente gestor
--     envia, substitui ou remove. O bucket aceita PNG, JPEG e WebP ate 2 MiB.
--
-- A migracao nao cria funcao SECURITY DEFINER. As policies reutilizam
-- fn_perfil_usuario_atual(), endurecida pelas migracoes 14 e 16, e o trigger
-- reutiliza fn_set_atualizado_em(), que e SECURITY INVOKER.
--
-- Script IDEMPOTENTE e TRANSACIONAL. Nao insere configuracao inicial: a unica
-- linha sera criada pelo gestor na tela, sempre com id = 1.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

-- -----------------------------------------------------------------------------
-- 1) CADASTRO SINGLETON
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.configuracao_oficina (
  id                SMALLINT      PRIMARY KEY DEFAULT 1,
  nome_fantasia     VARCHAR(120)  NOT NULL,
  razao_social      VARCHAR(160),
  cnpj              VARCHAR(14)   NOT NULL UNIQUE,
  telefone          VARCHAR(20),
  email             VARCHAR(160),
  cep               VARCHAR(8),
  logradouro        VARCHAR(160),
  numero            VARCHAR(20),
  complemento       VARCHAR(100),
  bairro            VARCHAR(100),
  cidade            VARCHAR(100),
  uf                VARCHAR(2),
  logo_path         TEXT,
  texto_rodape      VARCHAR(300),
  criado_em         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT configuracao_oficina_singleton
    CHECK (id = 1),
  CONSTRAINT configuracao_oficina_cnpj_formato
    CHECK (cnpj ~ '^[0-9]{14}$'),
  CONSTRAINT configuracao_oficina_cep_formato
    CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$'),
  CONSTRAINT configuracao_oficina_uf_valida
    CHECK (uf IS NULL OR uf IN (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    )),
  CONSTRAINT configuracao_oficina_logo_path_valido
    CHECK (
      logo_path IS NULL
      OR (
        BTRIM(logo_path) <> ''
        AND BTRIM(logo_path) = logo_path
        AND BTRIM(logo_path) !~* '^[a-z][a-z0-9+.-]*:'
        AND BTRIM(logo_path) !~ '^/'
        AND POSITION(CHR(92) IN BTRIM(logo_path)) = 0
        AND BTRIM(logo_path) !~ '(^|/)\.\.(/|$)'
      )
    )
);

COMMENT ON TABLE public.configuracao_oficina IS
  'Cadastro singleton da oficina desta instalacao; a unica linha permitida usa id = 1.';
COMMENT ON COLUMN public.configuracao_oficina.cnpj IS
  'CNPJ com 14 digitos, sem mascara; validacao dos digitos verificadores fica na aplicacao.';
COMMENT ON COLUMN public.configuracao_oficina.logo_path IS
  'Caminho do objeto no bucket privado logos-oficina; nunca URL assinada ou conteudo Base64.';

DROP TRIGGER IF EXISTS trg_configuracao_oficina_atualizado_em
  ON public.configuracao_oficina;
CREATE TRIGGER trg_configuracao_oficina_atualizado_em
  BEFORE UPDATE ON public.configuracao_oficina
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_atualizado_em();

-- -----------------------------------------------------------------------------
-- 2) ACL E RLS DA CONFIGURACAO
--    authenticated precisa dos grants de escrita para o PostgREST chegar ao
--    RLS; as policies abaixo restringem cada operacao ao perfil gestor.
-- -----------------------------------------------------------------------------

ALTER TABLE public.configuracao_oficina ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.configuracao_oficina
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.configuracao_oficina TO authenticated;

DROP POLICY IF EXISTS pol_configuracao_oficina_select
  ON public.configuracao_oficina;
DROP POLICY IF EXISTS pol_configuracao_oficina_insert_gestor
  ON public.configuracao_oficina;
DROP POLICY IF EXISTS pol_configuracao_oficina_update_gestor
  ON public.configuracao_oficina;
DROP POLICY IF EXISTS pol_configuracao_oficina_delete_gestor
  ON public.configuracao_oficina;

CREATE POLICY pol_configuracao_oficina_select
  ON public.configuracao_oficina
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY pol_configuracao_oficina_insert_gestor
  ON public.configuracao_oficina
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_perfil_usuario_atual() = 'gestor');

CREATE POLICY pol_configuracao_oficina_update_gestor
  ON public.configuracao_oficina
  FOR UPDATE TO authenticated
  USING (public.fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (public.fn_perfil_usuario_atual() = 'gestor');

CREATE POLICY pol_configuracao_oficina_delete_gestor
  ON public.configuracao_oficina
  FOR DELETE TO authenticated
  USING (public.fn_perfil_usuario_atual() = 'gestor');

-- -----------------------------------------------------------------------------
-- 3) BUCKET PRIVADO DO LOGOTIPO
--    2 MiB = 2 * 1024 * 1024 = 2097152 bytes.
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'logos-oficina',
  'logos-oficina',
  FALSE,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET name               = EXCLUDED.name,
    public             = FALSE,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS pol_logos_oficina_select
  ON storage.objects;
DROP POLICY IF EXISTS pol_logos_oficina_insert_gestor
  ON storage.objects;
DROP POLICY IF EXISTS pol_logos_oficina_update_gestor
  ON storage.objects;
DROP POLICY IF EXISTS pol_logos_oficina_delete_gestor
  ON storage.objects;
DROP POLICY IF EXISTS pol_logos_oficina_guard_select
  ON storage.objects;
DROP POLICY IF EXISTS pol_logos_oficina_guard_insert
  ON storage.objects;
DROP POLICY IF EXISTS pol_logos_oficina_guard_update
  ON storage.objects;
DROP POLICY IF EXISTS pol_logos_oficina_guard_delete
  ON storage.objects;

CREATE POLICY pol_logos_oficina_select
  ON storage.objects
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (bucket_id = 'logos-oficina');

CREATE POLICY pol_logos_oficina_insert_gestor
  ON storage.objects
  AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos-oficina'
    AND public.fn_perfil_usuario_atual() = 'gestor'
  );

CREATE POLICY pol_logos_oficina_update_gestor
  ON storage.objects
  AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos-oficina'
    AND public.fn_perfil_usuario_atual() = 'gestor'
  )
  WITH CHECK (
    bucket_id = 'logos-oficina'
    AND public.fn_perfil_usuario_atual() = 'gestor'
  );

CREATE POLICY pol_logos_oficina_delete_gestor
  ON storage.objects
  AS PERMISSIVE
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos-oficina'
    AND public.fn_perfil_usuario_atual() = 'gestor'
  );

-- Guards restritivos compoem por AND com a soma (OR) de todas as policies
-- permissivas, inclusive policies preexistentes que esta migracao nao controla.
-- Para qualquer outro bucket retornam TRUE e nao alteram o acesso existente.
-- `service_role` preserva o BYPASSRLS nativo e nao e afetada pelos guards.
CREATE POLICY pol_logos_oficina_guard_select
  ON storage.objects
  AS RESTRICTIVE
  FOR SELECT TO PUBLIC
  USING (
    CASE
      WHEN bucket_id IS DISTINCT FROM 'logos-oficina' THEN TRUE
      ELSE auth.role() = 'authenticated'
    END
  );

CREATE POLICY pol_logos_oficina_guard_insert
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO PUBLIC
  WITH CHECK (
    CASE
      WHEN bucket_id IS DISTINCT FROM 'logos-oficina' THEN TRUE
      WHEN auth.role() IS DISTINCT FROM 'authenticated' THEN FALSE
      ELSE public.fn_perfil_usuario_atual() = 'gestor'
    END
  );

CREATE POLICY pol_logos_oficina_guard_update
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO PUBLIC
  USING (
    CASE
      WHEN bucket_id IS DISTINCT FROM 'logos-oficina' THEN TRUE
      WHEN auth.role() IS DISTINCT FROM 'authenticated' THEN FALSE
      ELSE public.fn_perfil_usuario_atual() = 'gestor'
    END
  )
  WITH CHECK (
    CASE
      WHEN bucket_id IS DISTINCT FROM 'logos-oficina' THEN TRUE
      WHEN auth.role() IS DISTINCT FROM 'authenticated' THEN FALSE
      ELSE public.fn_perfil_usuario_atual() = 'gestor'
    END
  );

CREATE POLICY pol_logos_oficina_guard_delete
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE TO PUBLIC
  USING (
    CASE
      WHEN bucket_id IS DISTINCT FROM 'logos-oficina' THEN TRUE
      WHEN auth.role() IS DISTINCT FROM 'authenticated' THEN FALSE
      ELSE public.fn_perfil_usuario_atual() = 'gestor'
    END
  );

-- -----------------------------------------------------------------------------
-- 4) POS-CONDICOES FAIL-CLOSED
--    Falham a transacao se o singleton, as ACLs, o RLS, o bucket ou as policies
--    finais divergirem do contrato. A verificacao de policies rejeita qualquer
--    policy adicional de escrita aplicavel a authenticated/PUBLIC na tabela.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_linhas        BIGINT;
  v_policies_invalidas  TEXT;
  v_cnpj_teste          VARCHAR(14);
  v_constraint_name     TEXT;
BEGIN
  SELECT count(*)
    INTO v_total_linhas
    FROM public.configuracao_oficina;

  IF v_total_linhas > 1 THEN
    RAISE EXCEPTION
      'configuracao_oficina violou o singleton: % linhas encontradas',
      v_total_linhas;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'public.configuracao_oficina'::regclass
       AND c.contype = 'p'
       AND c.convalidated
       AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)'
  ) THEN
    RAISE EXCEPTION
      'configuracao_oficina nao possui PRIMARY KEY em id';
  END IF;

  IF (
    SELECT count(*)
      FROM pg_constraint c
     WHERE c.conrelid = 'public.configuracao_oficina'::regclass
       AND c.conname IN (
         'configuracao_oficina_singleton',
         'configuracao_oficina_cnpj_formato',
         'configuracao_oficina_cep_formato',
         'configuracao_oficina_uf_valida',
         'configuracao_oficina_logo_path_valido'
       )
       AND c.contype = 'c'
       AND c.convalidated
  ) <> 5 THEN
    RAISE EXCEPTION
      'checks obrigatorios de configuracao_oficina ausentes ou nao validados';
  END IF;

  -- Prova comportamental do singleton, sem deixar dado de teste: a violacao
  -- abre uma subtransacao PL/pgSQL, e o INSERT e revertido ao entrar no handler.
  v_cnpj_teste := CASE
    WHEN EXISTS (
      SELECT 1
        FROM public.configuracao_oficina
       WHERE cnpj = '00000000000000'
    ) THEN '11111111111111'
    ELSE '00000000000000'
  END;

  BEGIN
    INSERT INTO public.configuracao_oficina (id, nome_fantasia, cnpj)
    VALUES (2, '__pos_condicao_singleton__', v_cnpj_teste);

    RAISE EXCEPTION
      'configuracao_oficina aceitou id diferente de 1';
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IS DISTINCT FROM 'configuracao_oficina_singleton' THEN
        RAISE EXCEPTION
          'INSERT de teste falhou no CHECK inesperado: %',
          v_constraint_name;
      END IF;
  END;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
     WHERE t.tgrelid = 'public.configuracao_oficina'::regclass
       AND t.tgname = 'trg_configuracao_oficina_atualizado_em'
       AND NOT t.tgisinternal
       AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION
      'trigger de atualizado_em ausente ou desabilitado em configuracao_oficina';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'configuracao_oficina'
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS nao esta habilitado em configuracao_oficina';
  END IF;

  IF has_table_privilege('anon', 'public.configuracao_oficina', 'SELECT')
     OR has_table_privilege('anon', 'public.configuracao_oficina', 'INSERT')
     OR has_table_privilege('anon', 'public.configuracao_oficina', 'UPDATE')
     OR has_table_privilege('anon', 'public.configuracao_oficina', 'DELETE')
  THEN
    RAISE EXCEPTION 'anon ainda possui privilegio em configuracao_oficina';
  END IF;

  IF NOT has_table_privilege(
           'authenticated', 'public.configuracao_oficina', 'SELECT'
         )
     OR NOT has_table_privilege(
           'authenticated', 'public.configuracao_oficina', 'INSERT'
         )
     OR NOT has_table_privilege(
           'authenticated', 'public.configuracao_oficina', 'UPDATE'
         )
     OR NOT has_table_privilege(
           'authenticated', 'public.configuracao_oficina', 'DELETE'
         )
  THEN
    RAISE EXCEPTION
      'authenticated nao possui os grants necessarios para o RLS da configuracao';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'configuracao_oficina'
       AND policyname = 'pol_configuracao_oficina_select'
       AND cmd = 'SELECT'
       AND roles = ARRAY['authenticated']::name[]
       AND qual IN ('true', '(true)')
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'configuracao_oficina'
       AND policyname = 'pol_configuracao_oficina_insert_gestor'
       AND cmd = 'INSERT'
       AND roles = ARRAY['authenticated']::name[]
       AND with_check LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'configuracao_oficina'
       AND policyname = 'pol_configuracao_oficina_update_gestor'
       AND cmd = 'UPDATE'
       AND roles = ARRAY['authenticated']::name[]
       AND qual LIKE '%fn_perfil_usuario_atual()%gestor%'
       AND with_check LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'configuracao_oficina'
       AND policyname = 'pol_configuracao_oficina_delete_gestor'
       AND cmd = 'DELETE'
       AND roles = ARRAY['authenticated']::name[]
       AND qual LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) THEN
    RAISE EXCEPTION
      'policies obrigatorias de configuracao_oficina ausentes ou inseguras';
  END IF;

  SELECT string_agg(policyname, ', ' ORDER BY policyname)
    INTO v_policies_invalidas
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'configuracao_oficina'
     AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
     AND roles && ARRAY['public', 'authenticated']::name[]
     AND policyname NOT IN (
       'pol_configuracao_oficina_insert_gestor',
       'pol_configuracao_oficina_update_gestor',
       'pol_configuracao_oficina_delete_gestor'
     );

  IF v_policies_invalidas IS NOT NULL THEN
    RAISE EXCEPTION
      'policies adicionais podem liberar escrita nao gestora em configuracao_oficina: %',
      v_policies_invalidas;
  END IF;
END $$;

DO $$
DECLARE
  v_bucket  storage.buckets%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'storage'
       AND c.relname = 'objects'
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS nao esta habilitado em storage.objects';
  END IF;

  SELECT *
    INTO v_bucket
    FROM storage.buckets
   WHERE id = 'logos-oficina';

  IF NOT FOUND
     OR v_bucket.public
     OR v_bucket.file_size_limit IS DISTINCT FROM 2097152
     OR v_bucket.allowed_mime_types IS DISTINCT FROM
          ARRAY['image/png', 'image/jpeg', 'image/webp']::TEXT[]
  THEN
    RAISE EXCEPTION
      'bucket logos-oficina ausente ou fora do contrato privado/MIME/2 MiB';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'pol_logos_oficina_select'
       AND permissive = 'PERMISSIVE'
       AND cmd = 'SELECT'
       AND roles = ARRAY['authenticated']::name[]
       AND qual LIKE '%logos-oficina%'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'pol_logos_oficina_insert_gestor'
       AND permissive = 'PERMISSIVE'
       AND cmd = 'INSERT'
       AND roles = ARRAY['authenticated']::name[]
       AND with_check LIKE '%logos-oficina%'
       AND with_check LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'pol_logos_oficina_update_gestor'
       AND permissive = 'PERMISSIVE'
       AND cmd = 'UPDATE'
       AND roles = ARRAY['authenticated']::name[]
       AND qual LIKE '%logos-oficina%'
       AND qual LIKE '%fn_perfil_usuario_atual()%gestor%'
       AND with_check LIKE '%logos-oficina%'
       AND with_check LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'pol_logos_oficina_delete_gestor'
       AND permissive = 'PERMISSIVE'
       AND cmd = 'DELETE'
       AND roles = ARRAY['authenticated']::name[]
       AND qual LIKE '%logos-oficina%'
       AND qual LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) THEN
    RAISE EXCEPTION
      'policies obrigatorias do bucket logos-oficina ausentes ou inseguras';
  END IF;

  -- Os guards RESTRICTIVE valem para PUBLIC: sao combinados por AND com toda
  -- policy permissiva, inclusive as preexistentes. Assim nao e preciso inferir
  -- por texto se cada policy externa exclui ou nao o bucket.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'pol_logos_oficina_guard_select'
       AND permissive = 'RESTRICTIVE'
       AND cmd = 'SELECT'
       AND roles = ARRAY['public']::name[]
       AND LOWER(qual) LIKE '%bucket_id is distinct from%logos-oficina%then true%'
       AND qual LIKE '%auth.role()%authenticated%'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'pol_logos_oficina_guard_insert'
       AND permissive = 'RESTRICTIVE'
       AND cmd = 'INSERT'
       AND roles = ARRAY['public']::name[]
       AND LOWER(with_check) LIKE '%bucket_id is distinct from%logos-oficina%then true%'
       AND with_check LIKE '%auth.role()%authenticated%'
       AND with_check LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'pol_logos_oficina_guard_update'
       AND permissive = 'RESTRICTIVE'
       AND cmd = 'UPDATE'
       AND roles = ARRAY['public']::name[]
       AND LOWER(qual) LIKE '%bucket_id is distinct from%logos-oficina%then true%'
       AND qual LIKE '%auth.role()%authenticated%'
       AND qual LIKE '%fn_perfil_usuario_atual()%gestor%'
       AND LOWER(with_check) LIKE '%bucket_id is distinct from%logos-oficina%then true%'
       AND with_check LIKE '%auth.role()%authenticated%'
       AND with_check LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'pol_logos_oficina_guard_delete'
       AND permissive = 'RESTRICTIVE'
       AND cmd = 'DELETE'
       AND roles = ARRAY['public']::name[]
       AND LOWER(qual) LIKE '%bucket_id is distinct from%logos-oficina%then true%'
       AND qual LIKE '%auth.role()%authenticated%'
       AND qual LIKE '%fn_perfil_usuario_atual()%gestor%'
  ) THEN
    RAISE EXCEPTION
      'guards RESTRICTIVE do bucket logos-oficina ausentes ou inseguros';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICACAO EM HOMOLOGACAO (nao executada por esta migracao)
--
-- 1) Rode o arquivo inteiro duas vezes.
-- 2) Via PostgREST/Storage, teste anon, gestor, atendente e mecanico:
--      anon: nenhuma leitura/escrita;
--      autenticados: leitura da configuracao e do logo;
--      somente gestor: INSERT/UPDATE/DELETE da linha e do objeto.
-- 3) Confirme que segundo INSERT com id diferente de 1, CNPJ/CEP/UF invalidos,
--    MIME fora da lista e arquivo acima de 2 MiB sao recusados.
-- =============================================================================
