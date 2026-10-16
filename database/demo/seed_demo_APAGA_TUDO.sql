-- =============================================================================
-- seed_demo_APAGA_TUDO.sql
-- Dados de demonstracao do SIGAuto: 100 clientes, 120 veiculos, 60 itens de
-- estoque, 25 servicos de catalogo e 250 ordens de servico distribuidas nos
-- ultimos 180 dias.
--
-- Para executar, e obrigatorio confirmar a destruicao: descomente a linha
-- `SET LOCAL app.permitir_seed_demo` logo abaixo do `BEGIN;` deste arquivo.
-- Enquanto ela estiver comentada, o script se recusa a rodar e nada e apagado.
--
-- NAO E UMA MIGRACAO. Fica fora de `database/` e fora da sequencia numerada de
-- proposito: `10_seed_demo.sql` esta na sequencia e e aplicado no rollout; este
-- nao. Rode manualmente, e so em banco cujo conteudo pode ser perdido:
-- o script APAGA cliente, endereco, veiculo, ordem_servico (e itens), estoque,
-- movimentacoes, catalogo de servicos, recomendacoes de IA e mensagens do
-- chatbot. Preserva usuario, funcionario, configuracao_oficina e log_auditoria.
--
-- Por que 180 dias: o Painel IA (backend/src/services/metricasPainelIA.js)
-- compara uma janela de 90 dias com os 90 dias anteriores. Menos de 180 dias de
-- historico deixa `periodo_anterior` vazio e toda `variacao_percentual` nula.
--
-- Por que passa pelos RPCs em vez de INSERT direto: desde a migracao 26 o saldo
-- de `item_estoque` so muda pelo trigger do ledger, e a transicao para
-- `concluida` exige a GUC que so `finalizar_ordem_servico` define. Semear por
-- UPDATE direto e recusado pelos guards — e mesmo que passasse, produziria OS
-- concluida sem baixa de estoque e sem snapshot de comissao, que e justamente a
-- inconsistencia que os relatorios denunciam.
--
-- Requisitos: rodar como `postgres`, com as migracoes 01-28 aplicadas e ao
-- menos um usuario gestor ativo, um mecanico ativo e um atendente ou gestor
-- ativo.
--
-- RODE COM `psql`, NAO PELO SQL EDITOR DO SUPABASE:
--
--   psql "<connection string do projeto>" -1 -v ON_ERROR_STOP=1 --        -f database/demo/seed_demo_APAGA_TUDO.sql
--
-- Motivo, medido em 16/10/2026: o SQL Editor divide o script em statements no
-- cliente, e o divisor nao entende corpos entre `$$` (que estao cheios de `;`).
-- Duas execucoes falharam em pontos diferentes por causa disso, e numa delas o
-- erro veio DEPOIS dos `DELETE` terem sido commitados — ou seja, o
-- `BEGIN`/`COMMIT` deste arquivo nao garantiu atomicidade por aquele caminho. O
-- `-1` do psql abre uma transacao de verdade e o `ON_ERROR_STOP=1` para no
-- primeiro erro. As tabelas de trabalho ja nao dependem mais de transacao (ver
-- o schema `seed_tmp`), mas a atomicidade dos `DELETE` depende.
--
-- **Faca backup antes de qualquer caminho.**
-- =============================================================================

BEGIN;

SET LOCAL search_path = public, pg_catalog;
SET LOCAL statement_timeout = '600s';

-- DESCOMENTE A LINHA ABAIXO PARA CONFIRMAR QUE OS DADOS PODEM SER APAGADOS.
SET LOCAL app.permitir_seed_demo = 'sim';

-- Sequencia pseudoaleatoria fixa: duas execucoes produzem os mesmos numeros.
SELECT setseed(0.4242);

-- -----------------------------------------------------------------------------
-- 0. Pre-condicoes. Identidade do gestor para `auth.uid()`, porque
--    `finalizar_ordem_servico` checa `fn_perfil_usuario_atual()` e no SQL
--    Editor nao existe JWT.
-- -----------------------------------------------------------------------------
-- Trava de ambiente. O cabecalho avisa que o script e destrutivo, mas comentario
-- nao impede colagem: sem esta GUC, as pre-condicoes abaixo aceitam exatamente
-- o estado de um banco de producao saudavel — quanto mais real o banco, melhor
-- o script passa. Rode antes, na MESMA transacao:
--   SET LOCAL app.permitir_seed_demo = 'sim';
DO $$
BEGIN
  IF current_setting('app.permitir_seed_demo', true) IS DISTINCT FROM 'sim' THEN
    RAISE EXCEPTION
      'Seed recusado: este script APAGA os dados de negocio. Para confirmar, rode "SET LOCAL app.permitir_seed_demo = ''sim'';" dentro desta transacao.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

DO $$
DECLARE
  v_usuario UUID;
BEGIN
  SELECT u.id INTO v_usuario
    FROM public.usuario u
   WHERE u.perfil = 'gestor' AND u.ativo
   ORDER BY u.criado_em
   LIMIT 1;

  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Seed abortado: nenhum usuario com perfil gestor e ativo.';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_usuario, 'role', 'authenticated')::text,
    true
  );

  IF COALESCE(public.fn_perfil_usuario_atual()::text, '') <> 'gestor' THEN
    RAISE EXCEPTION 'Seed abortado: fn_perfil_usuario_atual() nao reconheceu o gestor %.', v_usuario;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.funcionario WHERE cargo = 'mecanico' AND ativo) THEN
    RAISE EXCEPTION 'Seed abortado: nenhum funcionario mecanico ativo para atribuir as OS.';
  END IF;

  -- A atribuicao do atendente divide pela contagem: sem nenhum, seria uma
  -- `division by zero` no meio do INSERT das OS, com mensagem que nao diz nada.
  IF NOT EXISTS (
    SELECT 1 FROM public.funcionario WHERE cargo IN ('atendente', 'gestor') AND ativo
  ) THEN
    RAISE EXCEPTION 'Seed abortado: nenhum funcionario atendente ou gestor ativo para atribuir as OS.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.movimentacao_estoque'::regclass
       AND tgname = 'trg_movimentacao_atualiza_estoque'
       AND tgenabled <> 'D' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Seed abortado: trigger de saldo ausente. Aplique a migracao 27 antes.';
  END IF;

  RAISE NOTICE 'Seed executando como gestor %.', v_usuario;
