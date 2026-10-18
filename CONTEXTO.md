# CONTEXTO — estado de trabalho do SIGAuto

> Arquivo de transferência entre agentes (Claude ↔ Codex). Quem assume lê este
> arquivo **e o estado real do repositório**; o repositório vence quando os dois
> discordarem. Nunca sobrescreva alteração existente: continue a partir dela.

```
OWNER: codex
HANDOFF_AT: 2026-10-18T01:36:42-03:00
ATUALIZADO_EM: 2026-10-18
BRANCH: feat/relatorio-filtro-funcionario-e-visualizador-pdf
ULTIMO_COMMIT: 1c9d978 + trabalho nao commitado no branch
BRANCH_TRABALHO: feat/relatorio-filtro-funcionario-e-visualizador-pdf
```

## Estado atual — 18/10/2026

As seções abaixo deste resumo são histórico de handoff e contêm números
intermediários. Para o estado consolidado, leia `AUDITORIA_SIGAUTO.md`,
`TESTES_SIGAUTO.md`, `CORRECOES_SIGAUTO.md` e `docs/DER.md`.

- Frontend **382/382**, backend **394/394**, E2E **24/24** e SQL **3/3** aprovados localmente.
- Migração 29 aplicada e reaplicada com sucesso no Supabase efêmero. Ela fecha
  A-05 a A-10, cria `cancelar_ordem_servico`, guards, policies, dois índices e a
  allowlist global de `SECURITY DEFINER`.
- Frontend validado na execução final com **382/382** testes.
- Lint frontend: 0 erros e 3 warnings preexistentes; backend limpo. Build passou.
- Audit de produção do backend: 0. Frontend: 1 alta em `xlsx`, sem correção npm.
- Produção continua bloqueada por três ações externas: rollout coordenado da
  migração 29, rotação das credenciais demo reais e conferência de `NODE_ENV` na
  Vercel.
- O.S. canceladas antes da migração 29 não recebem estorno automático; revisar
  manualmente as que mantêm baixa registrada.

## Segunda entrega ao Codex — Claude (2026-10-17, fim da sessão)

Continuação direta da seção anterior. Nada commitado; branch
`feat/relatorio-filtro-funcionario-e-visualizador-pdf`, `main` em `5e82bdb`.

### O BLOQUEIO FOI DESTRAVADO: E2E e testes SQL agora rodam nesta máquina

O Docker Desktop estava instalado mas com o daemon parado. Subi o daemon, subi o
Supabase efêmero e **os dois testes SQL executaram pela primeira vez**:

- `database/tests/rls_matrix_test.sql` → **PASSOU** (gestor, mecânico e
  atendente). Era o teste que nunca compilava; a correção da linha 140 está no
  branch.
- `database/tests/estoque_os_test.sql` → **PASSOU** (baixa atômica, histórico,
  idempotência).
- Playwright: **15 de 17 passaram**, 2 falharam e eu corrigi a causa (ver
  abaixo). Depois da correção, `fluxos.spec.js` ficou 5/5.

Como reproduzir, exatamente o que fiz:

```bash
# 1. Docker Desktop precisa estar rodando
# 2. preparar migracoes como a CI faz
cd <repo>
mkdir -p supabase/migrations && rm -f supabase/migrations/*.sql
for arquivo in database/[0-9][0-9]_*.sql; do
  base="$(basename "$arquivo")"
  case "$base" in 04_seed_data.sql|10_seed_demo.sql) continue ;; esac
  cp "$arquivo" "supabase/migrations/202610150000${base%%_*}_${base#*_}"
done
npx supabase start
npx supabase db reset --local --no-seed
# 3. fixtures
cd react-app
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<anon local> \
SUPABASE_SERVICE_ROLE_KEY=<service local> node e2e/setup-database.mjs
# 4. testes SQL (psql nao existe na estacao; roda dentro do container)
docker cp database/tests/rls_matrix_test.sql supabase_db_sigauto-e2e:/tmp/rls.sql
MSYS_NO_PATHCONV=1 docker exec supabase_db_sigauto-e2e \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rls.sql
# 5. E2E
npx playwright test
```

