# AGENTS.md — SIGAuto

Guia para agentes de IA trabalhando neste repositório. Complementa o [README.md](README.md).

> Mantenha `AGENTS.md` e `CLAUDE.md` idênticos (só o título muda): o primeiro é lido pelo Codex e o segundo pelo Claude Code.

## O que é

SIGAuto — Sistema Inteligente de Gestão de Oficinas Automotivas. TFC UniRV 2026 (Bruno Gabriel Guimarães Fernandes). Web app: OS, clientes, veículos, estoque, relatórios e um módulo de IA (Google Gemini) para recomendações e chatbot.

## Estrutura

- `react-app/` — Frontend React 19 + Vite (o cliente principal).
- `backend/` — API Express (ESM), **só o que não pode rodar no navegador**: `authRoutes`, `chatbotRoutes` e `iaRoutes` (health incluso), porque dependem da chave do Gemini e da `service_role`. O cadastro administrativo de conta (`POST /auth/usuarios`) pertence aqui porque usa `auth.admin`; os demais cadastros passam direto pelo Supabase sob RLS. Não crie rota CRUD comum aqui.
- `database/` — Scripts SQL numerados, aplicados **em ordem** no Supabase (**01 → 28**).
- `docs/` — a especificação e o modelo de dados. Leia antes de implementar: ver **Documentação** abaixo.

## Documentação

Antes de implementar, consulte — nesta ordem de autoridade:

| Arquivo | O que é | Fonte |
|---|---|---|
| [`docs/Desenvolvimento_DERS_BrunoGabrielGuimaraes.docx`](docs/Desenvolvimento_DERS_BrunoGabrielGuimaraes.docx) | O **DERS**, entrega acadêmica do TFC | **A fonte dos requisitos.** Edite este arquivo no Word |
| [`docs/REQUISITOS.md`](docs/REQUISITOS.md) | RF01–RF15, RN01–RN50, critérios e escopo | **Gerado — não edite à mão.** Derivado do `.docx` |
| [`docs/DER.md`](docs/DER.md) | O modelo de dados real, em Mermaid | **`database/*.sql`.** Se a especificação e o schema divergirem, o schema ganha — divergências listadas lá |
| [`docs/VALIDACAO_VERIFICACAO.md`](docs/VALIDACAO_VERIFICACAO.md) | Plano de V&V e a matriz de rastreabilidade UC → RF → implementação → teste | **O código e as suítes.** Só rodando os testes se sabe quantos são |

Requisito novo ou alterado entra pelo `.docx`, seguido de `python docs/importar-ders.py`.
O `REQUISITOS.md` e as imagens são artefatos gerados e versionados.

Três coisas que esses documentos evitam, e que custam caro:

- **Escopo excluído é excluído.** Nota fiscal eletrônica, módulo financeiro, trilha de auditoria por operação, app móvel nativo e folha de pagamento estão **fora** desta versão. Não implemente por iniciativa própria. A baixa automática de peças da OS passou a integrar o RF05/RF10.
- **Requisito tem número.** Ao mexer num comportamento, cite o RF/RN correspondente no commit e no teste. As 50 regras de negócio (RN01–RN50) são critérios verificáveis, não prosa.
- **Divergência se relata, não se resolve no escuro.** Se o código contradiz a especificação, registre em `docs/DER.md` (última seção) e avise — não escolha um lado em silêncio. Foi assim que apareceram a troca RF12/RF13 na matriz e o `custo` que a tela enviava para uma coluna inexistente.

## Arquitetura (fatos não óbvios)

