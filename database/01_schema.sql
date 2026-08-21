-- =============================================================================
-- SIGAuto - Schema Principal
-- Arquivo: 01_schema.sql
-- Descrição: Criação de tipos ENUM, tabelas e triggers do banco de dados
-- =============================================================================

-- -----------------------------------------------------------------------------
-- LIMPEZA (permite reexecutar sem erro)
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.fn_handle_new_auth_user() CASCADE;
DROP FUNCTION IF EXISTS public.fn_set_atualizado_em() CASCADE;

DROP TABLE IF EXISTS log_auditoria          CASCADE;
DROP TABLE IF EXISTS recomendacao_ia        CASCADE;
DROP TABLE IF EXISTS mensagem_chatbot       CASCADE;
DROP TABLE IF EXISTS movimentacao_estoque   CASCADE;
DROP TABLE IF EXISTS servico_catalogo       CASCADE;
DROP TABLE IF EXISTS item_estoque           CASCADE;
DROP TABLE IF EXISTS ordem_servico          CASCADE;
DROP TABLE IF EXISTS veiculo                CASCADE;
DROP TABLE IF EXISTS cliente                CASCADE;
DROP TABLE IF EXISTS usuario                CASCADE;

DROP TABLE IF EXISTS veiculos               CASCADE;
DROP TABLE IF EXISTS clientes               CASCADE;

DROP TYPE IF EXISTS perfil_usuario          CASCADE;
DROP TYPE IF EXISTS status_os               CASCADE;
DROP TYPE IF EXISTS tipo_movimentacao       CASCADE;
DROP TYPE IF EXISTS tipo_pessoa             CASCADE;

-- -----------------------------------------------------------------------------
-- ENUM TYPES
-- -----------------------------------------------------------------------------

CREATE TYPE perfil_usuario AS ENUM ('gestor', 'atendente', 'mecanico');
CREATE TYPE status_os AS ENUM ('aberta', 'em_andamento', 'aguardando_peca', 'concluida', 'cancelada');
CREATE TYPE tipo_movimentacao AS ENUM ('entrada', 'saida', 'ajuste');
CREATE TYPE tipo_pessoa AS ENUM ('fisica', 'juridica');

-- -----------------------------------------------------------------------------
-- TABELA: usuario
-- Vinculada ao auth.users do Supabase via FK
-- -----------------------------------------------------------------------------