END;
$$;

-- Area de trabalho do seed. Tabelas REAIS, nao temporarias: o divisor de
-- statements do SQL Editor do Supabase nao entende corpos entre `$$` e pode
-- quebrar o script em transacoes diferentes das que criaram as temporarias —
-- com `ON COMMIT DROP` a tabela morria antes de ser usada (`42P01 relation
-- "tmp_cliente" does not exist`). Schema proprio, fora de `public`, logo o
-- PostgREST nao o expoe; e derrubado no fim do arquivo.
DROP SCHEMA IF EXISTS seed_tmp CASCADE;
CREATE SCHEMA seed_tmp;
REVOKE ALL ON SCHEMA seed_tmp FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Limpeza, das folhas para as raizes.
--    `recomendacao_ia.id_os` e `movimentacao_estoque.id_os` referenciam
--    `ordem_servico` SEM `ON DELETE`, diferente dos itens da OS (que sao
--    CASCADE). Apagar a OS antes delas aborta com 23503 em qualquer banco onde
--    o Painel IA ja gravou analise ligada a uma OS. `mensagem_chatbot` nao
--    referencia OS (so `id_usuario`); vem junto por limpeza, nao por FK.
-- -----------------------------------------------------------------------------
DELETE FROM public.recomendacao_ia;
DELETE FROM public.mensagem_chatbot;
DELETE FROM public.os_comissao;
DELETE FROM public.os_baixa_estoque;
DELETE FROM public.os_peca;
DELETE FROM public.os_servico;
DELETE FROM public.movimentacao_estoque;
DELETE FROM public.ordem_servico;
DELETE FROM public.item_estoque;
DELETE FROM public.veiculo;
DELETE FROM public.endereco;
DELETE FROM public.cliente;
DELETE FROM public.servico_catalogo;

ALTER SEQUENCE public.ordem_servico_numero_os_seq RESTART WITH 1;

-- -----------------------------------------------------------------------------
-- 2. Comissao da equipe. Sem percentual, `os_comissao` nasce toda zerada e o
--    relatorio de comissao fica em branco. So preenche quem esta em zero: um
--    percentual ja configurado a mao e preservado.
--
--    ATENCAO: isto altera dado real de funcionario, que o resto do script
--    preserva de proposito. O estado anterior e guardado e impresso no final —
--    e regra financeira, nao dado de demonstracao, e a 23 congela o percentual
--    em cada OS encerrada depois daqui.
-- -----------------------------------------------------------------------------
--    Captura e altera no MESMO bloco, e relata na hora. A versao anterior
--    guardava o estado em `tmp_comissao_antes` (`ON COMMIT DROP`) e comparava
--    no bloco de pos-condicoes, no fim do arquivo: se o executor commitar por
--    statement em vez de manter uma transacao unica — o que o SQL Editor do
--    Supabase fez em 16/10/2026 — a temp table e descartada antes do fim e o
--    script morre com `42P01 relation "tmp_comissao_antes" does not exist`,
--    DEPOIS de ter apagado e repovoado tudo. Nao dependa de estado que
--    atravessa statements.
DO $$
DECLARE
  r RECORD;
  v_alterados INT := 0;
BEGIN
  FOR r IN
    UPDATE public.funcionario f
       SET comissao_percentual = CASE WHEN f.cargo = 'mecanico' THEN 25.00 ELSE 5.00 END,
           comissao_sobre_servicos = true
     WHERE f.ativo
       AND f.cargo IN ('mecanico', 'atendente')
       AND f.comissao_percentual = 0
    RETURNING f.nome, f.cargo, f.comissao_percentual
  LOOP
    -- O sinal de porcentagem vai concatenado no argumento: em `%%%` o plpgsql
    -- le `%%` (literal) + `%` (substituicao), o que imprimiria "para %25.00".
    RAISE NOTICE 'Comissao definida: % (%) de 0%% para %.',
      r.nome, r.cargo, r.comissao_percentual::text || '%';
    v_alterados := v_alterados + 1;
  END LOOP;
  RAISE NOTICE 'Funcionarios com comissao ajustada: %. Quem ja tinha percentual foi preservado.',
    v_alterados;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Catalogo de servicos (25).
