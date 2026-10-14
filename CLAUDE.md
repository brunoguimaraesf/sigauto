# CLAUDE.md — SIGAuto

Guia para agentes de IA trabalhando neste repositório. Complementa o [README.md](README.md).

> Mantenha o [AGENTS.md](AGENTS.md) idêntico a este arquivo (só o título muda). Ele é a versão lida pelo Codex.

## O que é

SIGAuto — Sistema Inteligente de Gestão de Oficinas Automotivas. TFC UniRV 2026 (Bruno Gabriel Guimarães Fernandes). Web app: OS, clientes, veículos, estoque, relatórios e um módulo de IA (Google Gemini) para recomendações e chatbot.

## Estrutura

- `react-app/` — Frontend React 19 + Vite (o cliente principal).
- `backend/` — API Express (ESM), **só o que não pode rodar no navegador**: `authRoutes`, `chatbotRoutes` e `iaRoutes` (health incluso), porque dependem da chave do Gemini e da `service_role`. As rotas de cadastro (clientes, veículos, OS, estoque, movimentações, relatórios, usuários) **foram removidas** — operavam com privilégio administrativo e hoje tudo isso passa direto pelo Supabase sob RLS. Não crie rota nova de cadastro aqui.
- `database/` — Scripts SQL numerados, aplicados **em ordem** no Supabase (**01 → 19**).
- `docs/` — a especificação e o modelo de dados. Leia antes de implementar: ver **Documentação** abaixo.

## Documentação

Antes de implementar, consulte — nesta ordem de autoridade:

| Arquivo | O que é | Fonte |
|---|---|---|
| `docs/Desenvolvimento_DERS_BrunoGabrielGuimaraes.docx` | O **DERS**, entrega acadêmica do TFC. **Local, fora do Git** (`.gitignore`): é binário de 9,6 MB e a entrega vai pelo sistema da faculdade | **A fonte dos requisitos.** É este arquivo que você edita no Word |
| `docs/REQUISITOS.md` | A especificação: **RF01–RF15** com critérios de aceite e campos de tela, **RN01–RN50** (regras de negócio), restrições obrigatórias, glossário, **escopo incluído e excluído**, RNF | **Gerado — não edite à mão, e não versionado.** Derivado do `.docx` acima |
| [`docs/DER.md`](docs/DER.md) | O modelo de dados real, em Mermaid | **`database/*.sql`.** Se o DERS e o schema divergirem, o schema ganha — divergências listadas lá |
| [`docs/VALIDACAO_VERIFICACAO.md`](docs/VALIDACAO_VERIFICACAO.md) | Plano de V&V e a matriz de rastreabilidade UC → RF → implementação → teste | **O código e as suítes.** Só rodando os testes se sabe quantos são |

**Requisito novo ou alterado entra pelo `.docx` que está em `docs/`**, nunca editando o `REQUISITOS.md`. Abra `docs/Desenvolvimento_DERS_BrunoGabrielGuimaraes.docx` no Word, salve, e regenere:

```bash
pip install python-docx
python docs/importar-ders.py
```

O script lê a cópia de `docs/` por padrão, avisa se algum RF01–RF15 ou RN01–RN50 desapareceu, e refaz as imagens em `docs/img/`. É idempotente: rodar duas vezes não muda o arquivo, então o diff mostra só o que você alterou no Word.

Edição feita direto no `REQUISITOS.md` é perdida na próxima importação.

**O material do DERS não vai para o Git.** `.gitignore` exclui o `.docx`, o `REQUISITOS.md`, o `docs/img/`, o `docs/importar-ders.py` e o `docs/superpowers/`: são a entrega acadêmica e artefatos derivados dela, não código. Quem clonar o repositório não os terá — guarde cópia própria do `.docx`, porque o Git deixou de ser o backup dele. Versionados em `docs/` ficam só o [`DER.md`](docs/DER.md) e o [`VALIDACAO_VERIFICACAO.md`](docs/VALIDACAO_VERIFICACAO.md).

Três coisas que esses documentos evitam, e que custam caro:

