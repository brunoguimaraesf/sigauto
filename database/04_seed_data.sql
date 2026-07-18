-- =============================================================================
-- SIGAuto - Seed Data (Dados de Exemplo)
-- Arquivo: 04_seed_data.sql
-- Descrição: Dados iniciais para testes e desenvolvimento
-- Pré-requisito: 01_schema.sql deve ter sido executado
-- ATENÇÃO: Não insere na tabela `usuario` pois ela depende do auth.users do Supabase
-- =============================================================================

-- Desabilita temporariamente triggers para acelerar o seed
SET session_replication_role = 'replica';

-- =============================================================================
-- CLIENTES (5 registros: mix física/jurídica)
-- UUIDs fixos para facilitar referências
-- =============================================================================

INSERT INTO cliente (id, nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, ativo)
VALUES
  -- Pessoa física 1
  (
    '11111111-0001-0001-0001-000000000001',
    'Carlos Eduardo Ferreira',
    'fisica',
    '529.982.247-25',       -- CPF válido
    '(11) 98765-4321',
    'carlos.ferreira@email.com',
    'Rua das Acácias, 120 - Jardim Paulista, São Paulo - SP, 01310-100',
    true
  ),
  -- Pessoa física 2
  (
    '11111111-0001-0001-0001-000000000002',
    'Mariana Souza Lima',
    'fisica',
    '153.509.460-56',       -- CPF válido
    '(21) 97654-3210',
    'mariana.lima@email.com',
    'Av. Atlântica, 500 - Copacabana, Rio de Janeiro - RJ, 22010-000',
    true
  ),
  -- Pessoa física 3
  (
    '11111111-0001-0001-0001-000000000003',
    'Roberto Alves Neto',
    'fisica',
    '847.593.320-04',       -- CPF válido
    '(31) 96543-2109',
    'roberto.alves@email.com',
    'Rua da Bahia, 750 - Centro, Belo Horizonte - MG, 30160-010',
    true
  ),
  -- Pessoa jurídica 1
  (
    '11111111-0001-0001-0001-000000000004',
    'Transportes Rápidos Ltda',
    'juridica',
    '11.222.333/0001-81',   -- CNPJ válido
    '(11) 3456-7890',
    'contato@transportesrapidos.com.br',
    'Rodovia Anhangüera, km 15 - Galpão 7, Guarulhos - SP, 07140-000',
    true
  ),
  -- Pessoa jurídica 2
  (
    '11111111-0001-0001-0001-000000000005',
    'Frota Segura Comércio de Veículos S.A.',
    'juridica',
    '45.678.901/0001-02',   -- CNPJ válido
    '(41) 3333-9999',
    'frotas@frotasegura.com.br',
    'Av. das Torres, 2000 - Bairro Industrial, Curitiba - PR, 81460-010',
    true
  );

-- =============================================================================
-- VEÍCULOS (8 registros: mix formato antigo e Mercosul)
-- =============================================================================

INSERT INTO veiculo (id, id_cliente, placa, modelo, marca, ano, cor, km_atual, observacoes, ativo)
VALUES
  -- Veículos de Carlos Eduardo (placa antiga)
  (
    '22222222-0002-0002-0002-000000000001',
    '11111111-0001-0001-0001-000000000001',
    'ABC-1234',
    'Gol 1.0',
    'Volkswagen',
    2008,
    'Prata',
    185000,
    'Carro de uso diário. Histórico de troca de embreagem em 2022.',
    true
  ),
  (
    '22222222-0002-0002-0002-000000000002',
    '11111111-0001-0001-0001-000000000001',
    'DEF-5678',
    'Civic EXL 2.0',
    'Honda',
    2015,
    'Preto',
    98000,
    'Segunda mão. Revisão completa feita no ato da compra.',
    true
  ),

  -- Veículos de Mariana Souza (placa Mercosul)
  (
    '22222222-0002-0002-0002-000000000003',
    '11111111-0001-0001-0001-000000000002',
    'BRA2E19',
    'Argo Drive 1.3',
    'Fiat',
    2021,
    'Vermelho',
    32000,
    NULL,
    true
  ),

  -- Veículo de Roberto Alves
  (
    '22222222-0002-0002-0002-000000000004',
    '11111111-0001-0001-0001-000000000003',
    'GHI-9012',
    'Saveiro Cabine Dupla',
    'Volkswagen',
    2012,
    'Branco',
    220000,
    'Veículo usado para trabalho. Molas traseiras reforçadas.',
    true
  ),
  (
    '22222222-0002-0002-0002-000000000005',
    '11111111-0001-0001-0001-000000000003',
    'MNO3F45',
    'Cronos Precision 1.8',
    'Fiat',
    2023,
    'Cinza Scandium',
    8500,
    'Veículo novo em garantia de fábrica.',
    true
  ),

  -- Veículos de Transportes Rápidos Ltda (frota)
  (
    '22222222-0002-0002-0002-000000000006',
    '11111111-0001-0001-0001-000000000004',
    'JKL-3456',
    'Master Furgão L3H2',
    'Renault',
    2019,
    'Branco',
    310000,
    'Furgão de entrega. Revisão a cada 20.000 km.',
    true
  ),
  (
    '22222222-0002-0002-0002-000000000007',
    '11111111-0001-0001-0001-000000000004',
    'PQR4G67',
    'Sprinter 415 CDI',
    'Mercedes-Benz',
    2022,
    'Branco',
    95000,
    'Veículo de longa distância com rastreador.',
    true
  ),

  -- Veículo de Frota Segura S.A.
  (
    '22222222-0002-0002-0002-000000000008',
    '11111111-0001-0001-0001-000000000005',
    'STU5H89',
    'Hilux CD SRX 2.8 4x4',
    'Toyota',
    2020,
    'Cinza Metálico',
    67000,
    'Caminhonete executiva para diretoria. Pneus trocados em 60.000 km.',
    true
  );