-- -----------------------------------------------------------------------------
INSERT INTO public.servico_catalogo (nome, descricao, preco, ativo, criado_em, atualizado_em)
SELECT nome, descricao, preco, true, now() - INTERVAL '200 days', now() - INTERVAL '200 days'
FROM (VALUES
  ('Troca de oleo e filtro', 'Troca de oleo do motor e substituicao do filtro de oleo.', 120.00),
  ('Alinhamento e balanceamento', 'Alinhamento da geometria de direcao e balanceamento das quatro rodas.', 150.00),
  ('Revisao preventiva completa', 'Checklist de 40 itens, fluidos, filtros e teste de rodagem.', 420.00),
  ('Troca de pastilhas de freio', 'Substituicao das pastilhas dianteiras e limpeza do sistema.', 180.00),
  ('Troca de discos de freio', 'Substituicao dos discos dianteiros e regulagem.', 320.00),
  ('Troca de correia dentada', 'Substituicao da correia dentada, tensor e rolamentos.', 680.00),
  ('Troca de embreagem', 'Substituicao do kit de embreagem e sangria do sistema.', 950.00),
  ('Reparo de suspensao dianteira', 'Troca de amortecedores, batentes e kit de suspensao.', 540.00),
  ('Reparo de suspensao traseira', 'Troca de amortecedores traseiros e buchas.', 430.00),
  ('Higienizacao do ar-condicionado', 'Limpeza do evaporador, troca do filtro de cabine e recarga de gas.', 260.00),
  ('Recarga de gas do ar-condicionado', 'Teste de vazamento e recarga de fluido refrigerante.', 190.00),
  ('Diagnostico eletronico (scanner)', 'Leitura e interpretacao dos codigos de falha da injecao.', 90.00),
  ('Troca de bateria', 'Substituicao da bateria e teste do alternador.', 80.00),
  ('Reparo do sistema de arrefecimento', 'Troca de valvula termostatica, mangueiras e fluido.', 380.00),
  ('Troca de radiador', 'Substituicao do radiador e teste de pressao do circuito.', 620.00),
  ('Troca de velas e cabos', 'Substituicao das velas de ignicao e cabos de vela.', 160.00),
  ('Limpeza de bicos injetores', 'Limpeza por ultrassom e teste de vazao dos bicos.', 280.00),
  ('Troca de amortecedores', 'Substituicao dos quatro amortecedores e kit de batentes.', 720.00),
  ('Troca de kit de distribuicao', 'Substituicao completa do kit de distribuicao e bomba de agua.', 890.00),
  ('Revisao de freios completa', 'Pastilhas, discos, fluido e regulagem do freio de estacionamento.', 460.00),
  ('Troca de filtro de combustivel', 'Substituicao do filtro de combustivel e teste de pressao.', 110.00),
  ('Troca de filtro de ar', 'Substituicao do filtro de ar do motor.', 70.00),
  ('Reparo eletrico geral', 'Diagnostico e reparo de chicote, fusiveis e reles.', 240.00),
  ('Troca de junta do cabecote', 'Desmontagem do cabecote, troca da junta e torque de montagem.', 1450.00),
  ('Geometria de direcao 3D', 'Alinhamento tridimensional com relatorio impresso.', 210.00)
) AS s(nome, descricao, preco);

-- -----------------------------------------------------------------------------
-- 4. Itens de estoque (60). `custo` e `preco_unit` preenchidos: o RF09 e a RN35
--    pedem a margem, que a tela deriva dos dois.
-- -----------------------------------------------------------------------------
INSERT INTO public.item_estoque
  (codigo, nome, descricao, unidade, qtd_minima, custo, preco_unit, ativo, criado_em, atualizado_em)
SELECT 'PEC-' || lpad(ord::text, 3, '0'),
       nome,
       'Item de giro da oficina: ' || nome || '.',
       unidade,
       qtd_minima,
       custo,
       preco,
       true,
       now() - INTERVAL '200 days',
       now() - INTERVAL '200 days'
FROM (VALUES
  ( 1,'Oleo de motor 5W30 sintetico','LT', 12, 22.90,  39.90),
  ( 2,'Oleo de motor 15W40 mineral','LT', 10, 16.50,  28.90),
  ( 3,'Filtro de oleo','UN',  8, 14.00,  28.00),
  ( 4,'Filtro de ar do motor','UN',  8, 19.00,  38.00),
  ( 5,'Filtro de combustivel','UN',  8, 21.00,  42.00),
  ( 6,'Filtro de cabine (ar-condicionado)','UN',  6, 24.00,  49.00),
  ( 7,'Pastilha de freio dianteira','PC',  6, 78.00, 149.00),
  ( 8,'Pastilha de freio traseira','PC',  6, 69.00, 132.00),
  ( 9,'Disco de freio ventilado','PC',  4,112.00, 219.00),
  (10,'Disco de freio solido','PC',  4, 96.00, 189.00),
  (11,'Fluido de freio DOT4','LT',  6, 18.00,  36.00),
  (12,'Correia dentada','UN',  4, 64.00, 128.00),
  (13,'Tensor da correia dentada','UN',  3, 88.00, 178.00),
  (14,'Correia do alternador','UN',  4, 42.00,  86.00),
  (15,'Bomba de agua','UN',  3,146.00, 289.00),
  (16,'Valvula termostatica','UN',  4, 52.00, 104.00),
  (17,'Radiador','UN',  2,318.00, 629.00),
  (18,'Mangueira superior do radiador','UN',  4, 38.00,  78.00),
  (19,'Mangueira inferior do radiador','UN',  4, 36.00,  74.00),
  (20,'Aditivo de radiador','LT',  8, 17.00,  34.00),
  (21,'Vela de ignicao','UN', 16, 22.00,  44.00),
  (22,'Cabo de vela (jogo)','CX',  4, 72.00, 142.00),
  (23,'Bobina de ignicao','UN',  3,128.00, 249.00),
  (24,'Bico injetor','UN',  4,156.00, 309.00),
  (25,'Bateria 60Ah','UN',  3,298.00, 549.00),
  (26,'Bateria 45Ah','UN',  3,248.00, 459.00),
  (27,'Alternador remanufaturado','UN',  2,392.00, 759.00),
  (28,'Motor de arranque remanufaturado','UN',  2,368.00, 719.00),
  (29,'Amortecedor dianteiro','PC',  4,168.00, 329.00),
  (30,'Amortecedor traseiro','PC',  4,142.00, 279.00),
  (31,'Kit de batentes e coifas','CX',  4, 86.00, 172.00),
  (32,'Mola helicoidal dianteira','PC',  3,124.00, 246.00),
  (33,'Bucha da bandeja','UN',  8, 34.00,  68.00),
  (34,'Pivo de suspensao','UN',  6, 46.00,  94.00),
  (35,'Terminal de direcao','UN',  6, 52.00, 104.00),
  (36,'Barra axial','UN',  6, 58.00, 116.00),
  (37,'Rolamento de roda dianteira','UN',  4, 92.00, 184.00),
  (38,'Rolamento de roda traseira','UN',  4, 84.00, 168.00),
  (39,'Kit de embreagem','CX',  2,418.00, 819.00),
  (40,'Atuador hidraulico da embreagem','UN',  2,186.00, 369.00),
  (41,'Junta do cabecote','UN',  3, 96.00, 192.00),
  (42,'Retentor de valvula (jogo)','CX',  3, 64.00, 128.00),
  (43,'Bomba de combustivel','UN',  2,246.00, 489.00),
  (44,'Sonda lambda','UN',  3,198.00, 389.00),
  (45,'Sensor de rotacao','UN',  3,112.00, 224.00),
  (46,'Sensor de temperatura','UN',  4, 68.00, 136.00),
  (47,'Lampada H4','UN', 12,  9.00,  22.00),
  (48,'Lampada de painel','UN', 12,  4.50,  12.00),
  (49,'Fusivel automotivo (cartela)','CX',  8,  7.00,  18.00),
  (50,'Rele auxiliar','UN',  6, 16.00,  34.00),
  (51,'Palheta limpador 16 pol','PC',  6, 24.00,  48.00),
  (52,'Palheta limpador 18 pol','PC',  6, 26.00,  52.00),
  (53,'Gas refrigerante R134a','KG',  5, 42.00,  89.00),
  (54,'Oleo de cambio ATF','LT',  6, 32.00,  64.00),
  (55,'Fluido de direcao hidraulica','LT',  5, 24.00,  48.00),
  (56,'Graxa de rolamento','KG',  4, 28.00,  56.00),
  (57,'Limpa contato eletrico','UN',  6, 14.00,  29.00),
  (58,'Desengripante','UN',  6, 12.00,  26.00),
  (59,'Parafuso de roda','UN', 20,  6.00,  14.00),
  (60,'Mangueira de freio flexivel','MT',  5, 22.00,  46.00)
) AS i(ord, nome, unidade, qtd_minima, custo, preco);

