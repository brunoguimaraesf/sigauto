-- =============================================================================
-- 11_normalizacao_relacional.sql
-- Descricao: Normaliza o modelo conforme revisao do orientador (secao 10.6 DERS):
--   1) Comissao sai da tabela `usuario` e passa para a nova entidade `funcionario`
--   2) Itens de servico/peca da OS deixam de ser JSONB e viram tabelas
--      relacionais `os_servico` e `os_peca`
--   3) `ordem_servico.id_mecanico` / `id_atendente` passam a referenciar
--      `funcionario` (o colaborador), e `id_usuario` continua referenciando
--      `usuario` (quem registrou a OS no sistema)
--
-- Script IDEMPOTENTE e TRANSACIONAL. Rode DEPOIS de publicar o codigo novo,
-- pois o app antigo ainda le as colunas JSONB (que aqui sao mantidas como
-- deprecated ate a limpeza opcional no fim do arquivo).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) ENUM de cargo do funcionario (mesmos papeis operacionais do usuario)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE cargo_funcionario AS ENUM ('gestor', 'atendente', 'mecanico');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2) TABELA funcionario  (colaborador da oficina + regra de comissao)
--    Relacao 1:1 opcional com usuario: nem todo funcionario tem login, e o
--    login (usuario) cuida apenas de acesso/credenciais.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS funcionario (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                    VARCHAR(120)  NOT NULL,
  cargo                   cargo_funcionario NOT NULL DEFAULT 'atendente',
  comissao_percentual     DECIMAL(5,2)  NOT NULL DEFAULT 0
                            CHECK (comissao_percentual >= 0 AND comissao_percentual <= 100),
  comissao_sobre_servicos BOOLEAN       NOT NULL DEFAULT false,
  comissao_sobre_pecas    BOOLEAN       NOT NULL DEFAULT false,
  id_usuario              UUID          UNIQUE REFERENCES usuario(id) ON DELETE SET NULL,
  ativo                   BOOLEAN       NOT NULL DEFAULT true,
  criado_em               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE funcionario IS 'Colaborador da oficina e sua regra de comissao; vinculado opcionalmente a um usuario (login)';

-- 2.1) Backfill: cria um funcionario para cada usuario existente, trazendo a
--      comissao que hoje mora em `usuario`.
INSERT INTO funcionario (nome, cargo, comissao_percentual, comissao_sobre_servicos, comissao_sobre_pecas, id_usuario, ativo)
SELECT u.nome,
       u.perfil::text::cargo_funcionario,
       COALESCE(u.comissao_percentual, 0),
       COALESCE(u.comissao_sobre_servicos, false),
       COALESCE(u.comissao_sobre_pecas, false),
       u.id,
       u.ativo
FROM usuario u
WHERE NOT EXISTS (SELECT 1 FROM funcionario f WHERE f.id_usuario = u.id);

-- -----------------------------------------------------------------------------
-- 3) TABELAS relacionais dos itens da OS (substituem os campos JSONB)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_servico (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_os          UUID          NOT NULL REFERENCES ordem_servico(id) ON DELETE CASCADE,
  id_servico     UUID          REFERENCES servico_catalogo(id) ON DELETE SET NULL,
  descricao      VARCHAR(200)  NOT NULL,
  quantidade     NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  criado_em      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_os_servico_os ON os_servico(id_os);
COMMENT ON TABLE os_servico IS 'Servicos lancados em cada ordem de servico (substitui ordem_servico.servicos_itens JSONB)';

CREATE TABLE IF NOT EXISTS os_peca (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_os          UUID          NOT NULL REFERENCES ordem_servico(id) ON DELETE CASCADE,
  id_item        UUID          REFERENCES item_estoque(id) ON DELETE SET NULL,
  descricao      VARCHAR(200)  NOT NULL,
  quantidade     NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  criado_em      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_os_peca_os ON os_peca(id_os);
COMMENT ON TABLE os_peca IS 'Pecas lancadas em cada ordem de servico (substitui ordem_servico.pecas_itens JSONB)';

-- 3.1) Backfill dos itens a partir dos arrays JSONB (so para OS ainda nao migradas)
INSERT INTO os_servico (id_os, id_servico, descricao, quantidade, valor_unitario)
SELECT os.id,
       (SELECT sc.id FROM servico_catalogo sc WHERE lower(sc.nome) = lower(item->>'descricao') LIMIT 1),
       COALESCE(NULLIF(item->>'descricao', ''), 'Servico'),
       GREATEST(COALESCE(NULLIF(item->>'quantidade','')::numeric, 1), 1),
       COALESCE(NULLIF(item->>'valor_unitario','')::numeric, NULLIF(item->>'valor','')::numeric, 0)
FROM ordem_servico os
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(os.servicos_itens, '[]'::jsonb)) AS item
WHERE jsonb_typeof(os.servicos_itens) = 'array'
  AND NOT EXISTS (SELECT 1 FROM os_servico x WHERE x.id_os = os.id);

