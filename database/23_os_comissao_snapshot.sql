-- =============================================================================
-- 23_os_comissao_snapshot.sql
-- Normaliza o snapshot historico de comissao antes de remover o JSON legado.
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS public.os_comissao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_os           UUID NOT NULL REFERENCES public.ordem_servico(id) ON DELETE CASCADE,
  papel           VARCHAR(12) NOT NULL CHECK (papel IN ('mecanico', 'atendente')),
  id_funcionario  UUID REFERENCES public.funcionario(id) ON DELETE SET NULL,
  nome            VARCHAR(120),
  percentual      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percentual BETWEEN 0 AND 100),
  sobre_servicos  BOOLEAN NOT NULL DEFAULT false,
  sobre_pecas     BOOLEAN NOT NULL DEFAULT false,
  base_servicos   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (base_servicos >= 0),
  base_pecas      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (base_pecas >= 0),
  valor           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_os, papel)
);

CREATE INDEX IF NOT EXISTS idx_os_comissao_os ON public.os_comissao(id_os);

COMMENT ON TABLE public.os_comissao IS
  'Snapshot imutavel da regra e do valor de comissao aplicados a uma OS.';

-- Backfill preserva primeiro o JSON historico; quando ele nao existe, usa os
-- valores escalares ja gravados e a regra atual apenas para preencher a base.
-- O SQL dinamico mantem a migracao reaplicavel depois que a 24 remove a coluna.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'ordem_servico'
       AND column_name = 'comissao_detalhes'
  ) THEN
    EXECUTE $backfill$
      INSERT INTO public.os_comissao
        (id_os, papel, id_funcionario, nome, percentual, sobre_servicos, sobre_pecas, base_servicos, base_pecas, valor)
      SELECT os.id,
             papel.nome,
             CASE WHEN papel.nome = 'mecanico' THEN os.id_mecanico ELSE os.id_atendente END,
             f.nome,
             COALESCE(NULLIF((os.comissao_detalhes -> papel.nome) ->> 'percentual', '')::numeric, f.comissao_percentual, 0),
             COALESCE(((os.comissao_detalhes -> papel.nome) ->> 'sobreServicos')::boolean, f.comissao_sobre_servicos, false),
             COALESCE(((os.comissao_detalhes -> papel.nome) ->> 'sobrePecas')::boolean, f.comissao_sobre_pecas, false),
             CASE WHEN COALESCE(((os.comissao_detalhes -> papel.nome) ->> 'sobreServicos')::boolean, f.comissao_sobre_servicos, false)
                  THEN COALESCE(os.valor_servicos, 0) ELSE 0 END,
             CASE WHEN COALESCE(((os.comissao_detalhes -> papel.nome) ->> 'sobrePecas')::boolean, f.comissao_sobre_pecas, false)
                  THEN COALESCE(os.valor_pecas, 0) ELSE 0 END,
             COALESCE(
               NULLIF((os.comissao_detalhes -> papel.nome) ->> 'valor', '')::numeric,
               CASE WHEN papel.nome = 'mecanico' THEN os.valor_comissao_mecanico ELSE os.valor_comissao_atendente END,
               0
             )
        FROM public.ordem_servico os
       CROSS JOIN (VALUES ('mecanico'), ('atendente')) AS papel(nome)
        LEFT JOIN public.funcionario f
          ON f.id = CASE WHEN papel.nome = 'mecanico' THEN os.id_mecanico ELSE os.id_atendente END
       WHERE (CASE WHEN papel.nome = 'mecanico' THEN os.id_mecanico ELSE os.id_atendente END) IS NOT NULL
          OR jsonb_typeof(os.comissao_detalhes -> papel.nome) = 'object'
      ON CONFLICT (id_os, papel) DO NOTHING
    $backfill$;
  END IF;
END;
$$;