### ESTADO SUJO DA ESTAÇÃO — limpar antes de continuar

1. **`react-app/.env.local` existe e aponta para o Supabase efêmero**
   (`http://127.0.0.1:54321`). Tem precedência sobre o `.env` no Vite, então
   enquanto ele existir o `npm run dev` **não** fala com produção. Isso foi
   deliberado, para o E2E não escrever em produção. **Apague o arquivo** quando
   terminar, ou o desenvolvimento normal continuará apontando para o banco
   local. É gitignored (`*.local`).
2. `supabase/migrations/` e `supabase/.temp/` são cópias geradas para o banco
   efêmero. **Não commite.** Confira se entram no `.gitignore` antes do commit.
3. Containers do Supabase e um `vite` na porta 5173 ficaram no ar
   (`npx supabase stop`, e matar o processo do Vite).

### Bug novo encontrado E corrigido pelo E2E

`react-app/src/components/ui/VisualizadorDocumentoOS.module.css` — o modal usava
`height: 90dvh` fixo, e o `.modal-overlay` tem 24px de padding em cima e
embaixo: 90dvh + 48px passa da tela, o cabeçalho com o botão de fechar ficava
**acima da área visível** e sem rolagem. O Playwright acusou
`element is outside of the viewport`. Corrigido com `max-height: 100%`; os 5
testes de `fluxos.spec.js` passam.

### Testes novos de backend (agente dedicado, já no disco)

5 arquivos, backend foi de 298 para **388 testes em 20 arquivos** (385 passam +
3 `expected fail` que documentam bug real):

- `backend/src/controllers/chatbotFuncional.test.js` — inclui o teste de
  **prompt injection**: injeção no turno `chatbot` do histórico chega ao modelo
  só como turno `model`, nunca no `systemInstruction`, e o recorte por perfil de
  `utils/contextoPorPerfil.js` resiste (mecânico segue sem faturamento, sem
  ranking e sem nome de cliente).
- `backend/src/middleware/authMiddleware.test.js` — `USUARIO_NAO_ENCONTRADO`,
  `USUARIO_INATIVO`, perfil do token ignorado, `requireRole` fail-closed.
- `backend/src/middleware/errorHandler.test.js`
- `backend/src/services/iaRespostaInvalida.test.js`
- `backend/src/controllers/iaPaginacao.test.js`

### Bugs de backend encontrados e NÃO corrigidos (documentados com `it.fails`)

| # | Onde | Problema |
| --- | --- | --- |
| 1 | `chatbotController.js:143-154` | Falha na persistência descarta a resposta do Gemini já paga: vira 500 depois de gerar |
| 2 | `chatbotController.js:143-154` | Retorno do `insert` nunca verificado: erro de RLS perde a conversa em silêncio |
| 3 | `errorHandler.js:7` | Mensagem interna do erro vaza em produção mesmo com `NODE_ENV` correto |
| 4 | `chatbotController.js:119-127` | Histórico vindo do banco não é truncado em 4 000 |
| 5 | `chatbotController.js:102` | `pergunta: 42` passa o guard e quebra em `.trim()` → 500 |
| 6 | `iaService.js:283` | Regex gulosa `/\{[\s\S]*\}/` descarta JSON válido quando há `{}` no texto depois |
| 7 | `iaService.js:286` | `'null'` faz `JSON.parse` devolver `null` e o gestor recebe análise em branco |
| 8 | `errorHandler.js:5` | `err.status` inválido (`'bad'`, `0`) vai direto para `res.status()` |

### Dois agentes ficaram rodando quando a sessão encerrou

Eram testes de frontend e podem ter deixado arquivos no disco:

- Módulo de O.S.: só `react-app/src/pages/OrdemServico/*.test.jsx`
  (encerramento com payload do RPC, desconto acima do limite e percentual > 100,
  precisão decimal, itens, rollback, filtro de status legado).
- Cadastros e camada de dados: `Clientes.test.jsx`, `Veiculos.test.jsx`,
  `Funcionarios.test.jsx`, `Usuarios.test.jsx` e `useDatabase.test.jsx` (novo).

