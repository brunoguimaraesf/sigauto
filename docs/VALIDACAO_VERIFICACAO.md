# Plano de Verificação e Validação (V&V) — SIGAuto

TFC UniRV 2026 · Bruno Gabriel Guimarães Fernandes

## 1. Conceitos

- **Verificação** — "construímos o produto **do jeito certo**?" Conformidade técnica:
  o código atende à especificação, está livre de defeitos e compila/executa.
- **Validação** — "construímos o **produto certo**?" Conformidade com os requisitos
  e a necessidade real do usuário da oficina.

## 2. Ferramentas de Verificação

| Ferramenta | Uso | Situação |
|---|---|---|
| **Vitest** | Testes unitários, de integração e de componente (frontend e backend) | **Implementado — 918 testes aprovados em 22/10/2026** |
| **React Testing Library** | Testes de componente React (renderização isolada) | **Implementado** |
| **Supertest** | Testes de integração da API Express | **Implementado** |
| **ESLint** | Análise estática de código | Configurado (`npm run lint`). No backend, com **plugin de segurança** (`backend/eslint.config.js`) e execução na integração contínua. Em 22/10/2026, frontend e backend sem avisos |
| **Vite build** | Verificação de compilação/empacotamento | `npm run build` |
| **QA assistido em navegador** | Inspeção de telas, console e fluxos | Realizado (evidências em prints) |
| **Playwright** | Testes ponta a ponta (E2E) dos fluxos | **Implementado — 24 testes E2E em banco Supabase efêmero na CI** |
| **Postman** | Testes da API REST (endpoints) | **Coleção v2.1 executada localmente — 12/12 endpoints, 30/30 requisições e 91/91 assertions; contraprova RN30 3/3** ([resultado sanitizado](api/RESULTADO_POSTMAN_LOCAL_2026-10-26.md)) |

### 2.1 Testes automatizados (Vitest)

- **Backend (529 testes, 24 arquivos)**:
  - `validators.test.js` — CPF, CNPJ, placa, e-mail, senha.
  - `security.test.js` — hardening de cabeçalhos, CORS e limites de payload.
  - `comRetry.test.js` — retry da IA em erros transitórios 503/429 (com timers falsos).
  - `comModeloAlternativo.test.js` — troca para o 2º modelo, classificação transitório/permanente
    e **pinagem dos dois nomes de modelo** (trocar o alternativo por um modelo morto deixava
    a suíte verde e matava a contingência em produção).
  - `modeloNasChamadas.test.js` — fiação do modelo nas duas chamadas, e os **parâmetros**
    enviados: `systemInstruction` com o MAPA DO SISTEMA, `generationConfig` e teto de tempo.
  - `contingenciaBordas.test.js` — lista de modelos vazia, entrada ausente, `AbortError`
    retentável, orçamento de tempo total e o cronograma exato do backoff.
  - `contextoPorPerfil.test.js` — recorte do contexto da IA por perfil (RN39).
  - `contextoAnalitico.test.js` — faturamento por encerramento, entradas por
    modelo e saídas reais de peças, com período determinístico (RF11/RN43).
  - `iaController.test.js` e `chatbotController.test.js` — contrato das rotas de IA.
  - `app.integration.test.js` (Supertest) — `/health`, rota 404, bloqueio 401 sem token,
    token inválido e o rate limit dedicado das rotas de IA.
  - `authController.test.js` — criação administrativa de conta já confirmada, vínculo
    automático com `funcionario`, conflito de e-mail e compensação da conta Auth se o
    vínculo relacional falhar; a integração também recusa a operação para atendente.
  - **Painel IA gerencial (RF12/RN40/RN41/RN43/RN44)** —
    `metricasPainelIA.test.js` verifica janelas temporais semiabertas, uso de
    `data_encerramento` para conclusões, fronteiras inclusiva/exclusiva, base anterior
    zero, estoque por movimentação de saída, cobertura/reposição, item parado,
    produtividade, mediana, rankings comparativos de modelos de veículo e serviços
    frequentes e comparações sem `NaN`/`Infinity`.
    `recomendacoesExplicaveis.test.js` verifica allow-lists, evidências do catálogo
    (chave, valor, unidade e período), descarte de texto quantitativo livre e resistência
    a propriedades herdadas/acessores. `iaController.test.js` verifica coleta mínima,
    falha fechada das consultas, sanitização de dados quantitativos e PII antes do Gemini
    e da persistência, precedência das métricas calculadas, paginação e histórico.
    `app.integration.test.js` confirma bloqueio gestor-only e o limite de requisições da IA.
