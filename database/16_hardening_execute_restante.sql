-- =============================================================================
-- 16_hardening_execute_restante.sql
-- Descricao: fecha o que a migracao 14 deixou aberto — tres funcoes
--   `SECURITY DEFINER` continuaram com `EXECUTE` para `PUBLIC`.
--
-- REQUER a migracao 14 aplicada (a pos-condicao deste script so passa depois
-- dela, porque e a 14 que revoga as outras oito).
--
-- O ACHADO
--   O projeto tem 11 funcoes `SECURITY DEFINER` (contando `fn_perfil_usuario_atual`
--   uma vez, redefinida no 07). A migracao 14 revogou o `EXECUTE` de 8. Ficaram
--   TRES de fora, com o default do PostgreSQL (`EXECUTE` para `PUBLIC`):
--
--     get_relatorio_atendimentos(timestamptz, timestamptz)  03_functions.sql:122
--     get_clientes_frequentes()                             03_functions.sql:225
--     get_historico_veiculo(uuid)                           03_functions.sql:378
--
--   `SECURITY DEFINER` IGNORA RLS por construcao: a funcao roda com os
--   privilegios de quem a definiu. Como a chave `anon` esta no bundle do
--   frontend (e publica, por definicao), era possivel chamar
--
--     POST /rest/v1/rpc/get_clientes_frequentes
--
--   SEM AUTENTICACAO e receber nome, CPF/CNPJ, telefone e faturamento por
--   cliente (`03_functions.sql:230-231`). O mesmo vale para
--   `get_relatorio_atendimentos`, que devolve `cliente_nome`, `cliente_cpf_cnpj`
--   e `veiculo_placa` (`:160`), e para `get_historico_veiculo`.
--
--   Sao exatamente as condicoes do achado critico que motivou a migracao 14 —
--   estas tres passaram batido. Dado pessoal de cliente exposto sem login.
--
--   Nenhuma das tres e chamada pelo app: nao existe UMA chamada `.rpc(` em
--   `react-app/src` nem em `backend/src` (o backend usa `.from().select()` com a
--   `service_role`). Revogar nao quebra tela nenhuma.
--
-- TAMBEM NESTE SCRIPT
--   - `search_path` fixado nas tres (funcao `SECURITY DEFINER` sem `search_path`
--     resolve nomes pelo path da sessao de quem chama);
--   - `EXECUTE` revogado tambem de `fn_normaliza_endereco()` — essa e
--     SECURITY INVOKER, nao DEFINER, entao NAO era o buraco acima; e higiene de
--     grant, para que a funcao nao fique chamavel por quem nao precisa;
--   - a view `funcionario_publico`, que ignora RLS por design, com `REVOKE`
--     explicito de `anon` (ver secao 3).
--
-- Script IDEMPOTENTE e TRANSACIONAL. `REVOKE`, `GRANT` e `ALTER FUNCTION ... SET`
-- sao idempotentes por natureza. Nao remove nada: nao ha Fase 2.
--
-- NAO inclui o CHECK de `item_estoque.preco_unit`: restricao valida as linhas
-- existentes, e uma unica linha negativa abortaria a transacao, desfazendo os
-- REVOKE e deixando a vulnerabilidade aberta por motivo de DADO. Isso foi para
-- a migracao 17, de proposito.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

-- -----------------------------------------------------------------------------
-- 1) REVOGA O EXECUTE DAS TRES SECURITY DEFINER QUE A 14 NAO COBRIU
--    `authenticated` tambem perde: nenhuma delas e chamada por RPC pelo
--    frontend, e um mecanico autenticado e ameaca real neste modelo.
--
--    O `GRANT ... TO service_role` logo abaixo e explicito de proposito.
--    `service_role` NAO "ignora grants" — `BYPASSRLS` afeta RLS, nao ACL de
--    funcao. Ele mantem o EXECUTE hoje porque o default privilege do Supabase o
--    concede em funcao nova de `public`; depender disso e depender de
--    configuracao de plataforma. Declarar evita um `42501 permission denied for
--    function` no dia em que alguem escrever o primeiro `.rpc(...)` no backend.
-- -----------------------------------------------------------------------------

-- Resolve pelo catalogo em vez de fixar assinaturas. Bancos antigos podem ter
-- recebido outra assinatura ou nem ter uma das funcoes. Uma referencia fixa
-- abortaria a transacao com 42883 antes de fechar as demais. Pelo OID, todas as
-- SECURITY DEFINER existentes (inclusive overloads) sao endurecidas. A unica
-- excecao e a assinatura exata de fn_perfil_usuario_atual(), usada pelas RLS.
DO $$
DECLARE
  v_funcao regprocedure;
BEGIN
  FOR v_funcao IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.oid IS DISTINCT FROM to_regprocedure(
         'public.fn_perfil_usuario_atual()'
       )
       AND NOT EXISTS (
         SELECT 1
           FROM pg_depend d
          WHERE d.classid = 'pg_proc'::regclass
            AND d.objid = p.oid
            AND d.refclassid = 'pg_extension'::regclass
            AND d.deptype = 'e'
       )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_funcao
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_funcao);
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, pg_catalog',
      v_funcao
    );
  END LOOP;
END $$;

-- Higiene, NAO o achado acima: `fn_normaliza_endereco` e SECURITY INVOKER
-- (13_endereco_cliente.sql:87-96 — sem `SECURITY DEFINER`), logo nunca driblou o
-- RLS. Revogar o EXECUTE **nao** impede o trigger de disparar: o privilegio da
-- funcao de trigger e verificado em `CREATE TRIGGER` e NAO e reavaliado a cada
-- disparo. A normalizacao de CEP/UF continua valendo.
DO $$
DECLARE
  v_funcao regprocedure;
