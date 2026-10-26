# Auditoria complementar de QA — SIGAuto

| Campo | Valor |
| --- | --- |
| Data | 25/10/2026 |
| Commit base | `4cfc18d` (`melhorias/login-desempenho-historico-os`), árvore limpa no início |
| Alterações desta auditoria | locais, **não commitadas e não publicadas** |
| Banco usado | Supabase efêmero local (Docker `supabase_db_sigauto-e2e`, PostgreSQL 17.11, migrações 01–33) |
| Produção | **não acessada**. Nenhuma migração, teste ou chamada foi feita contra o projeto publicado |

## 0. Atualização — correções da segunda rodada (25/10/2026)

As seções 1 a 10 descrevem a auditoria como foi feita. Depois dela, a pedido do responsável, os achados
foram corrigidos na árvore local. Nada foi commitado. A aplicação da 34 em produção foi
**recusada pelo responsável** no momento da execução e continua pendente.

| ID | Estado agora | Onde |
| --- | --- | --- |
| QA-01..06 | **Corrigidos no schema** pela migração `34_regras_negocio_servidor.sql`, aplicada e reaplicada no Supabase efêmero. A antiga `regras_negocio_lacunas_test.sql` virou a regressão `regras_negocio_servidor_test.sql` e **passa** | `database/34_...`, `database/tests/` |
| QA-03 | Número só do sistema: `numero_os` sem `DEFAULT`, trigger numera todo `INSERT` de app e recusa `UPDATE`; duas criações seguidas recebem números consecutivos (sem buraco) | idem |
| Revisão de segurança da 34 | **Três achados corrigidos localmente:** RN46 também em escrita direta de `os_servico`, com regravação segura dos pares anteriores pelo RPC; criação sem queixa recusada e `status` do cliente descartado; RN15/RN16 antes de `nextval`, com DML e sequência revogados de `anon`. Pós-condições cobrem trigger, `SECURITY INVOKER`, `search_path`, grants e sequência | `database/34_...`, `database/tests/regras_negocio_servidor_test.sql` |
| QA-09 | **Corrigido:** faturamento pela data de encerramento; linhas = OS da receita | `Relatorios.jsx`, `Relatorios.periodo.test.jsx` |
| QA-10 | **Corrigido:** tela calcula como o banco (centésimos inteiros, soma por categoria arredondada); desconto e comissão idem | `osFinance.js`, `EncerrarOS.jsx`, `osFinance.arredondamento.test.js` |
| QA-11 | **Fechado no local/self-hosted; produção Free ainda depende de CAPTCHA.** A migração 35 e `supabase/config.toml` ativam o Password Verification Hook: cinco falhas bloqueiam também o grant direto por 15 minutos. O backend propaga o `429` sem contar outra falha | `database/35_...`, `login_direto_auth_hook_test.sql/.mjs`, `authController.js` |
| QA-12 | **Corrigido:** `body-parser@2.4.0`; `npm audit --omit=dev` backend em 0 | `backend/package-lock.json` |
| QA-05 (tela) | Nome só com espaços e preço inválido recusados antes do banco | `Servicos.jsx`, `Servicos.rn45.test.jsx` |
| Laudo de segurança | Os 5 ajustes aplicados: SQLSTATE esperado em cada recusa, trava `sigauto.ambiente_teste=on`, `IS DISTINCT FROM`, preço omitido na RN45, casos base64 por posição + espaço | testes SQL e `verifica-bundle.segredos.test.js` |
| CI | Reaplica a 34 e roda `regras_negocio_test.sql`, `regras_negocio_servidor_test.sql` e `concorrencia_os_estoque.sh` | `.github/workflows/ci.yml` |
| Coleção Postman | **Executada em 26/10/2026:** 30/30 requisições e 91/91 assertions; RN30 com e-mail inexistente 3/3, sem itens ignorados | `docs/api/RESULTADO_POSTMAN_LOCAL_2026-10-26.md` |

