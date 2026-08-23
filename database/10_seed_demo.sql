-- =============================================================================
-- 10_seed_demo.sql
-- Popula o banco com dados realistas para a demonstração do TCC.
-- Gera: 60 clientes, 70 veículos, 65 ordens de serviço, 55 itens de estoque,
--       50 serviços de catálogo e 60 movimentações de estoque.
-- Respeita o schema: CPF/placa/código únicos, enums de status, FKs, e datas
-- dentro dos últimos 90 dias (para o Painel IA analisar).
--
-- COMO USAR: cole e rode no SQL Editor do Supabase. Roda como service role,
-- então ignora RLS. RODE UMA VEZ (re-rodar adiciona MAIS dados).
--
-- Para RESETAR os dados de demo antes de rodar de novo, descomente o bloco abaixo:
-- DELETE FROM movimentacao_estoque;
-- DELETE FROM recomendacao_ia;
-- DELETE FROM ordem_servico;
-- DELETE FROM veiculo;
-- DELETE FROM item_estoque;
-- DELETE FROM servico_catalogo;
-- DELETE FROM cliente;
-- =============================================================================

DO $$
DECLARE
  v_gestor    UUID;
  v_mecanico  UUID;
  v_atendente UUID;
  v_salt      INT := floor(random() * 9000 + 1000)::int;  -- evita colisão entre execuções
  i           INT;

  v_cli_ids   UUID[] := '{}';
  v_veic_ids  UUID[] := '{}';
  v_item_ids  UUID[] := '{}';
  v_new_id    UUID;

  -- pools de dados realistas
  nomes    TEXT[] := ARRAY['João','Maria','José','Ana','Pedro','Carla','Lucas','Fernanda','Bruno','Juliana','Rafael','Camila','Gustavo','Patrícia','Marcos','Aline','Felipe','Beatriz','Rodrigo','Larissa','Thiago','Mariana','Diego','Renata','Eduardo','Vanessa'];
  sobren   TEXT[] := ARRAY['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Ferreira','Rodrigues','Almeida','Nascimento','Carvalho','Araújo','Ribeiro','Gomes','Martins','Rocha','Barbosa','Mendes','Freitas'];
  empresas TEXT[] := ARRAY['Transportadora Rota Sul','Locadora Movida Frota','Comércio Veloz Ltda','Log Express Cargas','Distribuidora Central','Serviços Rápidos ME','Frota Segura S.A.','Auto Peças do Vale'];
  marcas   TEXT[] := ARRAY['Volkswagen|Gol','Volkswagen|Polo','Volkswagen|T-Cross','Fiat|Uno','Fiat|Argo','Fiat|Mobi','Fiat|Toro','Chevrolet|Onix','Chevrolet|Tracker','Chevrolet|S10','Hyundai|HB20','Hyundai|Creta','Ford|Ka','Ford|Ranger','Toyota|Corolla','Toyota|Hilux','Honda|Civic','Honda|Fit','Renault|Kwid','Renault|Sandero','Jeep|Renegade','Jeep|Compass','Nissan|Kicks','Peugeot|208'];
  cores    TEXT[] := ARRAY['Branco','Prata','Preto','Cinza','Vermelho','Azul','Vinho','Bege'];
  cidades  TEXT[] := ARRAY['São Paulo|SP','Rio de Janeiro|RJ','Belo Horizonte|MG','Curitiba|PR','Porto Alegre|RS','Salvador|BA','Goiânia|GO','Rio Verde|GO','Campinas|SP','Brasília|DF'];
  bairros  TEXT[] := ARRAY['Centro','Jardim América','Vila Nova','Setor Bueno','Bairro Industrial','Jardim Paulista','Vila Mariana','Setor Central','Boa Vista','Santa Mônica'];
  descr    TEXT[] := ARRAY['Revisão preventiva dos 20.000 km','Barulho na suspensão dianteira','Troca de óleo e filtros','Ar-condicionado não gela','Freios fazendo ruído','Motor falhando em baixa rotação','Troca de pastilhas de freio','Alinhamento e balanceamento','Vazamento de óleo no motor','Substituição da correia dentada','Bateria descarregando','Check-up geral do veículo','Troca de embreagem','Reparo no sistema elétrico','Troca de amortecedores'];
  servs    TEXT[] := ARRAY['Troca de óleo|120','Alinhamento|80','Balanceamento|60','Revisão completa|450','Troca de pastilhas|200','Troca de correia dentada|650','Diagnóstico eletrônico|150','Troca de embreagem|1200','Higienização do ar|180','Troca de amortecedores|900','Reparo elétrico|300','Troca de bateria|450'];
  pecas    TEXT[] := ARRAY['Filtro de óleo|35','Filtro de ar|45','Pastilha de freio|180','Correia dentada|220','Vela de ignição|40','Amortecedor|380','Bateria|420','Óleo 5W30 1L|48','Pneu aro 15|350','Disco de freio|260','Kit embreagem|780','Lâmpada H4|25'];
  itens    TEXT[] := ARRAY['Filtro de óleo','Filtro de ar','Filtro de combustível','Pastilha de freio dianteira','Pastilha de freio traseira','Correia dentada','Vela de ignição','Amortecedor dianteiro','Amortecedor traseiro','Bateria 60Ah','Óleo motor 5W30','Óleo motor 15W40','Pneu aro 15','Pneu aro 16','Disco de freio','Kit embreagem','Lâmpada H4','Fluido de freio DOT4','Aditivo de radiador','Palheta do limpador','Correia do alternador','Bomba de água','Coxim do motor','Rolamento de roda','Junta do cabeçote'];
  status_p TEXT[] := ARRAY['concluida','concluida','concluida','concluida','em_andamento','em_andamento','aberta','aberta','aguardando_peca','cancelada'];
  prior_p  TEXT[] := ARRAY['baixa','normal','normal','normal','alta','urgente'];
  pgto_p   TEXT[] := ARRAY['Dinheiro','Pix','Cartão de Crédito','Cartão de Débito','Boleto'];
  unid_p   TEXT[] := ARRAY['UN','PC','LT'];

  v_nome TEXT; v_cid TEXT; v_mm TEXT; v_st TEXT;
  v_svc TEXT; v_pec TEXT; v_serv NUMERIC; v_pecv NUMERIC; v_data TIMESTAMPTZ; v_qtd INT; v_min INT;