**Rode `cd react-app && npx vitest run` antes de qualquer coisa** para ver o que
de fato ficou: pode haver teste pela metade ou `it.fails` documentando bug.

### O que ainda falta, em ordem

1. Limpar o estado sujo da estação (acima) e rodar as três suítes.
2. Terminar `react-app/e2e/jornada.spec.js` — eu escrevi a jornada completa
   (cliente → veículo → O.S. → itens → desconto → recarregar → status →
   documento → logout) mas **os seletores estão errados**: 5 de 7 falharam. Os
   rótulos reais são `Clientes`, `Veiculos`, `Ordens de Servico`, `Relatorios`,
   `Usuarios` (sem acento, no `Sidebar.jsx`); o heading de clientes é
   `Base de Clientes`; o de veículos é `Veículos` (com acento); o logout é um
   `button` com `title="Sair"`; e a tela `AbrirOS.jsx` tem cadastro rápido
   embutido (`Nome *`, `CPF/CNPJ`, `Placa *`, `Marca *`, `Modelo *`), que é o
   caminho mais curto para a jornada. Ajuste e rode até ficar verde.
3. Corrigir os 8 bugs de backend da tabela acima, cada um com o `it.fails`
   virando teste normal.
4. Migração **29** com A-05 a A-10 de `AUDITORIA_SIGAUTO.md` (nada aplicado em
   produção).
5. Performance (§12 do pedido original): continua **não medida**. Só há os
   advisories do Supabase (15 policies reavaliando `auth.<fn>()` por linha, 2
   FKs sem índice).
6. Atualizar `TESTES_SIGAUTO.md`, `AUDITORIA_SIGAUTO.md` e
   `CORRECOES_SIGAUTO.md` com os números finais: eles ainda registram
   frontend 237 / backend 298 e E2E como BLOQUEADO, o que **deixou de ser
   verdade** nesta sessão.

### Continua pendente e é só do usuário

Trocar ou desativar `gestor@sigauto.com`, `atendente@sigauto.com` e
`mecanico@sigauto.com` no Supabase de produção, e corrigir `NODE_ENV` no painel
da Vercel.
## Auditoria completa e correções — Claude (2026-10-17), ENTREGUE AO CODEX

Estado: trabalho **não commitado**, no branch
`feat/relatorio-filtro-funcionario-e-visualizador-pdf`. A `main` está em
`5e82bdb` e **não** contém nada disto. Suítes verdes: frontend **237** (35
arquivos), backend **298** (15), `eslint` 0 erros, build aprovado. E2E e testes
SQL **bloqueados nesta estação** (sem Docker e sem `psql`).

Leia antes de continuar, nesta ordem: `AUDITORIA_SIGAUTO.md` (15 achados, com
evidência), `CORRECOES_SIGAUTO.md` (7 correções + pendências) e
`TESTES_SIGAUTO.md` (matriz e lacunas priorizadas). Os três são novos.

### O que é urgente e NÃO depende de código

1. **Credencial de gestor publicada.** `gestor@sigauto.com` / `Gestor123` esteve
   em texto puro no bundle servido e **funciona** contra a API de produção
   (confirmado com login real durante a auditoria, HTTP 200 com token). Existe 1
   conta `gestor` ativa nesse domínio. O código já não publica mais a senha, mas
   isso **não revoga** o que foi servido nem o que está no histórico do git.
   Ação: trocar ou desativar as três contas no Supabase.
2. **`NODE_ENV=development` na API de produção.** `/health` responde
   `{"env":"development"}`; `backend/src/middleware/errorHandler.js:13` devolve
   stack trace. Ação: painel da Vercel. Nenhum commit resolve.

### O que foi corrigido (com teste)

- Quantidade de item: normalizador único `normalizarQuantidade`
  (`react-app/src/utils/osFinance.js`), usado também em `useDatabase`. Antes a
  tela e o banco discordavam: `"0"` mostrava R$ 0,00 e gravava 1.
- Comissão: `Relatorios.jsx` escolhe o snapshot **por papel**; antes zerava o
  papel ausente.