Medição depois da segunda rodada: **frontend 460/460** (46 arquivos), **backend 537/537** (27), lint
dos dois sem avisos, build aprovado, **E2E 72/72** nos três navegadores contra o efêmero com a 34,
**8/8 suítes SQL** e **concorrência 15/15**. Um teste existente teve a asserção trocada por decisão do
QA-10: `EncerrarOS.test.jsx` esperava enviar `desconto_valor` 9,999 (float) e agora espera 10, o
valor que o banco grava.

A ampliação opcional de `numero_os` para `bigint` não entrou neste lote: a view
`historico_movimentacao_estoque` depende diretamente da coluna e funções legadas declaram `numero_os INT`.
Ela exige uma migração de compatibilidade própria, fora dos três achados fechados aqui.

Medição após fechar os três achados da revisão da 34: migração aplicada **duas vezes** sem erro,
**8/8 suítes SQL**, concorrência **15/15**, frontend **460/460** (46 arquivos), backend **537/537**
(27 arquivos), lint dos dois sem avisos, build aprovado e E2E **72/72** nos três navegadores contra
servidores isolados e o Supabase efêmero. O build/E2E conserva apenas o aviso PostCSS já conhecido.

Produção, conferida por leitura de catálogo via MCP: os objetos de 29–33 **já existem** (os documentos
que diziam "pendente" estavam desatualizados); funções `criar_`/`salvar_ordem_servico_com_itens`
idênticas às do efêmero; nenhuma queixa curta, nome em branco ou preço negativo, ou seja, a 34
aplicaria sem violar dado existente. Plano da organização: **Free**.

Passos externos para fechar QA-11 no projeto hospedado Free: criar um site no Cloudflare Turnstile (gratuito); configurar
`VITE_TURNSTILE_SITE_KEY` no projeto Vercel do frontend e publicar frontend e backend; **depois**
ligar Authentication → Attack Protection → CAPTCHA (Turnstile, com a chave secreta) no painel do
Supabase. Invertida, a ordem trava todos os logins.

No Supabase efêmero/self-hosted, a migração 35 e o Password Verification Hook já fecharam a
contraprova: quatro senhas incorretas retornaram `400`, a quinta e a senha correta durante o bloqueio
retornaram `429`, e o login voltou a `200` após a expiração simulada. O hook hospedado exige plano
Teams/Enterprise; por isso essa evidência local não substitui a ativação do CAPTCHA no plano Free.

## 1. Relatórios históricos versus estado real

| Documento | Base declarada | Situação em 25/10/2026 |
| --- | --- | --- |
| `TESTES_SIGAUTO.md`, `AUDITORIA_SIGAUTO.md`, `CORRECOES_SIGAUTO.md` | `1c9d978`, 18/10, schema até a 29 | **Históricos.** Números (382/394/24/3) e "próxima migração 30" estão superados |
| `docs/VALIDACAO_VERIFICACAO.md` | 22/10, migrações 29–33 | Coerente com o código; a lista de RNs sem evidência (§4.3) é a lacuna que esta auditoria atacou |
| `CLAUDE.md`/`AGENTS.md` | 22/10 | Coerentes (389/529/24/6 SQL), exceto o achado novo de `body-parser` |

A medição de base desta auditoria (seção 3) encontrou **402 frontend (37 arquivos)** e **529 backend
(24 arquivos)** em `4cfc18d`. Os 389/36 de 22/10 estão superados por commits posteriores.

## 2. Inventário dos testes existentes (antes)

| Camada | Quantidade | Onde |
| --- | --- | --- |
| Frontend Vitest + RTL | 402 testes, 37 arquivos | `react-app/src/**/*.test.*`, `react-app/scripts/*.test.js` |
| Backend Vitest + Supertest | 529 testes, 24 arquivos | `backend/src/**/*.test.js` |
| E2E Playwright | 24 testes, 4 specs, só Chromium | `react-app/e2e/` |
| SQL no Supabase efêmero | 6 suítes | `database/tests/*.sql` |

