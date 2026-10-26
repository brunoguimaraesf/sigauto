# Relatório de Auditoria de Segurança, Desempenho e Resiliência

## 1. Identificação

- **Data:** 26/10/2026.
- **Commit inicial auditado:** `e9daebe454f45fdd94a190de4903d4b9d056d3e4`.
- **Escopo:** ambiente local, sem produção, sem Gemini e sem alvo externo.
- **Banco:** Supabase efêmero `sigauto-e2e`, PostgreSQL 17.11, acessado em `127.0.0.1`.
- **Ferramentas:** Node 24.19.0, npm 11.17.0, Vitest 4.1.11, Playwright 1.62.1, Postman CLI 1.77.0 e Docker 29.8.2.
- **Código:** alterações locais não commitadas; nenhuma publicação ou deploy foi realizado.

## 2. Inventário

### Cobertura preexistente relevante

- RLS por perfil, funções RPC, grants e views: oito suítes SQL em `database/tests/`.
- Prompt injection por pergunta, histórico forjado, perfil e ferramenta: `chatbotFuncional.test.js` e `chatbotFinanceiro.test.js`.
- Rate limiting de IA e bloqueio persistente do login: `app.integration.test.js`, `authController.limites.test.js` e `login_bloqueio_test.sql`.
- Desempenho DS01–DS05: `react-app/scripts/medir-desempenho.mjs` e `docs/RELATORIO_DESEMPENHO.md`.
- API: coleção Postman com os 12 pares método/rota do Express.

### Cobertura implementada nesta rodada

- Sonda PostgREST real e não destrutiva: `react-app/scripts/auditar-injecao-sql.mjs`.
- Três casos adversariais na pasta `06 - Seguranca: entradas adversariais` da coleção Postman.
- Regra explícita de que textos vindos do banco são dados não confiáveis nos prompts do chatbot e do Painel IA.
- Regressão de prompt injection indireta tentando acionar ferramenta financeira.
- Fábrica testável dos limitadores, incluindo `Retry-After`, recuperação da janela, separação por IP e disponibilidade do health.
- Ensaio de carga progressivo configurável, com p99, RPS, `429`, timeouts, critérios de parada, recuperação e amostras do container PostgreSQL.
- Seed E2E idempotente e placa dinâmica com entropia suficiente para repetição multibrowser.

### Áreas não cobertas

- DDoS real, proibido pelo escopo e inadequado para o ambiente.
- Modelo Gemini real, para evitar custo, vazamento e dependência externa.
- Produção e Supabase hospedado.

## 3. SQL Injection

### Método

A sonda autenticou contas sintéticas de gestor e mecânico pelo Supabase local e enviou
payloads por filtros, ordenação, UUID, login e campos persistidos. Incluiu aspas,
escapes, condições booleanas, comentários, tentativa de alterar filtro, texto longo e
`pg_sleep(2)`. A fixture criada em `servico_catalogo` foi removida ao final.

### Resultado

| Cenário | Resultado | Evidência resumida |
|---|---|---|
| `anon` tenta ler clientes | Aprovado | HTTP 200 com zero linhas |
| Condição booleana no login | Aprovado | nenhuma sessão criada |
| Aspas, comentário, filtro e texto longo | Aprovado | zero linhas, sem ampliação da consulta |
| Tentativa de `pg_sleep(2)` em filtro | Aprovado | 34,71 ms; nenhum atraso executado |
| Ordenação adversarial | Aprovado | HTTP 400 em 8,86 ms |
| Mecânico lê recomendações gerenciais | Aprovado | zero linhas por RLS |
| Texto adversarial persistido | Aprovado | nome e descrição preservados literalmente; fixture removida |
| Consulta normal após os ataques | Aprovado | aplicação continuou respondendo |
| UUID adversarial | **Reprovado pelo critério estrito de exposição** | HTTP 400 expôs SQLSTATE `22P02` e o tipo interno `uuid` |

**Total:** 13 cenários, 12 aprovados e 1 reprovado. Nenhum payload executou SQL
adicional, ampliou resultado, acessou registro indevido ou provocou erro HTTP 500.