INSERT INTO os_peca (id_os, id_item, descricao, quantidade, valor_unitario)
SELECT os.id,
       (SELECT ie.id FROM item_estoque ie WHERE lower(ie.nome) = lower(item->>'descricao') LIMIT 1),
       COALESCE(NULLIF(item->>'descricao', ''), 'Peca'),
       GREATEST(COALESCE(NULLIF(item->>'quantidade','')::numeric, 1), 1),
       COALESCE(NULLIF(item->>'valor_unitario','')::numeric, NULLIF(item->>'valor','')::numeric, 0)
FROM ordem_servico os
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(os.pecas_itens, '[]'::jsonb)) AS item
WHERE jsonb_typeof(os.pecas_itens) = 'array'
  AND NOT EXISTS (SELECT 1 FROM os_peca x WHERE x.id_os = os.id);

-- -----------------------------------------------------------------------------
-- 4) Repontar responsaveis da OS: id_mecanico / id_atendente -> funcionario
--    (hoje referenciam usuario; convertemos via funcionario.id_usuario)
-- -----------------------------------------------------------------------------
ALTER TABLE ordem_servico DROP CONSTRAINT IF EXISTS ordem_servico_id_mecanico_fkey;
ALTER TABLE ordem_servico DROP CONSTRAINT IF EXISTS ordem_servico_id_atendente_fkey;

UPDATE ordem_servico os
   SET id_mecanico = f.id
  FROM funcionario f
 WHERE os.id_mecanico IS NOT NULL AND f.id_usuario = os.id_mecanico;

UPDATE ordem_servico os
   SET id_atendente = f.id
  FROM funcionario f
 WHERE os.id_atendente IS NOT NULL AND f.id_usuario = os.id_atendente;

-- Zera referencias que nao casaram com nenhum funcionario (evita violar a nova FK)
UPDATE ordem_servico SET id_mecanico = NULL
 WHERE id_mecanico IS NOT NULL AND NOT EXISTS (SELECT 1 FROM funcionario f WHERE f.id = id_mecanico);
UPDATE ordem_servico SET id_atendente = NULL
 WHERE id_atendente IS NOT NULL AND NOT EXISTS (SELECT 1 FROM funcionario f WHERE f.id = id_atendente);

ALTER TABLE ordem_servico
  ADD CONSTRAINT ordem_servico_id_mecanico_fkey  FOREIGN KEY (id_mecanico)  REFERENCES funcionario(id),
  ADD CONSTRAINT ordem_servico_id_atendente_fkey FOREIGN KEY (id_atendente) REFERENCES funcionario(id);

-- -----------------------------------------------------------------------------
-- 4.5) RLS das novas tabelas + correcao das policies de mecanico
--      (id_mecanico agora aponta para funcionario, nao mais para auth.uid())
-- -----------------------------------------------------------------------------
ALTER TABLE funcionario ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_servico  ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_peca     ENABLE ROW LEVEL SECURITY;