Cobertura que já existia e **não foi duplicada**: matriz RLS por perfil, baixa/idempotência sequencial
do estoque, hardening A-05–A-10, gates do histórico do chatbot/painel, bloqueio de login persistente
(migração 32), histórico de status (33), contingência Gemini (retry, modelo alternativo, orçamento),
canários de PII no contexto da IA, `errorHandler` sem `err.message` em 5xx de produção, varredura de
credenciais demo no bundle.

## 3. Comandos e resultados

### 3.1 Linha de base (código em `4cfc18d`, antes de qualquer alteração)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Frontend | `cd react-app && npx vitest run --coverage` em worktree limpo de `4cfc18d` | **402/402 aprovados** (37 arquivos) |
| Backend | `cd backend && npx vitest run --coverage` | **529/529 aprovados** (24 arquivos) |

A primeira medição do frontend, rodada ao mesmo tempo que a do backend, coletou só 26 arquivos/191
testes e 29 arquivos-fonte a menos na cobertura. Foi **descartada** e refeita num `git worktree` limpo
do commit base; os números acima são os da segunda execução.

### 3.2 Depois das alterações

| Gate | Comando | Resultado |
| --- | --- | --- |
| Frontend Vitest | `cd react-app && npx vitest run` | **432/432 aprovados** (43 arquivos = 402 + 30 novos) |
| Backend Vitest | `cd backend && npx vitest run` | **533/533 aprovados** (26 arquivos = 529 + 4 novos) |
| E2E Chromium | `npx playwright test -c playwright.navegadores.config.js --project=chromium --workers=1` | **24/24 aprovados** (2,4 min) |
| E2E Firefox + WebKit | idem, `--project=firefox --project=webkit` | **48/48 aprovados** (7,1 min), sem retry |
| SQL (6 suítes existentes) | `psql -v ON_ERROR_STOP=1 -f database/tests/<suite>.sql` | **6/6 aprovadas** |
| SQL `regras_negocio_test.sql` | idem | **aprovada** |
| SQL `regras_negocio_lacunas_test.sql` | idem | **REPROVADA** — 10 lacunas (esperado; seção 5) |
| Concorrência | `SIGAUTO_BANCO_DESCARTAVEL=1 bash database/tests/concorrencia_os_estoque.sh` | **15/15 verificações aprovadas** |
| Lint frontend / backend | `npm run lint` | **sem erros nem avisos** nos dois |
| Build frontend | `npm run build` | **aprovado**; verificador inspecionou 67 arquivos. Mantém o aviso PostCSS `from` já conhecido |
| `npm audit --omit=dev` frontend | — | **0 vulnerabilidades** |
| `npm audit --omit=dev` backend | — | **1 alta** (QA-12) |

Os E2E rodaram contra API (porta 3101) e Vite (porta 5273) isolados, apontados ao Supabase efêmero,
com `GEMINI_API_KEY` vazia (nenhuma chamada real ao Gemini). Rodaram depois das correções de
`Historico.jsx`/`Relatorios.jsx`; as alterações posteriores foram só em testes, no verificador de
bundle e em comentários de lint, revalidadas pelas suítes Vitest, lint e build acima.

### 3.3 Cobertura antes/depois (V8, `@vitest/coverage-v8` já instalado)

| Escopo | Métrica | Antes (`4cfc18d`) | Depois |
| --- | --- | --- | --- |
| Frontend | Linhas | 78,35% (2006/2560) | 78,67% (2018/2565) |
| Frontend | Branches | 64,83% (1798/2773) | 65,17% (1812/2780) |
| Frontend | Funções | 67,14% (566/843) | 67,81% (573/845) |
| Frontend | Statements | 75,34% (2271/3014) | 75,65% (2287/3023) |
| Backend | Linhas | 91,61% (918/1002) | 91,61% (918/1002) |
| Backend | Branches | 82,84% (932/1125) | 82,84% (932/1125) |
| Backend | Funções | 92,66% (202/218) | 92,66% (202/218) |

