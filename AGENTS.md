# AGENTS.md — SIGAuto

Guia para agentes de IA trabalhando neste repositório. Complementa o [README.md](README.md).

> Mantenha `AGENTS.md` e `CLAUDE.md` idênticos (só o título muda): o primeiro é lido pelo Codex e o segundo pelo Claude Code.

## O que é

SIGAuto — Sistema Inteligente de Gestão de Oficinas Automotivas. TFC UniRV 2026 (Bruno Gabriel Guimarães Fernandes). Web app: OS, clientes, veículos, estoque, relatórios e um módulo de IA (Google Gemini) para recomendações e chatbot.

## Estrutura

- `react-app/` — Frontend React 19 + Vite (o cliente principal).
- `backend/` — API Express (ESM), **só o que não pode rodar no navegador**: `authRoutes`, `chatbotRoutes` e `iaRoutes` (health incluso), porque dependem da chave do Gemini e da `service_role`. O cadastro administrativo de conta (`POST /auth/usuarios`) pertence aqui porque usa `auth.admin`; os demais cadastros passam direto pelo Supabase sob RLS. Não crie rota CRUD comum aqui.
- `database/` — Scripts SQL numerados, aplicados **em ordem** no Supabase (**01 → 34**).
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
- **Números financeiros do chatbot passam por ferramenta validada.** O Gemini interpreta métrica/período em `iaService.js`; `consultaFinanceiraChatbot.js` confere os argumentos contra a pergunta e as mensagens anteriores do usuário. O callback de `chatbotController.js` exige gestor e consulta OS concluídas por encerramento, com paginação/contagem exata. A resposta é calculada em centavos e formatada no backend, sem segunda chamada ao modelo. Contexto livre não leva agregados financeiros e respostas antigas do assistente são mascaradas. Falha de consulta não vira zero. O controller tem prazo de 25 s, consultas de até 5 s e persistência de até 2 s limitada ao tempo restante; isso não cria fallback offline.
- **Histórico persistido do chatbot é restrito a gestor desde a migração 30.** Uma conta rebaixada não pode reler respostas financeiras antigas. A API responde `403/HISTORICO_RESTRITO` para não gestores e o RLS também recusa `SELECT` direto. A conversa atual continua disponível; o frontend reinicia o chatbot ao mudar usuário ou perfil. Não remova a proteção restritiva do banco supondo que o middleware protege o Supabase direto.
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
- **`29_hardening_os_usuario_estoque.sql`** — fecha os achados A-05–A-10: limita colunas editáveis da OS por perfil, exige RPC transacional para cancelar com estorno idempotente, impede auto-reativação de usuário, filtra autoria/comissões no RPC de OS, reserva ajuste absoluto de estoque ao gestor e instala uma allowlist global para funções `SECURITY DEFINER`. O frontend que chama `cancelar_ordem_servico` deve ser publicado em rollout coordenado logo após a migração; canceladas históricas exigem conciliação manual.
- **`30_historico_chatbot_gestor.sql`** — restringe `SELECT` de `mensagem_chatbot` a gestor e adiciona policy restritiva para impedir que outra policy permissiva reabra o histórico a uma conta rebaixada. Não apaga mensagens nem adiciona coluna/função privilegiada. Publique junto do backend que recusa o histórico persistido para não gestores e do frontend que reinicia a conversa ao mudar usuário/perfil. Aplicação em produção permanece pendente; API sozinha não fecha acesso direto pelo Supabase.
- **`31_historico_painel_ia_gestor.sql`** — fecha a mesma exposição na leitura direta de `recomendacao_ia`: a policy legada permitia ler por autoria ou vínculo com OS, mesmo após perder o perfil gestor. Adiciona gate restritivo de `SELECT` para gestor, sem apagar análises ou alterar a estrutura. É separada da 30 porque a 30 já havia sido aplicada no banco local quando esse caminho foi identificado. A CI aplica ambas; produção permanece pendente.
- **`32_login_bloqueio_persistente.sql`** — persiste tentativas de login por HMAC do e-mail normalizado, sem guardar o endereço em claro. A RPC atômica é exclusiva do `service_role`; hashes sem atividade são removidos após 30 dias. O backend aplica cinco falhas em 15 minutos no fluxo de login da aplicação. A chave anon é pública e o endpoint de senha do Supabase Auth continua acessível diretamente; esse lockout não substitui os controles nativos do provedor nem bloqueia chamadas externas ao Express. Migração ainda precisa ser aplicada no ambiente de destino.
- **`33_historico_status_os.sql`** — registra transições reais de status de OS por trigger, inclusive autoria autenticada quando disponível; a view `duracao_etapa_os` calcula o tempo entre transições observadas. Não há backfill de durações anteriores à migração. Histórico é append-only para os papéis da aplicação e sua visibilidade acompanha a da OS. Em 25/10/2026 os objetos de 29–33 foram confirmados no catálogo de produção.
- **`34_regras_negocio_servidor.sql`** — fecha QA-01 a QA-06 e os três achados da revisão de segurança de 25/10/2026. Para requisições `authenticated`/`anon`, `numero_os` é gerado só pelo banco depois das validações RN15/RN16, permanece imutável e `anon` não tem escrita na tabela nem privilégios na sequência; a OS nasce `aberta`, inclusive quando o RPC recebe outro status; criar sem queixa não ganha texto padrão; e `criado_em`/`atualizado_em` são do banco. `servico_catalogo` fica sem `DEFAULT 0` em `preco` e com CHECKs de nome/preço. A RN46 também é imposta por trigger `SECURITY INVOKER` em `os_servico`; durante o `DELETE` + `INSERT` transacional, o RPC marca localmente os pares que já existiam para permitir regravar um serviço posteriormente inativado. A ampliação opcional de `numero_os` para `bigint` ficou pendente porque a view `historico_movimentacao_estoque` e funções legadas dependem do tipo `integer`. `service_role` e manutenção direta ficam fora, como nas demais regras. **Aplicação em produção pendente de autorização.**