-- Carga inicial de saldo. 190 dias atras, fora da janela de 90 dias do Painel
-- IA, para que o consumo recente apareca sem a entrada inicial distorcer.
INSERT INTO public.movimentacao_estoque
  (id_item, id_usuario, tipo, quantidade, motivo, data_hora, origem)
SELECT ie.id,
       (current_setting('request.jwt.claims')::json ->> 'sub')::uuid,
       'entrada',
       60 + (right(ie.codigo, 3)::int % 7) * 20,
       'Carga inicial de estoque',
       now() - INTERVAL '190 days',
       'manual'
FROM public.item_estoque ie;

-- -----------------------------------------------------------------------------
-- 5. Clientes (100), com endereco estruturado completo.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS seed_tmp.cliente;
CREATE TABLE seed_tmp.cliente (ord INT PRIMARY KEY, id UUID NOT NULL);

WITH fontes AS (
  SELECT i,
    (ARRAY['Ana','Bruno','Carla','Diego','Elaine','Fabio','Gabriela','Helio','Iara','Joao',
           'Karla','Lucas','Marina','Nelson','Olivia','Paulo','Queila','Rafael','Simone','Tiago'])
      [1 + (i * 7) % 20] AS primeiro,
    (ARRAY['Silva','Souza','Pereira','Oliveira','Costa','Rodrigues','Almeida','Nunes','Barbosa','Carvalho',
           'Ribeiro','Martins','Araujo','Teixeira','Moreira','Cardoso','Gomes','Freitas','Batista','Siqueira'])
      [1 + (i * 13) % 20] AS sobrenome,
    (ARRAY['Transportadora Rota Clara','Locadora Via Norte','Construtora Pedra Alta','Distribuidora Campo Verde',
           'Frota Expressa Centro Oeste','Agro Maquinas Cerrado','Servicos Urbanos Ipe','Logistica Rio Doce'])
      [1 + (i / 7) % 8] AS empresa,
    (i % 7 = 0) AS juridica
  FROM generate_series(1, 100) AS i
),
montadas AS (
  SELECT i, juridica, empresa, primeiro, sobrenome,
    CASE WHEN juridica THEN empresa || ' LTDA' ELSE primeiro || ' ' || sobrenome END AS nome,
    CASE WHEN juridica
      THEN lpad(((i * 37) % 90 + 10)::text, 2, '0') || '.'
        || lpad(((i * 131) % 900 + 100)::text, 3, '0') || '.'
        || lpad(((i * 277) % 900 + 100)::text, 3, '0') || '/0001-'
        || lpad((i % 100)::text, 2, '0')
      ELSE lpad(((i * 41) % 900 + 100)::text, 3, '0') || '.'
        || lpad(((i * 167) % 900 + 100)::text, 3, '0') || '.'
        || lpad(((i * 311) % 900 + 100)::text, 3, '0') || '-'
        || lpad((i % 100)::text, 2, '0')
    END AS documento,
    '(64) ' || CASE WHEN juridica THEN '3' ELSE '9' END
      || lpad((1000 + (i * 83) % 9000)::text, 4, '0') || '-'
      || lpad((1000 + (i * 59) % 9000)::text, 4, '0') AS telefone
  FROM fontes
),
comemail AS (
  SELECT m.*,
    lower(CASE WHEN juridica
      THEN 'contato' || i::text || '@' || replace(lower(empresa), ' ', '') || '.com.br'
      ELSE lower(primeiro) || '.' || lower(sobrenome) || i::text || '@email.com'
    END) AS email
  FROM montadas m
),
inseridas AS (
  INSERT INTO public.cliente
    (nome, tipo_pessoa, cpf_cnpj, telefone, email, ativo, criado_em, atualizado_em)
  SELECT nome,
         CASE WHEN juridica THEN 'juridica'::tipo_pessoa ELSE 'fisica'::tipo_pessoa END,
         documento,
         telefone,
         email,
         i % 29 <> 0,
         now() - INTERVAL '195 days' + (i * INTERVAL '12 hours'),
         now() - INTERVAL '195 days' + (i * INTERVAL '12 hours')
  FROM comemail
  RETURNING id, cpf_cnpj
)
INSERT INTO seed_tmp.cliente (ord, id)
SELECT c.i, ins.id
FROM comemail c
JOIN inseridas ins ON ins.cpf_cnpj = c.documento;

INSERT INTO public.endereco
  (id_cliente, cep, logradouro, numero, complemento, bairro, cidade, uf, ponto_referencia, criado_em, atualizado_em)