O ganho de cobertura é pequeno de propósito: os testes novos miram fronteiras e asserções que faltavam
em código já executado. No backend nenhuma linha nova foi coberta, mas quatro mutantes antes
sobreviventes passaram a ser detectados.

A cobertura de linhas mede o que os testes **executam**, não o que verificam. O escore de mutação
(seção 3.4) é a medida de verificação.

### 3.4 Mutation testing

Sem Stryker (seria dependência nova). Executor manual em script descartável: cada mutante altera um
trecho, roda só as suítes do módulo e restaura o arquivo a partir da cópia em memória. Mutante que
sobrevive = suíte que não percebe a mudança.

| Módulo | Mutantes | 1ª rodada | Sobreviventes na 1ª rodada | Rodada final |
| --- | --- | --- | --- | --- |
| `react-app/src/utils/osFinance.js` | 9 | 8 mortos | `toMoney` sem vírgula decimal | 9/9 |
| `react-app/src/utils/periodo.js` | 5 | 5 mortos | — | 5/5 |
| `backend/src/utils/consultaFinanceiraChatbot.js` | 6 | 5 mortos | fração de 1 casa lida como centavo | 6/6 |
| `backend/src/controllers/authController.js` | 5 | 2 mortos | limite 6 tentativas; bloqueio 14 min; `!estado.permitido` ignorado | 5/5 |
| **Total** | **25** | **20/25 (80%)** | 5 | **25/25** |

Testes que mataram os sobreviventes: `osFinance.dinheiro.test.js`,
`consultaFinanceiraChatbot.centavos.test.js`, `authController.limites.test.js`. A rodada final
reexecutou os 25 mutantes, não só os cinco. O escore vale para esses mutantes escolhidos à mão;
não é um escore de mutação do sistema.

## 4. Lacunas comprovadas e testes novos

### 4.1 Matriz requisito × implementação × teste × risco

| Requisito | Implementação | Teste existente | Teste novo | Resultado | Risco residual |
| --- | --- | --- | --- | --- | --- |
| RF05/RF10 concorrência | `finalizar_ordem_servico` e `cancelar_ordem_servico` com `FOR UPDATE` em OS e itens (`ORDER BY id_item`) | idempotência **sequencial** | `concorrencia_os_estoque.sh` (C1–C4) | **15/15 aprovados**, espera de lock comprovada | baixo |
| RN04 datas automáticas | defaults + `fn_set_atualizado_em` | nenhum | `regras_negocio_test.sql` | aprovado para `atualizado_em` | **`criado_em` forjável (QA-04)** |
| RN09 número sequencial imutável | `SERIAL`; RPC descarta `numero_os` | nenhum (fixtures com número fixo) | `regras_negocio_test.sql` + lacunas | RPC aprovado | **INSERT/UPDATE direto (QA-03)** |
| RN15 queixa ≥ 10 | só `AbrirOS.jsx` | nenhum na fronteira | `AbrirOS.queixa.test.jsx` (9/10, espaços) + lacunas | tela aprovada | **banco aceita (QA-01)** |
| RN16 status inicial Aberta | RPC fixa `aberta`; ledger da 33 | nenhum | `AbrirOS.queixa.test.jsx` + `regras_negocio_test.sql` + lacunas | RPC/tela aprovados | **INSERT direto (QA-02)** |
| RN24 fronteiras de data | `Historico.jsx` | nenhum | `Historico.periodo.test.jsx`, `utils/periodo.test.js` | **bug QA-07 corrigido** | baixo |
| RF07 período do relatório | `Relatorios.jsx` | filtro por funcionário | `Relatorios.periodo.test.jsx` | **bug QA-08 corrigido** | data-base divergente (QA-09) |
| RN31 código duplicado | `UNIQUE (codigo)` | nenhum | `regras_negocio_test.sql` | aprovado | `"ABC"` ≠ `"abc"` ≠ `"ABC "` são aceitos como distintos (interpretação da RN pendente) |
| RN36 unidades | `CHECK` + `<select>` com as 6 | nenhum | `regras_negocio_test.sql` (6 aceitas, `un`/`GL`/`M2`/vazio recusadas) | aprovado | baixo |
| RN45 nome e preço | `NOT NULL`; tela com `required` | nenhum | `regras_negocio_test.sql` + lacunas | nulos recusados | **nome em branco aceito (QA-05)** |
| RN46 inativo fora da OS | consulta da tela filtra `ativo` | inativação | lacunas | — | **RPC aceita inativo (QA-06)** |
| RN48 vínculo 1:1 | `UNIQUE (id_usuario)` | nenhum | `regras_negocio_test.sql` (INSERT e UPDATE) | aprovado | baixo |
| RN21/RN22 dinheiro | servidor `NUMERIC`+`round`; tela `float` | casos fracionados | sonda com o banco como oráculo | divergência **QA-10** | médio |
| RN29 força bruta | Express + migração 32 | `authController`, SQL 32 | sonda direta no GoTrue local | **QA-11 comprovado** | alto |
| RN30 recuperação | Supabase Auth | `Login.test.jsx` | sonda direta no GoTrue local | limite por e-mail do provedor local observado (429) | produção não verificada |
| Segredos no build | `verifica-bundle.mjs` | credenciais demo | `verifica-bundle.segredos.test.js` + padrões novos | aprovado | baixo |
| E2E multi-navegador | Playwright só Chromium | 24 | `playwright.navegadores.config.js` | **72/72** (3 navegadores) | baixo |