- **Escopo excluído é excluído.** Nota fiscal eletrônica, módulo financeiro, baixa automática de estoque na OS, trilha de auditoria por operação, app móvel nativo e folha de pagamento estão **fora** desta versão. Não implemente por iniciativa própria.
- **Requisito tem número.** Ao mexer num comportamento, cite o RF/RN correspondente no commit e no teste. As 50 regras de negócio (RN01–RN50) são critérios verificáveis, não prosa.
- **Divergência se relata, não se resolve no escuro.** Se o código contradiz o DERS, registre em `docs/DER.md` (última seção) e avise — não escolha um lado em silêncio. Foi assim que apareceram a troca RF12/RF13 na matriz e o `custo` que a tela enviava para uma coluna inexistente.

## Arquitetura (fatos não óbvios)

- **Dados no frontend:** tudo é carregado uma vez em [`react-app/src/hooks/useDatabase.js`](react-app/src/hooks/useDatabase.js) (`DataProvider` + `useDatabase()`), usando a chave **anon** do Supabase + **RLS**. Ao mexer em leitura/escrita de dados, é aqui, não no backend.
- **Itens da OS são relacionais:** `os_servico` e `os_peca` (não mais JSON). `useDatabase` carrega via JOIN e grava com `syncItensOS` (apaga e reinsere). O objeto de OS na aplicação ainda expõe `servicos_itens`/`pecas_itens` como arrays — não mude esse formato interno sem ajustar as telas que consomem.
- **Funcionário ≠ Usuário:** `usuario` é só acesso/login; `funcionario` é o colaborador (cargo + comissão), 1:1 opcional com usuario. OS referencia `funcionario` em `id_mecanico`/`id_atendente` e `usuario` em `id_usuario` (quem registrou). Resolver a equipe de uma OS: `resolveEquipe(os, funcionarios)` em [`react-app/src/utils/osFinance.js`](react-app/src/utils/osFinance.js), que tem fallback para OS antigas sem `id_mecanico`/`id_atendente` (usa o funcionario ligado ao `id_usuario`).
- **Armadilha de nome:** `calcUserCommission(usuario, totals)` em `osFinance.js` tem o parâmetro chamado `usuario`, mas recebe um **funcionario** (quem chama é `calcOSCommissions`, com os funcionarios resolvidos). Não "corrija" isso lendo a comissão de `usuario`: a comissão vive em `funcionario`.
- **Lista de funcionários vem de uma view:** o frontend lê a lista geral por `funcionario_publico` ([`useDatabase.js:209`](react-app/src/hooks/useDatabase.js)), que **não** expõe campos de comissão, com fallback para a tabela em bancos pré-12. Leitura direta de `funcionario` é restrita a gestor + o próprio.
- **RLS:** toda tabela tem RLS. Tabela nova acessada pelo frontend **precisa** de policies (ver `02_rls_policies.sql`, a seção de RLS no `11` e os endurecimentos no `12` e no `14`).
- **A chamada ao Gemini tem duas camadas de contingência**, nesta ordem, em [`backend/src/services/iaService.js`](backend/src/services/iaService.js): `comRetry` (3 tentativas, backoff 0,8 s e 1,6 s) → `comModeloAlternativo` (troca para o 2º modelo de `MODELOS`). **Não há terceira camada:** se os dois modelos falharem, a tela diz que a IA está indisponível e **nenhum número é estimado localmente** — o roteador de respostas fixas (`utils/chatbot.js`) e a análise local do `PainelIA` foram removidos de propósito, e a divergência das RN38/RN42 está registrada em [`docs/DER.md`](docs/DER.md).
- **A classificação do erro da IA é por `e.status`**, não por varredura da mensagem. Sem status, o código tem de estar entre colchetes (`[503 ...]`, formato do SDK) ou no início do texto. Varrer a mensagem inteira errava nas duas direções: retentava um 401 que mencionasse "503" no fim, e **não** retentava erro de transporte (`fetch failed`) nem `AbortError`, que são justamente o que a camada existe para absorver.
- **A operação de IA tem orçamento de tempo total** (`ORCAMENTO_IA_MS`, 20 s), além do teto por chamada (`TIMEOUT_CHAMADA_MS`, 15 s): cada tentativa recebe o menor entre os dois, e o backoff não é dormido se não couber no que resta. Sem o orçamento, 6 chamadas × 15 s davam 90 s e a Vercel matava a função no meio — o usuário pagava a espera inteira e nada era persistido. O pior caso cabe no `maxDuration: 30` do `backend/vercel.json`.
- **Ao trocar de modelo do Gemini, teste com uma chamada real.** O `ListModels` da API lista modelos que respondem **404 "no longer available to new users"** — foi o caso do `gemini-2.5-flash-lite`. A lista mente; a chamada não. A medição que escolheu os modelos atuais está comentada em cima de `MODELOS`.
- **Função nova no banco precisa de `EXECUTE` revogado de `anon`.** A migração `14` existe porque duas funções `SECURITY DEFINER` eram chamáveis por RPC com a chave pública, driblando o RLS. Ao criar função, fixe o `search_path` e conceda `EXECUTE` só a quem precisa.