SELECT t.id,
       lpad((75000000 + t.ord * 371)::text, 8, '0'),
       (ARRAY['Rua das Acacias','Avenida Brasil','Rua Goias','Avenida Rio Verde','Rua Sete de Setembro',
              'Rua Jose Bonifacio','Avenida Presidente Vargas','Rua Santa Rita','Rua dos Ipes','Avenida Central'])
         [1 + (t.ord * 3) % 10],
       (100 + (t.ord * 17) % 1800)::text,
       CASE WHEN t.ord % 5 = 0 THEN 'Apto ' || (10 + t.ord % 80)::text ELSE NULL END,
       (ARRAY['Centro','Jardim Goias','Vila Nova','Setor Oeste','Bairro Industrial',
              'Jardim America','Setor Sul','Residencial Primavera'])
         [1 + (t.ord * 5) % 8],
       (ARRAY['Rio Verde','Goiania','Jatai','Mineiros','Santa Helena de Goias','Quirinopolis'])
         [1 + (t.ord * 7) % 6],
       'GO',
       CASE WHEN t.ord % 11 = 0 THEN 'Proximo ao posto da rodovia' ELSE NULL END,
       now() - INTERVAL '195 days' + (t.ord * INTERVAL '12 hours'),
       now() - INTERVAL '195 days' + (t.ord * INTERVAL '12 hours')
FROM seed_tmp.cliente t;

-- -----------------------------------------------------------------------------
-- 6. Veiculos (120). Os 20 primeiros clientes tem dois veiculos.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS seed_tmp.veiculo;
CREATE TABLE seed_tmp.veiculo (ord INT PRIMARY KEY, id UUID NOT NULL);

WITH fontes AS (
  SELECT i,
    (ARRAY['Volkswagen|Gol 1.6','Volkswagen|Voyage 1.6','Chevrolet|Onix 1.0 Turbo','Chevrolet|Prisma 1.4',
           'Fiat|Argo Drive 1.3','Fiat|Strada Freedom','Fiat|Uno Way','Ford|Ka SE 1.0',
           'Ford|Ranger XLS 3.2','Toyota|Corolla XEi 2.0','Toyota|Hilux SRV','Hyundai|HB20 Comfort',
           'Renault|Kwid Zen','Jeep|Renegade Longitude','Honda|Civic EXL'])
      [1 + (i * 11) % 15] AS marca_modelo,
    (ARRAY['Branco','Prata','Preto','Cinza','Vermelho','Azul','Bege'])[1 + (i * 3) % 7] AS cor
  FROM generate_series(1, 120) AS i
),
montados AS (
  SELECT i, cor,
    split_part(marca_modelo, '|', 1) AS marca,
    split_part(marca_modelo, '|', 2) AS modelo,
    chr(65 + ((i - 1) / 26) % 26) || chr(65 + (i - 1) % 26) || 'A'
      || (i % 10)::text || 'B' || lpad(((i * 7) % 100)::text, 2, '0') AS placa,
    (2008 + (i * 5) % 16)::smallint AS ano,
    20000 + (i * 1733) % 200000 AS km
  FROM fontes
),
inseridos AS (
  INSERT INTO public.veiculo
    (id_cliente, placa, modelo, marca, ano, cor, km_atual, observacoes, ativo, criado_em, atualizado_em)
  SELECT c.id, m.placa, m.modelo, m.marca, m.ano, m.cor, m.km,
         CASE WHEN m.i % 9 = 0 THEN 'Veiculo de frota. Cliente pede nota detalhada por item.' ELSE NULL END,
         true,
         now() - INTERVAL '190 days' + (m.i * INTERVAL '8 hours'),
         now() - INTERVAL '190 days' + (m.i * INTERVAL '8 hours')
  FROM montados m
  JOIN seed_tmp.cliente c ON c.ord = 1 + (m.i - 1) % 100
  RETURNING id, placa
)
INSERT INTO seed_tmp.veiculo (ord, id)
SELECT m.i, ins.id FROM montados m JOIN inseridos ins ON ins.placa = m.placa;

-- -----------------------------------------------------------------------------
-- 7. Equipe disponivel para atribuicao.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS seed_tmp.equipe;
CREATE TABLE seed_tmp.equipe (papel TEXT, ord INT, id UUID, id_usuario UUID);

INSERT INTO seed_tmp.equipe (papel, ord, id, id_usuario)
SELECT 'mecanico', row_number() OVER (ORDER BY nome), id, id_usuario
  FROM public.funcionario WHERE cargo = 'mecanico' AND ativo;

INSERT INTO seed_tmp.equipe (papel, ord, id, id_usuario)
SELECT 'atendente', row_number() OVER (ORDER BY (cargo = 'atendente') DESC, nome), id, id_usuario
  FROM public.funcionario WHERE cargo IN ('atendente', 'gestor') AND ativo;

-- -----------------------------------------------------------------------------
-- 8. Ordens de servico (250).
--    100 na janela ANTERIOR (dia -180 a -91) e 150 na janela ATUAL (-90 a -2):
--    a diferenca de volume e o que faz as comparacoes do Painel IA terem sinal.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS seed_tmp.os;
CREATE TABLE seed_tmp.os (
  ord INT PRIMARY KEY,
  id UUID,
  abertura TIMESTAMPTZ NOT NULL,
  encerramento TIMESTAMPTZ,
  status_alvo TEXT NOT NULL,
  desconto_tipo TEXT,
  desconto_valor NUMERIC(10,2),
  desconto_percentual NUMERIC(5,2),
  forma_pagamento TEXT
);

