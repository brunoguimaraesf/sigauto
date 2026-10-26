-- =============================================================================
-- SIGAuto - 34_regras_negocio_servidor.sql
--
-- Fecha as lacunas QA-01 a QA-06 da auditoria QA complementar (25/10/2026,
-- docs/AUDITORIA_QA_COMPLEMENTAR.md): regras que valiam so na tela e que um
-- usuario autenticado contornava chamando o PostgREST ou o RPC com a chave anon.
--
--   RN04  criado_em/atualizado_em sao do banco: ignorados no INSERT, criado_em
--         imutavel no UPDATE.
--   RN09  numero_os e gerado so pelo banco: valor enviado no INSERT e
--         descartado, UPDATE e recusado. Ocupar o proximo numero da sequencia
--         travava a criacao legitima seguinte.
--   RN15  queixa com no minimo 10 caracteres uteis, no INSERT e quando alterada.
--   RN16  OS nasce Aberta.
--   RN45  servico com nome preenchido e preco informado, nao negativo.
--   RN46  servico inativo nao entra na OS (salvo se ja estava nela).
--
-- As regras de OS e datas valem para requisicoes com papel JWT `authenticated`
-- ou `anon` (frontend e PostgREST), inclusive dentro dos RPCs SECURITY DEFINER,
-- que preservam o JWT de quem chamou. `service_role` (backend, fixtures E2E) e
-- manutencao direta no banco ficam fora: e o mesmo recorte das demais regras.
--
-- So escritas novas sao afetadas. Linhas historicas com queixa curta continuam
-- validas ate alguem alterar a queixa. Os CHECKs do catalogo validam as linhas
-- existentes; a pre-condicao aborta antes, com a contagem, se houver violacao.
--
-- Transacional e idempotente.
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- 0) Pre-condicoes de dado para os CHECKs do catalogo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_nome_branco INTEGER;
  v_preco_invalido INTEGER;
BEGIN
  SELECT count(*) INTO v_nome_branco FROM public.servico_catalogo WHERE btrim(nome) = '';
  SELECT count(*) INTO v_preco_invalido FROM public.servico_catalogo WHERE preco IS NULL OR preco < 0;
  IF v_nome_branco > 0 OR v_preco_invalido > 0 THEN
    RAISE EXCEPTION 'Pre-condicao 34: % servico(s) com nome em branco e % com preco invalido. Corrija antes.',
      v_nome_branco, v_preco_invalido;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1) RN09, RN15, RN16 na ordem_servico
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_regras_ordem_servico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    -- Sem DEFAULT na coluna (passo abaixo): manutencao direta que omitir o
    -- numero ainda recebe um valor do banco.
    IF TG_OP = 'INSERT' AND NEW.numero_os IS NULL THEN
      NEW.numero_os := nextval(pg_get_serial_sequence('public.ordem_servico', 'numero_os'));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- RN15/RN16 precisam rodar antes do nextval: requisicao invalida nao pode
    -- queimar um numero de OS.
    IF NEW.status IS DISTINCT FROM 'aberta'::public.status_os THEN
      RAISE EXCEPTION 'RN16: toda ordem de servico inicia com o status Aberta.'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.descricao IS NULL OR char_length(btrim(NEW.descricao)) < 10 THEN
      RAISE EXCEPTION 'RN15: a descricao da queixa deve ter pelo menos 10 caracteres.'
        USING ERRCODE = '23514';
    END IF;
    -- Para a aplicacao, qualquer numero informado pelo cliente e descartado.
    NEW.numero_os := nextval(pg_get_serial_sequence('public.ordem_servico', 'numero_os'));
  ELSE
    IF NEW.numero_os IS DISTINCT FROM OLD.numero_os THEN
      RAISE EXCEPTION 'RN09: o numero da ordem de servico e gerado pelo sistema e nao pode ser alterado.'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.descricao IS DISTINCT FROM OLD.descricao
       AND (NEW.descricao IS NULL OR char_length(btrim(NEW.descricao)) < 10) THEN
      RAISE EXCEPTION 'RN15: a descricao da queixa deve ter pelo menos 10 caracteres.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_regras_ordem_servico() IS
  'RN09/RN15/RN16 no servidor: numero gerado pelo banco e imutavel, queixa >= 10 caracteres, OS nasce Aberta.';