-- funcionario: todos autenticados leem (para selects de OS/relatorios); so gestor gerencia
DROP POLICY IF EXISTS pol_func_select ON funcionario;
CREATE POLICY pol_func_select ON funcionario
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pol_func_gestor_all ON funcionario;
CREATE POLICY pol_func_gestor_all ON funcionario
  FOR ALL TO authenticated
  USING (fn_perfil_usuario_atual() = 'gestor')
  WITH CHECK (fn_perfil_usuario_atual() = 'gestor');

-- os_servico / os_peca: gestor e atendente gerenciam; mecanico le os itens das suas OS
DROP POLICY IF EXISTS pol_os_servico_manage ON os_servico;
CREATE POLICY pol_os_servico_manage ON os_servico
  FOR ALL TO authenticated
  USING (fn_perfil_usuario_atual() IN ('gestor', 'atendente'))
  WITH CHECK (fn_perfil_usuario_atual() IN ('gestor', 'atendente'));
DROP POLICY IF EXISTS pol_os_servico_mecanico_select ON os_servico;
CREATE POLICY pol_os_servico_mecanico_select ON os_servico
  FOR SELECT TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND EXISTS (
      SELECT 1 FROM ordem_servico o JOIN funcionario f ON f.id = o.id_mecanico
      WHERE o.id = os_servico.id_os AND f.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS pol_os_peca_manage ON os_peca;
CREATE POLICY pol_os_peca_manage ON os_peca
  FOR ALL TO authenticated
  USING (fn_perfil_usuario_atual() IN ('gestor', 'atendente'))
  WITH CHECK (fn_perfil_usuario_atual() IN ('gestor', 'atendente'));
DROP POLICY IF EXISTS pol_os_peca_mecanico_select ON os_peca;
CREATE POLICY pol_os_peca_mecanico_select ON os_peca
  FOR SELECT TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND EXISTS (
      SELECT 1 FROM ordem_servico o JOIN funcionario f ON f.id = o.id_mecanico
      WHERE o.id = os_peca.id_os AND f.id_usuario = auth.uid()
    )
  );

-- Corrige policies existentes que comparavam id_mecanico com auth.uid()
DROP POLICY IF EXISTS pol_os_mecanico_select ON ordem_servico;
CREATE POLICY pol_os_mecanico_select ON ordem_servico
  FOR SELECT TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico IN (SELECT id FROM funcionario WHERE id_usuario = auth.uid())
  );

DROP POLICY IF EXISTS pol_os_mecanico_update ON ordem_servico;
CREATE POLICY pol_os_mecanico_update ON ordem_servico
  FOR UPDATE TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND id_mecanico IN (SELECT id FROM funcionario WHERE id_usuario = auth.uid())
  )
  WITH CHECK (fn_perfil_usuario_atual() = 'mecanico');

DROP POLICY IF EXISTS pol_veiculo_mecanico_select ON veiculo;
CREATE POLICY pol_veiculo_mecanico_select ON veiculo
  FOR SELECT TO authenticated
  USING (
    fn_perfil_usuario_atual() = 'mecanico'
    AND id IN (
      SELECT o.id_veiculo FROM ordem_servico o
      JOIN funcionario f ON f.id = o.id_mecanico
      WHERE f.id_usuario = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 5) LIMPEZA (FASE 2) — rode SOMENTE apos validar o app novo em producao.
--    Remove as colunas antigas que a normalizacao substituiu.
-- -----------------------------------------------------------------------------
-- ALTER TABLE ordem_servico
--   DROP COLUMN IF EXISTS servicos_itens,
--   DROP COLUMN IF EXISTS pecas_itens,
--   DROP COLUMN IF EXISTS comissao_detalhes;
-- ALTER TABLE usuario
--   DROP COLUMN IF EXISTS comissao_percentual,
--   DROP COLUMN IF EXISTS comissao_sobre_servicos,
--   DROP COLUMN IF EXISTS comissao_sobre_pecas;

COMMIT;
