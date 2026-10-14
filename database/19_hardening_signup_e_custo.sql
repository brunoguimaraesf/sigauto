-- =============================================================================
-- 19_hardening_signup_e_custo.sql
-- Descricao: Fecha os tres achados da auditoria de seguranca das migracoes
--   15-18. Nenhum deles foi introduzido por elas; os dois primeiros sao
--   anteriores e esvaziavam o contrato de acesso que a 18 tenta estabelecer.
--
--   1) CRITICO - escalonamento para `gestor` no cadastro de conta.
--      `fn_handle_new_auth_user` (01_schema.sql:84-91) copiava
--      `raw_user_meta_data->>'perfil'` direto para `usuario.perfil`. Esse
--      metadado e escolhido por quem se cadastra: com a chave `anon` que esta
--      no bundle do frontend, um `POST /auth/v1/signup` com
--      `"data": {"perfil": "gestor"}` criava uma conta gestor. A partir dai
--      `fn_perfil_usuario_atual()` devolve 'gestor' e a conta passa em TODAS as
--      policies do projeto (estoque, configuracao da oficina, `funcionario`
--      com comissao, `cliente` com CPF/CNPJ). O mesmo valia pelos tres e-mails
--      fixos de demonstracao: quem registrasse `gestor@sigauto.com` primeiro
--      virava gestor.
--      Conserto: o trigger passa a gravar SEMPRE o perfil minimo ('mecanico').
--      Promover e ato de gestor, por UPDATE em `usuario` (pol_usuario_gestor_all),
--      que e exatamente o que a tela de Usuarios ja faz depois do signUp
--      (react-app/src/pages/Usuarios.jsx:112-115). Nao ha auto-promocao: se
--      nenhum gestor existir, a promocao sai pelo SQL Editor / service_role.
--
--   2) MEDIO - `item_estoque.custo` (e, por derivacao, a margem) legivel por
--      qualquer `atendente`. RLS e por linha: `pol_estoque_atendente_select`
--      (02_rls_policies.sql:222-225) liberava a tabela inteira, e um
--      `GET /rest/v1/item_estoque?select=custo` com o JWT de atendente devolvia
--      o custo de aquisicao de todo o estoque — sem passar pela tela.
--      Conserto no padrao `funcionario_publico` (migracao 12): view
--      `item_estoque_publico` SEM a coluna `custo`, com `REVOKE` de `anon`
--      desde o primeiro dia, e leitura da TABELA restrita ao gestor.
--      Efeito colateral desejado: o perfil `mecanico`, que nao tinha policy
--      nenhuma em `item_estoque` (tela de pecas vazia), passa a enxergar o
--      estoque sem custo pela view.
--
--   3) BAIXO - leitura da configuracao da oficina e do logo nao exigia usuario
--      ativo (18_configuracao_oficina.sql:107-110 e :170-174, `USING (TRUE)`).
--      Conta desativada (`usuario.ativo = false`) com JWT ainda valido lia
--      CNPJ, razao social, telefone, e-mail e endereco. Passa a exigir perfil
--      resolvivel, que so existe para usuario presente em `usuario`.
--
-- ORDEM DE DEPLOY (importa): publique ANTES o frontend que le
-- `item_estoque_publico`, com fallback para a tabela. Rodar esta migracao com o
-- frontend antigo no ar deixa a tela de estoque vazia para atendente.
--
-- Script IDEMPOTENTE e TRANSACIONAL. As partes que dependem da migracao 18 sao
-- puladas com aviso se ela ainda nao tiver sido aplicada.
-- =============================================================================

BEGIN;

-- Mesma disciplina das migracoes 14-18: fixa a resolucao de nomes da transacao.
SET LOCAL search_path = public, pg_catalog;

-- -----------------------------------------------------------------------------
-- 1) CADASTRO DE CONTA NAO DECIDE PERFIL
--    O perfil deixa de vir de metadado controlado por quem se cadastra. O nome
--    continua vindo do metadado: e rotulo, nao privilegio.
--    `ON CONFLICT` nao toca em `perfil`: um reenvio do trigger sobre conta ja
--    existente rebaixaria um gestor legitimo.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.usuario (id, nome, email, perfil, ativo)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'nome', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      split_part(NEW.email, '@', 1),
      'Usuario'
    ),
    NEW.email,
    -- Perfil minimo, sempre. Promover e UPDATE em `usuario`, permitido so a
    -- quem tem o perfil de maior privilegio (ver pol_usuario_*_all na 02).
    -- O texto da funcao nao cita esse perfil de proposito: a pos-condicao 4.1
    -- usa a mencao como sinal de concessao no cadastro.
    'mecanico'::perfil_usuario,
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nome  = EXCLUDED.nome;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_handle_new_auth_user() IS
  'Cria a linha em public.usuario quando nasce a conta no Auth. Grava sempre perfil mecanico: perfil vindo de raw_user_meta_data era escalonamento para gestor com a chave anon (migracao 19).';