### 4.2 Arquivos criados ou alterados

| Arquivo | Tipo | Conteúdo |
| --- | --- | --- |
| `database/tests/concorrencia_os_estoque.sh` | novo | corrida real com duas conexões; recusa rodar sem `SIGAUTO_BANCO_DESCARTAVEL=1`; limpa fixtures `QA-CONC` |
| `database/tests/regras_negocio_test.sql` | novo | RN04, RN09, RN16, RN31, RN36, RN45, RN48 — **aprova**; pronto para a CI |
| `database/tests/regras_negocio_lacunas_test.sql` | novo | afirma o comportamento exigido; **reprova de propósito** (10 lacunas); fora da CI até a migração |
| `react-app/src/utils/periodo.js` | novo | filtro por dia civil local (correção QA-07/QA-08) |
| `react-app/src/utils/periodo.test.js` | novo | fronteiras, virada de mês/ano, limites vazios |
| `react-app/src/pages/Historico.periodo.test.jsx` | novo | RN24 na tela, fuso fixado em `America/Sao_Paulo` |
| `react-app/src/pages/Relatorios.periodo.test.jsx` | novo | receita do período no fuso da oficina |
| `react-app/src/pages/OrdemServico/AbrirOS.queixa.test.jsx` | novo | RN15 (9/10, espaços) e RN16 |
| `react-app/src/utils/osFinance.dinheiro.test.js` | novo | vírgula decimal em `toMoney` e no total |
| `backend/src/utils/consultaFinanceiraChatbot.centavos.test.js` | novo | NUMERIC com uma casa (`"10.5"`) e soma exata |
| `backend/src/controllers/authController.limites.test.js` | novo | `p_limite: 5`, `p_duracao_segundos: 900`, reserva não permitida → 429 sem provedor |
| `react-app/scripts/verifica-bundle.segredos.test.js` | novo | JWT `service_role` nas três fases base64, `sb_secret_`, chave Google; anon e o guard aprovados |
| `react-app/playwright.navegadores.config.js` | novo | Chromium/Firefox/WebKit, porta própria, **recusa** Supabase não local, nunca reaproveita servidor |
| `react-app/src/pages/Historico.jsx`, `Relatorios.jsx` | alterado | usam `dentroDoPeriodo` |
| `react-app/scripts/verifica-bundle.mjs` | alterado | três padrões de segredo de backend |
| `docs/DER.md` | alterado | divergências 15 (QA-01..06), 16 (QA-09), 17 (QA-10) |