-- O DEFAULT nextval() consumiria um numero antes do trigger, que consome outro
-- para quem forjou o campo: o trigger passa a ser o unico gerador.
ALTER TABLE public.ordem_servico ALTER COLUMN numero_os DROP DEFAULT;

DROP TRIGGER IF EXISTS trg_00_os_regras ON public.ordem_servico;
CREATE TRIGGER trg_00_os_regras
  BEFORE INSERT OR UPDATE ON public.ordem_servico
  FOR EACH ROW EXECUTE FUNCTION public.fn_regras_ordem_servico();

-- O frontend nao escreve diretamente nesta tabela; criacao e alteracao usam os
-- RPCs transacionais. `authenticated` permanece com os grants existentes para
-- compatibilidade, mas `anon` nao pode reservar numeros nem alterar cabecalhos.
REVOKE INSERT, UPDATE, DELETE ON public.ordem_servico FROM anon;

DO $$
DECLARE
  v_sequencia REGCLASS := pg_get_serial_sequence('public.ordem_servico', 'numero_os')::REGCLASS;
BEGIN
  IF v_sequencia IS NULL THEN
    RAISE EXCEPTION 'Pre-condicao 34: sequencia de numero_os nao encontrada.';
  END IF;
  EXECUTE format('REVOKE USAGE, SELECT, UPDATE ON SEQUENCE %s FROM anon', v_sequencia);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2) RN04 em toda tabela de public com criado_em
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_protege_datas_registro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  -- jsonb_populate_record ignora chave sem coluna: serve para tabela com e sem
  -- atualizado_em.
  IF TG_OP = 'INSERT' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('criado_em', now(), 'atualizado_em', now()));
  ELSE
    NEW := jsonb_populate_record(NEW, jsonb_build_object('criado_em', to_jsonb(OLD) -> 'criado_em'));
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_protege_datas_registro() IS
  'RN04: criado_em/atualizado_em definidos pelo banco no INSERT; criado_em imutavel no UPDATE.';

-- Nome com prefixo 00: dispara antes dos guards, que comparam NEW e OLD.
DO $$
DECLARE
  v_tabela TEXT;
BEGIN
  FOR v_tabela IN
    SELECT c.relname
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind = 'r'
       AND a.attname = 'criado_em'
       AND NOT a.attisdropped
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_00_protege_datas ON public.%I', v_tabela);
    EXECUTE format(
      'CREATE TRIGGER trg_00_protege_datas BEFORE INSERT OR UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.fn_protege_datas_registro()', v_tabela);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) RN45 no catalogo de servicos
-- -----------------------------------------------------------------------------
-- Sem DEFAULT 0: omitir o preco gravava zero em silencio.
ALTER TABLE public.servico_catalogo ALTER COLUMN preco DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.servico_catalogo'::regclass
                    AND conname = 'servico_catalogo_nome_preenchido') THEN
    ALTER TABLE public.servico_catalogo
      ADD CONSTRAINT servico_catalogo_nome_preenchido CHECK (btrim(nome) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.servico_catalogo'::regclass
                    AND conname = 'servico_catalogo_preco_nao_negativo') THEN
    ALTER TABLE public.servico_catalogo
      ADD CONSTRAINT servico_catalogo_preco_nao_negativo CHECK (preco >= 0);
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4) RN46: qualquer escrita da aplicacao recusa servico inativo novo na OS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_valida_servico_ativo_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_pares_existentes JSONB := COALESCE(
    NULLIF(current_setting('sigauto.rn46_pares_existentes', true), ''),
    '[]'
  )::JSONB;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon')
     OR NEW.id_servico IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
       SELECT 1
         FROM public.servico_catalogo c
        WHERE c.id = NEW.id_servico
          AND NOT c.ativo
     )
     AND NOT (
       v_pares_existentes @> jsonb_build_array(
         jsonb_build_object('id_os', NEW.id_os, 'id_servico', NEW.id_servico)
       )
       OR EXISTS (
         SELECT 1
           FROM public.os_servico existente
          WHERE existente.id_os = NEW.id_os
            AND existente.id_servico = NEW.id_servico
       )
     ) THEN
    RAISE EXCEPTION 'RN46: servico inativo nao pode ser incluido na OS.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_valida_servico_ativo_os() IS
  'RN46: bloqueia servico inativo novo em os_servico; o RPC marca localmente os pares existentes antes de sincronizar os itens.';