-- `SECURITY DEFINER` chamada por trigger: o EXECUTE e checado na criacao do
-- trigger, nao a cada disparo, entao revogar nao desliga o cadastro.
REVOKE ALL ON FUNCTION public.fn_handle_new_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_handle_new_auth_user() FROM anon;
REVOKE ALL ON FUNCTION public.fn_handle_new_auth_user() FROM authenticated;

-- -----------------------------------------------------------------------------
-- 2) CUSTO SO PARA GESTOR
--    View sem `custo` para todo mundo; tabela so para gestor.
--    A view roda com os direitos do dono (ignora RLS de proposito, como
--    `funcionario_publico`), por isso o `REVOKE` de `anon` e obrigatorio: sem
--    ele a chave publica do bundle leria o estoque inteiro sem login.
-- -----------------------------------------------------------------------------

-- `CREATE OR REPLACE VIEW` falha se existir uma variante com outro conjunto ou
-- outra ordem de colunas ("cannot change name of view column"). O DROP guardado
-- torna a migracao reexecutavel depois de um ajuste de colunas.
DROP VIEW IF EXISTS public.item_estoque_publico;

CREATE VIEW public.item_estoque_publico AS
  SELECT
    id, codigo, nome, descricao, unidade,
    quantidade, qtd_minima, preco_unit,
    ativo, criado_em, atualizado_em
  FROM public.item_estoque
  -- A view roda com os direitos do dono e ignora o RLS de item_estoque: sem
  -- este predicado, QUALQUER portador de JWT valido — conta desativada, conta
  -- sem linha em `usuario`, conta recem-criada por auto-cadastro — leria o
  -- catalogo inteiro. `fn_perfil_usuario_atual()` exige `ativo = true`.
  WHERE public.fn_perfil_usuario_atual() IS NOT NULL;

COMMENT ON VIEW public.item_estoque_publico IS
  'Estoque sem a coluna custo (RF09/RN35), para perfis nao gestores. Ignora RLS por design: EXECUTE/SELECT revogado de anon na migracao 19.';

REVOKE ALL ON public.item_estoque_publico FROM PUBLIC;
REVOKE ALL ON public.item_estoque_publico FROM anon;
GRANT SELECT ON public.item_estoque_publico TO authenticated;
GRANT SELECT ON public.item_estoque_publico TO service_role;

-- A tabela deixa de ser legivel por atendente: o custo mora nela.
-- INSERT e UPDATE do atendente continuam valendo (policies proprias, com
-- `USING`/`WITH CHECK` independentes do SELECT) — a tela de estoque grava sem
-- pedir representacao de volta.
DROP POLICY IF EXISTS pol_estoque_atendente_select ON public.item_estoque;

-- Esconder a leitura nao basta: `pol_estoque_atendente_update` autoriza a LINHA
-- inteira, entao um `PATCH /rest/v1/item_estoque?id=eq.<uuid>` com
-- `{"custo": null}` apagava o custo que o atendente nao pode nem ver. RLS e por
-- linha e GRANT por coluna nao separa gestor de atendente (mesma role
-- `authenticated`), por isso o controle de coluna sai em trigger.
CREATE OR REPLACE FUNCTION public.fn_guard_custo_gestor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $guard$
BEGIN
  -- `service_role` (backend) e o dono nao tem linha em `usuario` e tambem nao
  -- passam por aqui como gestor; hoje nenhum dos dois grava custo.
  IF public.fn_perfil_usuario_atual() IS DISTINCT FROM 'gestor' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.custo := NULL;
    ELSE
      NEW.custo := OLD.custo;
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

COMMENT ON FUNCTION public.fn_guard_custo_gestor() IS
  'Preserva item_estoque.custo contra escrita de quem nao e gestor (migracao 19). RLS e por linha; controle de coluna so por trigger.';

REVOKE ALL ON FUNCTION public.fn_guard_custo_gestor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_guard_custo_gestor() FROM anon;
REVOKE ALL ON FUNCTION public.fn_guard_custo_gestor() FROM authenticated;