- Status legado: `statusOSCanonico` em `utils/os.js`; o filtro da lista passou a
  comparar status canônico.
- Inativação de cliente/veículo/funcionário propaga erro e desfaz o estado
  otimista; as telas mostram mensagem.
- Cancelar O.S. concluída é recusado na tela (o estorno de estoque não existe no
  banco — ver migração 29).
- Paginação de `GET /chatbot/historico` validada.
- Contas de demonstração fora de qualquer build.

### O gate de demonstração — não simplifique

Três rodadas de auditoria derrubaram duas versões dele. O que vale hoje:

- `import.meta.env.DEV` **não serve**: o Vite o deriva de `NODE_ENV`, e
  `NODE_ENV=development npx vite build` recoloca `Gestor123` no bundle (medido).
- Vale a bandeira `__DEMO_LOGIN__` do `react-app/vite.config.js`
  (`command === 'serve' && mode !== 'production'`), lida por
  `react-app/src/demoLogin.js`, que trata global ausente como desabilitado para
  não derrubar o app onde o `define` não existe.
- `react-app/scripts/verifica-bundle.mjs` roda como **plugin do Vite**
  (`closeBundle`, sobre o `outDir` resolvido), logo em todo `vite build`,
  qualquer `outDir`, qualquer Build Command — verificar caminho fixo era furo:
  `--outDir build` publicava `build/` e a checagem aprovava a `dist/` antiga.
  `react-app/vercel.json` fixa `buildCommand`, que vence o painel. O verificador
  inspeciona tudo menos uma denylist binária, descomprime `.gz`/`.br`, pega
  `.map` (com `--sourcemap` as senhas voltam via `sourcesContent`) e nunca
  imprime o trecho casado, só o caminho. Tem teste próprio
  (`react-app/scripts/verifica-bundle.test.js`).
- Canário `CANARIO_DEMO_LOGIN` dentro dos blocos condicionais: a lista de senhas
  do verificador envelhece, o canário não — se ele sobreviver ao build, a
  eliminação de código morto falhou.
- `react-app/scripts/` é **untracked**: commite junto com o `package.json` e o
  `vite.config.js`, senão o build quebra na CI e na Vercel.

### Próximo trabalho, em ordem

1. Commitar o que está no branch e abrir PR. **Não** commitar `dist/`.
2. Consertar a CI: o job E2E está vermelho desde antes deste trabalho, agora por
   nada — a correção de `database/tests/rls_matrix_test.sql:140` está no branch.
   Separar os dois `psql` num job próprio, que não dependa de instalar Chromium,
   e exigi-lo como check obrigatório. Hoje o Playwright sai `skipped` atrás da
   falha do SQL, então **os 17 E2E não rodam há semanas**.
3. **Migração 29** (a próxima; nada aplicado em produção). Conteúdo levantado:
   - A-05: trigger `BEFORE UPDATE` em `ordem_servico` restringindo o mecânico a
     `diagnostico`, `observacoes` e `status` — RLS não recorta coluna, e hoje ele
     reescreve `valor_comissao_mecanico`, que é o número que a tela lê.
   - A-06: congelar o cabeçalho de O.S. `concluida`/`cancelada` para não gestor.
   - A-07: RPC transacional de cancelamento com estorno de estoque.
   - A-08: fixar `ativo` no `WITH CHECK` de `pol_usuario_self_update`.
   - A-09: tirar `id_usuario` e as duas comissões da allowlist de
     `salvar_ordem_servico_com_itens`.
   - A-10: exigir gestor para `tipo = 'ajuste'` em `movimentacao_estoque`.
   - Índices de FK: `os_comissao.id_funcionario`, `os_baixa_estoque.id_item`.
   - Reescrever a pós-condição da `16`, que hoje **aborta por construção** (as
     migrações 22 e 23 concedem `EXECUTE` a quatro RPCs de propósito).
4. Testes que faltam, por risco: `AuthContext` (fail-closed do `carregarPerfil`),
   `ProtectedRoute`, `authMiddleware` (conta inativa), payload do encerramento de
   O.S. A lista completa e priorizada está em `TESTES_SIGAUTO.md`.
