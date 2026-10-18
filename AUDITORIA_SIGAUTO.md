# Auditoria técnica — SIGAuto

**Atualização:** 18/10/2026  
**Base versionada:** `1c9d978` na branch `feat/relatorio-filtro-funcionario-e-visualizador-pdf` + alterações locais ainda não commitadas  
**Banco de validação:** Supabase efêmero local

Este relatório separa o que foi aprovado na árvore local do que ainda depende de
produção. Resultado local não prova que o mesmo código, a migração 29 ou a mesma
configuração já estejam publicados.

## 1. Estado executivo

| Escopo | Estado | Evidência |
| --- | --- | --- |
| Backend | **APROVADO LOCALMENTE** | 394/394 testes |
| E2E | **APROVADO LOCALMENTE** | 24/24 testes Playwright |
| Banco | **APROVADO LOCALMENTE** | 3/3 scripts SQL; migração 29 aplicada e reaplicada com sucesso |
| Frontend unitário/componente | **APROVADO LOCALMENTE** | 382/382 testes |
| Lint | **APROVADO LOCALMENTE** | frontend: 0 erros e 3 warnings preexistentes; backend: limpo |
| Build frontend | **APROVADO LOCALMENTE** | build concluído e verificador de credenciais executado |
| Dependências de produção do backend | **APROVADO LOCALMENTE** | `npm audit --omit=dev`: 0 vulnerabilidades |
| Dependências de produção do frontend | **RISCO RESIDUAL** | 1 vulnerabilidade alta em `xlsx`; `npm audit` não oferece correção |
| Produção | **BLOQUEADA** | migração 29, rotação das contas demo e conferência de `NODE_ENV` ainda exigem ação coordenada |

## 2. Arquitetura e fronteiras auditadas

- O frontend React usa a chave `anon` e acessa o Supabase sob RLS. Operações que
  precisam de atomicidade usam RPCs `SECURITY DEFINER` com autorização interna.
- O backend Express concentra autenticação administrativa e IA. Ele usa a
  `service_role`; essa chave não pertence ao frontend.
- A instalação não é multiempresa. O isolamento é por perfil e vínculo entre
  `usuario`, `funcionario` e O.S.
- O schema versionado agora vai de `database/01` a `database/29`. A migração 29
  não cria tabela, mas altera o contrato de escrita de O.S., usuário e estoque.

## 3. Achados e situação atual

### A-01 · Teste de RLS não compilava — fechado localmente

A chamada inválida de `RAISE NOTICE` em `database/tests/rls_matrix_test.sql` foi
corrigida. A matriz executou no Supabase efêmero e integra o resultado SQL 3/3.
Isso fecha o bloqueio local; a proteção contínua depende de publicar a alteração
da CI e mantê-la como check obrigatório.

### A-02 · Credenciais demo publicadas — mitigado no código, aberto em produção

O código local remove as contas de demonstração de qualquer build e verifica o
artefato gerado. A mitigação inclui bandeira independente de `NODE_ENV`, canário
de eliminação de código morto e inspeção do diretório real de saída.

A senha já foi servida e as contas são reais. Remover o segredo do próximo bundle
não revoga credenciais antigas. A produção continua bloqueada até trocar ou
desativar `gestor@sigauto.com`, `atendente@sigauto.com` e
`mecanico@sigauto.com`.

### A-03 · `NODE_ENV=development` na API publicada — código endurecido, configuração aberta

O `errorHandler` local normaliza status HTTP e não devolve `err.message` de erros
5xx em produção. Detalhes e stack continuam restritos ao modo de desenvolvimento.
Os testes do backend cobrem esses caminhos.

Ainda é obrigatório conferir o valor efetivo de `NODE_ENV` no projeto Vercel. O
estado observado anteriormente era `development`; este relatório não afirma que
o painel já foi corrigido.

### A-04 · Dinheiro em `Number` — aberto

Totais e comissões ainda são calculados em ponto flutuante no frontend e gravados
em colunas `NUMERIC/DECIMAL`. Há testes de casos fracionados nas telas, mas não
existe decisão de domínio que substitua o cálculo por centavos inteiros ou defina
arredondamento em cada fronteira. O risco residual é divergência de centavo.

### A-05 a A-10 · Fechados no schema local pela migração 29

| Achado | Correção efetiva em `29_hardening_os_usuario_estoque.sql` |
| --- | --- |
| A-05 — mecânico alterava qualquer coluna da própria O.S. | `fn_guard_atualizacao_os` limita o mecânico a `diagnostico`, `observacoes` e status operacionais; colunas futuras nascem bloqueadas |
| A-06 — cabeçalho encerrado editável | atendente só pode reabrir alterando `status`; autoria e comissões escalares são imutáveis fora dos caminhos internos |
| A-07 — cancelamento sem estorno | `cancelar_ordem_servico(uuid)` cancela e estorna pelo ledger, na mesma transação e de forma idempotente |
| A-08 — usuário inativo podia se reativar | `pol_usuario_self_update` exige conta ativa e preserva `perfil` e `ativo` |
| A-09 — RPC aceitava autoria e comissões | `salvar_ordem_servico_com_itens` remove `id_usuario` e os dois campos de comissão antes da allowlist e do `UPDATE` |
| A-10 — atendente fazia ajuste absoluto | `pol_mov_operacional_insert` reserva `tipo = 'ajuste'` ao gestor |

A migração também:

- cria índices para `os_comissao.id_funcionario` e
  `os_baixa_estoque.id_item`;
- exige RPC para toda transição nova a `concluida` ou `cancelada`;
- concede `EXECUTE` de `SECURITY DEFINER` a `authenticated` somente para seis
  funções declaradas em allowlist;