## Remoção dos legados concluída

As migrações 23–25 normalizam o snapshot de comissão, repetem os backfills com
pós-condições e removem os JSONs da OS, a comissão de `usuario` e o endereço
textual de `cliente`. A 25 aborta se ainda houver endereço textual sem equivalente
estruturado. Não reintroduza fallbacks para essas colunas removidas.

## Convenções

- **Design system imutável:** tema escuro + laranja (`--neon-orange: #E8590C`), fonte Manrope, em `react-app/src/index.css`. Não altere cores/tipografia/layout global sem pedido explícito.
- **Idioma:** código, UI e mensagens de commit em **português**.
- **Commits:** não commite a cada alteração; agrupe em commits significativos e **só quando pedido**. **Sem marca de IA** (nada de "Co-Authored-By" ou "Generated with"). Trabalhe em branch, nunca direto na `main`.
- **Migrações de banco:** nunca reescreva scripts já aplicados; adicione um novo arquivo numerado (**o próximo é o `35`**). Migração deve ser transacional e idempotente, com backfill e pós-condição antes de qualquer `DROP`. Mexeu no schema? Atualize o [`docs/DER.md`](docs/DER.md) **no mesmo commit**.
- **Segredos:** a `SUPABASE_SERVICE_ROLE_KEY` e a `GEMINI_API_KEY` só existem no backend. O frontend usa exclusivamente a chave `anon` + RLS. Nunca mova uma dessas chaves para o `react-app/`.

## Testes

```bash
cd react-app && npx vitest run        # unit + componente
cd react-app && npx playwright test   # E2E
cd backend   && npx vitest run        # unit + integração da API
```

Rode antes de considerar uma mudança concluída. Ambiente: Windows (PowerShell + Git Bash).

Linha de base medida em 18/10/2026: **382 testes de frontend** (35 arquivos), **394 de backend** (20 arquivos), **24 E2E** e **3 suítes SQL** aprovados. A CI executa E2E e os testes SQL contra Supabase efêmero. Caiu o número? Alguma suíte parou de ser coletada.

Medição posterior em 22/10/2026: **389 testes de frontend** (36 arquivos), **529 de backend** (24 arquivos), **24 E2E** e **6 suítes SQL** aprovados; migrações 29–33 reaplicadas no Supabase efêmero. Lint de frontend e backend sem avisos. O build passou, mas conserva um aviso do plugin PostCSS sobre a opção `from`. A migração 32 registra tentativas no servidor; chamadas diretas ao grant de senha do Supabase Auth ainda podem contornar o controller. O DERS também precisa refletir o histórico de status.

Medição de 25/10/2026 (auditoria QA complementar, `docs/AUDITORIA_QA_COMPLEMENTAR.md`): **460 testes de frontend** (46 arquivos), **537 de backend** (27 arquivos), **72 E2E** (Chromium, Firefox e WebKit via `playwright.navegadores.config.js`), **8 suítes SQL** e o teste de concorrência real `database/tests/concorrencia_os_estoque.sh` aprovados, com a 34 aplicada e reaplicada no Supabase efêmero. As suítes `regras_negocio_*` exigem `PGOPTIONS='-c sigauto.ambiente_teste=on'` (queimam valores de sequência). **Nunca rode `npx playwright test` com um `npm run dev` apontado para o Supabase publicado:** o config padrão reaproveita o servidor da 5173 e a jornada grava dados.

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