DROP TRIGGER IF EXISTS trg_os_servico_valida_ativo ON public.os_servico;
CREATE TRIGGER trg_os_servico_valida_ativo
  BEFORE INSERT OR UPDATE OF id_servico ON public.os_servico
  FOR EACH ROW EXECUTE FUNCTION public.fn_valida_servico_ativo_os();

-- Copia integral da versao da 29, com um unico acrescimo marcado "RN46". O
-- servico que ja estava na OS antes de ser inativado continua aceito: a OS
-- regrava todos os itens a cada salvamento e nao pode travar por isso. Antes do
-- DELETE, o RPC guarda os pares existentes em uma configuracao LOCAL da
-- transacao; o trigger aceita somente esses pares durante a reinsercao.
CREATE OR REPLACE FUNCTION public.salvar_ordem_servico_com_itens(p_id_os uuid, p_dados jsonb, p_servicos jsonb DEFAULT NULL::jsonb, p_pecas jsonb DEFAULT NULL::jsonb)
 RETURNS SETOF ordem_servico
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_os public.ordem_servico%ROWTYPE;
  v_perfil public.perfil_usuario := public.fn_perfil_usuario_atual();
  v_dados JSONB := COALESCE(p_dados, '{}'::jsonb)
    - ARRAY['id_usuario', 'valor_comissao_mecanico', 'valor_comissao_atendente'];
  v_chaves TEXT[];
  v_pares_existentes JSONB;
  v_contexto_rn46_anterior TEXT := current_setting('sigauto.rn46_pares_existentes', true);