DROP TRIGGER IF EXISTS trg_item_estoque_guard_custo ON public.item_estoque;
CREATE TRIGGER trg_item_estoque_guard_custo
  BEFORE INSERT OR UPDATE ON public.item_estoque
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_custo_gestor();

-- -----------------------------------------------------------------------------
-- 3) LEITURA DA OFICINA EXIGE USUARIO PRESENTE
--    `fn_perfil_usuario_atual()` so devolve perfil para quem tem linha em
--    `usuario`; conta removida ou JWT de usuario inexistente cai fora.
--    Pulado com aviso se a migracao 18 ainda nao rodou.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.configuracao_oficina') IS NULL THEN
    RAISE NOTICE 'Migracao 18 ausente: policies de configuracao_oficina/logos nao ajustadas.';
  ELSE
    -- NOME NOVO de proposito. A 18 (`:107-110`) recria
    -- `pol_configuracao_oficina_select` com `USING (TRUE)` e manda, no rodape,
    -- rodar o arquivo inteiro duas vezes: reaplicar a 18 depois desta migracao
    -- reverteria o conserto em silencio e ainda passaria nas assertivas dela.
    -- Com nome proprio, o `DROP POLICY IF EXISTS` da 18 nao acerta esta aqui —
    -- e, se a 18 rodar de novo, as duas convivem e combinam por OR, entao a
    -- antiga e removida aqui tambem.
    DROP POLICY IF EXISTS pol_configuracao_oficina_select
      ON public.configuracao_oficina;
    DROP POLICY IF EXISTS pol_configuracao_oficina_select_ativo
      ON public.configuracao_oficina;
    CREATE POLICY pol_configuracao_oficina_select_ativo
      ON public.configuracao_oficina
      FOR SELECT TO authenticated
      USING (public.fn_perfil_usuario_atual() IS NOT NULL);

    -- Mesmo motivo do nome novo acima. `storage.objects` pertence ao
    -- `supabase_storage_admin`: se a role que aplica a migracao nao puder mexer
    -- em policy desse schema, o erro e capturado e o conserto do signup (parte
    -- 1, o achado critico) nao e perdido junto.
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN ('pol_logos_oficina_select', 'pol_logos_oficina_select_ativo')
    ) THEN
      BEGIN
        DROP POLICY IF EXISTS pol_logos_oficina_select ON storage.objects;
        DROP POLICY IF EXISTS pol_logos_oficina_select_ativo ON storage.objects;
        CREATE POLICY pol_logos_oficina_select_ativo
          ON storage.objects
          AS PERMISSIVE
          FOR SELECT TO authenticated
          USING (
            bucket_id = 'logos-oficina'
            AND public.fn_perfil_usuario_atual() IS NOT NULL
          );
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE WARNING 'Sem privilegio em storage.objects: pol_logos_oficina_select continua com USING (TRUE). Rode esta parte como dono do schema storage.';
      END;
    END IF;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4) POS-CONDICOES — falham a transacao inteira se algo ficou aberto
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_def           TEXT;
  v_anon_view     BOOLEAN;
  v_policy_ruim   TEXT;
  v_abertas       TEXT;
  v_trg           BOOLEAN;
  v_qual_oficina  TEXT;
