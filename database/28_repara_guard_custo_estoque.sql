-- =============================================================================
-- 28_repara_guard_custo_estoque.sql
-- Reinstala os objetos da migracao 19 que nao existem no banco publicado (a
-- view `item_estoque_publico`, a funcao `fn_guard_custo_gestor` e o trigger
-- `trg_item_estoque_guard_custo`) e fecha o privilegio de ESCRITA que
-- `authenticated` tem nas tres views que ignoram o RLS.
--
-- Por que existe: a 19 ficou pela metade. O `DROP POLICY` de
-- `pol_estoque_atendente_select` foi aplicado, mas a view que a substituiria e
-- o guard de coluna nao. O estado resultante tem dois defeitos:
--
--   1) FUNCIONAL. O atendente nao tem policy de SELECT em `item_estoque` e a
--      view nao existe: a tela de estoque fica vazia para esse perfil. O
--      frontend ja le `item_estoque_publico` com fallback para a tabela
--      (ListaEstoque.jsx, Sidebar.jsx, AtualizarOS.jsx), e o fallback nao
--      acusa nada — RLS filtra LINHA sem devolver erro, entao a tela mostra
--      zero itens em silencio.
--   2) INTEGRIDADE. `pol_estoque_atendente_update` autoriza a LINHA inteira e
--      RLS nao recorta coluna. Sem o guard, um
--      `PATCH /rest/v1/item_estoque?id=eq.<uuid>` com `{"custo": 0}` deixa o
--      atendente sobrescrever um campo que ele nao pode nem ler. A propria 19
--      documenta esse ataque como a razao do trigger.
--
-- E fecha um TERCEIRO defeito, achado ao escrever esta migracao e que nao vem
-- da 19: as tres views que ignoram o RLS por design (`item_estoque_publico`,
-- `funcionario_publico`, `historico_movimentacao_estoque`) revogam privilegio
-- so de `PUBLIC` e `anon`. `REVOKE ... FROM PUBLIC` nao apaga concessao nominal
-- a `authenticated`, e o default privilege do Supabase concede `ALL` em
-- `public` a `anon, authenticated, service_role`. Resultado no banco publicado:
-- `authenticated` tem INSERT/UPDATE/DELETE nas tres. `funcionario_publico` e
-- AUTO-ATUALIZAVEL e expoe `id_usuario`, entao um mecanico autenticado
-- repontava um funcionario para o proprio `auth.uid()` por
-- `PATCH /rest/v1/funcionario_publico` e passava a satisfazer as policies de
-- `os_comissao` e `pol_cliente_mecanico_select` — comissao alheia e CPF/CNPJ de
-- todos os clientes, sem tocar em `funcionario` diretamente.
--
-- DIVERGENCIA RELATADA, NAO CORRIGIDA: a migracao 15 especifica
-- `item_estoque.custo` ANULAVEL (`NULL` = nao informado, `0` = custo zero) e
-- tem pos-condicao que aborta se a coluna estiver `NOT NULL`. No banco
-- publicado a coluna e `NOT NULL DEFAULT 0` — a 15 nunca foi aplicada e a
-- coluna nasceu a mao. Converter `0` em `NULL` seria adivinhar qual zero e
-- "custo zero" e qual e "nao informado", e isso perde dado. Esta migracao NAO
-- toca na coluna: o guard se adapta aos dois formatos. Registrado em
-- `docs/DER.md`.
--
-- Transacional e idempotente. Reaplicar nao muda nada.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

-- -----------------------------------------------------------------------------
-- 1) GUARD DE COLUNA PARA `custo`
--    RLS e por linha; GRANT por coluna nao separa gestor de atendente, porque
--    os dois sao a mesma role `authenticated`. O controle de coluna so sai em
--    trigger.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'item_estoque' AND column_name = 'custo'
  ) THEN
    RAISE EXCEPTION
      'Migracao 28 abortada: item_estoque.custo nao existe. Aplique a 15 antes.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_guard_custo_gestor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $guard$
DECLARE
  v_anulavel BOOLEAN;
BEGIN
  -- `service_role` (backend) e o dono da tabela nao tem linha em `usuario`,
  -- entao tambem nao passam por aqui como gestor. Hoje nenhum dos dois grava
  -- custo; se passar a gravar, esta condicao precisa de revisao.
  IF public.fn_perfil_usuario_atual() IS DISTINCT FROM 'gestor' THEN
    IF TG_OP = 'INSERT' THEN
      -- A 19 original escrevia `NULL` direto. Em banco onde a coluna nasceu
      -- `NOT NULL DEFAULT 0` (divergencia da 15, ver cabecalho) isso viraria
      -- violacao de NOT NULL no INSERT: o atendente receberia um erro de
      -- restricao em vez de simplesmente nao conseguir gravar o custo. A
      -- sentinela e escolhida pela nulidade real da coluna, entao a migracao
      -- serve aos dois formatos e se ajusta sozinha se a coluna mudar.
      SELECT NOT a.attnotnull INTO v_anulavel
        FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = 'public.item_estoque'::regclass
         AND a.attname = 'custo'
         AND NOT a.attisdropped;
      NEW.custo := CASE WHEN v_anulavel THEN NULL ELSE 0 END;
    ELSE
      NEW.custo := OLD.custo;
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