INSERT INTO seed_tmp.os (ord, abertura, status_alvo, desconto_tipo, desconto_valor, desconto_percentual, forma_pagamento)
SELECT i,
       CASE WHEN i <= 100
         THEN now() - INTERVAL '180 days' + (i * INTERVAL '0.89 days')
         ELSE now() - INTERVAL '90 days' + ((i - 100) * INTERVAL '0.586 days')
       END,
       CASE
         WHEN i <= 100 THEN
           CASE WHEN i % 25 = 0 THEN 'cancelada'
                WHEN i % 50 = 7 THEN 'aguardando_peca'
                WHEN i % 50 = 23 THEN 'em_andamento'
                ELSE 'concluida' END
         ELSE
           CASE WHEN i > 242 THEN 'aberta'
                WHEN i > 236 THEN 'em_andamento'
                WHEN i % 23 = 0 THEN 'cancelada'
                WHEN i % 17 = 0 THEN 'aguardando_peca'
                WHEN i % 13 = 0 THEN 'em_andamento'
                ELSE 'concluida' END
       END,
       CASE WHEN i % 9 = 0 THEN 'pct' WHEN i % 14 = 0 THEN 'valor' ELSE NULL END,
       CASE WHEN i % 14 = 0 AND i % 9 <> 0 THEN 30.00 ELSE 0 END,
       CASE WHEN i % 9 = 0 THEN 5.00 ELSE NULL END,
       (ARRAY['pix','dinheiro','cartao_credito','cartao_debito','transferencia'])[1 + (i * 3) % 5]
FROM generate_series(1, 250) AS i;

WITH contagens AS (
  SELECT (SELECT count(*) FROM seed_tmp.equipe WHERE papel = 'mecanico')::int AS mecanicos,
         (SELECT count(*) FROM seed_tmp.equipe WHERE papel = 'atendente')::int AS atendentes
),
alvo AS (
  SELECT t.*,
         1 + (t.ord % c.mecanicos) AS ord_mecanico,
         1 + (t.ord % c.atendentes) AS ord_atendente
  FROM seed_tmp.os t CROSS JOIN contagens c
),
inseridas AS (
  INSERT INTO public.ordem_servico
    (id_veiculo, id_usuario, id_mecanico, id_atendente, descricao, diagnostico,
     status, prioridade, data_abertura, km_entrada, observacoes, criado_em, atualizado_em)
  SELECT v.id,
         COALESCE(a.id_usuario, (current_setting('request.jwt.claims')::json ->> 'sub')::uuid),
         m.id,
         a.id,
         (ARRAY['Cliente relata ruido na suspensao ao passar em lombadas.',
                'Revisao preventiva de 10.000 km solicitada pelo cliente.',
                'Veiculo apresenta perda de potencia em subidas.',
                'Luz de injecao acesa no painel desde a semana passada.',
                'Freio com ruido metalico e pedal baixo.',
                'Vazamento de fluido sob o motor identificado pelo cliente.',
                'Ar-condicionado nao gela e exala odor.',
                'Motor esquentando acima da metade do marcador.',
                'Dificuldade de partida a frio pela manha.',
                'Troca de oleo e filtros conforme plano de manutencao.',
                'Direcao puxando para a direita apos trocar pneus.',
                'Cambio engasgando na passagem de segunda para terceira.'])
           [1 + (al.ord * 5) % 12],
         CASE WHEN al.status_alvo = 'aberta' THEN NULL
           ELSE (ARRAY['Constatado desgaste do componente e necessidade de substituicao.',
                       'Diagnostico eletronico apontou falha no sensor. Pecas orcadas e aprovadas.',
                       'Folga excessiva identificada no conjunto. Reparo executado conforme manual.',
                       'Sistema testado sob pressao; vazamento localizado e vedado.',
                       'Desgaste natural por quilometragem. Recomendada revisao em 10.000 km.'])
                  [1 + (al.ord * 7) % 5]
         END,
         'aberta'::status_os,
         (ARRAY['normal','normal','normal','alta','baixa','urgente'])[1 + (al.ord * 11) % 6],
         al.abertura,
         25000 + (al.ord * 911) % 190000,
         CASE WHEN al.ord % 8 = 0 THEN 'Cliente aguarda na oficina. Priorizar entrega no mesmo dia.' ELSE NULL END,
         al.abertura,
         al.abertura
  FROM alvo al
  JOIN seed_tmp.veiculo v ON v.ord = 1 + (al.ord * 7) % 120
  JOIN seed_tmp.equipe m ON m.papel = 'mecanico' AND m.ord = al.ord_mecanico
  JOIN seed_tmp.equipe a ON a.papel = 'atendente' AND a.ord = al.ord_atendente
  ORDER BY al.ord
  RETURNING id, data_abertura
)
-- O mapeamento usa `data_abertura`, nao `numero_os`. O PostgreSQL nao garante
-- que `nextval` seja atribuido na ordem do `ORDER BY` de um INSERT ... SELECT:
-- se o plano emitisse as linhas permutadas, cada OS receberia um id valido mas
-- ligado a outra linha de seed_tmp.os, e status, desconto e encerramento sairiam
-- cruzados sem nenhuma pos-condicao perceber. `abertura` e unica por `ord`.
UPDATE seed_tmp.os t SET id = ins.id
FROM inseridas ins
WHERE ins.data_abertura = t.abertura;

DO $$
DECLARE v_sem_id INT; v_dup INT;
BEGIN
  SELECT count(*) INTO v_sem_id FROM seed_tmp.os WHERE id IS NULL;
  IF v_sem_id > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % OS sem id mapeado.', v_sem_id;
  END IF;
  SELECT count(*) INTO v_dup FROM (SELECT id FROM seed_tmp.os GROUP BY id HAVING count(*) > 1) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % id(s) de OS mapeado(s) para mais de uma linha.', v_dup;
  END IF;
END;
$$;

-- Itens da OS. Servicos sempre; pecas em ~86% das OS.
INSERT INTO public.os_servico (id_os, id_servico, descricao, quantidade, valor_unitario, criado_em)
SELECT t.id, s.id, s.nome, 1, s.preco, t.abertura
FROM seed_tmp.os t
CROSS JOIN LATERAL (
  SELECT sc.id, sc.nome, sc.preco
    FROM public.servico_catalogo sc
   ORDER BY md5(t.ord::text || sc.nome)
   LIMIT 1 + (t.ord % 3)
) s;