- **Frontend (389 testes, 36 arquivos)**:
  - Funções puras (`utils/*.test.js`) — placa, estoque (alerta/saldo/moeda/resumo),
    endereço/CEP, finanças da OS e status de OS.
  - **Componente (React Testing Library)** — entre as suítes estão `GlassPanel.test.jsx`,
    `Servicos.test.jsx`, `Usuarios.test.jsx`, `Funcionarios.test.jsx`,
    `Chatbot.test.jsx` e `Chatbot.origem.test.jsx` (indisponibilidade da IA por bolha,
    status da sidebar e região viva para leitor de tela) e `PainelIA.test.jsx`
    (**15 testes**): blocos gerenciais completos, comparações sem base anterior, cobertura
    sem consumo, listas vazias, recomendações com evidências, indisponibilidade sem números
    e histórico sob demanda, somente leitura e isolado de falhas da análise atual.
  - **Autenticação e inativação (RF08/RF13)** — adicionados em 20/10/2026:
    - `pages/Login.test.jsx` — RN29: quatro falhas ainda permitem tentar; a quinta bloqueia
      campos, botão e submit direto; nenhuma chamada adicional antes de 15 minutos; liberação
      exatamente no limite, seguida de login bem-sucedido. RN30: confirmação idêntica para
      sucesso, erro retornado e exceção da recuperação de senha, sem expor erro do provedor.
    - `pages/Servicos.test.jsx` — RN46: só o serviço escolhido é encaminhado à inativação
      após confirmar; cancelar a confirmação não solicita alteração.
    - `hooks/useDatabase.test.jsx` — RN46: remoção envia `UPDATE ativo:false` filtrado pelo
      ID, sem exclusão física; preserva outros serviços e os itens já associados à OS.
      Trata-se de contrato com Supabase mockado, sem executar o banco real.
  - **Configuração da oficina e documento da O.S. (RF05)** — adicionados em 14/10/2026:
    - `hooks/useDatabase.test.jsx` — singleton da oficina (ausente = `null`, sem registro
      fabricado quando a consulta falha), normalização de CNPJ/CEP/UF, upsert que só altera o
      estado após sucesso, e o **upload transacional do logotipo**: arquivo inválido ou acima de
      2 MiB não chega ao Storage, a troca remove o antigo **somente depois** do upsert, e a falha
      do upsert limpa o arquivo novo preservando o anterior; remoção recusa path fora do prefixo
      controlado; a ausência temporária de `funcionario_publico` não descarta clientes,
      veículos e O.S. já carregados e aciona o fallback limitado pelo RLS.
    - `pages/ConfiguracaoOficina.test.jsx` — cadastro e edição, CNPJ inválido sem chamar o banco,
      erro de RLS exibido, ViaCEP indisponível com campos ainda editáveis, logotipo recusado com
      motivo, e **atendente não renderiza a página** (rota exclusiva do gestor).
    - `utils/osPdf.test.js` — contrato do documento: recusa emitir sem configuração da oficina
      (antes de criar o arquivo), conteúdo obrigatório (oficina, cliente, veículo, equipe, itens
      com valor unitário e total), valor final persistido com o desconto que ele implica,
      emissão sem logotipo, O.S. cancelada e não concluída identificadas, 60 itens paginando com
      cabeçalho repetido e resumo não partido, nome `OS-<numero>-<data>.pdf`, e **salvar e
      imprimir sobre o mesmo documento**, desconto persistido e a URL temporária que o
      visualizador consome (sem abrir guia nenhuma).
    - `components/ui/AcoesDocumentoOS.test.jsx` — abre o visualizador na própria página,
      revoga a URL temporária ao fechar, imprime reaproveitando o documento já montado e
      avisa, sem gerar documento, quando a oficina não está cadastrada.
    - `pages/OrdemServico/AtualizarOS.test.jsx` — tabela de casos com os **cinco status**
      (`aberta`, `em_andamento`, `aguardando_peca`, `concluida`, `cancelada`): em todos, Salvar PDF
      e Imprimir existem e recebem os dados corretos; sem configuração da oficina, aviso acessível
      e nenhum documento gerado.
    - `pages/OrdemServico/EncerrarOS.test.jsx` — O.S. já finalizada continua emitindo, e a prévia
      do encerramento leva o desconto e a forma de pagamento escolhidos na tela.