- **Dados no frontend:** tudo é carregado uma vez em [`react-app/src/hooks/useDatabase.js`](react-app/src/hooks/useDatabase.js) (`DataProvider` + `useDatabase()`), usando a chave **anon** do Supabase + **RLS**. Ao mexer em leitura/escrita de dados, é aqui, não no backend.
- **Itens da OS são relacionais:** `os_servico` e `os_peca` (não mais JSON). `useDatabase` carrega via JOIN e grava com `syncItensOS` (apaga e reinsere). O objeto de OS na aplicação ainda expõe `servicos_itens`/`pecas_itens` como arrays — não mude esse formato interno sem ajustar as telas que consomem.
- **Funcionário ≠ Usuário:** `usuario` é só acesso/login; `funcionario` é o colaborador (cargo + comissão), 1:1 opcional com usuario. OS referencia `funcionario` em `id_mecanico`/`id_atendente` e `usuario` em `id_usuario` (quem registrou). Resolver a equipe de uma OS: `resolveEquipe(os, funcionarios)` em [`react-app/src/utils/osFinance.js`](react-app/src/utils/osFinance.js), que tem fallback para OS antigas sem `id_mecanico`/`id_atendente` (usa o funcionario ligado ao `id_usuario`).
- **Armadilha de nome:** `calcUserCommission(usuario, totals)` em `osFinance.js` tem o parâmetro chamado `usuario`, mas recebe um **funcionario** (quem chama é `calcOSCommissions`, com os funcionarios resolvidos). Não "corrija" isso lendo a comissão de `usuario`: a comissão vive em `funcionario`.
- **Lista de funcionários vem de uma view:** o frontend lê a lista geral por `funcionario_publico`, que **não** expõe campos de comissão. Se a view estiver ausente durante o deploy, o DataProvider usa temporariamente a leitura direta de `funcionario`, ainda limitada por RLS a gestor + o próprio; nesse estado, perfis não gestores podem ver somente o próprio registro.
- **RLS:** toda tabela tem RLS. Tabela nova acessada pelo frontend **precisa** de policies (ver `02_rls_policies.sql`, a seção de RLS no `11` e os endurecimentos no `12` e no `14`).
- **A chamada ao Gemini tem duas camadas de contingência**, nesta ordem, em [`backend/src/services/iaService.js`](backend/src/services/iaService.js): `comRetry` (3 tentativas, backoff 0,8 s e 1,6 s) → `comModeloAlternativo` (troca para o 2º modelo de `MODELOS`). **Não há terceira camada:** se os dois modelos falharem, a tela diz que a IA está indisponível e **nenhum número é estimado localmente** — o roteador de respostas fixas (`utils/chatbot.js`) e a análise local do `PainelIA` foram removidos de propósito, e a divergência das RN38/RN42 está registrada em [`docs/DER.md`](docs/DER.md).
- **A classificação do erro da IA é por `e.status`**, não por varredura da mensagem. Sem status, o código tem de estar entre colchetes (`[503 ...]`, formato do SDK) ou no início do texto. Varrer a mensagem inteira errava nas duas direções: retentava um 401 que mencionasse "503" no fim, e **não** retentava erro de transporte (`fetch failed`) nem `AbortError`, que são justamente o que a camada existe para absorver.
- **A operação de IA tem orçamento de tempo total** (`ORCAMENTO_IA_MS`, 20 s), além do teto por chamada (`TIMEOUT_CHAMADA_MS`, 15 s): cada tentativa recebe o menor entre os dois, e o backoff não é dormido se não couber no que resta. Sem o orçamento, 6 chamadas × 15 s davam 90 s e a Vercel matava a função no meio — o usuário pagava a espera inteira e nada era persistido. O pior caso cabe no `maxDuration: 30` do `backend/vercel.json`.
- **Ao trocar de modelo do Gemini, teste com uma chamada real.** O `ListModels` da API lista modelos que respondem **404 "no longer available to new users"** — foi o caso do `gemini-2.5-flash-lite`. A lista mente; a chamada não. A medição que escolheu os modelos atuais está comentada em cima de `MODELOS`.
- **Função nova no banco precisa de `EXECUTE` revogado de `anon`.** A migração `14` existe porque duas funções `SECURITY DEFINER` eram chamáveis por RPC com a chave pública, driblando o RLS. Ao criar função, fixe o `search_path` e conceda `EXECUTE` só a quem precisa.

## Modelo de dados