Os testes que exigem fuso fixam `process.env.TZ` no topo do arquivo e conferem o deslocamento: a CI
roda em UTC, onde QA-07/QA-08 não aparecem, e um teste que não confere o fuso passaria sem testar nada.

## 5. Bugs e achados

Severidade: **Crítica** (dado/segurança explorável sem login), **Alta**, **Média**, **Baixa**.
"Reproduzido" significa falha observada antes da correção, com o comando indicado.

| ID | Sev. | Achado | Evidência | Estado |
| --- | --- | --- | --- | --- |
| QA-11 | **Alta** | **RN29 contornável direto no provedor.** Oito senhas erradas seguidas em `POST /auth/v1/token?grant_type=password` do GoTrue local e a correta ainda autentica (200). O bloqueio de 5 falhas/15 min só existe no Express; URL e chave anon são públicas | seção 6.1 | **Mitigado no código; ativação externa pendente.** CAPTCHA Turnstile implementado no login e na recuperação; precisa ser configurado no frontend e no Supabase Auth |
| QA-12 | **Alta** | `body-parser` 2.0.0–2.3.0 (transitivo de `express@5.3.0`): DoS por bytes após corpo comprimido, GHSA-27r3-jxmh-p828. Novo desde o audit de 22/10 | `cd backend && npm audit --omit=dev` | **Corrigido:** lockfile atualizado para `body-parser@2.4.0`; auditoria sem vulnerabilidades em produção |
| QA-03 | **Média** | **RN09:** atendente grava `numero_os` escolhido no `INSERT` direto; gestor edita por `UPDATE`. Ocupar o próximo valor da sequência faz a criação legítima seguinte falhar com `duplicate key value violates unique constraint "ordem_servico_numero_os_key"` | `regras_negocio_servidor_test.sql`; sonda da seção 6.2 | **Corrigido e verificado pela migração 34** |
| QA-07 | **Média** | **RN24:** Histórico com início `2026-10-01` incluía OS das 21h–23h59 de 30/09 (`new Date('AAAA-MM-DD')` é meia-noite UTC) e excluía a do último segundo do fim (`T23:59:59` perde a fração) | `Historico.periodo.test.jsx`: 4 falhas antes, 5/5 depois | **Corrigido e verificado** |
| QA-08 | **Média** | **RF07:** mesmo defeito em Relatórios. Faturamento de outubro somava OS encerrada às 22h de 30/09: R$ 1.500,00 em vez de R$ 500,00 na fixture | `Relatorios.periodo.test.jsx` reprova com o código antigo (`git stash` do arquivo) | **Corrigido e verificado** |
| QA-10 | **Média** | **A-04:** prévia em `float` diverge do total gravado: 1,5 × R$ 8,45 → tela R$ 12,67, banco R$ 12,68; 2,5 × R$ 19,99 → R$ 49,97 contra R$ 49,98 | seção 6.3 | **Corrigido e verificado:** cálculo em centavos segue o arredondamento do banco |
| QA-01 | **Baixa** | **RN15:** banco aceita queixa vazia e de 9 caracteres pelo RPC e de 5 por `INSERT` direto | `regras_negocio_servidor_test.sql` | **Corrigido e verificado pela migração 34** |
| QA-02 | **Baixa** | **RN16:** `INSERT` direto cria OS `em_andamento` | idem | **Corrigido e verificado pela migração 34** |
| QA-04 | **Baixa** | **RN04:** `criado_em` informado no `INSERT` e reescrito no `UPDATE` | idem | **Corrigido e verificado pela migração 34** |
| QA-05 | **Baixa** | **RN45:** nome de serviço em branco (`'   '`) aceito no banco e na tela (`required` aceita espaços) | idem | **Corrigido e verificado na tela e no banco** |
| QA-06 | **Baixa** | **RN46:** `criar_ordem_servico_com_itens` inclui serviço inativo | idem | **Corrigido e verificado pela migração 34, inclusive escrita direta** |
| QA-09 | **Baixa** | Faturamento filtra concluídas pela **abertura**; chatbot/painel pelo **encerramento** | leitura de `Relatorios.jsx` e regressão de período | **Corrigido:** faturamento usa a data de encerramento |
| QA-13 | Info | `react-app/e2e/setup-database.mjs` não é idempotente: falha com `A user with this email address has already been registered` se o banco não foi resetado | execução local | Aberto (infra de teste) |
| QA-14 | **Alta (operacional)** | O `npm run dev` que estava rodando em `localhost:5173` aponta para o Supabase publicado. Com `reuseExistingServer: !process.env.CI`, um `npx playwright test` local **reaproveitaria esse servidor e a jornada E2E gravaria clientes e O.S. no banco publicado** | `curl localhost:5173/src/supabaseClient.js` | **Mitigado para a nova config** (recusa URL não local e não reaproveita). A config original continua com o risco |

