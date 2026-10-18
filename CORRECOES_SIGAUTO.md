# Correções — SIGAuto

**Atualização:** 18/10/2026  
**Estado:** implementadas na árvore local, ainda não commitadas nem publicadas

Os itens abaixo descrevem o código e o schema locais. “Corrigido” não significa
“em produção”. Os bloqueios externos estão na última seção.

## C-01 · Quantidade da O.S. normalizada na tela e no payload

Antes, valores como `"0"`, vazio e número inválido podiam produzir totais
diferentes dos gravados. `normalizarQuantidade` passou a ser a regra única no
cálculo, na tela de atualização e na camada que monta o RPC. Valores ausentes,
inválidos, zero ou negativos viram `1`; vírgula decimal é aceita.

**Arquivos principais:** `react-app/src/utils/osFinance.js`,
`react-app/src/hooks/useDatabase.js`,
`react-app/src/pages/OrdemServico/AtualizarOS.jsx`.

## C-02 · Snapshot de comissão escolhido por papel

O relatório não troca mais o objeto inteiro de comissão quando existe snapshot
de apenas um papel. Mecânico e atendente são resolvidos separadamente; o papel
sem snapshot usa o cálculo aplicável.

**Arquivo principal:** `react-app/src/pages/Relatorios.jsx`.

## C-03 · Status legado normalizado

`statusOSCanonico` converte os valores históricos antes da comparação. A lista de
O.S. não duplica “Em Andamento” e registros legados entram no filtro canônico.

**Arquivos principais:** `react-app/src/utils/os.js`,
`react-app/src/pages/OrdemServico/ListaOS.jsx`.

## C-04 · Escritas otimistas fazem rollback

Inativação de cliente, veículo e funcionário, além das gravações de O.S. cobertas
pelas telas, restaura o estado anterior e propaga o erro quando o Supabase recusa
a operação. O usuário não fica com uma linha removida apenas na memória até o
próximo reload.

**Arquivos principais:** `react-app/src/hooks/useDatabase.js` e páginas de
cadastro/O.S.

## C-05 · Encerramento, desconto e itens da O.S.

A suíte e as telas passaram a exercer e tratar:

- payload completo de `finalizar_ordem_servico`;
- forma de pagamento obrigatória;
- desconto percentual limitado a 100%;
- desconto em valor limitado ao total da O.S.;
- inclusão e remoção de serviço/peça somente após confirmação da persistência;
- erro de banco exibido sem adiantar totais na interface.

## C-06 · Chatbot e erros da API

O backend agora:

- valida `pergunta` como string não vazia;
- limita o histórico a 10 mensagens e 4.000 caracteres por mensagem;
- normaliza `page` e `limit` do histórico;
- não descarta a resposta do Gemini quando apenas a persistência da conversa
  falha;
- verifica o erro retornado pelo `insert`;
- normaliza status HTTP inválidos;
- não expõe `err.message` em erro 5xx de produção;
- rejeita resposta da IA que não seja objeto JSON válido e extrai o primeiro
  objeto balanceado sem regex gulosa.

**Arquivos principais:** `backend/src/controllers/chatbotController.js`,
`backend/src/middleware/errorHandler.js`, `backend/src/services/iaService.js`.

## C-07 · Credenciais demo fora do build

O login de demonstração só existe no servidor de desenvolvimento. A bandeira
`__DEMO_LOGIN__` depende do comando do Vite, não de `NODE_ENV`. O build procura
senhas conhecidas, e-mails, sentinela não substituída e o canário
`CANARIO_DEMO_LOGIN` no `outDir` real, incluindo sourcemaps e arquivos `.gz`/`.br`.
Diretório ausente ou vazio reprova o build.

Essa correção impede nova publicação do segredo. Ela não revoga senhas já
servidas; a rotação das contas continua obrigatória.

## C-08 · Dependências alcançáveis atualizadas

- Backend: `express` atualizado; audit de produção com 0 vulnerabilidades.
- Frontend: `jspdf`, `jspdf-autotable` e `react-router-dom` atualizados.
- Frontend: permanece 1 vulnerabilidade alta em `xlsx@0.18.5`, sem correção
  oferecida pelo npm. O código exporta planilha e não importa arquivo do usuário.