5. Atualizar o DERS (`.docx` + `python docs/importar-ders.py`): as divergências
   9 e 10 de `docs/DER.md` — o PDF não abre mais em nova guia, e o relatório
   ganhou um terceiro seletor (funcionário), que a RN25 não menciona.

### Armadilhas verificadas nesta rodada

- **Não reaplique `01` nem `02`**: recriam o trigger de signup vulnerável e a
  `pol_estoque_atendente_select`.
- **Não reaplique `22` nem `27` depois da `28`**: elas fazem `DROP VIEW` +
  `CREATE VIEW` revogando só de `PUBLIC` e `anon`, e o default privilege do
  Supabase devolve `INSERT/UPDATE/DELETE` a `authenticated` nas três views que
  ignoram RLS.
- Produção registra só **4 migrações** na tabela de controle, embora os scripts
  cheguem ao `28`: confira objeto por objeto no catálogo
  (`to_regclass`, `pg_trigger`, `pg_policy`) antes de depender de qualquer um.
- `item_estoque.custo` em produção é `NOT NULL DEFAULT 0` — a migração 15 nunca
  foi aplicada.

## Continuação concluída — extração de estilos inline (2026-10-15)

Pedido atual: continuar a extração CSS Modules iniciada pelo Claude.
Concluídos `PainelIA.jsx`, `AtualizarOS.jsx` e `EncerrarOS.jsx`, com seus
módulos CSS. O módulo de AtualizarOS já existia e foi reaproveitado.
Estilos estáticos extraídos; inline apenas valores calculados (cores e animação).
Varredura AST de src não encontrou objetos de estilo inteiramente estáticos.
Comparação AST das três telas confirmou lógica e textos preservados.
Prioridade dos seletores ajustada para conservar os overrides dos antigos inline.

Validação: 192 testes frontend (27 arquivos), 286 backend (13 arquivos), lint
frontend e build final passaram. Edge com fixtures locais: Painel IA inicial,
resultado e histórico; fontes/paddings conferidos. Atualizar OS preservou textareas
72px/52px; Encerrar OS preservou 80px e as duas ações de documento, sem erros JS.
E2E: 14 coletados, bloqueado no primeiro lançamento por Chromium headless ausente;
13 não executados. Nenhuma dependência instalada ou configuração E2E alterada.

Sem commit. Demais alterações do Claude preservadas, incluindo watcher e módulos
já extraídos. Próximo passo: revisar o conjunto e executar E2E no ambiente com
navegador disponível. Os registros anteriores abaixo são históricos.

## Regra de convivência

- Só o agente nomeado em `OWNER` edita arquivos. O outro lê.
- Quem assume troca `OWNER`, preenche `HANDOFF_AT` e só então escreve.
- Nenhum dos dois trabalha nos arquivos listados em **Arquivos em edição** sem
  ser o dono.
- A devolução acontece em **ponto seguro**: suítes verdes e árvore de trabalho
  commitada ou com stash nomeado. Nunca no meio de uma edição.

## Ajuste visual concluido — Codex (2026-10-14)

Pedido atual do usuario: acrescentar cor ao tema claro criado pelo Claude.
Alteracoes restritas a `react-app/src/index.css` e `react-app/src/pages/Dashboard.jsx`:
laranja nos acentos de marca e navegacao, azul nas acoes, verde na receita.
Base clara e alteracoes anteriores do Claude preservadas. Sem commit.

Validacao: frontend 184 testes (27 arquivos), backend 104 (11 arquivos) e build Vite passaram.
Revisao visual no Edge com dados ficticios locais: desktop 1440px e celular 390px,
sem overflow horizontal e sem erros de renderizacao. Contraste do texto laranja sobre
fundo suave: 4,98:1. Abas verificadas.
E2E: 14 coletados; primeira tentativa bloqueada por Chromium headless ausente,
13 nao executados. Login real tambem retornou Failed to fetch para o Supabase.
As secoes seguintes preservam o registro anterior do Claude e precisam ser
comparadas ao repositorio antes de retomar outras tarefas.