INSERT INTO public.os_peca (id_os, id_item, descricao, quantidade, valor_unitario, criado_em)
SELECT t.id, i.id, i.nome, 1 + (t.ord % 3), i.preco_unit, t.abertura
FROM seed_tmp.os t
CROSS JOIN LATERAL (
  SELECT ie.id, ie.nome, ie.preco_unit
    FROM public.item_estoque ie
   ORDER BY md5(t.ord::text || ie.codigo)
   LIMIT 1 + (t.ord % 2)
) i
WHERE t.ord % 7 <> 0;

-- Encerramento planejado: sempre depois da abertura e antes de agora, senao o
-- calculo de duracao do Painel IA descarta a OS.
UPDATE seed_tmp.os
   SET encerramento = least(
         abertura + ((4 + (ord % 9) * 20) * INTERVAL '1 hour') + ((ord % 5) * INTERVAL '1 day'),
         now() - INTERVAL '3 hours'
       )
 WHERE status_alvo = 'concluida';

-- -----------------------------------------------------------------------------
-- 9. Finalizacao pelo RPC. Gera ledger, `os_baixa_estoque` e o snapshot de
--    comissao; o encerramento e retrodatado em seguida, junto das movimentacoes
--    que o RPC acabou de gravar com `now()`.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_total INT := 0;
BEGIN
  FOR r IN SELECT * FROM seed_tmp.os WHERE status_alvo = 'concluida' ORDER BY ord LOOP
    PERFORM public.finalizar_ordem_servico(
      r.id,
      COALESCE(r.desconto_tipo, 'valor')::varchar,
      COALESCE(r.desconto_valor, 0),
      r.desconto_percentual,
      r.forma_pagamento::varchar,
      'Servico concluido e veiculo entregue ao cliente.'
    );

    -- Sem `app.finalizacao_os` de proposito: `trg_os_guard_finalizacao` e
    -- BEFORE UPDATE OF status, e este UPDATE nao toca o status, entao o guard
    -- nem dispara. Ligar a GUC aqui seria inocuo e ensinaria o padrao errado.
    UPDATE public.ordem_servico
       SET data_encerramento = r.encerramento
     WHERE id = r.id;

    UPDATE public.movimentacao_estoque
       SET data_hora = r.encerramento
     WHERE id_os = r.id;

    UPDATE public.os_baixa_estoque
       SET atualizado_em = r.encerramento
     WHERE id_os = r.id;

    v_total := v_total + 1;
  END LOOP;

  RAISE NOTICE 'OS finalizadas pelo RPC: %.', v_total;
END;
$$;

-- Status restantes. O guard so barra a transicao PARA `concluida`.
UPDATE public.ordem_servico o
   SET status = t.status_alvo::status_os
  FROM seed_tmp.os t
 WHERE o.id = t.id AND t.status_alvo NOT IN ('concluida', 'aberta');

-- Valores das OS nao concluidas, para a lista e o PDF nao mostrarem zero.
-- A OS concluida nao entra: seu `valor_total` ja saiu do RPC com desconto.
UPDATE public.ordem_servico o
   SET valor_servicos = c.servicos,
       valor_pecas = c.pecas,
       valor_total = c.servicos + c.pecas
  FROM seed_tmp.os t
  JOIN LATERAL (
    SELECT COALESCE((SELECT round(sum(quantidade * valor_unitario), 2) FROM public.os_servico WHERE id_os = t.id), 0) AS servicos,
           COALESCE((SELECT round(sum(quantidade * valor_unitario), 2) FROM public.os_peca WHERE id_os = t.id), 0) AS pecas
  ) c ON true
 WHERE o.id = t.id AND t.status_alvo <> 'concluida';

UPDATE public.ordem_servico o
   SET observacoes_finais = 'OS cancelada a pedido do cliente. Nenhuma peca foi aplicada.'
  FROM seed_tmp.os t
 WHERE o.id = t.id AND t.status_alvo = 'cancelada';

-- -----------------------------------------------------------------------------
-- 10. Itens criticos. Sem isto todo item fica acima do minimo, `itens_criticos`
--     volta zero e os blocos de alerta do Painel IA nascem vazios.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_alvo NUMERIC(10,2);
  v_baixa NUMERIC(10,2);
  v_itens INT := 0;
BEGIN
  FOR r IN
    SELECT id, quantidade, qtd_minima
      FROM public.item_estoque
     ORDER BY md5('critico' || codigo)
     LIMIT 8
  LOOP
    v_alvo := greatest(0, floor(r.qtd_minima * 0.6));
    v_baixa := r.quantidade - v_alvo;
    IF v_baixa > 0 THEN
      INSERT INTO public.movimentacao_estoque
        (id_item, id_usuario, tipo, quantidade, motivo, data_hora, origem)
      VALUES (r.id,
              (current_setting('request.jwt.claims')::json ->> 'sub')::uuid,
              'saida', v_baixa, 'Consumo interno da oficina',
              now() - INTERVAL '15 days', 'manual');
      v_itens := v_itens + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Itens levados a situacao critica: %.', v_itens;
END;
$$;

-- Algumas entradas de reposicao recentes, para o historico de estoque ter os
-- dois sentidos dentro da janela de 90 dias.
INSERT INTO public.movimentacao_estoque
  (id_item, id_usuario, tipo, quantidade, motivo, data_hora, origem)
SELECT ie.id,
       (current_setting('request.jwt.claims')::json ->> 'sub')::uuid,
       'entrada',
       10 + (right(ie.codigo, 3)::int % 4) * 5,
       'Reposicao de fornecedor',
       now() - ((20 + right(ie.codigo, 3)::int % 50) * INTERVAL '1 day'),
       'manual'
FROM public.item_estoque ie
WHERE right(ie.codigo, 3)::int % 5 = 0;

-- -----------------------------------------------------------------------------
-- 11. Pos-condicoes. Falham a transacao inteira: seed pela metade e pior que
--     seed nenhum, porque a tela mostra numero sem denunciar a lacuna.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_clientes INT; v_veiculos INT; v_itens INT; v_servicos INT; v_os INT;
  v_concluidas INT; v_sem_comissao INT; v_sem_baixa INT; v_negativos INT;
  v_datas_invalidas INT; v_mov INT; v_janela_atual INT; v_janela_anterior INT;
  v_criticos INT; v_faturamento NUMERIC; v_comissao NUMERIC;
  v_sem_custo INT;
