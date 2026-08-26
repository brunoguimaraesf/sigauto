-- =============================================================================
-- 13_endereco_cliente.sql
-- Descricao: Estrutura o endereco do cliente, que ate aqui era um unico campo
--   de texto livre (cliente.endereco VARCHAR(255)). Com o texto livre nao era
--   possivel filtrar por cidade ou bairro, nem preencher pelo CEP.
--
--   Cria a entidade `endereco` em relacao 1:1 com `cliente` (id_cliente UNIQUE).
--   Tabela separada, e nao colunas novas em `cliente`, porque endereco e um dado
--   opcional e com ciclo de vida proprio: a maioria dos clientes de balcao nunca
--   informa, e manter sete colunas nulas em `cliente` sujaria a entidade
--   principal. Tambem deixa o caminho aberto para reaproveitar a entidade em
--   fornecedor/oficina sem novo redesenho.
--
-- Script IDEMPOTENTE e TRANSACIONAL. A coluna legada cliente.endereco e
-- MANTIDA: os registros antigos continuam legiveis por ela enquanto o novo
-- cadastro grava estruturado. A remocao fica na Fase 2, comentada no fim.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) TABELA endereco
--    Campos do padrao dos Correios/ViaCEP. `numero` e texto porque na pratica
--    recebe 'S/N', '123-A' e afins.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS endereco (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cliente        UUID          NOT NULL UNIQUE REFERENCES cliente(id) ON DELETE CASCADE,
  cep               CHAR(8),
  logradouro        VARCHAR(150),
  numero            VARCHAR(15),
  complemento       VARCHAR(80),
  bairro            VARCHAR(80),
  cidade            VARCHAR(80),
  uf                CHAR(2),
  ponto_referencia  VARCHAR(120),
  criado_em         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  endereco IS 'Endereco estruturado do cliente (1:1). Substitui o texto livre em cliente.endereco.';
COMMENT ON COLUMN endereco.cep IS 'Somente digitos, sem mascara (8 caracteres).';
COMMENT ON COLUMN endereco.numero IS 'Texto: aceita S/N, 123-A, etc.';

-- -----------------------------------------------------------------------------
-- 2) RESTRICOES DE FORMATO
--    Guardamos CEP sem mascara para a busca ser previsivel, e UF so aceita as
--    27 unidades federativas. Sem isso, "GO " e "go" viram valores distintos.
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE endereco ADD CONSTRAINT chk_endereco_cep
    CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE endereco ADD CONSTRAINT chk_endereco_uf
    CHECK (uf IS NULL OR uf IN (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 3) INDICES
--    id_cliente ja tem indice pelo UNIQUE. Os demais atendem a busca por
--    regiao, que era justamente o que o texto livre impedia.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_endereco_cep         ON endereco (cep);
CREATE INDEX IF NOT EXISTS idx_endereco_cidade_uf   ON endereco (cidade, uf);
CREATE INDEX IF NOT EXISTS idx_endereco_bairro      ON endereco (bairro);

-- -----------------------------------------------------------------------------
-- 4) TRIGGER de atualizado_em (mesma funcao usada pelas demais tabelas)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_endereco_atualizado_em ON endereco;
CREATE TRIGGER trg_endereco_atualizado_em
  BEFORE UPDATE ON endereco
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

-- -----------------------------------------------------------------------------
-- 5) NORMALIZACAO NA ESCRITA
--    O app ja envia limpo, mas o banco nao pode depender disso: qualquer outro
--    cliente da API (ou um INSERT manual) tem de cair no mesmo formato.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_normaliza_endereco()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.cep := NULLIF(regexp_replace(COALESCE(NEW.cep, ''), '[^0-9]', '', 'g'), '');
  NEW.uf  := NULLIF(UPPER(TRIM(COALESCE(NEW.uf, ''))), '');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_normaliza_endereco() IS
  'Grava CEP so com digitos e UF em maiusculas, independente de quem escreve.';

DROP TRIGGER IF EXISTS trg_endereco_normaliza ON endereco;
CREATE TRIGGER trg_endereco_normaliza
  BEFORE INSERT OR UPDATE ON endereco
  FOR EACH ROW EXECUTE FUNCTION fn_normaliza_endereco();

-- -----------------------------------------------------------------------------
-- 6) RLS
--    Tabela nova acessada pelo frontend com a chave anon PRECISA de policies,
--    senao o RLS bloqueia tudo. Espelham as de `cliente`: quem enxerga o
--    cliente enxerga o endereco dele, nas mesmas condicoes.
-- -----------------------------------------------------------------------------
ALTER TABLE endereco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_endereco_gestor_all       ON endereco;
DROP POLICY IF EXISTS pol_endereco_atendente_select ON endereco;
DROP POLICY IF EXISTS pol_endereco_atendente_insert ON endereco;
DROP POLICY IF EXISTS pol_endereco_atendente_update ON endereco;
DROP POLICY IF EXISTS pol_endereco_mecanico_select  ON endereco;

-- Gestor: acesso total
CREATE POLICY pol_endereco_gestor_all ON endereco
  FOR ALL
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');

-- Atendente: SELECT, INSERT, UPDATE (sem DELETE), como em cliente
CREATE POLICY pol_endereco_atendente_select ON endereco
  FOR SELECT
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_endereco_atendente_insert ON endereco
  FOR INSERT
  TO authenticated
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

CREATE POLICY pol_endereco_atendente_update ON endereco
  FOR UPDATE
  TO authenticated
  USING (fn_perfil_usuario_atual() = 'atendente')
  WITH CHECK (fn_perfil_usuario_atual() = 'atendente');

-- Mecanico: le apenas o endereco de cliente com veiculo em OS atribuida a ele.
-- Mesma intencao da pol_cliente_mecanico_select, porem na forma pos-11:
-- id_mecanico aponta para `funcionario`, entao a comparacao direta com
-- auth.uid() (como a policy de cliente ainda faz) nunca casa.
CREATE POLICY pol_endereco_mecanico_select ON endereco
  FOR SELECT
  TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND EXISTS (
      SELECT 1
      FROM veiculo v
      JOIN ordem_servico os ON os.id_veiculo = v.id
      JOIN funcionario f    ON f.id = os.id_mecanico
      WHERE v.id_cliente = endereco.id_cliente
        AND f.id_usuario = auth.uid()
    )
  );

COMMIT;

-- =============================================================================
-- FASE 2 (opcional, so depois que todo endereco relevante estiver estruturado)
-- Remove o campo de texto livre. NAO rode junto: os registros antigos ainda
-- dependem dele, e a quebra de "Av. X, 123 - Cidade - UF" em colunas nao e
-- confiavel o bastante para virar backfill automatico -- acerta no seed e erra
-- em dado digitado a mao, gravando cidade errada onde hoje ha texto correto.
-- O caminho seguro e preencher pela tela, cliente a cliente.
--
-- Antes de rodar, confira quantos ficariam sem endereco nenhum:
--   SELECT COUNT(*) FROM cliente c
--    WHERE c.endereco IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM endereco e WHERE e.id_cliente = c.id);
--
-- BEGIN;
--   ALTER TABLE cliente DROP COLUMN endereco;
-- COMMIT;
-- =============================================================================