BEGIN
  -- 4.1 O trigger de cadastro tem de existir E gravar perfil fixo. Assertar so
  --     a ausencia do padrao antigo aprovava banco sem funcao nenhuma, e o
  --     padrao textual nao pega `->> 'perfil'` com espaco.
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_handle_new_auth_user';

  IF NOT FOUND OR v_def IS NULL THEN
    RAISE EXCEPTION 'fn_handle_new_auth_user nao existe: o cadastro de conta ficaria sem linha em usuario.';
  END IF;
  -- `raw_user_meta_data[^;]*perfil` daria falso positivo: a propria funcao nova
  -- le `nome` do metadado e cita `perfil_usuario` no cast, no MESMO comando.
  -- O alvo e o acesso a chave `perfil` do metadado, com `->` ou `->>`.
  IF v_def ~* 'raw_user_meta_data\s*->>?\s*''perfil''' THEN
    RAISE EXCEPTION 'fn_handle_new_auth_user ainda deriva perfil de raw_user_meta_data.';
  END IF;
  -- Fecha tambem a concessao por e-mail fixo (gestor@sigauto.com e companhia):
  -- nenhum caminho da funcao pode mencionar o perfil de maior privilegio.
  IF v_def ILIKE '%gestor%' THEN
    RAISE EXCEPTION 'fn_handle_new_auth_user ainda pode conceder perfil gestor no cadastro.';
  END IF;
  IF v_def NOT ILIKE '%''mecanico''::perfil_usuario%' THEN
    RAISE EXCEPTION 'fn_handle_new_auth_user nao grava o perfil minimo fixo.';
  END IF;

  -- 4.2 A view nova nao pode ser legivel pela chave publica.
  SELECT has_table_privilege('anon', 'public.item_estoque_publico', 'SELECT')
    INTO v_anon_view;
  IF v_anon_view THEN
    RAISE EXCEPTION 'anon ainda tem SELECT em item_estoque_publico.';
  END IF;

  -- 4.3 Nenhuma policy pode devolver a tabela (com custo) a quem nao e gestor.
  --     `qual NOT ILIKE '%gestor%'` aprovava
  --     `= ANY (ARRAY['gestor','atendente'])`, que expoe o custo de novo:
  --     agora a comparacao e com a forma normalizada exata.
  SELECT string_agg(policyname, ', ') INTO v_policy_ruim
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'item_estoque'
    AND cmd IN ('SELECT', 'ALL')
    AND regexp_replace(COALESCE(qual, ''), '\s+', '', 'g')
        NOT IN (
          '(fn_perfil_usuario_atual()=''gestor''::perfil_usuario)',
          '(fn_perfil_usuario_atual()=''gestor''::text)',
          '(fn_perfil_usuario_atual()=''gestor'')'
        );
  IF v_policy_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'Policy de leitura de item_estoque fora do perfil gestor: %', v_policy_ruim;
  END IF;

  -- 4.4 O guard de coluna precisa estar armado, senao o custo escondido
  --     continua apagavel por quem nao pode ve-lo.
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.item_estoque'::regclass
      AND tgname = 'trg_item_estoque_guard_custo'
      AND NOT tgisinternal
  ) INTO v_trg;
  IF NOT v_trg THEN
    RAISE EXCEPTION 'Trigger trg_item_estoque_guard_custo ausente: custo gravavel por nao gestor.';
  END IF;

  -- 4.5 A parte 3 so emite NOTICE quando a 18 falta, e NOTICE passa batido no
  --     SQL Editor. Quando a tabela existe, a policy nova TEM de estar la.
  IF to_regclass('public.configuracao_oficina') IS NOT NULL THEN
    SELECT string_agg(COALESCE(qual, ''), ' | ') INTO v_qual_oficina
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'configuracao_oficina'
      AND cmd IN ('SELECT', 'ALL');

    IF v_qual_oficina IS NULL OR v_qual_oficina NOT ILIKE '%fn_perfil_usuario_atual%' THEN
      RAISE EXCEPTION 'Leitura de configuracao_oficina nao exige usuario ativo (qual = %).', COALESCE(v_qual_oficina, '<nenhuma>');
    END IF;
    IF v_qual_oficina ~ '(^|\| )\s*(true|\(true\))\s*($|\|)' THEN
      RAISE EXCEPTION 'Ainda ha policy de leitura irrestrita em configuracao_oficina.';
    END IF;
  END IF;

  -- 4.6 Assertiva da migracao 16 repetida cobrindo tambem MATERIALIZED VIEW
  --     (relkind 'm'), que ignora RLS por construcao. Objeto de extensao fica
  --     de fora, como a 16 ja faz com funcoes: sem esse filtro, uma view de
  --     extensao com GRANT a PUBLIC abortaria a transacao inteira e levaria
  --     junto o conserto do signup, que e o achado critico.
  SELECT string_agg(format('%s.%s', n.nspname, c.relname), ', ')
    INTO v_abertas
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('v', 'm')
    AND has_table_privilege('anon', c.oid, 'SELECT')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e'
    );

  IF v_abertas IS NOT NULL THEN
    RAISE EXCEPTION 'Views/matviews de public legiveis por anon: %', v_abertas;
  END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- NAO FECHADO POR ESTE SCRIPT (exige acao fora do SQL):
--   - Desabilite o cadastro publico no painel do Supabase
--     (Authentication > Providers > Email > "Allow new users to sign up") se a
--     criacao de conta so deve sair pela tela de Usuarios. O conserto do
--     trigger impede o escalonamento, mas nao impede a criacao de contas.
--   - Os tres e-mails de demonstracao do 01_schema.sql nao concedem mais
--     perfil: as contas de demo precisam ser promovidas por um gestor.
-- =============================================================================