COMMENT ON FUNCTION public.fn_guard_custo_gestor() IS
  'Preserva item_estoque.custo contra escrita de quem nao e gestor (migracoes 19 e 28). RLS e por linha; controle de coluna so por trigger.';

REVOKE ALL ON FUNCTION public.fn_guard_custo_gestor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_guard_custo_gestor() FROM anon;
REVOKE ALL ON FUNCTION public.fn_guard_custo_gestor() FROM authenticated;

DROP TRIGGER IF EXISTS trg_item_estoque_guard_custo ON public.item_estoque;
CREATE TRIGGER trg_item_estoque_guard_custo
  BEFORE INSERT OR UPDATE ON public.item_estoque
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_custo_gestor();

-- -----------------------------------------------------------------------------
-- 2) VIEW SEM `custo`, PARA OS PERFIS NAO GESTORES
--    A view roda com os direitos do dono e ignora o RLS de `item_estoque` por
--    design, como `funcionario_publico`. Por isso o `REVOKE` de `anon` e
--    obrigatorio: sem ele a chave publica do bundle leria o estoque inteiro sem
--    login. O predicado exige usuario presente e ativo.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.item_estoque_publico;

CREATE VIEW public.item_estoque_publico AS
  SELECT
    id, codigo, nome, descricao, unidade,
    quantidade, qtd_minima, preco_unit,
    ativo, criado_em, atualizado_em
  FROM public.item_estoque
  WHERE public.fn_perfil_usuario_atual() IS NOT NULL;

COMMENT ON VIEW public.item_estoque_publico IS
  'Estoque sem a coluna custo (RF09/RN35), para perfis nao gestores. Ignora RLS por design: SELECT revogado de anon nas migracoes 19 e 28.';

-- `REVOKE` tem de alcancar `authenticated` e `service_role`, nao so `PUBLIC` e
-- `anon`. Esta view e AUTO-ATUALIZAVEL (um unico FROM, colunas que sao
-- referencias diretas, sem DISTINCT nem agregado), entao aceita INSERT, UPDATE
-- e DELETE. E como ela ignora o RLS por design, a escrita por ela tambem
-- ignora: com o `ALL` que o default privilege do Supabase concede, qualquer
-- autenticado alteraria preco e `ativo` e apagaria item do catalogo sem passar
-- por policy nenhuma. `REVOKE ... FROM PUBLIC` NAO apaga concessao nominal a
-- `authenticated` — sao entradas distintas de ACL.
REVOKE ALL ON public.item_estoque_publico FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.item_estoque_publico TO authenticated, service_role;

-- A tabela nao volta a ser legivel por atendente: o custo mora nela. INSERT e
-- UPDATE do atendente continuam valendo, com `USING`/`WITH CHECK` proprios, e
-- agora o custo e protegido pelo trigger. Reaplicar a `02` recria esta policy,
-- por isso o DROP fica aqui tambem.
DROP POLICY IF EXISTS pol_estoque_atendente_select ON public.item_estoque;

-- -----------------------------------------------------------------------------
-- 3) MESMO BURACO NAS DUAS VIEWS QUE JA EXISTIAM
--    `funcionario_publico` (12/16) e `historico_movimentacao_estoque` (22/27)
--    tambem revogam so de `PUBLIC` e `anon`, e tambem ignoram o RLS por design.
--    No banco publicado as duas estao com DELETE/INSERT/UPDATE para
--    `authenticated`, herdados do default privilege do Supabase.
--
--    `funcionario_publico` e AUTO-ATUALIZAVEL e expoe `id_usuario`: um mecanico
--    autenticado mandava `PATCH /rest/v1/funcionario_publico?id=eq.<uuid>` com
--    `{"id_usuario": "<o proprio auth.uid()>"}` e passava a satisfazer
--    `funcionario.id_usuario = auth.uid()` nas policies de `os_comissao` e em
--    `pol_cliente_mecanico_select` — comissao alheia e CPF/CNPJ de todos os
--    clientes. `historico_movimentacao_estoque` tem LEFT JOIN, logo nao e
--    atualizavel, mas o grant indevido sai junto por higiene.
--
--    Correcao de privilegio, nao de dado: `REVOKE` nao valida linha e nao pode
--    abortar por conteudo, entao cabe na mesma transacao sem o risco que
--    separou a 17 da 16.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.funcionario_publico') IS NOT NULL THEN
    REVOKE ALL ON public.funcionario_publico FROM PUBLIC, anon, authenticated, service_role;
    GRANT SELECT ON public.funcionario_publico TO authenticated, service_role;
  ELSE
    RAISE WARNING 'funcionario_publico ausente: pule, a migracao 12 nao foi aplicada.';
  END IF;

  IF to_regclass('public.historico_movimentacao_estoque') IS NOT NULL THEN
    REVOKE ALL ON public.historico_movimentacao_estoque FROM PUBLIC, anon, authenticated, service_role;
    GRANT SELECT ON public.historico_movimentacao_estoque TO authenticated, service_role;
  ELSE
    RAISE WARNING 'historico_movimentacao_estoque ausente: pule, a migracao 22/27 nao foi aplicada.';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4) POS-CONDICOES. Falham a transacao: migracao de seguranca aplicada pela