- revoga `PUBLIC` e `anon`, fixa `search_path` e valida funções e views por
  pós-condições transacionais.

O teste `database/tests/hardening_29_test.sql` exerce os caminhos permitidos e os
vetores A-05 a A-10. A migração foi aplicada duas vezes no banco efêmero sem
falha, validando sua reaplicação. Nada disso afirma aplicação em produção.

### A-11 · Histórico fornecido pelo cliente no chatbot — risco residual controlado

O histórico visível enviado pelo frontend ainda é aceito como contexto da sessão.
Ele é limitado a 10 mensagens e 4.000 caracteres por mensagem. Conteúdo marcado
como `chatbot` entra como turno `model`, não como `systemInstruction`; o contexto
de negócio é recortado por perfil antes da chamada. Os testes cobrem prompt
injection e ausência de PII não autorizada. O cliente ainda pode influenciar a
conversa, mas não a autorização do dado enviado pela API.

### A-12 · Recuperação de senha sem limite distribuído próprio — aberto

O fluxo direto do Supabase Auth e a rota de recuperação não compartilham um
limitador distribuído da aplicação. O risco é abuso de envio de e-mail e consumo
de cota. A correção depende de política no Supabase Auth ou store compartilhado.

### A-13 · Limitação de força bruta em memória — aberto

O `express-rate-limit` usa memória da instância serverless. O bloqueio visual da
tela também não substitui proteção no provedor de autenticação. O controle precisa
existir no Supabase Auth ou em store compartilhado.

### A-14 · Dependências — parcialmente fechado

`express`, `jspdf`, `jspdf-autotable` e `react-router-dom` foram atualizados na
árvore local. O audit de produção do backend ficou em zero. O frontend mantém uma
vulnerabilidade alta em `xlsx@0.18.5`; não há correção oferecida pelo `npm audit`.
O sistema apenas exporta planilhas e não importa arquivos do usuário, o que reduz
a alcançabilidade do vetor conhecido, mas não elimina o achado.

### A-15 · Residuais

- O frontend publicado não tem cabeçalhos de segurança definidos em
  `react-app/vercel.json`; Helmet protege somente a API.
- Algumas leituras continuam com `select('*')`; coluna sensível nova pode virar
  over-fetch sem decisão explícita.
- Nome de cliente e funcionário pode compor o contexto enviado ao Gemini. CPF,
  CNPJ, telefone e e-mail não devem sair; os testes usam canários para essa
  fronteira.
- `log_auditoria` permanece estrutura para versão futura, conforme o escopo; não
  representa trilha completa por operação.
- As 15 policies apontadas pelo advisor ainda reavaliam funções por linha. Os
  dois índices de FK apontados no mesmo levantamento entram na migração 29.
- Não reaplique migrações antigas isoladamente em produção. Em especial, `01`,
  `02`, `16`, `22` e `27` têm efeitos incompatíveis com hardenings posteriores.

## 4. Canceladas históricas

A migração 29 protege cancelamentos novos. Ela não presume que uma O.S. histórica
cancelada com `os_baixa_estoque.quantidade_baixada > 0` deva ser estornada: o
saldo físico pode ter sido corrigido fora do sistema. Esses registros exigem
revisão manual antes de chamar `cancelar_ordem_servico` ou lançar movimento
compensatório. Não há backfill automático.

Consulta de triagem, somente leitura:

```sql
SELECT os.id, os.numero_os, b.id_item, b.quantidade_baixada
FROM public.ordem_servico os
JOIN public.os_baixa_estoque b ON b.id_os = os.id
WHERE os.status = 'cancelada'
  AND b.quantidade_baixada > 0
ORDER BY os.numero_os, b.id_item;
```

## 5. Produção: bloqueios e rollout

Não liberar como concluído enquanto estes três itens estiverem abertos:

1. Aplicar a migração 29 em rollout coordenado.
2. Rotacionar ou desativar as três credenciais demo reais.
3. Conferir `NODE_ENV` no backend da Vercel e validar `/health` após o deploy.

Ordem segura para a migração 29:

1. Confirmar backup e executar a consulta de canceladas históricas.
2. Aplicar a migração 29 antes do frontend novo. O RPC de atualização mantém
   compatibilidade ao descartar os três campos antigos; já o frontend novo chama
   `cancelar_ordem_servico`, que não existe antes da migração.
3. Executar os três testes SQL e as pós-condições de privilégios no banco de
   destino.
4. Publicar frontend e backend do mesmo lote e executar smoke tests de salvar,
   finalizar, reabrir e cancelar O.S.
5. Revisar manualmente as canceladas históricas; não fazer estorno em massa sem
   conciliação do saldo físico.

## 6. Divergências e pontos em aberto

### Código/schema local versus produção

- A migração 29 existe e foi validada localmente, mas a aplicação em produção
  continua bloqueada.
- O código local elimina credenciais do build, mas as credenciais já publicadas
  continuam válidas até rotação.
- O middleware local foi endurecido, mas o valor efetivo de `NODE_ENV` depende do
  painel da Vercel.
- O schema versionado define `item_estoque.custo` anulável; o banco publicado foi
  observado com `NOT NULL DEFAULT 0`. A migração 29 não converte esse dado.

### Decisão humana necessária

- Qual regra de arredondamento monetário deve valer em cada etapa do cálculo?
- Qual proteção distribuída será usada para login e recuperação de senha?
- As O.S. canceladas históricas com baixa registrada correspondem a estoque que
  deve ser devolvido ou já foi conciliado fora do sistema?
- O projeto aceita manter `xlsx` enquanto não há versão corrigida no registro, ou
  deve substituir a biblioteca?

`AGENTS.md` e `CLAUDE.md` foram sincronizados com o intervalo `01 → 29` e com a
próxima migração reservada como `30`.