## Modelo de dados

Entidades (`database/`): `cliente`, `endereco`, `veiculo`, `usuario`, `funcionario`, `ordem_servico`, `os_servico`, `os_peca`, `item_estoque`, `movimentacao_estoque`, `servico_catalogo`, `recomendacao_ia`, `mensagem_chatbot`, `log_auditoria`. Mais a view `funcionario_publico`.

Enums: `perfil_usuario`, `cargo_funcionario`, `status_os`, `tipo_movimentacao`, `tipo_pessoa`.

Migrações que o README não cobre:

- **`12_hardening_rls_funcionario.sql`** — corrige dois achados de segurança do modelo do `11`: o `WITH CHECK` de `pol_os_mecanico_update` permitia o mecânico reatribuir a OS a outro funcionário, e `funcionario` tinha `SELECT` liberado a todos (expondo comissão). Criou a view `funcionario_publico`. **Ordem de deploy importa:** só rode depois de publicar o frontend que lê a view — o que já está feito.
- **`13_endereco_cliente.sql`** — estrutura o endereço do cliente numa entidade `endereco` 1:1 com `cliente` (`id_cliente` UNIQUE), em vez do texto livre `cliente.endereco`. Regras de CEP e ViaCEP em [`react-app/src/utils/endereco.js`](react-app/src/utils/endereco.js).
- **`14_hardening_advisor.sql`** — achados do Security Advisor do Supabase. O crítico: funções `SECURITY DEFINER` (`get_dashboard_stats`, `get_relatorio_faturamento`) tinham `EXECUTE` aberto, e a role **`anon`** — cuja chave está no bundle do frontend — conseguia chamá-las por RPC e **ler dados do negócio sem login**, passando por cima do RLS. Revoga `EXECUTE`, fixa `search_path` e indexa FKs. `fn_perfil_usuario_atual` continua acessível a `authenticated`, porque as policies dependem dela.
- **`15_custo_item_estoque.sql`** — acrescenta `item_estoque.custo` **anulável** (`NULL` = não informado, `0` = custo zero), exigido pelo RF09 e pela RN35 e que nunca existia. A tela já enviava o campo, então o custo era recusado pelo PostgREST. A **margem continua derivada**, calculada na tela; não crie coluna para ela.
- **`16_hardening_execute_restante.sql`** — fecha o que a `14` deixou aberto. O projeto tem 11 funções `SECURITY DEFINER` e a 14 revogou o `EXECUTE` de 8; ficaram **três** com o default do PostgreSQL (`EXECUTE` para `PUBLIC`), e duas delas — `get_clientes_frequentes` e `get_relatorio_atendimentos` — devolviam nome, **CPF/CNPJ** e telefone de cliente a quem chamasse por RPC com a chave `anon`, **sem login**. Revoga, fixa `search_path`, fecha com `REVOKE` explícito a view `funcionario_publico` (que ignora RLS por design e nunca teve `REVOKE` de `anon`), e termina com uma **pós-condição que falha a transação** se alguma `SECURITY DEFINER` de `public` ainda estiver chamável por `anon` — função nova que esqueça o `REVOKE` acusa aqui.
- **`17_check_preco_unit.sql`** — acrescenta o `CHECK` de nao-negatividade que faltava em `item_estoque.preco_unit`. **Em script proprio, de proposito:** `ADD CONSTRAINT` valida as linhas existentes, e uma unica linha negativa abortaria a transacao — junto da `16` isso desfaria os `REVOKE` de seguranca e deixaria a vulnerabilidade aberta por motivo de **dado**. Correcao de dado e correcao de seguranca nao compartilham transacao.