BEGIN
  -- `custo = 0` entra na conta, nao so `NULL`: a migracao 28 escolhe a
  -- sentinela do INSERT por nao gestor conforme a nulidade da coluna, e com
  -- `custo` NOT NULL (o caso do banco publicado) a sentinela e `0`. Checar so
  -- `IS NULL` deixaria a rede decorativa — todo o estoque podia nascer com
  -- custo zerado e o seed imprimiria "Seed concluido". Nenhum item deste seed
  -- tem custo zero legitimo: o menor e 4.50.
  SELECT count(*) INTO v_sem_custo
    FROM public.item_estoque WHERE custo IS NULL OR custo = 0;
  SELECT count(*) INTO v_clientes FROM public.cliente;
  SELECT count(*) INTO v_veiculos FROM public.veiculo;
  SELECT count(*) INTO v_itens FROM public.item_estoque;
  SELECT count(*) INTO v_servicos FROM public.servico_catalogo;
  SELECT count(*) INTO v_os FROM public.ordem_servico;
  SELECT count(*) INTO v_concluidas FROM public.ordem_servico WHERE status = 'concluida';
  SELECT count(*) INTO v_mov FROM public.movimentacao_estoque;
  SELECT count(*) INTO v_negativos FROM public.item_estoque WHERE quantidade < 0;
  SELECT count(*) INTO v_criticos FROM public.item_estoque WHERE quantidade <= qtd_minima;

  SELECT count(*) INTO v_datas_invalidas
    FROM public.ordem_servico
   WHERE status = 'concluida'
     AND (data_encerramento IS NULL OR data_encerramento < data_abertura OR data_encerramento > now());

  SELECT count(*) INTO v_sem_comissao
    FROM public.ordem_servico o
   WHERE o.status = 'concluida'
     AND NOT EXISTS (SELECT 1 FROM public.os_comissao c WHERE c.id_os = o.id);

  SELECT count(*) INTO v_sem_baixa
    FROM public.ordem_servico o
   WHERE o.status = 'concluida'
     AND EXISTS (SELECT 1 FROM public.os_peca p WHERE p.id_os = o.id AND p.id_item IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.os_baixa_estoque b WHERE b.id_os = o.id);

  SELECT count(*) INTO v_janela_atual
    FROM public.ordem_servico WHERE data_abertura >= now() - INTERVAL '90 days';
  SELECT count(*) INTO v_janela_anterior
    FROM public.ordem_servico
   WHERE data_abertura >= now() - INTERVAL '180 days' AND data_abertura < now() - INTERVAL '90 days';

  SELECT COALESCE(sum(valor_total), 0) INTO v_faturamento
    FROM public.ordem_servico
   WHERE status = 'concluida' AND data_encerramento >= now() - INTERVAL '90 days';

  SELECT COALESCE(sum(valor), 0) INTO v_comissao FROM public.os_comissao;

  IF v_negativos > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % item(ns) com saldo negativo.', v_negativos;
  END IF;
  IF v_datas_invalidas > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % OS concluida(s) com encerramento invalido.', v_datas_invalidas;
  END IF;
  IF v_sem_comissao > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % OS concluida(s) sem snapshot em os_comissao.', v_sem_comissao;
  END IF;
  IF v_sem_baixa > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % OS concluida(s) com peca de estoque e sem baixa.', v_sem_baixa;
  END IF;
  IF v_janela_atual = 0 OR v_janela_anterior = 0 THEN
    RAISE EXCEPTION 'Seed abortado: uma das janelas de 90 dias ficou vazia (atual %, anterior %).',
      v_janela_atual, v_janela_anterior;
  END IF;
  IF v_criticos = 0 THEN
    RAISE EXCEPTION 'Seed abortado: nenhum item critico. O Painel IA nasceria sem alertas de estoque.';
  END IF;
  IF v_comissao = 0 THEN
    RAISE EXCEPTION 'Seed abortado: todo o snapshot de comissao ficou zerado.';
  END IF;
  -- O RF09 e a RN35 derivam a margem de `custo` + `preco_unit`. O guard
  -- `trg_item_estoque_guard_custo` (migracoes 19 e 28) descarta o custo EM
  -- SILENCIO, sem erro, quando quem grava nao e gestor — e e exatamente o que
  -- acontece se as claims forjadas no bloco 0 nao valerem no INSERT dos itens.
  IF v_sem_custo > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % item(ns) sem custo gravado (claims de gestor perdidas?).', v_sem_custo;
  END IF;

  -- O iaController le `movimentacao_estoque` sem `.limit()`, entao o teto de
  -- linhas do PostgREST (1000 por padrao) truncaria o ledger em silencio e as
  -- metricas de consumo sairiam menores que a realidade.
  IF v_mov > 900 THEN
    RAISE WARNING 'Ledger com % linhas: perto do teto de 1000 do PostgREST, que truncaria as metricas de estoque do Painel IA.', v_mov;
  END IF;

  RAISE NOTICE '--- Seed concluido ---';
  RAISE NOTICE 'Clientes: % | Veiculos: % | Itens: % | Servicos no catalogo: %',
    v_clientes, v_veiculos, v_itens, v_servicos;
  RAISE NOTICE 'OS: % (concluidas %) | Aberturas 90d: % | Aberturas 90d anteriores: %',
    v_os, v_concluidas, v_janela_atual, v_janela_anterior;
  RAISE NOTICE 'Movimentacoes: % | Itens criticos: % | Faturamento 90d: % | Comissao total: %',
    v_mov, v_criticos, v_faturamento, v_comissao;
END;
$$;

-- Area de trabalho descartada. `CASCADE` porque so ha tabelas do proprio seed.
DROP SCHEMA IF EXISTS seed_tmp CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