--    metade foi exatamente o que produziu este reparo.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_trigger_ativo BOOLEAN;
  v_sentinela TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.item_estoque'::regclass
       AND tgname = 'trg_item_estoque_guard_custo'
       AND tgenabled <> 'D'
       AND NOT tgisinternal
  ) INTO v_trigger_ativo;

  IF NOT v_trigger_ativo THEN
    RAISE EXCEPTION 'Pos-condicao falhou: trigger de custo ausente ou desativado.';
  END IF;

  IF to_regclass('public.item_estoque_publico') IS NULL THEN
    RAISE EXCEPTION 'Pos-condicao falhou: view item_estoque_publico nao existe.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'item_estoque_publico'
       AND column_name = 'custo'
  ) THEN
    RAISE EXCEPTION 'Pos-condicao falhou: a view item_estoque_publico expoe a coluna custo.';
  END IF;

  IF has_table_privilege('anon', 'public.item_estoque_publico', 'SELECT') THEN
    RAISE EXCEPTION 'Pos-condicao falhou: anon pode ler item_estoque_publico.';
  END IF;

  -- O defeito funcional que motivou a migracao: sem caminho de leitura, a tela
  -- de estoque do atendente fica vazia sem erro.
  IF NOT has_table_privilege('authenticated', 'public.item_estoque_publico', 'SELECT') THEN
    RAISE EXCEPTION 'Pos-condicao falhou: authenticated nao pode ler item_estoque_publico.';
  END IF;

  -- A protecao da TABELA neste projeto e RLS, nao revogacao de GRANT: o default
  -- privilege do Supabase concede `ALL` em `public` a `anon`, e nenhuma
  -- migracao revoga isso. `anon` le zero linhas porque nao tem policy. Assertar
  -- `has_table_privilege('anon','item_estoque','SELECT')` media a coisa errada e
  -- abortava a migracao inteira num banco saudavel — a 16 foi cuidadosa em
  -- assertar privilegio so sobre VIEW (`relkind IN ('v','m')`), que e o objeto
  -- que ignora RLS. O que importa aqui e nao existir policy de leitura fora do
  -- gestor, que e o objetivo da 19 e o que o `DROP POLICY` acima garante apenas
  -- para UM nome conhecido.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'item_estoque'
       AND cmd IN ('SELECT', 'ALL')
       AND qual IS DISTINCT FROM '(fn_perfil_usuario_atual() = ''gestor''::perfil_usuario)'
  ) THEN
    RAISE EXCEPTION
      'Pos-condicao falhou: existe policy de leitura em item_estoque fora da forma exata de gestor — o custo volta a ficar exposto.';
  END IF;

  -- Escrita pela view driblaria o RLS inteiro de cada tabela-base.
  IF has_table_privilege('authenticated', 'public.item_estoque_publico', 'INSERT')
     OR has_table_privilege('authenticated', 'public.item_estoque_publico', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.item_estoque_publico', 'DELETE') THEN
    RAISE EXCEPTION 'Pos-condicao falhou: authenticated pode escrever por item_estoque_publico (bypass de RLS).';
  END IF;

  IF to_regclass('public.funcionario_publico') IS NOT NULL
     AND (has_table_privilege('authenticated', 'public.funcionario_publico', 'INSERT')
          OR has_table_privilege('authenticated', 'public.funcionario_publico', 'UPDATE')
          OR has_table_privilege('authenticated', 'public.funcionario_publico', 'DELETE')) THEN
    RAISE EXCEPTION 'Pos-condicao falhou: authenticated pode escrever por funcionario_publico (bypass de RLS).';
  END IF;

  IF to_regclass('public.historico_movimentacao_estoque') IS NOT NULL
     AND (has_table_privilege('authenticated', 'public.historico_movimentacao_estoque', 'INSERT')
          OR has_table_privilege('authenticated', 'public.historico_movimentacao_estoque', 'UPDATE')
          OR has_table_privilege('authenticated', 'public.historico_movimentacao_estoque', 'DELETE')) THEN
    RAISE EXCEPTION 'Pos-condicao falhou: authenticated pode escrever por historico_movimentacao_estoque.';
  END IF;

  SELECT CASE WHEN a.attnotnull THEN '0 (coluna NOT NULL)' ELSE 'NULL (coluna anulavel)' END
    INTO v_sentinela
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.item_estoque'::regclass
     AND a.attname = 'custo' AND NOT a.attisdropped;

  RAISE NOTICE 'Guard de custo ativo. Sentinela de INSERT para nao gestor: %.', v_sentinela;
  RAISE NOTICE 'View item_estoque_publico recriada sem a coluna custo.';
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