- **`19_hardening_signup_e_custo.sql`** — fecha os achados da auditoria das migracoes 15-18, nenhum deles introduzido por elas. O critico: `fn_handle_new_auth_user` copiava `raw_user_meta_data->>'perfil'` para `usuario.perfil`, entao um `signup` com a chave **anon** do bundle e `"data": {"perfil": "gestor"}` criava conta gestor e passava em todas as policies do projeto — o trigger agora grava sempre `mecanico`, e promover e `UPDATE` de gestor. Tambem tira `item_estoque.custo` do alcance do atendente (view `item_estoque_publico` sem a coluna, leitura da tabela so para gestor) e exige usuario presente para ler `configuracao_oficina` e o logo. **Ordem de deploy:** publique antes o frontend que le a view, senao a tela de estoque fica vazia para atendente. Acrescenta ainda o trigger `trg_item_estoque_guard_custo` (RLS nao recorta coluna: a policy de UPDATE do atendente deixava ele apagar o custo que nao pode ver), poe `fn_perfil_usuario_atual() IS NOT NULL` na view (que ignora RLS) e cria a policy da oficina com nome proprio, para reaplicar a 18 nao reverter o conserto. **Nao reexecute `01` nem `02` em banco provisionado:** eles recriam o trigger vulneravel e a `pol_estoque_atendente_select`.

## Migrações com "Fase 2" pendente

Duas limpezas estão **comentadas** no fim dos scripts e **ainda não podem rodar**, porque o frontend lê as colunas antigas como fallback. O banco hoje tem o formato novo **e** o antigo convivendo — conte com isso.

| Script | O que a Fase 2 remove | Por que ainda não dá |
|---|---|---|
| `11_normalizacao_relacional.sql` | `ordem_servico.servicos_itens`, `.pecas_itens`, `.comissao_detalhes` e `usuario.comissao_*` | `useDatabase.js:65-66` cai nos arrays JSONB antigos quando `os_servico`/`os_peca` vêm vazios |
| `13_endereco_cliente.sql` | `cliente.endereco` | `useDatabase.js:91` e `Clientes.jsx` ainda exibem o texto livre nos registros antigos (`formatarEndereco(estruturado, legado)`) |

Antes de propor qualquer `DROP` dessas colunas: confirme que nenhum registro depende do fallback e tire o fallback do código primeiro, em commit separado.

## Convenções

- **Design system imutável:** tema escuro + laranja (`--neon-orange: #E8590C`), fonte Manrope, em `react-app/src/index.css`. Não altere cores/tipografia/layout global sem pedido explícito.
- **Idioma:** código, UI e mensagens de commit em **português**.
- **Commits:** não commite a cada alteração; agrupe em commits significativos e **só quando pedido**. **Sem marca de IA** (nada de "Co-Authored-By" ou "Generated with"). Trabalhe em branch, nunca direto na `main`.
- **Migrações de banco:** nunca reescreva scripts já aplicados; adicione um novo arquivo numerado (**o próximo é o `20`**). Migração deve ser transacional e idempotente, com backfill antes de qualquer `DROP` (padrão do `11` e do `13`: cria e backfilla primeiro, deixa o drop como "Fase 2" comentada). Mexeu no schema? Atualize o [`docs/DER.md`](docs/DER.md) **no mesmo commit**.
- **Segredos:** a `SUPABASE_SERVICE_ROLE_KEY` e a `GEMINI_API_KEY` só existem no backend. O frontend usa exclusivamente a chave `anon` + RLS. Nunca mova uma dessas chaves para o `react-app/`.

## Testes

```bash
cd react-app && npx vitest run        # unit + componente
cd react-app && npx playwright test   # E2E
cd backend   && npx vitest run        # unit + integração da API
```

Rode antes de considerar uma mudança concluída. Ambiente: Windows (PowerShell + Git Bash).

Linha de base medida em 13/10/2026: **136 testes de frontend** (24 arquivos), **99 de backend** (10 arquivos) e **12 E2E**, todos passando. Caiu o número? Alguma suíte parou de ser coletada.

## Deploy

Vercel (frontend e backend serverless). Merge na `main` dispara deploy automático. Variáveis de ambiente ficam no painel da Vercel; `.env` é gitignored.

Quando a mudança envolver banco **e** frontend, respeite a ordem: publique o frontend que tolera os dois formatos, valide, e só então rode a migração que restringe (foi o caso do `12`).

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