A coleção Postman também executou três chamadas reais: login adversarial, paginação do
histórico do chatbot e paginação das recomendações. Foram **3/3 requisições e 16/16
assertions aprovadas**, com tempos de 67 a 147 ms.

## 4. Prompt Injection

Foram verificados 13 casos determinísticos: instruções na pergunta, resposta anterior
forjada, remetente `system`, tentativa de mudança de perfil, acesso financeiro por
atendente/mecânico, ferramenta desconhecida, múltiplas ferramentas, argumento SQL,
injeção indireta em dados da oficina e os dois avisos de conteúdo não confiável.

- O contexto continua recortado pelo perfil antes da chamada ao modelo.
- Uma ferramenta financeira solicitada pelo modelo para mecânico é recusada antes do callback.
- Ferramentas desconhecidas, múltiplas operações e argumentos extras não são executados.
- Textos de nomes, descrições e históricos são declarados como dados externos, nunca instruções.
- O painel permanece consultivo; nenhuma recomendação grava OS ou estoque.
- Segredos não integram o contexto enviado ao modelo.

**Resultado:** 13/13 aprovados com mocks determinísticos. Não foi feita chamada real ao Gemini.

## 5. Desempenho

### Configuração e limites de parada

- Níveis: 1, 5, 10, 20 e 50 sessões.
- Cinco repetições por sessão; rampa de 1.000 ms por nível.
- Limite: 2.500 requisições planejadas, p95 máximo de 3.000 ms, erros até 5%, CPU do banco até 85% e memória até 2.048 MiB.
- Massa: 200 clientes e 200 veículos sintéticos; quatro operações por sessão e repetição.
- Total medido: 1.720 requisições, além de autenticação e checks de recuperação.

| Sessões | Operação | p50 ms | p95 ms | p99 ms | Máximo ms |
|---:|---|---:|---:|---:|---:|
| 1 | Clientes | 30,14 | 81,97 | 81,97 | 81,97 |
| 1 | Veículos | 19,63 | 131,47 | 131,47 | 131,47 |
| 1 | OS | 18,97 | 111,78 | 111,78 | 111,78 |
| 1 | Gravação | 22,32 | 29,49 | 29,49 | 29,49 |
| 5 | Clientes | 233,29 | 374,99 | 431,42 | 431,42 |
| 5 | Veículos | 125,09 | 321,34 | 458,19 | 458,19 |
| 5 | OS | 147,81 | 416,27 | 453,80 | 453,80 |
| 5 | Gravação | 36,93 | 88,08 | 165,99 | 165,99 |
| 10 | Clientes | 100,58 | 196,17 | 211,39 | 211,39 |
| 10 | Veículos | 51,11 | 188,13 | 215,20 | 215,20 |
| 10 | OS | 71,08 | 175,82 | 199,76 | 199,76 |
| 10 | Gravação | 16,68 | 36,89 | 44,18 | 44,18 |
| 20 | Clientes | 210,94 | 888,38 | 894,87 | 896,28 |
| 20 | Veículos | 126,48 | 610,83 | 797,01 | 827,09 |
| 20 | OS | 195,52 | 827,34 | 844,60 | 844,93 |
| 20 | Gravação | 33,14 | 78,63 | 96,40 | 102,17 |
| 50 | Clientes | 528,33 | 1.020,79 | 1.093,54 | 1.110,18 |
| 50 | Veículos | 217,90 | 695,60 | 956,01 | 1.055,88 |
| 50 | OS | 422,41 | 842,73 | 1.048,16 | 1.114,33 |
| 50 | Gravação | 69,89 | 256,85 | 352,90 | 379,10 |