## Tarefa atual

Duas frentes, ambas **implementadas, verificadas e já na `main`** (PR #13,
merge `5e82bdb`):

1. **Documento da O.S. em PDF (RF05)** — o botão passou de "Salvar PDF"
   (download direto) para "Visualizar PDF". Desde 17/10/2026 o documento abre num
   visualizador **dentro da própria página** (modal com iframe, mais Baixar PDF,
   Imprimir e Fechar): a nova guia dependia de pop-up, que o navegador do usuário
   bloqueava. Corrigido junto o erro `autoTable is not a function`.
2. **Hardening de segurança (migração 19)** — fecha os achados de duas
   auditorias: escalonamento para `gestor` no cadastro de conta, `custo` do
   estoque exposto (e apagável) por atendente, e leitura da configuração da
   oficina sem exigir usuário ativo.

## Alterações realizadas

### PDF da O.S.

| Arquivo | O que mudou |
|---|---|
| `react-app/src/utils/osPdf.js` | `import * as pluginAutoTable` + `desenharTabela()`, que resolve o plugin em três caminhos (função exportada → `doc.autoTable` → `applyPlugin`). O `default` do pacote CJS não chegava como função depois do bundle. Novo `abrirDocumentoOS(dados, windowImpl)`: mesmo PDF, blob URL em nova guia, revogada em 60 s, erro explícito se o pop-up for bloqueado. |
| `react-app/src/utils/exportPDF.js` | Mesmo interop no import dinâmico. |
| `react-app/src/components/ui/AcoesDocumentoOS.jsx` | Botão "Visualizar PDF" (ícone `FileText`) chamando `abrirDocumentoOS`. "Imprimir" inalterado. |
| `react-app/src/utils/osPdf.test.js`, `.../AtualizarOS.test.jsx`, `.../EncerrarOS.test.jsx` | Cobrem a nova guia e o caso de pop-up bloqueado. |

Verificado em Chrome real (Playwright headed): a guia abre com o visualizador,
blob `application/pdf` de ~17 KB começando em `%PDF-`, sem erro de console.

### Segurança — `database/19_hardening_signup_e_custo.sql` (novo)

1. `fn_handle_new_auth_user` grava sempre `perfil = 'mecanico'`; ignora
   `raw_user_meta_data->>'perfil'` e os e-mails fixos de demonstração.
   `ON CONFLICT` não toca mais em `perfil`.
2. View `item_estoque_publico` (sem `custo`, com `WHERE
   fn_perfil_usuario_atual() IS NOT NULL`), `REVOKE` de `anon`; leitura da
   **tabela** `item_estoque` restrita a gestor.
3. Trigger `trg_item_estoque_guard_custo` / `fn_guard_custo_gestor`: RLS não
   recorta coluna, e a policy de UPDATE do atendente permitia apagar `custo`.
4. `pol_configuracao_oficina_select_ativo` e `pol_logos_oficina_select_ativo`
   exigem usuário ativo. Nome novo de propósito: reaplicar a 18 reverteria.
5. Pós-condições que abortam a transação (trigger de cadastro, `anon` sem
   SELECT na view, policies de `item_estoque`, guard de custo, policy da
   oficina, views/matviews legíveis por `anon` com filtro de extensão).

Frontend que acompanha: `ListaEstoque.jsx` (fonte por perfil, esconde
Custo/Margem e omite `custo` do payload fora de gestor), `Sidebar.jsx` e
`AtualizarOS.jsx` (leem a view com fallback), `AuthContext.jsx`
(`carregarPerfil` agora devolve `null` em vez de `'gestor'` — era fail-open).
Docs: `docs/DER.md`, `CLAUDE.md`, `AGENTS.md`.

## Decisões

- **Não reescrever as migrações 15–18**: podem já estar aplicadas no Supabase.
  Tudo entrou na `19`; a próxima é a `20`.
- **Custo é dado de gestor.** Leitura pela view, escrita protegida por trigger.
- **Fail-closed na interface.** Perfil não resolvido não vale gestor.
- **Oráculo de `custo` por UPDATE fica como residual aceito** (atendente pode
  filtrar `?custo=gt.100` e inferir faixas sem ler o valor). Fechar exigiria
  `REVOKE SELECT(custo)`, que cegaria o gestor — mesma role `authenticated`.