BEGIN
  -- Usuários existentes (id_usuario da OS é NOT NULL). Gestor é garantido.
  SELECT id INTO v_gestor    FROM usuario WHERE perfil = 'gestor'    AND ativo LIMIT 1;
  SELECT id INTO v_mecanico  FROM usuario WHERE perfil = 'mecanico'  LIMIT 1;
  SELECT id INTO v_atendente FROM usuario WHERE perfil = 'atendente' LIMIT 1;
  IF v_gestor IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário gestor encontrado. Faça login pelo menos uma vez antes de rodar o seed.';
  END IF;
  v_mecanico  := COALESCE(v_mecanico, v_gestor);
  v_atendente := COALESCE(v_atendente, v_gestor);

  -- ---------- 60 CLIENTES ----------
  FOR i IN 1..60 LOOP
    v_cid := cidades[1 + floor(random()*array_length(cidades,1))::int];
    IF i % 6 = 0 THEN
      -- pessoa jurídica
      v_nome := empresas[1 + floor(random()*array_length(empresas,1))::int];
      INSERT INTO cliente (nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, ativo)
      VALUES (
        v_nome, 'juridica',
        lpad(v_salt::text,2,'0') || lpad(i::text,12,'0'),
        '(' || (11 + i % 80)::text || ') 3' || lpad((1000+i)::text,4,'0') || '-' || lpad((1000+i*3)::text,4,'0'),
        'contato' || i || '@' || lower(split_part(v_nome,' ',1)) || '.com.br',
        'Av. ' || bairros[1 + floor(random()*array_length(bairros,1))::int] || ', ' || (100+i*7) || ' - ' || replace(v_cid,'|',' - '),
        true
      ) RETURNING id INTO v_new_id;
    ELSE
      v_nome := nomes[1 + floor(random()*array_length(nomes,1))::int] || ' ' || sobren[1 + floor(random()*array_length(sobren,1))::int];
      INSERT INTO cliente (nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, ativo)
      VALUES (
        v_nome, 'fisica',
        lpad(v_salt::text,4,'0') || lpad(i::text,7,'0'),
        '(' || (11 + i % 80)::text || ') 9' || lpad((1000+i)::text,4,'0') || '-' || lpad((1000+i*7)::text,4,'0'),
        lower(replace(v_nome,' ','.')) || i || '@email.com',
        'Rua ' || bairros[1 + floor(random()*array_length(bairros,1))::int] || ', ' || (10+i*3) || ' - ' || replace(v_cid,'|',' - '),
        true
      ) RETURNING id INTO v_new_id;
    END IF;
    v_cli_ids := array_append(v_cli_ids, v_new_id);
  END LOOP;

  -- ---------- 70 VEÍCULOS ----------
  FOR i IN 1..70 LOOP
    v_mm := marcas[1 + floor(random()*array_length(marcas,1))::int];
    INSERT INTO veiculo (id_cliente, placa, marca, modelo, ano, cor, km_atual, observacoes, ativo)
    VALUES (
      v_cli_ids[1 + floor(random()*array_length(v_cli_ids,1))::int],
      chr(65 + (i/26)%26) || chr(65 + i%26) || chr(65 + (v_salt+i)%26) || (i%10)::text || chr(65 + (i*3)%26) || lpad((i%100)::text,2,'0'),
      split_part(v_mm,'|',1), split_part(v_mm,'|',2),
      (2008 + floor(random()*18))::smallint,
      cores[1 + floor(random()*array_length(cores,1))::int],
      (20000 + floor(random()*180000))::int,
      NULL, true
    ) RETURNING id INTO v_new_id;
    v_veic_ids := array_append(v_veic_ids, v_new_id);
  END LOOP;

  -- ---------- 50 SERVIÇOS DE CATÁLOGO ----------
  FOR i IN 1..50 LOOP
    v_svc := servs[1 + floor(random()*array_length(servs,1))::int];
    INSERT INTO servico_catalogo (nome, descricao, preco, ativo)
    VALUES (
      split_part(v_svc,'|',1) || ' - Pacote ' || i,
      'Serviço de ' || lower(split_part(v_svc,'|',1)) || ' com mão de obra especializada.',
      (split_part(v_svc,'|',2)::numeric + floor(random()*100)),
      true
    );
  END LOOP;

  -- ---------- 55 ITENS DE ESTOQUE ----------
  FOR i IN 1..55 LOOP
    v_qtd := floor(random()*80)::int;
    v_min := (3 + floor(random()*12))::int;
    -- ~30% ficam abaixo do mínimo (gera alertas para o Painel IA)
    IF i % 3 = 0 THEN v_qtd := floor(random()*v_min)::int; END IF;
    INSERT INTO item_estoque (codigo, nome, descricao, unidade, quantidade, qtd_minima, preco_unit, ativo)
    VALUES (
      'PC' || lpad(v_salt::text,4,'0') || lpad(i::text,4,'0'),
      itens[1 + ((i-1) % array_length(itens,1))] || CASE WHEN i > array_length(itens,1) THEN ' (ref. ' || i || ')' ELSE '' END,
      'Peça automotiva de reposição.',
      unid_p[1 + floor(random()*array_length(unid_p,1))::int],
      v_qtd, v_min,
      (20 + floor(random()*600))::numeric(10,2),
      true
    ) RETURNING id INTO v_new_id;
    v_item_ids := array_append(v_item_ids, v_new_id);
  END LOOP;

  -- ---------- 65 ORDENS DE SERVIÇO ----------
  FOR i IN 1..65 LOOP
    v_st  := status_p[1 + floor(random()*array_length(status_p,1))::int];
    v_svc := servs[1 + floor(random()*array_length(servs,1))::int];
    v_pec := pecas[1 + floor(random()*array_length(pecas,1))::int];
    v_serv := split_part(v_svc,'|',2)::numeric * (1 + floor(random()*2));
    v_pecv := split_part(v_pec,'|',2)::numeric * (1 + floor(random()*3));
    v_data := NOW() - (floor(random()*89) || ' days')::interval - (floor(random()*24) || ' hours')::interval;

    INSERT INTO ordem_servico (
      id_veiculo, id_usuario, id_mecanico, id_atendente,
      descricao, status, prioridade, data_abertura, data_encerramento,
      km_entrada, valor_total, valor_servicos, valor_pecas,
      servicos_itens, pecas_itens, forma_pagamento
    ) VALUES (
      v_veic_ids[1 + floor(random()*array_length(v_veic_ids,1))::int],
      v_gestor, v_mecanico, v_atendente,
      descr[1 + floor(random()*array_length(descr,1))::int],
      v_st::status_os,
      prior_p[1 + floor(random()*array_length(prior_p,1))::int],
      v_data,
      CASE WHEN v_st = 'concluida' THEN v_data + (floor(random()*5)+1 || ' days')::interval ELSE NULL END,
      (20000 + floor(random()*180000))::int,
      v_serv + v_pecv, v_serv, v_pecv,
      jsonb_build_array(jsonb_build_object('descricao', split_part(v_svc,'|',1), 'quantidade', 1, 'valor_unitario', split_part(v_svc,'|',2)::numeric)),
      jsonb_build_array(jsonb_build_object('descricao', split_part(v_pec,'|',1), 'quantidade', 1 + floor(random()*3)::int, 'valor_unitario', split_part(v_pec,'|',2)::numeric)),
      CASE WHEN v_st = 'concluida' THEN pgto_p[1 + floor(random()*array_length(pgto_p,1))::int] ELSE NULL END
    );
  END LOOP;

  -- ---------- 60 MOVIMENTAÇÕES DE ESTOQUE ----------
  FOR i IN 1..60 LOOP
    INSERT INTO movimentacao_estoque (id_item, id_usuario, tipo, quantidade, motivo, data_hora)
    VALUES (
      v_item_ids[1 + floor(random()*array_length(v_item_ids,1))::int],
      v_gestor,
      (ARRAY['entrada','saida','saida','entrada','ajuste'])[1 + floor(random()*5)::int]::tipo_movimentacao,
      (1 + floor(random()*20))::int,
      (ARRAY['Compra de fornecedor','Consumo em OS','Ajuste de inventário','Reposição de estoque','Baixa por avaria'])[1 + floor(random()*5)::int],
      NOW() - (floor(random()*89) || ' days')::interval
    );
  END LOOP;

  RAISE NOTICE 'Seed concluído: 60 clientes, 70 veículos, 50 serviços, 55 itens, 65 OS, 60 movimentações.';
END $$;