BEGIN
  FOR v_funcao IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'fn_normaliza_endereco'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_funcao
    );
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, pg_catalog',
      v_funcao
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2) FIXA O search_path
-- -----------------------------------------------------------------------------

-- O search_path ja foi fixado nos blocos acima, usando a assinatura real de
-- cada funcao encontrada no catalogo.

-- -----------------------------------------------------------------------------
-- 3) A VIEW QUE IGNORA RLS
--    `funcionario_publico` (12_hardening_rls_funcionario.sql:44-52) e criada com
--    `security_invoker` DESLIGADO de proposito: ela le `funcionario` com os
--    privilegios do dono, justamente para que nao-gestores vejam nome e cargo
--    nos seletores de mecanico/atendente. O efeito colateral e que **o RLS de
--    `funcionario` nao se aplica a quem consulta pela view** — o unico controle
--    que resta e o GRANT.
--
--    E a 12 emitiu apenas `GRANT SELECT ... TO authenticated`, nunca um REVOKE.
--    Objeto novo em `public` nasce com o default privilege do Supabase, que
--    inclui `anon`. Se esse default estiver em vigor neste projeto,
--    `GET /rest/v1/funcionario_publico?select=*` com a chave publica devolve a
--    folha de colaboradores (id, nome, cargo, id_usuario, ativo) SEM LOGIN.
--
--    O REVOKE abaixo e correto nos dois casos (se `anon` nunca teve, e no-op).
--    NAO troque a view para `security_invoker = true`: o RLS de `funcionario`
--    voltaria a valer e a view devolveria so gestor + o proprio, esvaziando os
--    seletores — exatamente o que a 12 quis evitar.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'funcionario_publico'
       AND c.relkind = 'v'
  ) THEN
    REVOKE ALL    ON public.funcionario_publico FROM PUBLIC, anon;
    GRANT  SELECT ON public.funcionario_publico TO authenticated;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4) POS-CONDICAO
--    Transforma o achado numa regressao impossivel: funcao ou view nova que
--    esqueca o REVOKE faz este script falhar na proxima execucao, em vez de
--    abrir o buraco de novo em silencio.
--
--    Exclui objetos de EXTENSAO (`pg_depend.deptype = 'e'`): extensao instalada
--    no schema `public` traz funcao `SECURITY DEFINER` propria, e sem o filtro a
--    assercao abortaria a transacao — desfazendo os REVOKE acima e deixando a
--    vulnerabilidade aberta por motivo alheio.
--
--    `fn_perfil_usuario_atual` e a excecao legitima para `authenticated`: as
--    policies de RLS dependem dela, e a 14 manteve esse acesso de proposito (de
--    `anon` ela ja foi revogada).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_funcoes_anon  text;
  v_funcoes_auth  text;
  v_views_anon    text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_funcoes_anon
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef                                  -- SECURITY DEFINER
     AND NOT EXISTS (
       SELECT 1
         FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.refclassid = 'pg_extension'::regclass
          AND d.deptype = 'e'
     )
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_funcoes_anon IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER ainda executaveis por anon: %', v_funcoes_anon;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_funcoes_auth
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND p.oid IS DISTINCT FROM to_regprocedure('public.fn_perfil_usuario_atual()')
     AND NOT EXISTS (
       SELECT 1
         FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.refclassid = 'pg_extension'::regclass
          AND d.deptype = 'e'
     )
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_funcoes_auth IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER executaveis por authenticated (so fn_perfil_usuario_atual deveria): %', v_funcoes_auth;
  END IF;

  -- View sem `security_invoker` le as tabelas com o privilegio do dono, ou seja
  -- passa por cima do RLS: e o mesmo buraco por outra porta, e a checagem de
  -- funcoes acima nao o veria.
  SELECT string_agg(c.relname, ', ')
    INTO v_views_anon
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'v'
     AND COALESCE(
           (SELECT option_value::boolean
              FROM pg_options_to_table(c.reloptions)
             WHERE option_name = 'security_invoker'),
           false) = false
     AND has_table_privilege('anon', c.oid, 'SELECT');

  IF v_views_anon IS NOT NULL THEN
    RAISE EXCEPTION 'Views que ignoram RLS e estao legiveis por anon: %', v_views_anon;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- PRE-CHECK (rode ANTES de aplicar, para a pos-condicao nao abortar a correcao)
--
--   -- existe SECURITY DEFINER fora da lista deste script?
--   SELECT n.nspname, p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_pode,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_pode
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.prosecdef
--    ORDER BY 2;
--
--   -- alguma view sem security_invoker alem de funcionario_publico?
--   SELECT relname, reloptions FROM pg_class
--    WHERE relnamespace = 'public'::regnamespace AND relkind = 'v';
--
-- VERIFICACAO (rode depois)
--
--   -- as tres consultas da pos-condicao devem vir vazias; e o search_path:
--   SELECT proname, proconfig FROM pg_proc
--    WHERE proname IN ('get_relatorio_atendimentos', 'get_clientes_frequentes',
--                      'get_historico_veiculo', 'fn_normaliza_endereco');
--
--   -- o trigger de endereco continua normalizando? (deve gravar '74000000'/'GO')
--   -- rode num cliente de teste, nao em dado real.
--
-- Depois, fora do banco: tente o vetor que estava aberto, com a chave anon do
-- frontend, e confirme que agora e recusado:
--
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/get_clientes_frequentes" \
--     -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json"
--
--   curl "$SUPABASE_URL/rest/v1/funcionario_publico?select=*" \
--     -H "apikey: $SUPABASE_ANON_KEY"
--
-- Antes desta migracao, o primeiro devolvia a carteira de clientes com
-- CPF/CNPJ, e o segundo possivelmente a folha de colaboradores.
-- =============================================================================