- O PDF abre num visualizador na própria página em vez de baixar ou abrir guia:
  `window.open` saiu do caminho do documento porque o bloqueio de pop-ups do site
  (padrão no Safari do iPhone) fazia a tela baixar arquivo que ninguém pediu.

## Testes

```bash
cd react-app && npx vitest run        # 184 passando (28 arquivos)
cd backend   && npx vitest run        # 104 passando (11 arquivos)
cd react-app && npx playwright test   # E2E — NÃO rodado nesta sessão
```

SQL da `19` validado por parser (`pglast`), **não executado em banco nenhum**.

## Próximos passos

1. Rodar a suíte E2E (`npx playwright test`), a única não exercitada.
2. **Ordem de deploy, obrigatória:** publicar o frontend que lê
   `item_estoque_publico` → validar → só então aplicar a `19` no Supabase.
   Invertido, a tela de estoque fica vazia para atendente.
3. Desabilitar o cadastro público no painel do Supabase
   (Authentication > Providers > Email). Nenhum SQL resolve isso.
4. Promover as contas de demonstração: elas não ganham mais perfil automático.
5. Avaliar uma migração `20` para os endurecimentos restantes (H1, H3–H7 do
   primeiro laudo, dentro das 16 e 18).
6. Abrir o PR: a branch `correcao/remove-fallback-ia-e-hardening` já está no
   remoto, com seis commits (IA sem fallback, oficina + PDF da O.S., migrações
   15–17, migração 19 + frontend, documentação, vigia de handoff).

## Vigia de handoff (`scripts/`)

Processo separado que mede o consumo e passa o trabalho ao Codex antes de o
limite estourar. Mora fora da sessão de propósito: quando a cota acaba, o turno
do agente é cortado no meio e não sobra turno para escrever o handoff.

| Arquivo | O que é |
|---|---|
| `scripts/watcher-handoff.mjs` | O vigia. `--relatorio` mostra o consumo, `--dry-run` não aciona nada, `--once` avalia uma vez |
| `scripts/watcher-handoff.config.json` | Janela, orçamento, limiares, pesos e comando do Codex |
| `scripts/iniciar-watcher.ps1` | Sobe em janela oculta (`-DryRun`, `-Parar`) |

Dois gatilhos: **orçamento** (soma ponderada dos tokens das respostas na janela
de 5 h passou de 80 %) e **parada** (turno em aberto sem registro novo por 12
min, com uso acima de 50 %). O segundo cobre a sessão que morre no meio do
turno. A medição soma **todos os projetos**, porque a cota é da conta.

O vigia não commita, não faz stash e não mexe no git: árvore suja vira aviso no
prompt do Codex. O único arquivo que ele escreve é este `CONTEXTO.md` (bloco de
estado e histórico) e os próprios logs. A devolução ao Claude acontece quando o
processo do Codex termina **e** o uso cai abaixo de `limiarRetorno`.

`orcamentoPonderado` (40 M) é estimativa e precisa de calibração: rode
`--relatorio` quando o limite de verdade bater e ajuste para o valor observado.

## Arquivos em edição (não tocar sem ser o dono)

- `database/19_hardening_signup_e_custo.sql`
- `react-app/src/utils/osPdf.js`, `react-app/src/utils/exportPDF.js`
- `react-app/src/components/ui/AcoesDocumentoOS.jsx`
- `react-app/src/pages/Estoque/ListaEstoque.jsx`
- `react-app/src/context/AuthContext.jsx`
- `react-app/src/components/Sidebar.jsx`
- `react-app/src/pages/OrdemServico/AtualizarOS.jsx`
- `docs/DER.md`, `CLAUDE.md`, `AGENTS.md`
- `scripts/watcher-handoff.mjs`, `scripts/watcher-handoff.config.json`, `scripts/iniciar-watcher.ps1`

## Histórico de transferências

Nenhuma até agora.