BEGIN
  IF v_perfil IS NULL OR v_perfil NOT IN ('gestor', 'atendente', 'mecanico') THEN
    RAISE EXCEPTION 'Perfil sem permissao para alterar OS.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_os FROM public.ordem_servico WHERE id = p_id_os FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de servico nao encontrada.' USING ERRCODE = 'P0002';
  END IF;

  -- Durante o rollout o cliente anterior ainda envia campos de fechamento ao
  -- reabrir. Para atendente, conserva somente o status: o guard do cabecalho
  -- continua fail-closed e os valores historicos permanecem imutaveis.
  IF v_perfil = 'atendente' AND v_os.status IN ('concluida', 'cancelada') THEN
    v_dados := CASE
      WHEN v_dados ? 'status' THEN jsonb_build_object('status', v_dados->'status')
      ELSE '{}'::jsonb
    END;
  END IF;

  SELECT array_agg(key) INTO v_chaves FROM jsonb_object_keys(v_dados) AS key;
  IF v_perfil = 'mecanico' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.funcionario f
       WHERE f.id = v_os.id_mecanico AND f.id_usuario = auth.uid() AND f.ativo
    ) THEN
      RAISE EXCEPTION 'A OS nao esta atribuida ao mecanico autenticado.' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(v_chaves, ARRAY[]::TEXT[]) <@
         ARRAY['diagnostico', 'observacoes', 'status']::TEXT[] IS NOT TRUE
       OR p_servicos IS NOT NULL OR p_pecas IS NOT NULL THEN
      RAISE EXCEPTION 'Mecanico pode alterar somente diagnostico, observacoes e andamento.'
        USING ERRCODE = '42501';
    END IF;
    IF v_os.status IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Somente gestor ou atendente pode reabrir uma OS encerrada.'
        USING ERRCODE = '42501';
    END IF;
    IF v_dados ? 'status'
       AND (v_dados->>'status') NOT IN ('aberta', 'em_andamento', 'aguardando_peca') THEN
      RAISE EXCEPTION 'Status nao permitido ao mecanico.' USING ERRCODE = '42501';
    END IF;
  ELSIF COALESCE(v_chaves, ARRAY[]::TEXT[]) <@ ARRAY[
    'id_veiculo', 'id_mecanico', 'id_atendente', 'descricao', 'diagnostico',
    'status', 'prioridade', 'data_abertura', 'data_encerramento', 'km_entrada',
    'valor_total', 'forma_pagamento', 'observacoes', 'observacoes_finais',
    'desconto_tipo', 'desconto_valor', 'desconto_percentual', 'valor_servicos',
    'valor_pecas'
  ]::TEXT[] IS NOT TRUE THEN
    RAISE EXCEPTION 'Campo nao permitido na atualizacao da OS.' USING ERRCODE = '22023';
  END IF;

  IF (p_servicos IS NOT NULL OR p_pecas IS NOT NULL)
     AND v_os.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Reabra a OS antes de alterar seus itens.' USING ERRCODE = 'P0001';
  END IF;

  IF v_dados ? 'status'
     AND (v_dados->>'status') = 'concluida'
     AND v_os.status IS DISTINCT FROM 'concluida'::public.status_os THEN
    RAISE EXCEPTION 'Finalize a OS pela operacao transacional de encerramento.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_dados ? 'status'
     AND (v_dados->>'status') = 'cancelada'
     AND v_os.status IS DISTINCT FROM 'cancelada'::public.status_os THEN
    RAISE EXCEPTION 'Cancele a OS pela operacao transacional de cancelamento.'
      USING ERRCODE = 'P0001';
  END IF;

  -- RN46: servico inativo so permanece se ja estava na OS.
  IF p_servicos IS NOT NULL AND EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_servicos) AS x(id_servico uuid)
      JOIN public.servico_catalogo c ON c.id = x.id_servico
     WHERE NOT c.ativo
       AND NOT EXISTS (
         SELECT 1 FROM public.os_servico s
          WHERE s.id_os = p_id_os AND s.id_servico = x.id_servico
       )
  ) THEN
    RAISE EXCEPTION 'RN46: servico inativo nao pode ser incluido na OS.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.ordem_servico os SET
    id_veiculo = CASE WHEN v_dados ? 'id_veiculo' THEN (v_dados->>'id_veiculo')::uuid ELSE os.id_veiculo END,
    id_mecanico = CASE WHEN v_dados ? 'id_mecanico' THEN NULLIF(v_dados->>'id_mecanico', '')::uuid ELSE os.id_mecanico END,
    id_atendente = CASE WHEN v_dados ? 'id_atendente' THEN NULLIF(v_dados->>'id_atendente', '')::uuid ELSE os.id_atendente END,
    descricao = CASE WHEN v_dados ? 'descricao' THEN v_dados->>'descricao' ELSE os.descricao END,
    diagnostico = CASE WHEN v_dados ? 'diagnostico' THEN v_dados->>'diagnostico' ELSE os.diagnostico END,
    status = CASE WHEN v_dados ? 'status' THEN (v_dados->>'status')::public.status_os ELSE os.status END,
    prioridade = CASE WHEN v_dados ? 'prioridade' THEN v_dados->>'prioridade' ELSE os.prioridade END,
    data_abertura = CASE WHEN v_dados ? 'data_abertura' THEN (v_dados->>'data_abertura')::timestamptz ELSE os.data_abertura END,
    data_encerramento = CASE WHEN v_dados ? 'data_encerramento' THEN NULLIF(v_dados->>'data_encerramento', '')::timestamptz ELSE os.data_encerramento END,
    km_entrada = CASE WHEN v_dados ? 'km_entrada' THEN NULLIF(v_dados->>'km_entrada', '')::integer ELSE os.km_entrada END,
    valor_total = CASE WHEN v_dados ? 'valor_total' THEN COALESCE((v_dados->>'valor_total')::numeric, 0) ELSE os.valor_total END,
    forma_pagamento = CASE WHEN v_dados ? 'forma_pagamento' THEN v_dados->>'forma_pagamento' ELSE os.forma_pagamento END,
    observacoes = CASE WHEN v_dados ? 'observacoes' THEN v_dados->>'observacoes' ELSE os.observacoes END,
    observacoes_finais = CASE WHEN v_dados ? 'observacoes_finais' THEN v_dados->>'observacoes_finais' ELSE os.observacoes_finais END,
    desconto_tipo = CASE WHEN v_dados ? 'desconto_tipo' THEN v_dados->>'desconto_tipo' ELSE os.desconto_tipo END,
    desconto_valor = CASE WHEN v_dados ? 'desconto_valor' THEN COALESCE((v_dados->>'desconto_valor')::numeric, 0) ELSE os.desconto_valor END,
    desconto_percentual = CASE WHEN v_dados ? 'desconto_percentual' THEN NULLIF(v_dados->>'desconto_percentual', '')::numeric ELSE os.desconto_percentual END,
    valor_servicos = CASE WHEN v_dados ? 'valor_servicos' THEN COALESCE((v_dados->>'valor_servicos')::numeric, 0) ELSE os.valor_servicos END,
    valor_pecas = CASE WHEN v_dados ? 'valor_pecas' THEN COALESCE((v_dados->>'valor_pecas')::numeric, 0) ELSE os.valor_pecas END,
    atualizado_em = now()
  WHERE os.id = p_id_os;

  IF p_servicos IS NOT NULL THEN
    SELECT COALESCE(
             jsonb_agg(jsonb_build_object('id_os', s.id_os, 'id_servico', s.id_servico)),
             '[]'::jsonb
           )
      INTO v_pares_existentes
      FROM public.os_servico s
     WHERE s.id_os = p_id_os
       AND s.id_servico IS NOT NULL;
    PERFORM set_config('sigauto.rn46_pares_existentes', v_pares_existentes::TEXT, true);

    DELETE FROM public.os_servico WHERE id_os = p_id_os;
    INSERT INTO public.os_servico (id_os, id_servico, descricao, quantidade, valor_unitario)
    SELECT p_id_os, x.id_servico, left(COALESCE(NULLIF(x.descricao, ''), 'Servico'), 200),
           x.quantidade, x.valor_unitario
      FROM jsonb_to_recordset(p_servicos) AS x(
        id_servico uuid, descricao text, quantidade numeric, valor_unitario numeric
      );

    PERFORM set_config(
      'sigauto.rn46_pares_existentes',
      COALESCE(v_contexto_rn46_anterior, ''),
      true
    );
  END IF;

  IF p_pecas IS NOT NULL THEN
    DELETE FROM public.os_peca WHERE id_os = p_id_os;
    INSERT INTO public.os_peca (id_os, id_item, descricao, quantidade, valor_unitario)
    SELECT p_id_os, x.id_item, left(COALESCE(NULLIF(x.descricao, ''), 'Peca'), 200),
           x.quantidade, x.valor_unitario
      FROM jsonb_to_recordset(p_pecas) AS x(
        id_item uuid, descricao text, quantidade numeric, valor_unitario numeric
      );
  END IF;

  RETURN QUERY SELECT * FROM public.ordem_servico WHERE id = p_id_os;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5) RN15/RN16: criacao sem fallback de queixa e sem status fornecido pelo cliente