Entidades (`database/`): `cliente`, `endereco`, `veiculo`, `usuario`, `funcionario`, `ordem_servico`, `os_servico`, `os_peca`, `os_comissao`, `os_baixa_estoque`, `item_estoque`, `movimentacao_estoque`, `servico_catalogo`, `configuracao_oficina`, `recomendacao_ia`, `mensagem_chatbot`, `log_auditoria`. Mais as views `funcionario_publico`, `item_estoque_publico` e `historico_movimentacao_estoque`.

Enums: `perfil_usuario`, `cargo_funcionario`, `status_os`, `tipo_movimentacao`, `tipo_pessoa`.

Migrações que o README não cobre:

- **`12_hardening_rls_funcionario.sql`** — corrige dois achados de segurança do modelo do `11`: o `WITH CHECK` de `pol_os_mecanico_update` permitia o mecânico reatribuir a OS a outro funcionário, e `funcionario` tinha `SELECT` liberado a todos (expondo comissão). Criou a view `funcionario_publico`. **Ordem de deploy importa:** só rode depois de publicar o frontend que lê a view — o que já está feito.
- **`13_endereco_cliente.sql`** — estrutura o endereço do cliente numa entidade `endereco` 1:1 com `cliente` (`id_cliente` UNIQUE), em vez do texto livre `cliente.endereco`. Regras de CEP e ViaCEP em [`react-app/src/utils/endereco.js`](react-app/src/utils/endereco.js).
- **`14_hardening_advisor.sql`** — achados do Security Advisor do Supabase. O crítico: funções `SECURITY DEFINER` (`get_dashboard_stats`, `get_relatorio_faturamento`) tinham `EXECUTE` aberto, e a role **`anon`** — cuja chave está no bundle do frontend — conseguia chamá-las por RPC e **ler dados do negócio sem login**, passando por cima do RLS. Revoga `EXECUTE`, fixa `search_path` e indexa FKs. `fn_perfil_usuario_atual` continua acessível a `authenticated`, porque as policies dependem dela.
- **`15_custo_item_estoque.sql`** — acrescenta `item_estoque.custo` **anulável** (`NULL` = não informado, `0` = custo zero), exigido pelo RF09 e pela RN35 e que nunca existia. A tela já enviava o campo, então o custo era recusado pelo PostgREST. A **margem continua derivada**, calculada na tela; não crie coluna para ela.
- **`16_hardening_execute_restante.sql`** — fecha o que a `14` deixou aberto. O projeto tem 11 funções `SECURITY DEFINER` e a 14 revogou o `EXECUTE` de 8; ficaram **três** com o default do PostgreSQL (`EXECUTE` para `PUBLIC`), e duas delas — `get_clientes_frequentes` e `get_relatorio_atendimentos` — devolviam nome, **CPF/CNPJ** e telefone de cliente a quem chamasse por RPC com a chave `anon`, **sem login**. Revoga, fixa `search_path`, fecha com `REVOKE` explícito a view `funcionario_publico` (que ignora RLS por design e nunca teve `REVOKE` de `anon`), e termina com uma **pós-condição que falha a transação** se alguma `SECURITY DEFINER` de `public` ainda estiver chamável por `anon` — função nova que esqueça o `REVOKE` acusa aqui.
- **`17_check_preco_unit.sql`** — acrescenta o `CHECK` de nao-negatividade que faltava em `item_estoque.preco_unit`. **Em script proprio, de proposito:** `ADD CONSTRAINT` valida as linhas existentes, e uma unica linha negativa abortaria a transacao — junto da `16` isso desfaria os `REVOKE` de seguranca e deixaria a vulnerabilidade aberta por motivo de **dado**. Correcao de dado e correcao de seguranca nao compartilham transacao.