| Sessões | RPS total | Erros | `429` | Timeouts | Recuperação | Banco após nível |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 9,98 | 0 | 0 | 0 | 24,80 ms | 0,02% CPU; 158,9 MiB |
| 5 | 32,86 | 0 | 0 | 0 | 29,19 ms | 4,75% CPU; 192,1 MiB |
| 10 | 99,85 | 0 | 0 | 0 | 28,23 ms | 0,01% CPU; 221,9 MiB |
| 20 | 125,45 | 0 | 0 | 0 | 32,62 ms | 0,15% CPU; 224,5 MiB |
| 50 | 200,89 | 0 | 0 | 0 | 37,94 ms | 0,02% CPU; 232,2 MiB |

As amostras de CPU foram coletadas ao fim de cada nível e **não representam pico**.
Com 50 sessões, todas as operações permaneceram abaixo dos limites DS01/DS02 nesta
máquina local, mas a rodada curta não caracteriza capacidade de produção nem teste de
soak. Nenhum critério automático de parada foi acionado.

### Recursos contínuos e IA simulada por HTTP

Ensaio complementar de 15 segundos, três chamadas concorrentes à rota real
`POST /api/v1/ia/analisar`, modelo determinístico habilitado somente com ambiente de teste e
Supabase local. Foram coletadas 16 amostras contínuas do Chromium e do processo Node do backend.

| Medida | p50 | p95 | p99 | Máximo |
|---|---:|---:|---:|---:|
| Navegador — ocupação da thread principal | 3,33% | 20,49% | 20,49% | 20,49% |
| Navegador — heap JavaScript | 50,96 MiB | 85,81 MiB | 85,81 MiB | 85,81 MiB |
| Backend — CPU do host | 0,44% | 1,47% | 1,47% | 1,47% |
| Backend — memória residente | 82,07 MiB | 99,49 MiB | 99,49 MiB | 99,49 MiB |
| IA simulada — latência HTTP | 451,89 ms | 512,78 ms | 521,83 ms | 521,83 ms |

A rota de IA respondeu **96/96** chamadas com HTTP 200, sem `429`, timeout ou erro; o health
respondeu HTTP 200 em 16,48 ms depois da carga. A simulação não chamou o Gemini nem persistiu
recomendações. A ocupação do navegador é derivada de `TaskDuration` do Chromium; a CPU do backend
é a variação do tempo de processo dividida pelos processadores lógicos do host. É uma rodada curta,
não um teste de soak.

## 6. Rate Limiting

- Login isolado: terceira chamada após limite 2 recebeu HTTP 429 e `Retry-After`; voltou a HTTP 200 após a janela.
- Chatbot e IA compartilharam o limite configurado; outro IP sintético permaneceu disponível.
- Limite geral rejeitou excesso sem derrubar `/health`.
- O teste preexistente confirmou o teto padrão de dez chamadas/minuto para IA.
- RN29 confirmou cinco falhas e bloqueio persistente de 900 segundos no banco.
- O grant direto do Auth retornou `429` na quinta falha e recusou a senha correta durante o bloqueio; após a expiração simulada, voltou a `200`.
- Nenhum DDoS foi executado.

**Resultado:** 7/7 casos funcionais aprovados. O `MemoryStore` do Express não fornece
limite global entre múltiplas instâncias serverless; esse risco permanece aberto.

## 7. Regressão

| Suíte | Resultado |
|---|---:|
| Frontend Vitest | 460/460, 46 arquivos |
| Backend Vitest | 544/544, 29 arquivos |
| E2E multibrowser | 72/72, 24 cenários × 3 navegadores |
| SQL | 9/9 suítes |
| Concorrência OS/estoque | 15/15 verificações |
| Postman — pasta de segurança | 3/3 requisições; 16/16 assertions |
| ESLint frontend/backend | aprovado |
| Build de produção e inspeção do bundle | aprovado; 67 arquivos sem segredo de demonstração |

Os E2E inicialmente revelaram duas falhas de infraestrutura de teste: seed não
idempotente e placa com apenas mil combinações. Após as correções, o seed passou duas
vezes consecutivas e a rodada multibrowser completa passou.

## 8. Classificação de riscos