CREATE TABLE usuario (
  id            UUID          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome          VARCHAR(120)  NOT NULL,
  email         VARCHAR(150)  NOT NULL UNIQUE,
  perfil        perfil_usuario NOT NULL DEFAULT 'atendente',
  telefone      VARCHAR(20),
  comissao_percentual DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (comissao_percentual >= 0 AND comissao_percentual <= 100),
  comissao_sobre_servicos BOOLEAN NOT NULL DEFAULT false,
  comissao_sobre_pecas    BOOLEAN NOT NULL DEFAULT false,
  ativo         BOOLEAN       NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE usuario IS 'Usuários do sistema, espelhados a partir do auth.users do Supabase';
COMMENT ON COLUMN usuario.perfil IS 'Papel do usuário: gestor, atendente ou mecanico';

-- Espelha automaticamente usuarios criados diretamente no Supabase Auth.
-- Isso evita logins sem perfil quando a conta e criada pelo painel Authentication.
CREATE OR REPLACE FUNCTION public.fn_handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    CASE
      WHEN NEW.raw_user_meta_data->>'perfil' IN ('gestor', 'atendente', 'mecanico')
        THEN (NEW.raw_user_meta_data->>'perfil')::perfil_usuario
      WHEN lower(NEW.email) = 'gestor@sigauto.com' THEN 'gestor'::perfil_usuario
      WHEN lower(NEW.email) = 'atendente@sigauto.com' THEN 'atendente'::perfil_usuario
      WHEN lower(NEW.email) = 'mecanico@sigauto.com' THEN 'mecanico'::perfil_usuario
      ELSE 'atendente'::perfil_usuario
    END,
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nome = EXCLUDED.nome,
        perfil = EXCLUDED.perfil,
        ativo = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_handle_new_auth_user();

-- Backfill para contas do Auth que ja existiam antes deste schema/trigger.
INSERT INTO public.usuario (id, nome, email, perfil, ativo)
SELECT
  au.id,
  COALESCE(
    NULLIF(au.raw_user_meta_data->>'nome', ''),
    NULLIF(au.raw_user_meta_data->>'name', ''),
    split_part(au.email, '@', 1),
    'Usuario'
  ),
  au.email,
  CASE
    WHEN au.raw_user_meta_data->>'perfil' IN ('gestor', 'atendente', 'mecanico')
      THEN (au.raw_user_meta_data->>'perfil')::perfil_usuario
    WHEN lower(au.email) = 'gestor@sigauto.com' THEN 'gestor'::perfil_usuario
    WHEN lower(au.email) = 'atendente@sigauto.com' THEN 'atendente'::perfil_usuario
    WHEN lower(au.email) = 'mecanico@sigauto.com' THEN 'mecanico'::perfil_usuario
    ELSE 'atendente'::perfil_usuario
  END,
  true
FROM auth.users au
WHERE au.email IS NOT NULL
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      nome = EXCLUDED.nome,
      perfil = EXCLUDED.perfil,
      ativo = true;

-- -----------------------------------------------------------------------------
-- TABELA: cliente
-- -----------------------------------------------------------------------------

CREATE TABLE cliente (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          VARCHAR(120)  NOT NULL,
  tipo_pessoa   tipo_pessoa   NOT NULL DEFAULT 'fisica',
  cpf_cnpj      VARCHAR(18)   NOT NULL UNIQUE,
  telefone      VARCHAR(20)   NOT NULL,
  email         VARCHAR(150),
  endereco      VARCHAR(255),
  ativo         BOOLEAN       NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cliente IS 'Cadastro de clientes (pessoa física ou jurídica)';
COMMENT ON COLUMN cliente.cpf_cnpj IS 'CPF (pessoa física) ou CNPJ (pessoa jurídica) sem máscara';

-- -----------------------------------------------------------------------------
-- TABELA: veiculo
-- -----------------------------------------------------------------------------

CREATE TABLE veiculo (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cliente    UUID          NOT NULL REFERENCES cliente(id),
  placa         VARCHAR(10)   NOT NULL UNIQUE,
  modelo        VARCHAR(80)   NOT NULL,
  marca         VARCHAR(50)   NOT NULL,
  ano           SMALLINT      NOT NULL
                  CHECK (ano >= 1950 AND ano <= EXTRACT(YEAR FROM NOW())::SMALLINT + 1),
  cor           VARCHAR(30)   NOT NULL,
  km_atual      INT,
  observacoes   TEXT,
  ativo         BOOLEAN       NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE veiculo IS 'Veículos cadastrados vinculados a um cliente';
COMMENT ON COLUMN veiculo.placa IS 'Suporta formato antigo (AAA-9999) e Mercosul (AAA9A99)';

-- -----------------------------------------------------------------------------
-- TABELA: ordem_servico
-- -----------------------------------------------------------------------------

CREATE TABLE ordem_servico (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_os           SERIAL        NOT NULL UNIQUE,
  id_veiculo          UUID          NOT NULL REFERENCES veiculo(id),
  id_usuario          UUID          NOT NULL REFERENCES usuario(id),
  id_mecanico         UUID          REFERENCES usuario(id),
  id_atendente        UUID          REFERENCES usuario(id),
  descricao           TEXT          NOT NULL,
  diagnostico         TEXT,
  status              status_os     NOT NULL DEFAULT 'aberta',
  prioridade          VARCHAR(20)   NOT NULL DEFAULT 'normal'
                        CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  data_abertura       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  data_encerramento   TIMESTAMPTZ,
  km_entrada          INT,
  valor_total         DECIMAL(10,2) DEFAULT 0,
  valor_servicos      DECIMAL(10,2) DEFAULT 0,
  valor_pecas         DECIMAL(10,2) DEFAULT 0,
  valor_comissao_mecanico  DECIMAL(10,2) DEFAULT 0,
  valor_comissao_atendente DECIMAL(10,2) DEFAULT 0,
  comissao_detalhes   JSONB         DEFAULT NULL,
  servicos_itens      JSONB         NOT NULL DEFAULT '[]'::jsonb,
  pecas_itens         JSONB         NOT NULL DEFAULT '[]'::jsonb,
  forma_pagamento     VARCHAR(30),
  observacoes         TEXT,
  criado_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ordem_servico IS 'Ordens de serviço abertas para veículos';
COMMENT ON COLUMN ordem_servico.numero_os IS 'Número sequencial legível da OS (ex: 1001)';
COMMENT ON COLUMN ordem_servico.id_usuario IS 'Usuário responsável/atendente que abriu a OS';

-- -----------------------------------------------------------------------------
-- TABELA: item_estoque
-- -----------------------------------------------------------------------------

CREATE TABLE item_estoque (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        VARCHAR(30)   NOT NULL UNIQUE,
  nome          VARCHAR(100)  NOT NULL,
  descricao     TEXT,
  unidade       VARCHAR(10)   NOT NULL DEFAULT 'UN'
                  CHECK (unidade IN ('UN', 'PC', 'LT', 'MT', 'KG', 'CX')),
  quantidade    INT           NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  qtd_minima    INT           NOT NULL DEFAULT 1 CHECK (qtd_minima > 0),
  preco_unit    DECIMAL(10,2),
  ativo         BOOLEAN       NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE item_estoque IS 'Catálogo de peças e itens do estoque';
COMMENT ON COLUMN item_estoque.qtd_minima IS 'Quantidade mínima para alerta de reposição';

-- -----------------------------------------------------------------------------
-- TABELA: servico_catalogo
-- -----------------------------------------------------------------------------

CREATE TABLE servico_catalogo (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          VARCHAR(120)  NOT NULL,
  descricao     TEXT,
  preco         DECIMAL(10,2) NOT NULL DEFAULT 0,
  ativo         BOOLEAN       NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE servico_catalogo IS 'Catalogo de servicos que podem ser adicionados as ordens de servico';
COMMENT ON COLUMN servico_catalogo.preco IS 'Valor base do servico';

-- -----------------------------------------------------------------------------
-- TABELA: movimentacao_estoque
-- -----------------------------------------------------------------------------

CREATE TABLE movimentacao_estoque (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  id_item     UUID              NOT NULL REFERENCES item_estoque(id),
  id_os       UUID              REFERENCES ordem_servico(id),
  id_usuario  UUID              NOT NULL REFERENCES usuario(id),
  tipo        tipo_movimentacao NOT NULL,
  quantidade  INT               NOT NULL CHECK (quantidade > 0),
  motivo      VARCHAR(100),
  data_hora   TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE movimentacao_estoque IS 'Histórico de entradas, saídas e ajustes de estoque';
COMMENT ON COLUMN movimentacao_estoque.id_os IS 'OS relacionada à saída (nullable para entradas/ajustes)';

-- -----------------------------------------------------------------------------
-- TABELA: mensagem_chatbot
-- -----------------------------------------------------------------------------

CREATE TABLE mensagem_chatbot (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario  UUID        NOT NULL REFERENCES usuario(id),
  conteudo    TEXT        NOT NULL,
  remetente   VARCHAR(20) NOT NULL CHECK (remetente IN ('usuario', 'chatbot')),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE mensagem_chatbot IS 'Histórico de conversas com o assistente IA';

-- -----------------------------------------------------------------------------
-- TABELA: recomendacao_ia
-- -----------------------------------------------------------------------------

CREATE TABLE recomendacao_ia (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_os             UUID          REFERENCES ordem_servico(id),
  id_usuario        UUID          REFERENCES usuario(id),
  tipo              VARCHAR(60),
  conteudo          TEXT,
  confianca         DECIMAL(5,4),
  dados_analisados  JSONB,
  recomendacoes     JSONB,
  criado_em         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE recomendacao_ia IS 'Recomendações geradas pela IA para OS ou usuários';
COMMENT ON COLUMN recomendacao_ia.confianca IS 'Score de confiança entre 0.0000 e 1.0000';

-- -----------------------------------------------------------------------------
-- TABELA: log_auditoria
-- -----------------------------------------------------------------------------

CREATE TABLE log_auditoria (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario    UUID        REFERENCES usuario(id),
  acao          VARCHAR(60) NOT NULL,
  tabela        VARCHAR(50),
  id_registro   UUID,
  dados_antes   JSONB,
  dados_depois  JSONB,
  ip_origem     VARCHAR(45),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE log_auditoria IS 'Log de auditoria de ações realizadas no sistema';
COMMENT ON COLUMN log_auditoria.dados_antes IS 'Estado do registro antes da alteração (JSON)';
COMMENT ON COLUMN log_auditoria.dados_depois IS 'Estado do registro após a alteração (JSON)';

-- -----------------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------------

-- Buscas frequentes por placa e cliente
CREATE INDEX idx_veiculo_placa        ON veiculo(placa);
CREATE INDEX idx_veiculo_id_cliente   ON veiculo(id_cliente);

-- Filtragem de OS por status, veículo e responsável
CREATE INDEX idx_os_status            ON ordem_servico(status);
CREATE INDEX idx_os_id_veiculo        ON ordem_servico(id_veiculo);
CREATE INDEX idx_os_id_usuario        ON ordem_servico(id_usuario);
CREATE INDEX idx_os_id_mecanico       ON ordem_servico(id_mecanico);
CREATE INDEX idx_os_id_atendente      ON ordem_servico(id_atendente);
CREATE INDEX idx_os_data_abertura     ON ordem_servico(data_abertura);

-- Movimentação de estoque
CREATE INDEX idx_mov_id_item          ON movimentacao_estoque(id_item);
CREATE INDEX idx_mov_id_os            ON movimentacao_estoque(id_os);
CREATE INDEX idx_mov_data_hora        ON movimentacao_estoque(data_hora);

-- Busca de cliente por CPF/CNPJ
CREATE INDEX idx_cliente_cpf_cnpj     ON cliente(cpf_cnpj);

-- Auditoria por usuário e tabela
CREATE INDEX idx_audit_id_usuario     ON log_auditoria(id_usuario);
CREATE INDEX idx_audit_tabela         ON log_auditoria(tabela);
CREATE INDEX idx_audit_criado_em      ON log_auditoria(criado_em);

-- Estoque abaixo do mínimo (partial index)
CREATE INDEX idx_estoque_baixo        ON item_estoque(id) WHERE quantidade < qtd_minima;
CREATE INDEX idx_servico_catalogo_nome ON servico_catalogo(nome) WHERE ativo = true;

-- Chatbot por usuário
CREATE INDEX idx_chatbot_id_usuario   ON mensagem_chatbot(id_usuario);
CREATE INDEX idx_chatbot_criado_em    ON mensagem_chatbot(criado_em);

-- Recomendações por OS
CREATE INDEX idx_recom_id_os          ON recomendacao_ia(id_os);

-- -----------------------------------------------------------------------------
-- TRIGGER FUNCTION: atualiza campo atualizado_em automaticamente
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_set_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_set_atualizado_em() IS 'Atualiza automaticamente o campo atualizado_em antes de cada UPDATE';

-- -----------------------------------------------------------------------------
-- TRIGGERS: aplicados em cada tabela com campo atualizado_em
-- -----------------------------------------------------------------------------

CREATE TRIGGER trg_usuario_atualizado_em
  BEFORE UPDATE ON usuario
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TRIGGER trg_cliente_atualizado_em
  BEFORE UPDATE ON cliente
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TRIGGER trg_veiculo_atualizado_em
  BEFORE UPDATE ON veiculo
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TRIGGER trg_os_atualizado_em
  BEFORE UPDATE ON ordem_servico
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TRIGGER trg_estoque_atualizado_em
  BEFORE UPDATE ON item_estoque
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TRIGGER trg_servico_catalogo_atualizado_em
  BEFORE UPDATE ON servico_catalogo
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();