-- =============================================================================
-- ITENS DE ESTOQUE (10 registros com variação de saldo)
-- Alguns abaixo do mínimo para testar alertas
-- =============================================================================

INSERT INTO item_estoque (id, codigo, nome, descricao, unidade, quantidade, qtd_minima, preco_unit, ativo)
VALUES
  -- 1. Filtro de óleo - saldo normal
  (
    '33333333-0003-0003-0003-000000000001',
    'FILT-OL-001',
    'Filtro de Óleo Bosch F026407006',
    'Filtro de óleo para motores 1.0 a 2.0. Compatível com VW, Fiat, GM.',
    'UN',
    45,
    10,
    28.90,
    true
  ),

  -- 2. Filtro de ar - saldo normal
  (
    '33333333-0003-0003-0003-000000000002',
    'FILT-AR-002',
    'Filtro de Ar Mann C25004',
    'Filtro de ar cônico de alto fluxo. Compatível com diversas aplicações.',
    'UN',
    32,
    8,
    42.50,
    true
  ),

  -- 3. Óleo motor 5W30 - saldo ABAIXO DO MÍNIMO
  (
    '33333333-0003-0003-0003-000000000003',
    'OLEO-5W30-003',
    'Óleo Motor Sintético 5W30 Castrol Edge 1L',
    'Óleo motor sintético de alta performance. Norma API SN/CF.',
    'LT',
    6,
    20,
    39.90,
    true
  ),

  -- 4. Pastilha de freio - saldo normal
  (
    '33333333-0003-0003-0003-000000000004',
    'PAST-FR-004',
    'Jogo Pastilha Freio Dianteiro Fras-le PD/1347',
    'Pastilha de freio dianteiro para VW Gol, Parati, Saveiro.',
    'CX',
    18,
    5,
    89.00,
    true
  ),

  -- 5. Correia dentada - saldo ABAIXO DO MÍNIMO
  (
    '33333333-0003-0003-0003-000000000005',
    'CORR-DT-005',
    'Correia Dentada Gates T277',
    'Correia dentada para Fiat Uno, Palio, Strada motor Fire 1.0/1.4.',
    'UN',
    2,
    5,
    68.70,
    true
  ),

  -- 6. Vela de ignição - saldo normal
  (
    '33333333-0003-0003-0003-000000000006',
    'VELA-IG-006',
    'Jogo Vela Ignição NGK BKR5E (4un)',
    'Velas de ignição padrão para motores aspirados 1.0 a 1.6.',
    'CX',
    22,
    6,
    54.00,
    true
  ),

  -- 7. Fluido de freio - saldo normal
  (
    '33333333-0003-0003-0003-000000000007',
    'FLUID-FR-007',
    'Fluido de Freio DOT 4 Bosch 500ml',
    'Fluido de freio sintético DOT 4. Ponto de ebulição 260°C.',
    'UN',
    14,
    4,
    22.00,
    true
  ),

  -- 8. Amortecedor traseiro - estoque ZERADO (crítico)
  (
    '33333333-0003-0003-0003-000000000008',
    'AMOR-TR-008',
    'Par Amortecedor Traseiro Monroe GT Gas Gol G5/G6',
    'Amortecedor traseiro a gás para VW Gol G5 e G6 (2009-2014).',
    'PC',
    0,
    2,
    310.00,
    true
  ),

  -- 9. Tensor correia acessórios - saldo ABAIXO DO MÍNIMO
  (
    '33333333-0003-0003-0003-000000000009',
    'TENS-CA-009',
    'Tensor Correia Acessórios INA F-235869',
    'Tensor automático de correia de acessórios. Compatível com motores GM e Ford.',
    'UN',
    1,
    3,
    145.00,
    true
  ),

  -- 10. Rolamento roda - saldo normal
  (
    '33333333-0003-0003-0003-000000000010',
    'ROLA-RD-010',
    'Rolamento Roda Dianteira SKF VKBA3643',
    'Rolamento de cubo dianteiro para Honda Civic, Fit e CR-V.',
    'UN',
    8,
    4,
    195.00,
    true
  );

-- Reativa os triggers
SET session_replication_role = 'origin';

-- =============================================================================
-- VERIFICAÇÃO: Exibe resumo dos dados inseridos
-- =============================================================================

DO $$
DECLARE
  v_clientes    INT;
  v_veiculos    INT;
  v_estoque     INT;
  v_est_baixo   INT;
  v_est_zero    INT;
BEGIN
  SELECT COUNT(*) INTO v_clientes  FROM cliente;
  SELECT COUNT(*) INTO v_veiculos  FROM veiculo;
  SELECT COUNT(*) INTO v_estoque   FROM item_estoque;
  SELECT COUNT(*) INTO v_est_baixo FROM item_estoque WHERE quantidade > 0 AND quantidade < qtd_minima;
  SELECT COUNT(*) INTO v_est_zero  FROM item_estoque WHERE quantidade = 0;

  RAISE NOTICE '=== SIGAuto Seed concluído ===';
  RAISE NOTICE 'Clientes inseridos:              %', v_clientes;
  RAISE NOTICE 'Veículos inseridos:              %', v_veiculos;
  RAISE NOTICE 'Itens de estoque inseridos:      %', v_estoque;
  RAISE NOTICE 'Itens com estoque baixo:         %', v_est_baixo;
  RAISE NOTICE 'Itens com estoque zerado:        %', v_est_zero;
  RAISE NOTICE '==============================';
END;
$$;