- **`19_hardening_signup_e_custo.sql`** — fecha os achados da auditoria das migracoes 15-18, nenhum deles introduzido por elas. O critico: `fn_handle_new_auth_user` copiava `raw_user_meta_data->>'perfil'` para `usuario.perfil`, entao um `signup` com a chave **anon** do bundle e `"data": {"perfil": "gestor"}` criava conta gestor e passava em todas as policies do projeto — o trigger agora grava sempre `mecanico`, e promover e `UPDATE` de gestor. Tambem tira `item_estoque.custo` do alcance do atendente (view `item_estoque_publico` sem a coluna, leitura da tabela so para gestor) e exige usuario presente para ler `configuracao_oficina` e o logo. **Ordem de deploy:** publique antes o frontend que le a view, senao a tela de estoque fica vazia para atendente. Acrescenta ainda o trigger `trg_item_estoque_guard_custo` (RLS nao recorta coluna: a policy de UPDATE do atendente deixava ele apagar o custo que nao pode ver), poe `fn_perfil_usuario_atual() IS NOT NULL` na view (que ignora RLS) e cria a policy da oficina com nome proprio, para reaplicar a 18 nao reverter o conserto. **Nao reexecute `01` nem `02` em banco provisionado:** eles recriam o trigger vulneravel e a `pol_estoque_atendente_select`.
- **`20_fix_rls_cliente_mecanico.sql`** — corrige a policy de cliente usando `funcionario.id_usuario = auth.uid()`, cria vínculos de funcionário ausentes e faz contas de signup direto nascerem inativas. Também preserva endereços textuais na entidade estruturada antes do rollout do frontend.
- **`21_os_desconto_observacoes.sql`** — persiste o tipo, valor e percentual do desconto e as observações finais, com backfill monetário das OS históricas.
- **`22_baixa_automatica_estoque_os.sql`** — introduz o RPC transacional `finalizar_ordem_servico`, o estado idempotente em `os_baixa_estoque`, o baseline das OS históricas e a view segura `historico_movimentacao_estoque`. `EXECUTE` fica revogado de `anon`.
- **`23_os_comissao_snapshot.sql`** — cria `os_comissao`, captura o snapshot imutável dentro do encerramento e fornece RPCs transacionais para OS + itens e cliente + endereço.
- **`24_remocao_legados_os_usuario.sql`** — repete backfills, valida pós-condições e remove JSONs da OS e comissão de `usuario`.
- **`25_remocao_endereco_legado.sql`** — preserva qualquer texto restante em `endereco.ponto_referencia`, valida a pós-condição e remove `cliente.endereco`.
- **`26_enforcement_os_estoque.sql`** — fase restritiva pós-frontend: torna o ledger append-only, ativa os guards de saldo/finalização e impede alteração direta dos itens de OS concluída ou cancelada.
- **`27_repara_trigger_estoque.sql`** — reinstala o trigger que aplica o ledger ao saldo, reconcilia movimentos automáticos de OS quando detecta que o trigger estava ausente e restaura a view autenticada do histórico. O script bloqueia o ledger durante o reparo e, depois que instala o trigger, a reaplicação não reconcilia novamente.
- **`28_repara_guard_custo_estoque.sql`** — reinstala os objetos da 19 que não existiam no banco publicado: a view `item_estoque_publico`, a função `fn_guard_custo_gestor` e o trigger `trg_item_estoque_guard_custo`. A 19 ficou pela metade: o `DROP POLICY` de `pol_estoque_atendente_select` foi aplicado, mas a view que a substituiria não — a tela de estoque ficava **vazia para o atendente**, sem erro, porque o fallback do frontend lê a tabela e o RLS filtra linha em silêncio; e o `custo` ficava gravável por quem não pode lê-lo. Difere da 19 em um ponto: a sentinela do INSERT por não gestor segue a nulidade real da coluna (`NULL` se anulável, `0` se `NOT NULL`), porque a 15 tambem nunca foi aplicada e `custo` nasceu `NOT NULL DEFAULT 0` à mão. Divergência registrada em `docs/DER.md`. A 28 fecha ainda um terceiro defeito, alheio à 19: as três views que ignoram o RLS por design revogavam privilégio só de `PUBLIC` e `anon`, e `REVOKE ... FROM PUBLIC` não apaga concessão nominal a `authenticated` — o default privilege do Supabase deixava `INSERT`/`UPDATE`/`DELETE` em `funcionario_publico`, `item_estoque_publico` e `historico_movimentacao_estoque`. `funcionario_publico` é auto-atualizável e expõe `id_usuario`: um mecânico repontava um funcionário para o próprio `auth.uid()` e lia comissão alheia e CPF/CNPJ de todos os clientes. **View que ignora RLS precisa de `REVOKE` nominal de `authenticated`, não só de `PUBLIC` e `anon`.**