## C-09 · Migração 29 — hardening de O.S., usuário e estoque

`database/29_hardening_os_usuario_estoque.sql` fecha A-05 a A-10:

| Vetor | Correção |
| --- | --- |
| A-05 | mecânico restrito a diagnóstico, observações e status operacionais |
| A-06 | autoria imutável; comissões apenas pelo snapshot; atendente não altera cabeçalho encerrado |
| A-07 | novo RPC `cancelar_ordem_servico(uuid)` com estorno pelo ledger e idempotência |
| A-08 | autoedição preserva `perfil` e `ativo` e exige conta ativa |
| A-09 | RPC de salvar O.S. ignora autoria e comissões enviadas pelo cliente |
| A-10 | ajuste absoluto de estoque exclusivo do gestor |

A migração cria ainda:

- `idx_os_comissao_funcionario`;
- `idx_os_baixa_estoque_item`;
- allowlist exata de seis funções `SECURITY DEFINER` executáveis por
  `authenticated`;
- pós-condições para triggers, policies, índices, `search_path`, grants de
  funções e grants de views.

O frontend passou a cancelar O.S. por `cancelar_ordem_servico`, preserva o
registro com status `cancelada` e recarrega o estado após o RPC. O script foi
aplicado e reaplicado com sucesso no Supabase efêmero e
`hardening_29_test.sql` passou.

## C-10 · Regressões encontradas na revisão final

- A seleção de status `cancelada` na tela agora chama o RPC transacional, em vez
  de tentar gravar o status pelo RPC genérico.
- A reabertura em `AtualizarOS` e `EncerrarOS` envia somente
  `status = 'em_andamento'`. Para compatibilidade de rollout, a migração 29
  também descarta campos extras enviados pelo cliente anterior quando o
  atendente reabre uma O.S. encerrada.
- O parser da resposta de IA não aceita mais um objeto interno balanceado quando
  o JSON raiz foi truncado. Além do balanceamento por nível superior, exige
  `resumo`, `recomendacoes` e `alertas` com os tipos do contrato.

## C-11 · Testes e gates

- Backend: 394/394.
- Frontend unitário/componente: 382/382.
- E2E: 24/24.
- SQL: 3/3.
- Lint: frontend com 0 erros e 3 warnings preexistentes; backend limpo.
- Build: aprovado, incluindo verificação do bundle.

## Canceladas históricas

A migração 29 não faz estorno retroativo. Uma O.S. já cancelada pode manter
`os_baixa_estoque.quantidade_baixada > 0` por dois motivos indistinguíveis pelo
schema: defeito antigo ou conciliação física feita fora do sistema. Cada caso deve
ser conferido antes de usar o RPC ou criar movimento compensatório.

Não execute atualização em massa. Use a consulta de triagem documentada em
`AUDITORIA_SIGAUTO.md` e registre a decisão por O.S.

## Rollout obrigatório

1. Confirmar backup e levantar as canceladas históricas.
2. Aplicar a migração 29. Ela deve entrar antes do frontend novo porque o novo
   cliente chama `cancelar_ordem_servico`; o RPC não existe no schema anterior.
3. Rodar `rls_matrix_test.sql`, `estoque_os_test.sql` e
   `hardening_29_test.sql` no destino.
4. Publicar frontend e backend do lote.
5. Validar salvar, finalizar, reabrir e cancelar O.S. com perfis gestor,
   atendente e mecânico.
6. Conciliar manualmente as canceladas históricas.

## Bloqueios externos

| Bloqueio | Responsável/ação |
| --- | --- |
| Migração 29 ainda não aplicada em produção | executar rollout coordenado acima |
| Credenciais demo reais já publicadas | trocar ou desativar as três contas no Supabase |
| `NODE_ENV` da API na Vercel | conferir/remover override e validar `/health` após deploy |

## Pontos não corrigidos

- regra formal de arredondamento monetário;
- limitador distribuído para autenticação e recuperação de senha;
- cabeçalhos de segurança do frontend na Vercel;
- substituição ou aceite formal do risco de `xlsx`;
- divergência de produção em `item_estoque.custo` (`NOT NULL DEFAULT 0` observado
  contra coluna anulável no schema versionado).