- **E2E (Playwright) — 24 testes** — `react-app/e2e/`:
  - `login.spec.js` — login (ok/inválido), redirecionamento de rota protegida, entrada do
    mecânico diretamente em O.S. e espaçamento dos ícones nos campos de autenticação.
  - `navegacao.spec.js` — Clientes, Veículos, Estoque, Relatórios, Funcionários e chatbot.
  - `fluxos.spec.js` — busca de clientes, modal de novo cliente, dependência cliente→veículo na
    nova O.S. e a disponibilidade de **Salvar PDF / Imprimir** na O.S. aberta e na concluída
    abrindo a guia `blob:` real do documento).
  - `jornada.spec.js` — jornada integrada cliente→veículo→O.S.→itens→persistência→desconto→
    encerramento→PDF→logout, dados inválidos, falha de rede e restrições por perfil.
  - A CI inicia um Supabase efêmero, aplica as migrações 01–33, reaplica a 29 para provar
    idempotência, cria fixtures confirmadas e
    determinísticas e só então executa o navegador. Assim, ausência de dados não vira teste
    silenciosamente ignorado.
- **Banco (SQL)** — `database/tests/rls_matrix_test.sql` confere a matriz de acesso por perfil,
  inclusive o conjunto exato de clientes do mecânico; `estoque_os_test.sql` verifica baixa,
  presença do trigger do ledger, idempotência e rollback integral por saldo insuficiente; e
  `hardening_29_test.sql` valida A-05–A-10, grants, views, índices e cancelamento transacional.
  `chatbot_financeiro_test.sql` valida os gates restritivos do histórico do chatbot
  e das recomendações do painel, inclusive após perda do perfil gestor. As quatro
  suítes rodam na CI contra o mesmo banco dedicado do E2E.
- **Medição anterior à correção da IA: 783 testes unitários/integração/componente (389 frontend + 394 backend), todos aprovados**, medidos em 20/10/2026. São sete casos novos em relação à medição de 18/10/2026.
  Os **24 E2E passaram em 20/10/2026**, em 1,3 minuto, com um worker Chromium e sem
  repetição automática, contra o Supabase local em `127.0.0.1:54321`.
  A primeira tentativa do dia foi interrompida por indisponibilidade do Docker/Supabase;
  após iniciar os containers, a execução completa passou, sem casos ignorados.
  Nessa rodada anterior à correção da IA, as **3 suítes SQL** não foram reexecutadas;
  a evidência então disponível era de 18/10/2026. A nova execução SQL está separada
  na seção 4.3.
- **Como executar:** `npm test` (unitários, em `backend/` e `react-app/`) e
  `npm run test:e2e` (E2E em `react-app/`, requer o app rodando).

### 2.2 Divergência verificada: contingência do chatbot (RN38)

A RN38 prevê **resposta local de contingência** quando o chatbot não responde. O
sistema **não a tem mais**, por decisão do responsável do projeto. A RN42 atual,
conferida no DERS e nos requisitos gerados em 20/10/2026, já exige indisponibilidade
sem fabricar análise, recomendação ou número; nesse ponto não há divergência:

- O roteador de respostas fixas (`react-app/src/utils/chatbot.js`) e a análise
  local do `PainelIA.jsx` foram **removidos**. A análise local fabricava
  recomendações e barras de "confiança" com percentuais escritos no código
  (97%, 88%, 82%, 75%), indistinguíveis de uma medição do modelo.
- A contingência que resta é a **troca de modelo** (`MODELOS` em `iaService.js`),
  coberta por `comModeloAlternativo.test.js` e `modeloNasChamadas.test.js`.
- Quando os dois modelos falham, a tela declara a indisponibilidade e
  **nenhum número é estimado**. Verificado por:
  `PainelIA.test.jsx` → *"avisa em região viva e não mostra números de análise após a falha"*.