## Remoção dos legados concluída

As migrações 23–25 normalizam o snapshot de comissão, repetem os backfills com
pós-condições e removem os JSONs da OS, a comissão de `usuario` e o endereço
textual de `cliente`. A 25 aborta se ainda houver endereço textual sem equivalente
estruturado. Não reintroduza fallbacks para essas colunas removidas.

## Convenções

- **Design system imutável:** tema escuro + laranja (`--neon-orange: #E8590C`), fonte Manrope, em `react-app/src/index.css`. Não altere cores/tipografia/layout global sem pedido explícito.
- **Idioma:** código, UI e mensagens de commit em **português**.
- **Commits:** não commite a cada alteração; agrupe em commits significativos e **só quando pedido**. **Sem marca de IA** (nada de "Co-Authored-By" ou "Generated with"). Trabalhe em branch, nunca direto na `main`.
- **Migrações de banco:** nunca reescreva scripts já aplicados; adicione um novo arquivo numerado (**o próximo é o `29`**). Migração deve ser transacional e idempotente, com backfill e pós-condição antes de qualquer `DROP`. Mexeu no schema? Atualize o [`docs/DER.md`](docs/DER.md) **no mesmo commit**.
- **Segredos:** a `SUPABASE_SERVICE_ROLE_KEY` e a `GEMINI_API_KEY` só existem no backend. O frontend usa exclusivamente a chave `anon` + RLS. Nunca mova uma dessas chaves para o `react-app/`.

## Testes

```bash
cd react-app && npx vitest run        # unit + componente
cd react-app && npx playwright test   # E2E
cd backend   && npx vitest run        # unit + integração da API
```

Rode antes de considerar uma mudança concluída. Ambiente: Windows (PowerShell + Git Bash).

Linha de base medida em 17/10/2026: **207 testes de frontend** (29 arquivos), **291 de backend** (14 arquivos) aprovados e **17 E2E** coletados. A CI executa E2E e os testes SQL contra Supabase efêmero. Caiu o número? Alguma suíte parou de ser coletada.

## Deploy

Vercel (frontend e backend serverless). Merge na `main` dispara deploy automático. Variáveis de ambiente ficam no painel da Vercel; `.env` é gitignored.

Para o lote 20–27, o rollout é obrigatório em três fases: aplique **20–23** (aditivas), publique frontend + backend, valide, e só então aplique **24–27** (remoção/enforcement/reparo). Não aplique 24–27 antes do frontend novo e não publique o frontend antes da 23.

## Equipe de subagents

Há subagents especializados disponíveis nesta máquina. Use `/equipe` para despachar os relevantes em paralelo e receber um relatório consolidado; ou chame um direto quando souber qual quer.

| Papel | Quando usar neste projeto |
|---|---|
| `analista-de-plano` | antes de começar algo novo, ou para validar um plano/spec |
| `seguranca` | mexeu em RLS, policy, auth, perfil, `service_role`, contexto do chatbot ou dependência |
| `testador` | depois de alterar `useDatabase`, `osFinance` ou qualquer página |
| `revisor-de-codigo` | antes de abrir PR |
| `doc-tecnico` | mudou o schema, criou migração ou precisa de DER / requisitos |
| `designer-ui` | tela nova ou ajuste de UI — respeitando o design system imutável acima |
| `desenvolvedor` | implementar **uma** tarefa já delimitada do plano |

**Áreas que disparam auditoria automática de segurança** (um hook `Stop` pede o `seguranca` sozinho ao fim do turno): qualquer arquivo em `database/` ou `*.sql`, e caminhos com auth, login, sessão, token, permissão, segredo, `.env`, pagamento, ou os manifestos de dependência. Em outras palavras: quase toda mudança de banco deste projeto vai pedir o laudo. Isso é esperado.