QA-01 a QA-06 só são exploráveis por conta autenticada (atendente/gestor) chamando o PostgREST direto;
a tela os impede. Não houve exposição a usuário anônimo.

## 6. Evidências reproduzíveis

### 6.1 QA-11 — força bruta direta no GoTrue (somente stack local)

```bash
ANON=<chave anon do Supabase local>
for i in 1 2 3 4 5 6 7 8; do
  curl -s -o /dev/null -w "%{http_code} " -H "apikey: $ANON" -H 'Content-Type: application/json' \
    -d '{"email":"atendente@sigauto.com","password":"SenhaErrada!'$i'"}' \
    "http://127.0.0.1:54321/auth/v1/token?grant_type=password"
done   # 400 x8
# senha correta da fixture E2E -> 200 com access_token
```

`POST /auth/v1/recover` repetido para o mesmo e-mail respondeu 200 e depois 429: o GoTrue local limita
envio por e-mail. A configuração do provedor publicado **não foi verificada**.

### 6.2 QA-03 — número ocupado bloqueia a próxima OS

```sql
-- como atendente autenticado, em transação com ROLLBACK
INSERT INTO ordem_servico (id_veiculo, id_usuario, descricao, numero_os)
VALUES ('<veiculo>', auth.uid(), 'Ocupa o proximo numero', <last_value + 1>);
SELECT * FROM criar_ordem_servico_com_itens('{"id_veiculo":"<veiculo>","descricao":"Barulho no motor ao ligar"}');
-- ERROR: duplicate key value violates unique constraint "ordem_servico_numero_os_key"
```

### 6.3 QA-10 — banco como oráculo

```sql
SELECT round(1.5*8.45,2), round(2.5*19.99,2);   -- 12.68 | 49.98
```
```js
calcOSTotals({ servicos_itens: [{ quantidade: '1,5', valor_unitario: '8.45' }] }).valorTotal
// 12.674999999999999 -> formatCurrency -> "R$ 12,67"
```

### 6.4 Concorrência

```bash
PSQL='docker exec -i supabase_db_sigauto-e2e psql -U postgres' \
  SIGAUTO_BANCO_DESCARTAVEL=1 bash database/tests/concorrencia_os_estoque.sh
```

A sessão A executa o RPC e segura a transação por 2 s; B começa 0,7 s depois; uma terceira conexão
encontra B em `wait_event_type = 'Lock'` antes de A confirmar. Resultado: C1 duas finalizações da mesma
OS → uma baixa (5 → 3, um movimento); C2 duas OS pela última unidade → uma conclui, outra recebe
`Saldo insuficiente`, saldo 0, OS recusada continua aberta; C3 finalizar × cancelar → status e saldo
coerentes, um estorno; C4 dois cancelamentos → um estorno. **15/15 verificações aprovadas.**

## 7. Bloqueados e não executados

