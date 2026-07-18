-- =============================================================================
-- SIGAuto - Functions & Stored Procedures
-- Arquivo: 03_functions.sql
-- Descrição: Funções utilitárias, relatórios e triggers de negócio
-- Pré-requisito: 01_schema.sql e 02_rls_policies.sql devem ter sido executados
-- =============================================================================

-- =============================================================================
-- FUNÇÃO: get_dashboard_stats()
-- Retorna contagens de OS por status e alertas de estoque baixo
-- Acesso: gestor e atendente
-- =============================================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS TABLE (
  os_abertas          BIGINT,
  os_em_andamento     BIGINT,
  os_aguardando_peca  BIGINT,
  os_concluidas_hoje  BIGINT,
  os_canceladas_hoje  BIGINT,
  os_total_mes        BIGINT,
  faturamento_mes     NUMERIC,
  clientes_ativos     BIGINT,
  veiculos_ativos     BIGINT,
  itens_estoque_baixo BIGINT,
  itens_sem_estoque   BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- OS abertas no momento
    (SELECT COUNT(*) FROM ordem_servico WHERE status = 'aberta')                                        AS os_abertas,
    (SELECT COUNT(*) FROM ordem_servico WHERE status = 'em_andamento')                                  AS os_em_andamento,
    (SELECT COUNT(*) FROM ordem_servico WHERE status = 'aguardando_peca')                               AS os_aguardando_peca,

    -- Concluídas e canceladas hoje
    (SELECT COUNT(*) FROM ordem_servico
     WHERE status = 'concluida'
       AND data_encerramento::DATE = CURRENT_DATE)                                                      AS os_concluidas_hoje,
    (SELECT COUNT(*) FROM ordem_servico
     WHERE status = 'cancelada'
       AND data_encerramento::DATE = CURRENT_DATE)                                                      AS os_canceladas_hoje,

    -- Total do mês corrente
    (SELECT COUNT(*) FROM ordem_servico
     WHERE DATE_TRUNC('month', data_abertura) = DATE_TRUNC('month', NOW()))                             AS os_total_mes,

    -- Faturamento do mês (somente OS concluídas)
    (SELECT COALESCE(SUM(valor_total), 0) FROM ordem_servico
     WHERE status = 'concluida'
       AND DATE_TRUNC('month', data_encerramento) = DATE_TRUNC('month', NOW()))                         AS faturamento_mes,

    -- Clientes e veículos ativos
    (SELECT COUNT(*) FROM cliente WHERE ativo = true)                                                   AS clientes_ativos,
    (SELECT COUNT(*) FROM veiculo  WHERE ativo = true)                                                  AS veiculos_ativos,

    -- Alertas de estoque
    (SELECT COUNT(*) FROM item_estoque WHERE ativo = true AND quantidade > 0 AND quantidade < qtd_minima) AS itens_estoque_baixo,
    (SELECT COUNT(*) FROM item_estoque WHERE ativo = true AND quantidade = 0)                            AS itens_sem_estoque;
END;
$$;

COMMENT ON FUNCTION get_dashboard_stats() IS
  'Retorna estatísticas gerais para o dashboard: OS por status, faturamento do mês e alertas de estoque';

-- =============================================================================
-- FUNÇÃO: get_relatorio_faturamento(data_inicio, data_fim)
-- Retorna faturamento detalhado no período informado
-- Acesso: gestor
-- =============================================================================

CREATE OR REPLACE FUNCTION get_relatorio_faturamento(
  p_data_inicio TIMESTAMPTZ,
  p_data_fim    TIMESTAMPTZ
)
RETURNS TABLE (
  periodo             TEXT,
  total_os_concluidas BIGINT,
  faturamento_total   NUMERIC,
  ticket_medio        NUMERIC,
  maior_os_valor      NUMERIC,
  forma_pgto          TEXT,
  qtd_forma_pgto      BIGINT,
  valor_forma_pgto    NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(p_data_inicio, 'DD/MM/YYYY') || ' a ' || TO_CHAR(p_data_fim, 'DD/MM/YYYY')  AS periodo,
    COUNT(*)                                                                               AS total_os_concluidas,
    COALESCE(SUM(valor_total), 0)                                                          AS faturamento_total,
    COALESCE(AVG(valor_total), 0)                                                          AS ticket_medio,
    COALESCE(MAX(valor_total), 0)                                                          AS maior_os_valor,
    COALESCE(forma_pagamento, 'Não informado')                                             AS forma_pgto,
    COUNT(*)                                                                               AS qtd_forma_pgto,
    COALESCE(SUM(valor_total), 0)                                                          AS valor_forma_pgto
  FROM ordem_servico
  WHERE status = 'concluida'
    AND data_encerramento BETWEEN p_data_inicio AND p_data_fim
  GROUP BY forma_pagamento
  ORDER BY valor_forma_pgto DESC;
END;
$$;

COMMENT ON FUNCTION get_relatorio_faturamento(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Retorna faturamento do período agrupado por forma de pagamento';

-- =============================================================================
-- FUNÇÃO: get_relatorio_atendimentos(data_inicio, data_fim)
-- Retorna OS no período com detalhes completos
-- Acesso: gestor e atendente
-- =============================================================================

CREATE OR REPLACE FUNCTION get_relatorio_atendimentos(
  p_data_inicio TIMESTAMPTZ,
  p_data_fim    TIMESTAMPTZ
)
RETURNS TABLE (
  os_id             UUID,
  numero_os         INT,
  data_abertura     TIMESTAMPTZ,
  data_encerramento TIMESTAMPTZ,
  status            status_os,
  prioridade        TEXT,
  cliente_nome      TEXT,
  cliente_cpf_cnpj  TEXT,
  veiculo_placa     TEXT,
  veiculo_modelo    TEXT,
  veiculo_marca     TEXT,
  veiculo_ano       SMALLINT,
  atendente_nome    TEXT,
  descricao         TEXT,
  diagnostico       TEXT,
  valor_total       NUMERIC,
  forma_pagamento   TEXT,
  km_entrada        INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    os.id                               AS os_id,
    os.numero_os                        AS numero_os,
    os.data_abertura                    AS data_abertura,
    os.data_encerramento                AS data_encerramento,
    os.status                           AS status,
    os.prioridade                       AS prioridade,
    c.nome                              AS cliente_nome,
    c.cpf_cnpj                          AS cliente_cpf_cnpj,
    v.placa                             AS veiculo_placa,
    v.modelo                            AS veiculo_modelo,
    v.marca                             AS veiculo_marca,
    v.ano                               AS veiculo_ano,
    u.nome                              AS atendente_nome,
    os.descricao                        AS descricao,
    os.diagnostico                      AS diagnostico,
    os.valor_total                      AS valor_total,
    os.forma_pagamento                  AS forma_pagamento,
    os.km_entrada                       AS km_entrada
  FROM ordem_servico os
  JOIN veiculo v  ON v.id = os.id_veiculo
  JOIN cliente c  ON c.id = v.id_cliente
  JOIN usuario u  ON u.id = os.id_usuario
  WHERE os.data_abertura BETWEEN p_data_inicio AND p_data_fim
  ORDER BY os.data_abertura DESC;
END;
$$;

COMMENT ON FUNCTION get_relatorio_atendimentos(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Relatório completo de OS no período com dados de cliente, veículo e atendente';

-- =============================================================================
-- FUNÇÃO: get_servicos_frequentes()
-- TOP 10 descrições de serviços mais realizados
-- Acesso: gestor
-- =============================================================================

CREATE OR REPLACE FUNCTION get_servicos_frequentes()
RETURNS TABLE (
  descricao   TEXT,
  total_os    BIGINT,
  valor_medio NUMERIC,
  valor_total NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Agrupa por similaridade de descrição (lower + trim)
  RETURN QUERY
  SELECT
    LOWER(TRIM(os.descricao))       AS descricao,
    COUNT(*)                        AS total_os,
    ROUND(AVG(os.valor_total), 2)   AS valor_medio,
    SUM(os.valor_total)             AS valor_total
  FROM ordem_servico os
  WHERE os.status != 'cancelada'
  GROUP BY LOWER(TRIM(os.descricao))
  ORDER BY total_os DESC, valor_total DESC
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION get_servicos_frequentes() IS
  'Retorna os 10 serviços mais executados com valor médio e total acumulado';

-- =============================================================================
-- FUNÇÃO: get_clientes_frequentes()
-- TOP 10 clientes por quantidade de OS
-- Acesso: gestor e atendente
-- =============================================================================

CREATE OR REPLACE FUNCTION get_clientes_frequentes()
RETURNS TABLE (
  cliente_id        UUID,
  cliente_nome      TEXT,
  tipo_pessoa       tipo_pessoa,
  cpf_cnpj          TEXT,
  telefone          TEXT,
  total_os          BIGINT,
  total_veiculos    BIGINT,
  faturamento_total NUMERIC,
  ultima_os         TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id                          AS cliente_id,
    c.nome                        AS cliente_nome,
    c.tipo_pessoa                 AS tipo_pessoa,
    c.cpf_cnpj                    AS cpf_cnpj,
    c.telefone                    AS telefone,
    COUNT(DISTINCT os.id)         AS total_os,
    COUNT(DISTINCT v.id)          AS total_veiculos,
    COALESCE(SUM(os.valor_total), 0) AS faturamento_total,
    MAX(os.data_abertura)         AS ultima_os
  FROM cliente c
  LEFT JOIN veiculo v        ON v.id_cliente = c.id AND v.ativo = true
  LEFT JOIN ordem_servico os ON os.id_veiculo = v.id AND os.status != 'cancelada'
  WHERE c.ativo = true
  GROUP BY c.id, c.nome, c.tipo_pessoa, c.cpf_cnpj, c.telefone
  ORDER BY total_os DESC, faturamento_total DESC
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION get_clientes_frequentes() IS
  'Retorna os 10 clientes com maior número de OS e faturamento acumulado';

-- =============================================================================
-- FUNÇÃO: fn_update_estoque_quantidade()
-- Trigger function que:
--  1. Valida saldo suficiente antes de saídas
--  2. Atualiza item_estoque.quantidade após INSERT em movimentacao_estoque
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_update_estoque_quantidade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo_atual INT;
BEGIN
  -- Busca saldo atual para o item
  SELECT quantidade INTO v_saldo_atual
  FROM item_estoque
  WHERE id = NEW.id_item
  FOR UPDATE; -- bloqueia a linha para evitar race condition

  IF v_saldo_atual IS NULL THEN
    RAISE EXCEPTION 'Item de estoque não encontrado: %', NEW.id_item;
  END IF;

  -- Valida saldo para saída
  IF NEW.tipo = 'saida' THEN
    IF v_saldo_atual < NEW.quantidade THEN
      RAISE EXCEPTION
        'Saldo insuficiente para o item "%". Saldo atual: %, Quantidade solicitada: %',
        (SELECT nome FROM item_estoque WHERE id = NEW.id_item),
        v_saldo_atual,
        NEW.quantidade
        USING ERRCODE = 'P0001';
    END IF;

    -- Decrementa estoque
    UPDATE item_estoque
    SET quantidade = quantidade - NEW.quantidade
    WHERE id = NEW.id_item;

  ELSIF NEW.tipo = 'entrada' THEN
    -- Incrementa estoque
    UPDATE item_estoque
    SET quantidade = quantidade + NEW.quantidade
    WHERE id = NEW.id_item;

  ELSIF NEW.tipo = 'ajuste' THEN
    -- Ajuste: quantidade informada é o novo saldo absoluto
    UPDATE item_estoque
    SET quantidade = NEW.quantidade
    WHERE id = NEW.id_item;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_update_estoque_quantidade() IS
  'Trigger que valida saldo antes de saídas e atualiza a quantidade do item_estoque';

-- Trigger disparado após INSERT na movimentacao_estoque
CREATE TRIGGER trg_movimentacao_atualiza_estoque
  AFTER INSERT ON movimentacao_estoque
  FOR EACH ROW EXECUTE FUNCTION fn_update_estoque_quantidade();

-- =============================================================================
-- FUNÇÃO AUXILIAR: fn_registra_log_auditoria()
-- Pode ser chamada via código para registrar ações relevantes no log
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_registra_log_auditoria(
  p_acao        VARCHAR(60),
  p_tabela      VARCHAR(50)   DEFAULT NULL,
  p_id_registro UUID          DEFAULT NULL,
  p_dados_antes JSONB         DEFAULT NULL,
  p_dados_depois JSONB        DEFAULT NULL,
  p_ip_origem   VARCHAR(45)   DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO log_auditoria (
    id_usuario,
    acao,
    tabela,
    id_registro,
    dados_antes,
    dados_depois,
    ip_origem
  ) VALUES (
    auth.uid(),
    p_acao,
    p_tabela,
    p_id_registro,
    p_dados_antes,
    p_dados_depois,
    p_ip_origem
  );
END;
$$;

COMMENT ON FUNCTION fn_registra_log_auditoria(VARCHAR, VARCHAR, UUID, JSONB, JSONB, VARCHAR) IS
  'Insere uma entrada no log_auditoria. Deve ser chamada por funções SECURITY DEFINER ou via backend';

-- =============================================================================
-- FUNÇÃO: get_historico_veiculo(p_id_veiculo)
-- Retorna todo o histórico de OS de um veículo
-- =============================================================================

CREATE OR REPLACE FUNCTION get_historico_veiculo(p_id_veiculo UUID)
RETURNS TABLE (
  numero_os         INT,
  data_abertura     TIMESTAMPTZ,
  data_encerramento TIMESTAMPTZ,
  status            status_os,
  descricao         TEXT,
  diagnostico       TEXT,
  km_entrada        INT,
  valor_total       NUMERIC,
  atendente         TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    os.numero_os,
    os.data_abertura,
    os.data_encerramento,
    os.status,
    os.descricao,
    os.diagnostico,
    os.km_entrada,
    os.valor_total,
    u.nome AS atendente
  FROM ordem_servico os
  JOIN usuario u ON u.id = os.id_usuario
  WHERE os.id_veiculo = p_id_veiculo
  ORDER BY os.data_abertura DESC;
END;
$$;

COMMENT ON FUNCTION get_historico_veiculo(UUID) IS
  'Retorna o histórico completo de OS de um veículo específico';

-- =============================================================================
-- FUNÇÃO: get_estoque_critico()
-- Retorna itens com quantidade abaixo do mínimo ou zerada
-- =============================================================================

CREATE OR REPLACE FUNCTION get_estoque_critico()
RETURNS TABLE (
  item_id       UUID,
  codigo        TEXT,
  nome          TEXT,
  unidade       TEXT,
  quantidade    INT,
  qtd_minima    INT,
  deficit       INT,
  preco_unit    NUMERIC,
  custo_reposicao NUMERIC,
  nivel         TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ie.id                                           AS item_id,
    ie.codigo::TEXT                                 AS codigo,
    ie.nome::TEXT                                   AS nome,
    ie.unidade::TEXT                                AS unidade,
    ie.quantidade                                   AS quantidade,
    ie.qtd_minima                                   AS qtd_minima,
    (ie.qtd_minima - ie.quantidade)                 AS deficit,
    ie.preco_unit                                   AS preco_unit,
    ie.preco_unit * (ie.qtd_minima - ie.quantidade) AS custo_reposicao,
    CASE
      WHEN ie.quantidade = 0 THEN 'CRÍTICO'
      ELSE 'BAIXO'
    END                                             AS nivel
  FROM item_estoque ie
  WHERE ie.ativo = true
    AND ie.quantidade < ie.qtd_minima
  ORDER BY ie.quantidade ASC, ie.qtd_minima DESC;
END;
$$;

COMMENT ON FUNCTION get_estoque_critico() IS
  'Lista itens com quantidade abaixo do mínimo, indicando déficit e custo estimado de reposição';