-- -----------------------------------------------------------------------------
-- Copia integral da definicao vigente no banco efemero (originada na 23), com
-- somente duas correcoes: descricao sem texto padrao e `status` descartado antes
-- de delegar ao RPC de salvamento.
CREATE OR REPLACE FUNCTION public.criar_ordem_servico_com_itens(p_dados jsonb, p_servicos jsonb DEFAULT '[]'::jsonb, p_pecas jsonb DEFAULT '[]'::jsonb)
 RETURNS SETOF ordem_servico
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_id UUID := COALESCE(NULLIF(p_dados->>'id','')::uuid, gen_random_uuid());
BEGIN
  IF COALESCE(public.fn_perfil_usuario_atual()::text, '') NOT IN ('gestor', 'atendente') THEN
    RAISE EXCEPTION 'Perfil sem permissao para criar OS.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(p_dados->>'id_veiculo','') IS NULL THEN
    RAISE EXCEPTION 'Informe o veiculo da OS.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ordem_servico
    (id, id_veiculo, id_usuario, descricao, status)
  VALUES
    (v_id, (p_dados->>'id_veiculo')::uuid, auth.uid(),
     p_dados->>'descricao', 'aberta');

  PERFORM public.salvar_ordem_servico_com_itens(
    v_id,
    p_dados - ARRAY['id','numero_os','status'],
    COALESCE(p_servicos, '[]'::jsonb),
    COALESCE(p_pecas, '[]'::jsonb)
  );

  RETURN QUERY SELECT * FROM public.ordem_servico WHERE id = v_id;
END;
$function$;

COMMENT ON FUNCTION public.criar_ordem_servico_com_itens(JSONB, JSONB, JSONB) IS
  'Cria cabecalho e itens da OS atomicamente; exige queixa valida e ignora id, numero e status fornecidos pelo cliente.';