A divergência está registrada em [`DER.md`](DER.md), seção de divergências (#4).

### 2.3 Coleção de testes da API

Importe [SIGAuto.postman_collection.json](api/SIGAuto.postman_collection.json) no Postman
e siga o [guia de preparação e execução](api/README.md). A coleção cobre os 12 pares
método/rota existentes de health, autenticação, cadastro administrativo, chatbot e IA,
com 30 requisições, sucessos e rejeições de autenticação, perfil e entrada.
Credenciais e tokens são variáveis vazias; não são necessárias chaves administrativas no cliente.

Validação local atualizada em 26/10/2026: `node docs/api/validar-colecao.cjs` verificou os endpoints
contra as rotas locais, o JSON e a compilação de 49 scripts; executou 172 assertions
sobre exemplos fictícios e contraprovas. O bloqueio padrão foi conferido nas oito
operações com efeitos. Essa validação estática não substitui uma execução real.
Em 26/10/2026, o Postman CLI executou a coleção contra backend e Supabase locais:
**30/30 requisições e 91/91 assertions**, sem itens ignorados; a contraprova RN30 com
e-mail inexistente passou **3/3 assertions**. O
[relatório sanitizado](api/RESULTADO_POSTMAN_LOCAL_2026-10-26.md) registra ambiente,
tempos, limpeza e limites da evidência.

## 3. Ferramentas de Validação

| Ferramenta | Uso |
|---|---|
| **Matriz de rastreabilidade** | Liga cada requisito/caso de uso à funcionalidade e ao teste (seção 4) |
| **Testes de aceitação (UAT)** | [Roteiro UC01–UC15](ROTEIRO_UAT.md), massa de dados, resultados esperados, fichas de execução, incidentes e aceite — preparado, aplicação com orientador pendente |
| **Validação específica da IA** | [Lista de testes do chatbot e Painel IA](TESTES_IA.md) e [resultados de 20/10/2026](RESULTADOS_TESTES_IA.md): precisão mensal corrigida, valores de referência e fluxo HTTP real conferidos. Suítes aprovadas e retestes com Gemini registrados separadamente das reprovações iniciais; sem afirmar aprovação integral dos 39 cenários. |
| **Questionário SUS** (System Usability Scale) | [Instrumento em português](QUESTIONARIO_SUS.md), dez itens, escala e cálculo — preparado, coleta e análise pendentes |
| **Validação em ambiente hospedado** | Orientador testa o sistema publicado (Vercel) |

## 4. Matriz de Rastreabilidade de Requisitos

| UC | RF | Funcionalidade | Implementação | Status | Verificação/Validação |
|---|---|---|---|---|---|
| UC01 | RF08 | Autenticar usuário (login + perfil) | Login, AuthContext, authMiddleware, RLS | Implementado | `Login.test.jsx` (RN29/RN30) + login por perfil + redirecionamento do mecânico + matriz de RLS + UAT-01 |
| UC02 | RF01 | Manter clientes | Clientes.jsx | Implementado | Teste unitário + UAT |
| UC03 | RF02 | Manter veículos (vínculo a cliente) | Veiculos.jsx + utils/placa | Implementado | Teste unitário (placa) + E2E |
| UC04 | RF03 | Abrir ordem de serviço | OrdemServico/AbrirOS | Implementado | Teste E2E + aceitação |
| UC05 | RF04 | Atualizar ordem de serviço | OrdemServico/AtualizarOS | Implementado | Teste E2E + aceitação |
| UC06 | RF05 | Encerrar ordem de serviço | EncerrarOS + RPC `finalizar_ordem_servico` | Implementado | Componente + E2E + integração SQL de baixa/rollback |
| UC06 | RF05 | Configurar a oficina (cadastro único + logotipo) | ConfiguracaoOficina.jsx, useDatabase (`configuracao_oficina`), migração 18 | Implementado | `ConfiguracaoOficina.test.jsx` + `useDatabase.test.jsx` + auditoria de RLS/Storage |
| UC06 | RF05 | Emitir a O.S. em PDF ou imprimir, em qualquer status | utils/osPdf.js, components/ui/AcoesDocumentoOS.jsx | Implementado | `utils/osPdf.test.js` + testes por status em `AtualizarOS`/`EncerrarOS` + E2E |
| UC07 | RF06 | Consultar histórico | Historico.jsx | Implementado | Teste funcional |
| UC08 | RF07 | Emitir relatórios (exportação) | Relatorios.jsx (CSV/PDF/XLSX) | Implementado | `pages/Relatorios.test.jsx` — filtro por funcionário (inclusive homônimos), fechamento dos totais de comissão e validação de export |
| UC09 | RF09 | Manter estoque (alertas) | Estoque/ListaEstoque + utils/estoque | Implementado | Teste unitário (alerta) |
| UC10 | RF13 | Manter serviços | Servicos.jsx + useDatabase | Implementado | `Servicos.test.jsx` + `useDatabase.test.jsx` (inativação RN46) + UAT-10 |
| UC11 | RF10 | Movimentar estoque e consultar histórico | ListaEstoque + `movimentacao_estoque` + migração 22 | Implementado | Unitário de saldo + SQL de ledger, baixa e idempotência |
| UC12 | RF11 | Responder via chatbot | `Chatbot.jsx` + `iaService.js` (Gemini) | Implementado | `Chatbot.test.jsx`, `Chatbot.origem.test.jsx`, `chatbotController.test.js` |
| UC13 | RF12 | Gerar recomendações gerenciais da IA | `PainelIA.jsx`, componentes `components/ia/*`, `iaController`, `metricasPainelIA` e `recomendacoesExplicaveis` | Implementado | `metricasPainelIA.test.js`, `recomendacoesExplicaveis.test.js`, `iaController.test.js`, `PainelIA.test.jsx` (15 testes), `app.integration.test.js` e validação com orientador |
| UC14 | RF14 | Manter usuários | Usuarios.jsx + `POST /auth/usuarios` | Implementado | Componente + controller + integração de autorização |
| UC15 | RF15 | Manter funcionários (regras de comissão) | Funcionarios.jsx + utils/osFinance | Implementado | Teste unitário (Funcionarios.test.jsx, osFinance.test.js) |

> Observação: o UC13 usa a API do **Google Gemini** (modelo pré-treinado). Não há
> treinamento de modelo — as recomendações são geradas a partir dos dados reais da
> oficina enviados como contexto, o que torna o caso de uso plenamente executável.
>
> A numeração de RF foi conferida contra a especificação de requisitos:
> **RF12 é "Gerar recomendações da IA" e RF13 é "Manter serviços"** — os dois
> estavam invertidos nas linhas do UC10 e do UC13, e foram corrigidos. As linhas de
> **RF14** (manter usuários) e **RF15** (manter funcionários) faltavam e foram incluídas.

### 4.1 Rastreabilidade complementar do Painel IA

| Regra | Implementação verificada | Testes/cenários verificados |
|---|---|---|
| RN40 | `calcularMetricasPainelIA` calcula os indicadores dos períodos atual e anterior; `iaController` entrega as métricas calculadas sobre a redação do modelo. | Fronteiras temporais, conclusão por `data_encerramento`, médias/medianas, estoque/produtividade e comparação sem base anterior em `metricasPainelIA.test.js` e `iaController.test.js`. |
| RN41 | `recomendacoesExplicaveis` só aceita recomendações consultivas com período e evidência coincidente com o catálogo calculado; a interface mostra ação, impacto qualitativo, período e evidências. | Chave, valor, unidade e período adulterados são descartados; recomendações válidas e exibição no `PainelIA.test.jsx` são cobertas. |
| RN43 | O controller coleta somente campos mínimos, remove PII e linhas individuais antes do Gemini/persistência; números livres do modelo não são devolvidos à interface. | Sentinelas de CPF/CNPJ, placa, telefone, e-mail, endereço, motivo, IDs/nomes de funcionários e alegações quantitativas livres em `iaController.test.js` e `recomendacoesExplicaveis.test.js`. |
| RN44 | Rotas de IA usam autenticação, `requireRole('gestor')` e `iaRateLimiter`; o histórico é paginado, sob demanda e somente leitura. | Integração confirma `401`, `403/SEM_PERMISSAO` para atendente/mecânico e `429/RATE_LIMIT_IA`; `PainelIA.test.jsx` cobre consulta e detalhe de histórico sem reexecução. |

### 4.2 Lacunas solicitadas de cobertura de regras de negócio

| Regra | Evidência automatizada adicionada | Alcance e pendências |
|---|---|---|
| RN29 | `pages/Login.test.jsx`, quinta falha e fronteira de 15 minutos com relógio controlado; `authController.test.js` valida reserva, falha, sucesso e armazenamento indisponível; `database/tests/login_bloqueio_test.sql` valida persistência/RPC e privilégios | Estado consultado pelo backend após recarga; limite da aplicação persiste no banco e tentativas concorrentes são reservadas atomicamente. Chamadas diretas ao grant de senha do Supabase Auth permanecem fora do Express; isso exige controle nativo do provedor/gateway. Migração 32 ainda precisa de rollout no ambiente destino. |
| RN30 | `pages/Login.test.jsx`, mesmos texto e fluxo para sucesso, erro e exceção da recuperação | Não enumera e-mails na interface; provedor mockado. O envio real é uma etapa separada da coleção/UAT. |
| RN46 | `pages/Servicos.test.jsx`, `hooks/useDatabase.test.jsx` e `database/tests/regras_negocio_servidor_test.sql`: confirmação, `UPDATE ativo:false`, recusa de inclusão direta e regravação segura pelo RPC | A seleção da tela consulta somente serviços ativos; a migração 34 também impede contorno via PostgREST/RPC sem bloquear um serviço que já pertencia à OS antes de ser inativado. |

### 4.3 Histórico de status e desempenho

A migração 33 grava status inicial e cada transição posterior em `historico_status_os`;
`duracao_etapa_os` calcula a duração observada entre eventos, com etapa atual aberta até
o instante da consulta. `database/tests/historico_status_os_test.sql` cobre updates, RPCs
de conclusão/cancelamento, autoria, RLS, append-only e duração. O histórico começa na
implantação; tempos anteriores não são estimados. O DERS ainda contém a regra antiga que
proibia inferir duração sem histórico e precisa ser atualizado na fonte `.docx`.

O protocolo de desempenho para RNF-DS01–DS05 está em
[`RELATORIO_DESEMPENHO.md`](RELATORIO_DESEMPENHO.md). Ele separa medições quantitativas
de DS01/DS02, concorrência DS03 e verificações em navegador de DS04/DS05. Em
26/10/2026, DS04 foi aprovado sem consultas adicionais às três tabelas principais em
sete navegações SPA, e DS05 manteve os indicadores de carregamento visíveis após
3,2 s de espera controlada. O [relatório de evidências](evidencias/RESULTADO_DS04_DS05_2026-10-26.md)
registra o método e os resultados locais; nenhuma chamada foi enviada ao Gemini.

Na rodada de 22/10/2026, passaram **389/389 testes frontend** (36 arquivos),
**529/529 backend** (24 arquivos), **24/24 E2E** em Chromium e as **seis suítes SQL**
após reaplicar as migrações 29–33 no Supabase efêmero. O E2E usou portas locais
isoladas e um teto de rate limit elevado somente para permitir várias sessões da mesma
origem; o padrão da API permanece em cinco requisições por IP. O lint de frontend e
backend passou sem avisos. O build passou, mas ainda emite um aviso do plugin PostCSS
sobre a opção `from`; portanto, não se declara ausência de todos os avisos do build.
`xlsx` foi removido por não ser usado.

Na rodada complementar de 25/10/2026, após a migração 34, passaram **460/460 testes
frontend** (46 arquivos), **537/537 backend** (27 arquivos), **72/72 E2E** nos três
navegadores, **8/8 suítes SQL** e **15/15 verificações de concorrência**. A migração 34
foi aplicada duas vezes no Supabase efêmero, confirmando a idempotência. Lint dos dois
projetos e build também passaram; nenhum teste dessa rodada acessou produção.

Esses testes fecham as três lacunas solicitadas no código, mas **não fundamentam uma
declaração de 100% de conformidade ou de cobertura integral das 50 RNs**. Contar uma regra
referenciada por um teste não prova todas as suas cláusulas. A RN38 continua divergente,
a RN29 tem o limite acima, e UAT/SUS ainda exigem evidências.
O roteiro de UAT distingue resultados esperados dos efetivamente observados.

Na revisão estática das suítes, também não foram localizadas asserções específicas
para os critérios abaixo. A presença de validações no código ou de constraints no
schema não substitui testes desses critérios; esta lista não é uma auditoria exaustiva
de todas as cláusulas das 50 regras.

| Regra | Critério ainda sem evidência automatizada específica localizada |
|---|---|
| RN31 / RN36 | Recusa de código de estoque duplicado e domínio completo de unidades de medida. |
| RN48 | Recusa de colisão no vínculo 1:1 entre funcionário e usuário. |

### 4.3 Correção das consultas financeiras do chatbot

RF11/RN39: `iaService.js` solicita interpretação estruturada ao Gemini, sem
agregados financeiros no contexto livre e com as respostas anteriores do assistente
substituídas por marcador. `consultaFinanceiraChatbot.js` valida métrica/período
contra a pergunta e perguntas anteriores do usuário; o callback no controller
autoriza gestor antes de consultar OS concluídas, pelo encerramento. A consulta
paginada exige contagem exata consistente e IDs distintos. O backend calcula em
centavos e formata a resposta, sem segunda chamada de redação ao modelo.

A regra de leitura do histórico também muda: não gestores continuam usando a
conversa da sessão, mas recebem `403/HISTORICO_RESTRITO` no histórico persistido.
A migração 30 protege a leitura direta do chatbot pelo Supabase de contas
rebaixadas; a 31 fecha a leitura de recomendações do painel por autoria/vínculo
com OS. O frontend reinicia a conversa ao mudar usuário/perfil. RN37 continua sendo atendida
pelo registro por usuário; ela não concede acesso a conteúdo financeiro após
mudança de autorização.

As novas verificações abrangem períodos/anos, continuação, fronteiras no fuso de
São Paulo, precisão monetária, comparação sem base, paginação completa, argumentos
adulterados, falha de banco e restrição do histórico. **30 e 31 foram aplicadas e
reaplicadas localmente; quatro suítes SQL passaram com o teste estendido das duas
tabelas. Produção não recebeu as migrações 30 e 31.**

Reteste final: **519/519 backend** (24 arquivos, 1,64 s), **389/389 frontend**
(36 arquivos, 20,42 s), **24/24 E2E** (1,2 min, um worker, sem retries). Lint do
backend sem avisos; frontend sem erros, com três avisos preexistentes em
Sidebar/Dashboard. Build aprovado e 63 arquivos do bundle inspecionados sem segredo.

Com Gemini real, a rodada do chatbot teve **24 AP e uma RE em 25 operações, sem
BL**. A falha de interpretação do qualificador de CHAT-08 foi corrigida e recebeu
duas regressões unitárias; o caso passou em **três novas repetições**. O painel
confirmou R$ 4.750,00, cinco conclusões e ticket R$ 950,00 na fixture. Em fluxo
completo HTTP/Supabase local/Gemini, outubro/2026 resultou em R$ 749,00 e cinco OS,
coincidindo com o oráculo independente do banco. Atendente e mecânico não obtiveram
valores com perfil forjado e receberam 403 no histórico do chatbot.

O [relatório](RESULTADOS_TESTES_IA.md) preserva a rodada inicial e a reprovação
intermediária. As execuções não aprovam integralmente os 39 cenários nem substituem
UAT. A divergência deliberada da RN38 permanece. Sem deploy e sem commit.

A revisão final encerrou três achados de perda de qualificadores. Comparação de
ticket/quantidade, filtro por cliente e recorte relativo até ontem agora pedem
esclarecimento; não foram implementados novos filtros nem se aceita substituí-los
por faturamento global. Seis regressões adicionais e uma verificação da data de
referência local no prompt compõem a contagem final de 519 testes backend.

## 5. Como executar os testes

```bash
# Na raiz do repositório: backend
npm --prefix backend test

# Frontend
npm --prefix react-app test

# Coleção Postman: validação local, sem rede, na raiz do repositório
node docs/api/validar-colecao.cjs
```

Saída medida em 22/10/2026: **918 testes unitários/integração/componente aprovados**
(529 backend em 24 arquivos + 389 frontend em 36 arquivos), **24/24 E2E aprovados**
e **seis suítes SQL aprovadas** após reaplicar as migrações 29–33 no Supabase efêmero.
O Playwright foi executado com um worker Chromium, configuração local isolada e sem
acessar produção. Nenhum teste ou migração desta rodada usou produção.

Saída mais recente, medida em 25/10/2026: **997 testes de frontend/backend aprovados**
(460 frontend + 537 backend), **72/72 E2E**, **8/8 suítes SQL** e **15/15 verificações
de concorrência**. A execução usou servidores isolados e Supabase efêmero local.