| ID | Severidade | Arquivo/linha | Descrição e impacto | Correção/status | Risco residual |
|---|---|---|---|---|---|
| ASR-01 | **BAIXA** | `react-app/scripts/auditar-injecao-sql.mjs` | UUID inválido no PostgREST devolve SQLSTATE `22P02` e nome do tipo. Não houve acesso ou execução SQL, mas o critério proíbe detalhe interno. | Aberto; validar UUID antes da consulta reduz exposição na aplicação, porém chamada direta ao PostgREST exige gateway/customização do provedor. | Enumeração limitada de tipos e códigos internos. |
| ASR-02 | **MÉDIA** | `backend/src/middleware/rateLimiters.js` | Limitadores de API/IA usam memória do processo; múltiplas instâncias serverless podem dividir contadores e permitir mais chamadas/custo. | Aberto; adotar store distribuído ou rate limit no gateway/WAF. | Custo e indisponibilidade da IA sob abuso distribuído. |
| ASR-03 | **MÉDIA** | `database/35_bloqueio_login_auth_hook.sql` | O grant de senha público contornava o bloqueio RN29 do Express. | **Corrigido no local/self-hosted:** Password Verification Hook bloqueia também a chamada direta; contraprova HTTP aprovada. | Supabase hospedado Free não oferece o hook; produção precisa do CAPTCHA nativo já suportado pelo código ou de plano compatível. |
| ASR-04 | **BAIXA** | `react-app/e2e/setup-database.mjs` | Seed não podia ser reaplicado e deixava estoque consumido, produzindo falsos negativos. | **Corrigido** com reutilização de contas, inserts condicionais e ajuste pelo ledger. | Dados dinâmicos antigos ainda permanecem no efêmero até reset. |
| ASR-05 | **BAIXA** | `react-app/e2e/jornada.spec.js` | Placa dinâmica tinha só mil combinações e colidia em execuções repetidas. | **Corrigido** com geração aleatória válida de alta entropia. | Colisão teórica residual, não observada no reteste. |

Nenhum achado **CRÍTICO** ou **ALTO** foi confirmado nesta rodada.

## 9. Resultado final

| Categoria | Total | Aprovados | Reprovados | Bloqueados |
|---|---:|---:|---:|---:|
| SQL Injection | 13 | 12 | 1 | 0 |
| Prompt Injection | 13 | 13 | 0 | 0 |
| Carga e estresse | 8 | 8 | 0 | 0 |
| Rate limiting | 7 | 7 | 0 | 0 |
| Regressão | 1.100 | 1.100 | 0 | 0 |

O teste de DDoS real foi deliberadamente excluído e não é contado como cenário executável.

**Conclusão:** o SIGAuto resistiu aos payloads de injeção quanto a execução, ampliação
de consulta e acesso indevido; suportou até 50 sessões na rodada local curta; preservou
autorizações diante de prompt injection; e aplicou os limites funcionais testados. Isso
não significa segurança absoluta nem comprova produção. Permanecem a exposição técnica
de erro do PostgREST e limites distribuídos dependentes da configuração do provedor
hospedado. No ambiente local/self-hosted, o grant direto passou a respeitar o bloqueio
de cinco falhas.

## Comandos executados

```text
node docs/api/validar-colecao.cjs
postman collection run docs/api/SIGAuto.postman_collection.json -i "06 - Seguranca: entradas adversariais" ...
cd react-app && npm run test:seguranca:sql
cd react-app && npm run test:desempenho
cd react-app && npm run test:recursos
node database/tests/login_direto_auth_hook.mjs
cd backend && npx vitest run
cd backend && npm run lint
cd react-app && npx vitest run
cd react-app && npm run lint
cd react-app && npm run build
docker exec -i supabase_db_sigauto-e2e psql -U postgres -v ON_ERROR_STOP=1
PSQL="docker exec -i supabase_db_sigauto-e2e psql -U postgres" SIGAUTO_BANCO_DESCARTAVEL=1 bash database/tests/concorrencia_os_estoque.sh
cd react-app && npx playwright test -c playwright.navegadores.config.js --workers=1
```

As reticências no comando Postman representam variáveis locais de URL/token, omitidas
para não registrar credenciais. Todas as execuções usaram apenas o ambiente efêmero.