| Item | Estado | Motivo |
| --- | --- | --- |
| Testes no banco/Auth de produção | **Não executado (proibido)** | regra da missão; QA-11, rate limit de recuperação e `NODE_ENV` publicados seguem sem verificação |
| Correção de QA-01..06 | **Executada no efêmero** | migração 34 aplicada duas vezes e regressões aprovadas; produção fora do escopo |
| Correção de QA-10 | **Executada** | regra do banco adotada e coberta por regressão em centavos |
| Acessibilidade automatizada (axe/Lighthouse) | **Não executado** | nenhuma ferramenta instalada; adicioná-la seria dependência nova. Os E2E e testes de componente cobrem rótulos e regiões vivas pontuais, não conformidade WCAG |
| Desempenho DS04/DS05 | **Executado localmente em 26/10/2026** | DS04: 1 GET inicial por tabela e zero consultas extras em sete navegações; DS05: indicadores visíveis após 3,2 s de espera sintética e removidos após a resposta; ver `docs/evidencias/RESULTADO_DS04_DS05_2026-10-26.md` |
| Coleção Postman contra API real | **Executada localmente em 26/10/2026** | backend isolado + Supabase efêmero; 30/30 requisições e 91/91 assertions, mais contraprova RN30 3/3 |
| Falhas de Supabase/API/Gemini | **Não ampliado** | cobertura existente avaliada como suficiente: E2E de falha de rede, `comRetry`, `comModeloAlternativo`, `contingenciaBordas`, indisponibilidade no `PainelIA`/`Chatbot`, falha de persistência e de consulta financeira no backend |
| `regras_negocio_servidor_test.sql` | **Aprovado** | substituiu a sonda de lacunas e integra a CI com a migração 34 |

## 8. Riscos residuais

1. **QA-11** — força bruta e enumeração dependem só dos limites nativos do Supabase Auth publicado, que ninguém conferiu.
2. **QA-03** — um funcionário autenticado consegue travar a abertura de OS ocupando números da sequência.
3. **QA-10/A-04** — centavos diferentes entre prévia e documento gravado em quantidades fracionadas.
4. **QA-09** — faturamento diferente entre Relatórios e chatbot/painel para o mesmo período.
5. Migrações 29–33 continuam sem rollout confirmado em produção (herdado).
6. Credenciais demo e `NODE_ENV` publicados (herdado; ver memória do projeto e auditoria de 18/10).
7. Cobertura de linhas do frontend em ~73%: páginas grandes (`useDatabase`, `ListaEstoque`, `AtualizarOS`) têm ramos de erro sem teste.

## 9. Checklist de liberação para produção

- [ ] Atualizar `body-parser` (QA-12) com `cd backend && npm audit fix --omit=dev`, rodar a suíte e o lint do backend e conferir o audit em zero.
- [ ] Decidir e aplicar proteção do Supabase Auth contra força bruta direta (QA-11); repetir a sonda 6.1 **num projeto de staging**, não em produção.
- [ ] Escrever a migração 34 para QA-01..06 (gatilhos ou `CHECK ... NOT VALID` só para escritas novas), com `regras_negocio_lacunas_test.sql` virando aprovado e entrando na CI.
- [ ] Decidir a regra monetária (QA-10) e a data-base do faturamento (QA-09) no DERS.
- [ ] Incluir `regras_negocio_test.sql` e `concorrencia_os_estoque.sh` no job E2E da CI (alteração de CI não feita nesta auditoria).
- [ ] Aplicar 29–33 no destino em rollout coordenado e repetir as sete suítes SQL num clone fiel.
- [ ] Rodar `concorrencia_os_estoque.sh` no clone fiel (banco descartável).
- [ ] Rotacionar contas demo e conferir `NODE_ENV` da API publicada.
- [ ] Garantir que ninguém rode `npx playwright test` com um `npm run dev` apontado para produção (QA-14); preferir `playwright.navegadores.config.js`.
- [ ] Smoke test pós-deploy de salvar, finalizar, reabrir e cancelar OS por perfil.

## 10. O que esta auditoria não afirma

Não declara o sistema seguro nem livre de bugs. Testes aprovados provam os cenários escritos, no banco
efêmero e no commit indicado. Cobertura de linhas não prova verificação; o escore de mutação cobre
quatro módulos, não o sistema. Nenhuma afirmação vale para produção.