REVOKE ALL ON FUNCTION public.criar_ordem_servico_com_itens(JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_ordem_servico_com_itens(JSONB, JSONB, JSONB)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 6) Pos-condicoes
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_sem_trigger TEXT;
  v_sequencia REGCLASS := pg_get_serial_sequence('public.ordem_servico', 'numero_os')::REGCLASS;
  v_def_criar TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.ordem_servico'::regclass
                  AND tgname = 'trg_00_os_regras' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'Pos-condicao 34: trg_00_os_regras ausente.';
  END IF;
  SELECT string_agg(c.relname, ', ') INTO v_sem_trigger
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'criado_em' AND NOT a.attisdropped
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
     AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = 'trg_00_protege_datas');
  IF v_sem_trigger IS NOT NULL THEN
    RAISE EXCEPTION 'Pos-condicao 34: tabelas sem trg_00_protege_datas: %', v_sem_trigger;
  END IF;
  IF (SELECT column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ordem_servico' AND column_name = 'numero_os') IS NOT NULL THEN
    RAISE EXCEPTION 'Pos-condicao 34: numero_os ainda tem DEFAULT.';
  END IF;
  IF v_sequencia IS NULL THEN
    RAISE EXCEPTION 'Pos-condicao 34: sequencia de numero_os nao encontrada.';
  END IF;
  IF has_table_privilege('anon', 'public.ordem_servico', 'INSERT')
     OR has_table_privilege('anon', 'public.ordem_servico', 'UPDATE')
     OR has_table_privilege('anon', 'public.ordem_servico', 'DELETE') THEN
    RAISE EXCEPTION 'Pos-condicao 34: anon ainda pode escrever diretamente em ordem_servico.';
  END IF;
  IF has_sequence_privilege('anon', v_sequencia, 'USAGE')
     OR has_sequence_privilege('anon', v_sequencia, 'SELECT')
     OR has_sequence_privilege('anon', v_sequencia, 'UPDATE') THEN
    RAISE EXCEPTION 'Pos-condicao 34: anon ainda possui privilegio na sequencia de numero_os.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.os_servico'::regclass
       AND tgname = 'trg_os_servico_valida_ativo'
       AND tgenabled <> 'D'
       AND tgfoid = 'public.fn_valida_servico_ativo_os()'::regprocedure
       AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF id_servico ON public.os_servico%'
  ) THEN
    RAISE EXCEPTION 'Pos-condicao 34: trigger da RN46 ausente em os_servico.';
  END IF;
  IF position('RN46' IN pg_get_functiondef('public.salvar_ordem_servico_com_itens(uuid,jsonb,jsonb,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Pos-condicao 34: RPC de itens sem a regra RN46.';
  END IF;
  SELECT pg_get_functiondef('public.criar_ordem_servico_com_itens(jsonb,jsonb,jsonb)'::regprocedure)
    INTO v_def_criar;
  IF position('p_dados->>''descricao''' IN v_def_criar) = 0
     OR position('p_dados - ARRAY[''id'',''numero_os'',''status'']' IN v_def_criar) = 0
     OR position('Ordem de servico' IN v_def_criar) > 0 THEN
    RAISE EXCEPTION 'Pos-condicao 34: RPC de criacao sem as correcoes RN15/RN16.';
  END IF;
  IF has_function_privilege('anon', 'public.criar_ordem_servico_com_itens(jsonb,jsonb,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.criar_ordem_servico_com_itens(jsonb,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Pos-condicao 34: grants incorretos no RPC de criacao de OS.';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.servico_catalogo'::regclass
       AND conname IN ('servico_catalogo_nome_preenchido', 'servico_catalogo_preco_nao_negativo')) <> 2 THEN
    RAISE EXCEPTION 'Pos-condicao 34: CHECKs do catalogo ausentes.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid IN ('public.fn_regras_ordem_servico()'::regprocedure,
                                                 'public.fn_protege_datas_registro()'::regprocedure,
                                                 'public.fn_valida_servico_ativo_os()'::regprocedure)
               AND prosecdef) THEN
    RAISE EXCEPTION 'Pos-condicao 34: funcoes de trigger devem ser SECURITY INVOKER.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = 'public.fn_valida_servico_ativo_os()'::regprocedure
       AND NOT (proconfig @> ARRAY['search_path=public, pg_catalog'])
  ) THEN
    RAISE EXCEPTION 'Pos-condicao 34: trigger da RN46 sem search_path fixo.';
  END IF;
END;
$$;

COMMIT;