-- Captura a regra vigente no exato instante do encerramento. So o RPC de
-- finalizacao chama esta funcao; usuarios autenticados nao recebem EXECUTE nem
-- permissao de escrita direta na tabela de snapshot.
CREATE OR REPLACE FUNCTION public.fn_snapshot_comissoes_os(
  p_id_os UUID,
  p_valor_servicos NUMERIC,
  p_valor_pecas NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  DELETE FROM public.os_comissao WHERE id_os = p_id_os;

  INSERT INTO public.os_comissao
    (id_os, papel, id_funcionario, nome, percentual, sobre_servicos,
     sobre_pecas, base_servicos, base_pecas, valor)
  SELECT p_id_os,
         papel.nome,
         f.id,
         f.nome,
         f.comissao_percentual,
         f.comissao_sobre_servicos,
         f.comissao_sobre_pecas,
         CASE WHEN f.comissao_sobre_servicos THEN COALESCE(p_valor_servicos, 0) ELSE 0 END,
         CASE WHEN f.comissao_sobre_pecas THEN COALESCE(p_valor_pecas, 0) ELSE 0 END,
         round((
           CASE WHEN f.comissao_sobre_servicos THEN COALESCE(p_valor_servicos, 0) ELSE 0 END
           + CASE WHEN f.comissao_sobre_pecas THEN COALESCE(p_valor_pecas, 0) ELSE 0 END
         ) * f.comissao_percentual / 100, 2)
    FROM public.ordem_servico os
   CROSS JOIN (VALUES ('mecanico'), ('atendente')) AS papel(nome)
    JOIN public.funcionario f
      ON f.id = CASE WHEN papel.nome = 'mecanico' THEN os.id_mecanico ELSE os.id_atendente END
   WHERE os.id = p_id_os;

  UPDATE public.ordem_servico os
     SET valor_comissao_mecanico = COALESCE((
           SELECT c.valor FROM public.os_comissao c
            WHERE c.id_os = p_id_os AND c.papel = 'mecanico'
         ), 0),
         valor_comissao_atendente = COALESCE((
           SELECT c.valor FROM public.os_comissao c
            WHERE c.id_os = p_id_os AND c.papel = 'atendente'
         ), 0)
   WHERE os.id = p_id_os;
END;
$$;

COMMENT ON FUNCTION public.fn_snapshot_comissoes_os(UUID, NUMERIC, NUMERIC) IS
  'Snapshot interno e atomico das comissoes no encerramento da OS.';
REVOKE ALL ON FUNCTION public.fn_snapshot_comissoes_os(UUID, NUMERIC, NUMERIC)
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.os_comissao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_os_comissao_manage ON public.os_comissao;
DROP POLICY IF EXISTS pol_os_comissao_gestor_select ON public.os_comissao;
CREATE POLICY pol_os_comissao_gestor_select ON public.os_comissao
  FOR SELECT TO authenticated
  USING (public.fn_perfil_usuario_atual() = 'gestor');

DROP POLICY IF EXISTS pol_os_comissao_mecanico_select ON public.os_comissao;
DROP POLICY IF EXISTS pol_os_comissao_propria_select ON public.os_comissao;
CREATE POLICY pol_os_comissao_propria_select ON public.os_comissao
  FOR SELECT TO authenticated
  USING (
    public.fn_perfil_usuario_atual() IN ('mecanico', 'atendente')
    AND EXISTS (
      SELECT 1 FROM public.funcionario f
       WHERE f.id = os_comissao.id_funcionario
         AND f.id_usuario = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.os_comissao
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.os_comissao TO authenticated, service_role;

-- Substitui cabecalho e itens em uma unica transacao. A UI anterior fazia
-- DELETE + INSERT em varias requisicoes; uma falha intermediaria deixava a OS
-- sem parte dos itens. NULL em p_servicos/p_pecas significa "nao alterar".
CREATE OR REPLACE FUNCTION public.salvar_ordem_servico_com_itens(
  p_id_os UUID,
  p_dados JSONB,
  p_servicos JSONB DEFAULT NULL,
  p_pecas JSONB DEFAULT NULL
)
RETURNS SETOF public.ordem_servico
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_os public.ordem_servico%ROWTYPE;
  v_perfil public.perfil_usuario := public.fn_perfil_usuario_atual();
  v_chaves TEXT[];
BEGIN
  IF v_perfil IS NULL OR v_perfil NOT IN ('gestor', 'atendente', 'mecanico') THEN
    RAISE EXCEPTION 'Perfil sem permissao para alterar OS.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_os FROM public.ordem_servico WHERE id = p_id_os FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de servico nao encontrada.' USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(key) INTO v_chaves FROM jsonb_object_keys(COALESCE(p_dados, '{}'::jsonb)) AS key;
  IF v_perfil = 'mecanico' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.funcionario f
       WHERE f.id = v_os.id_mecanico AND f.id_usuario = auth.uid() AND f.ativo
    ) THEN
      RAISE EXCEPTION 'A OS nao esta atribuida ao mecanico autenticado.' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(v_chaves, ARRAY[]::TEXT[]) <@ ARRAY['diagnostico','observacoes','status']::TEXT[] IS NOT TRUE
       OR p_servicos IS NOT NULL OR p_pecas IS NOT NULL THEN
      RAISE EXCEPTION 'Mecanico pode alterar somente diagnostico, observacoes e andamento.' USING ERRCODE = '42501';
    END IF;
    IF v_os.status IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Somente gestor ou atendente pode reabrir uma OS encerrada.' USING ERRCODE = '42501';
    END IF;
    IF p_dados ? 'status' AND (p_dados->>'status') NOT IN ('aberta','em_andamento','aguardando_peca') THEN
      RAISE EXCEPTION 'Status nao permitido ao mecanico.' USING ERRCODE = '42501';
    END IF;
  ELSIF COALESCE(v_chaves, ARRAY[]::TEXT[]) <@ ARRAY[
    'id_veiculo','id_usuario','id_mecanico','id_atendente','descricao','diagnostico',
    'status','prioridade','data_abertura','data_encerramento','km_entrada',
    'valor_total','forma_pagamento','observacoes','observacoes_finais',
    'desconto_tipo','desconto_valor','desconto_percentual','valor_servicos',
    'valor_pecas','valor_comissao_mecanico','valor_comissao_atendente'
  ]::TEXT[] IS NOT TRUE THEN
    RAISE EXCEPTION 'Campo nao permitido na atualizacao da OS.' USING ERRCODE = '22023';
  END IF;

  IF (p_servicos IS NOT NULL OR p_pecas IS NOT NULL)
     AND v_os.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Reabra a OS antes de alterar seus itens.' USING ERRCODE = 'P0001';
  END IF;

  IF p_dados ? 'status'
     AND (p_dados->>'status') = 'concluida'
     AND v_os.status IS DISTINCT FROM 'concluida'::public.status_os THEN
    RAISE EXCEPTION 'Finalize a OS pela operacao transacional de encerramento.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.ordem_servico os SET
    id_veiculo = CASE WHEN p_dados ? 'id_veiculo' THEN (p_dados->>'id_veiculo')::uuid ELSE os.id_veiculo END,
    id_usuario = CASE WHEN p_dados ? 'id_usuario' THEN (p_dados->>'id_usuario')::uuid ELSE os.id_usuario END,
    id_mecanico = CASE WHEN p_dados ? 'id_mecanico' THEN NULLIF(p_dados->>'id_mecanico','')::uuid ELSE os.id_mecanico END,
    id_atendente = CASE WHEN p_dados ? 'id_atendente' THEN NULLIF(p_dados->>'id_atendente','')::uuid ELSE os.id_atendente END,
    descricao = CASE WHEN p_dados ? 'descricao' THEN p_dados->>'descricao' ELSE os.descricao END,
    diagnostico = CASE WHEN p_dados ? 'diagnostico' THEN p_dados->>'diagnostico' ELSE os.diagnostico END,
    status = CASE WHEN p_dados ? 'status' THEN (p_dados->>'status')::public.status_os ELSE os.status END,
    prioridade = CASE WHEN p_dados ? 'prioridade' THEN p_dados->>'prioridade' ELSE os.prioridade END,
    data_abertura = CASE WHEN p_dados ? 'data_abertura' THEN (p_dados->>'data_abertura')::timestamptz ELSE os.data_abertura END,
    data_encerramento = CASE WHEN p_dados ? 'data_encerramento' THEN NULLIF(p_dados->>'data_encerramento','')::timestamptz ELSE os.data_encerramento END,
    km_entrada = CASE WHEN p_dados ? 'km_entrada' THEN NULLIF(p_dados->>'km_entrada','')::integer ELSE os.km_entrada END,
    valor_total = CASE WHEN p_dados ? 'valor_total' THEN COALESCE((p_dados->>'valor_total')::numeric,0) ELSE os.valor_total END,
    forma_pagamento = CASE WHEN p_dados ? 'forma_pagamento' THEN p_dados->>'forma_pagamento' ELSE os.forma_pagamento END,
    observacoes = CASE WHEN p_dados ? 'observacoes' THEN p_dados->>'observacoes' ELSE os.observacoes END,
    observacoes_finais = CASE WHEN p_dados ? 'observacoes_finais' THEN p_dados->>'observacoes_finais' ELSE os.observacoes_finais END,
    desconto_tipo = CASE WHEN p_dados ? 'desconto_tipo' THEN p_dados->>'desconto_tipo' ELSE os.desconto_tipo END,
    desconto_valor = CASE WHEN p_dados ? 'desconto_valor' THEN COALESCE((p_dados->>'desconto_valor')::numeric,0) ELSE os.desconto_valor END,
    desconto_percentual = CASE WHEN p_dados ? 'desconto_percentual' THEN NULLIF(p_dados->>'desconto_percentual','')::numeric ELSE os.desconto_percentual END,
    valor_servicos = CASE WHEN p_dados ? 'valor_servicos' THEN COALESCE((p_dados->>'valor_servicos')::numeric,0) ELSE os.valor_servicos END,
    valor_pecas = CASE WHEN p_dados ? 'valor_pecas' THEN COALESCE((p_dados->>'valor_pecas')::numeric,0) ELSE os.valor_pecas END,
    valor_comissao_mecanico = CASE WHEN p_dados ? 'valor_comissao_mecanico' THEN COALESCE((p_dados->>'valor_comissao_mecanico')::numeric,0) ELSE os.valor_comissao_mecanico END,
    valor_comissao_atendente = CASE WHEN p_dados ? 'valor_comissao_atendente' THEN COALESCE((p_dados->>'valor_comissao_atendente')::numeric,0) ELSE os.valor_comissao_atendente END,
    atualizado_em = now()
  WHERE os.id = p_id_os;

  IF p_servicos IS NOT NULL THEN
    DELETE FROM public.os_servico WHERE id_os = p_id_os;
    INSERT INTO public.os_servico (id_os, id_servico, descricao, quantidade, valor_unitario)
    SELECT p_id_os, x.id_servico, left(COALESCE(NULLIF(x.descricao,''),'Servico'),200),
           x.quantidade, x.valor_unitario
      FROM jsonb_to_recordset(p_servicos) AS x(
        id_servico uuid, descricao text, quantidade numeric, valor_unitario numeric
      );
  END IF;

  IF p_pecas IS NOT NULL THEN
    DELETE FROM public.os_peca WHERE id_os = p_id_os;
    INSERT INTO public.os_peca (id_os, id_item, descricao, quantidade, valor_unitario)
    SELECT p_id_os, x.id_item, left(COALESCE(NULLIF(x.descricao,''),'Peca'),200),
           x.quantidade, x.valor_unitario
      FROM jsonb_to_recordset(p_pecas) AS x(
        id_item uuid, descricao text, quantidade numeric, valor_unitario numeric
      );
  END IF;

  RETURN QUERY SELECT * FROM public.ordem_servico WHERE id = p_id_os;
END;
$$;

COMMENT ON FUNCTION public.salvar_ordem_servico_com_itens(UUID, JSONB, JSONB, JSONB) IS
  'Atualiza cabecalho e substitui itens da OS atomicamente, com escopo proprio para mecanico.';
REVOKE ALL ON FUNCTION public.salvar_ordem_servico_com_itens(UUID, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_ordem_servico_com_itens(UUID, JSONB, JSONB, JSONB)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.criar_ordem_servico_com_itens(
  p_dados JSONB,
  p_servicos JSONB DEFAULT '[]'::jsonb,
  p_pecas JSONB DEFAULT '[]'::jsonb
)
RETURNS SETOF public.ordem_servico
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
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
     COALESCE(NULLIF(p_dados->>'descricao',''), 'Ordem de servico'), 'aberta');

  PERFORM public.salvar_ordem_servico_com_itens(
    v_id,
    p_dados - ARRAY['id','numero_os'],
    COALESCE(p_servicos, '[]'::jsonb),
    COALESCE(p_pecas, '[]'::jsonb)
  );

  RETURN QUERY SELECT * FROM public.ordem_servico WHERE id = v_id;
END;
$$;

COMMENT ON FUNCTION public.criar_ordem_servico_com_itens(JSONB, JSONB, JSONB) IS
  'Cria cabecalho e itens da OS atomicamente; registra auth.uid() como usuario de abertura.';
REVOKE ALL ON FUNCTION public.criar_ordem_servico_com_itens(JSONB, JSONB, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_ordem_servico_com_itens(JSONB, JSONB, JSONB)
  TO authenticated;

-- Cliente e endereco formam uma unidade de gravacao para a tela. Sem este RPC,
-- uma falha na segunda requisicao deixava o cliente salvo sem o endereco que o
-- usuario acabara de informar.
CREATE OR REPLACE FUNCTION public.salvar_cliente_com_endereco(
  p_id_cliente UUID,
  p_cliente JSONB,
  p_endereco JSONB DEFAULT NULL,
  p_novo BOOLEAN DEFAULT false
)
RETURNS SETOF public.cliente
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id UUID := COALESCE(p_id_cliente, gen_random_uuid());
BEGIN
  IF COALESCE(public.fn_perfil_usuario_atual()::text, '') NOT IN ('gestor', 'atendente') THEN
    RAISE EXCEPTION 'Perfil sem permissao para salvar cliente.' USING ERRCODE = '42501';
  END IF;

  IF p_novo THEN
    INSERT INTO public.cliente
      (id, nome, tipo_pessoa, cpf_cnpj, telefone, email, ativo)
    VALUES
      (v_id, p_cliente->>'nome', COALESCE(p_cliente->>'tipo_pessoa','fisica')::public.tipo_pessoa,
       p_cliente->>'cpf_cnpj', p_cliente->>'telefone', NULLIF(p_cliente->>'email',''),
       COALESCE((p_cliente->>'ativo')::boolean, true));
  ELSE
    PERFORM 1 FROM public.cliente WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente nao encontrado.' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.cliente c SET
      nome = p_cliente->>'nome',
      tipo_pessoa = COALESCE(p_cliente->>'tipo_pessoa','fisica')::public.tipo_pessoa,
      cpf_cnpj = p_cliente->>'cpf_cnpj',
      telefone = p_cliente->>'telefone',
      email = NULLIF(p_cliente->>'email',''),
      ativo = COALESCE((p_cliente->>'ativo')::boolean, c.ativo)
    WHERE c.id = v_id;
  END IF;

  IF p_endereco IS NULL THEN
    DELETE FROM public.endereco WHERE id_cliente = v_id;
  ELSE
    INSERT INTO public.endereco
      (id_cliente, cep, logradouro, numero, complemento, bairro, cidade, uf, ponto_referencia)
    VALUES
      (v_id, NULLIF(p_endereco->>'cep',''), NULLIF(p_endereco->>'logradouro',''),
       NULLIF(p_endereco->>'numero',''), NULLIF(p_endereco->>'complemento',''),
       NULLIF(p_endereco->>'bairro',''), NULLIF(p_endereco->>'cidade',''),
       NULLIF(p_endereco->>'uf',''), NULLIF(p_endereco->>'ponto_referencia',''))
    ON CONFLICT (id_cliente) DO UPDATE SET
      cep = EXCLUDED.cep, logradouro = EXCLUDED.logradouro, numero = EXCLUDED.numero,
      complemento = EXCLUDED.complemento, bairro = EXCLUDED.bairro,
      cidade = EXCLUDED.cidade, uf = EXCLUDED.uf,
      ponto_referencia = EXCLUDED.ponto_referencia;
  END IF;

  RETURN QUERY SELECT * FROM public.cliente WHERE id = v_id;
END;
$$;

COMMENT ON FUNCTION public.salvar_cliente_com_endereco(UUID, JSONB, JSONB, BOOLEAN) IS
  'Cria ou atualiza cliente e endereco na mesma transacao.';
REVOKE ALL ON FUNCTION public.salvar_cliente_com_endereco(UUID, JSONB, JSONB, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_cliente_com_endereco(UUID, JSONB, JSONB, BOOLEAN)
  TO authenticated;

COMMIT;
