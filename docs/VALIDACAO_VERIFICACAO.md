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
| **Vitest** | Testes unitários, de integração e de componente (frontend e backend) | **Implementado — 488 testes medidos** |
| **React Testing Library** | Testes de componente React (renderização isolada) | **Implementado** |
| **Supertest** | Testes de integração da API Express | **Implementado** |
| **ESLint** | Análise estática de código | Configurado (`npm run lint`). No backend, com **plugin de segurança** (`backend/eslint.config.js`) e execução na integração contínua |
| **Vite build** | Verificação de compilação/empacotamento | `npm run build` |
| **QA assistido em navegador** | Inspeção de telas, console e fluxos | Realizado (evidências em prints) |
| **Playwright** | Testes ponta a ponta (E2E) dos fluxos | **Implementado — 17 testes E2E em banco Supabase efêmero na CI** |
| **Postman/Insomnia** | Testes da API REST (endpoints) | Planejado |

### 2.1 Testes automatizados (Vitest)

- **Backend (291 testes, 14 arquivos)**:
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
- **Frontend (197 testes, 28 arquivos)**:
  - Funções puras (`utils/*.test.js`) — placa, estoque (alerta/saldo/moeda/resumo),
    endereço/CEP, finanças da OS e status de OS.
  - **Componente (React Testing Library)** — 16 suítes, entre elas `GlassPanel.test.jsx`,
    `Servicos.test.jsx`, `Usuarios.test.jsx`, `Funcionarios.test.jsx`,
    `Chatbot.test.jsx` e `Chatbot.origem.test.jsx` (indisponibilidade da IA por bolha,
    status da sidebar e região viva para leitor de tela) e `PainelIA.test.jsx`
    (**15 testes**): blocos gerenciais completos, comparações sem base anterior, cobertura
    sem consumo, listas vazias, recomendações com evidências, indisponibilidade sem números
    e histórico sob demanda, somente leitura e isolado de falhas da análise atual.
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
      imprimir sobre o mesmo documento**, desconto persistido e navegação da guia reservada.
    - `components/ui/AcoesDocumentoOS.test.jsx` — reserva a guia no gesto do clique, antes
      do carregamento assíncrono do logotipo, e baixa o mesmo PDF quando o pop-up é bloqueado.
    - `pages/OrdemServico/AtualizarOS.test.jsx` — tabela de casos com os **cinco status**
      (`aberta`, `em_andamento`, `aguardando_peca`, `concluida`, `cancelada`): em todos, Salvar PDF
      e Imprimir existem e recebem os dados corretos; sem configuração da oficina, aviso acessível
      e nenhum documento gerado.
    - `pages/OrdemServico/EncerrarOS.test.jsx` — O.S. já finalizada continua emitindo, e a prévia
      do encerramento leva o desconto e a forma de pagamento escolhidos na tela.
- **E2E (Playwright) — 17 testes** — `react-app/e2e/`:
  - `login.spec.js` — login (ok/inválido), redirecionamento de rota protegida, entrada do
    mecânico diretamente em O.S. e espaçamento dos ícones nos campos de autenticação.
  - `navegacao.spec.js` — Clientes, Veículos, Estoque, Relatórios, Funcionários e chatbot.
  - `fluxos.spec.js` — busca de clientes, modal de novo cliente, dependência cliente→veículo na
    nova O.S. e a disponibilidade de **Salvar PDF / Imprimir** na O.S. aberta e na concluída
    abrindo a guia `blob:` real do documento).
  - A CI inicia um Supabase efêmero, aplica as migrações 01–27, cria fixtures confirmadas e
    determinísticas e só então executa o navegador. Assim, ausência de dados não vira teste
    silenciosamente ignorado.
- **Banco (SQL)** — `database/tests/rls_matrix_test.sql` confere a matriz de acesso por perfil,
  inclusive o conjunto exato de clientes do mecânico; `estoque_os_test.sql` verifica baixa,
  presença do trigger do ledger, idempotência e rollback integral por saldo insuficiente. Ambos rodam na CI contra o
  mesmo banco dedicado do E2E.
- **Total: 488 testes unitários/integração/componente (197 frontend + 291 backend), todos aprovados**, medidos em 16/10/2026. O Playwright coleta **17 E2E**; a execução completa com o banco dedicado ocorre na CI porque requer Docker/Supabase local.
- **Como executar:** `npm test` (unitários, em `backend/` e `react-app/`) e
  `npm run test:e2e` (E2E em `react-app/`, requer o app rodando).

### 2.2 Divergência verificada: contingência da IA (RN38 / RN42)

As RN38 e RN42 preveem **resposta de contingência** quando a IA não responde. O
sistema **não a tem mais**, por decisão do responsável do projeto, e isso é
verificado por teste em vez de ficar implícito:

- O roteador de respostas fixas (`react-app/src/utils/chatbot.js`) e a análise
  local do `PainelIA.jsx` foram **removidos**. A análise local fabricava
  recomendações e barras de "confiança" com percentuais escritos no código
  (97%, 88%, 82%, 75%), indistinguíveis de uma medição do modelo.
- A contingência que resta é a **troca de modelo** (`MODELOS` em `iaService.js`),
  coberta por `comModeloAlternativo.test.js` e `modeloNasChamadas.test.js`.
- Quando os dois modelos falham, a tela declara a indisponibilidade e
  **nenhum número é estimado**. Verificado por:
  `PainelIA.test.jsx` → *"NAO exibe resumo, metrica nem barra de confianca quando
  a IA falha"*, que falha se qualquer percentual voltar à tela.

A divergência está registrada em [`DER.md`](DER.md), seção de divergências (#4).

## 3. Ferramentas de Validação

| Ferramenta | Uso |
|---|---|
| **Matriz de rastreabilidade** | Liga cada requisito/caso de uso à funcionalidade e ao teste (seção 4) |
| **Testes de aceitação (UAT)** | Critérios de aceite verificados por caso de uso |
| **Questionário SUS** (System Usability Scale) | Avaliação de usabilidade com usuários/orientador |
| **Validação em ambiente hospedado** | Orientador testa o sistema publicado (Vercel) |

## 4. Matriz de Rastreabilidade de Requisitos

| UC | RF | Funcionalidade | Implementação | Status | Verificação/Validação |
|---|---|---|---|---|---|
| UC01 | RF08 | Autenticar usuário (login + perfil) | Login, AuthContext, authMiddleware, RLS | Implementado | Login por perfil + redirecionamento do mecânico + matriz de RLS |
| UC02 | RF01 | Manter clientes | Clientes.jsx | Implementado | Teste unitário + UAT |
| UC03 | RF02 | Manter veículos (vínculo a cliente) | Veiculos.jsx + utils/placa | Implementado | Teste unitário (placa) + E2E |
| UC04 | RF03 | Abrir ordem de serviço | OrdemServico/AbrirOS | Implementado | Teste E2E + aceitação |
| UC05 | RF04 | Atualizar ordem de serviço | OrdemServico/AtualizarOS | Implementado | Teste E2E + aceitação |
| UC06 | RF05 | Encerrar ordem de serviço | EncerrarOS + RPC `finalizar_ordem_servico` | Implementado | Componente + E2E + integração SQL de baixa/rollback |
| UC06 | RF05 | Configurar a oficina (cadastro único + logotipo) | ConfiguracaoOficina.jsx, useDatabase (`configuracao_oficina`), migração 18 | Implementado | `ConfiguracaoOficina.test.jsx` + `useDatabase.test.jsx` + auditoria de RLS/Storage |
| UC06 | RF05 | Emitir a O.S. em PDF ou imprimir, em qualquer status | utils/osPdf.js, components/ui/AcoesDocumentoOS.jsx | Implementado | `utils/osPdf.test.js` + testes por status em `AtualizarOS`/`EncerrarOS` + E2E |
| UC07 | RF06 | Consultar histórico | Historico.jsx | Implementado | Teste funcional |
| UC08 | RF07 | Emitir relatórios (exportação) | Relatorios.jsx (CSV/PDF/XLSX) | Implementado | Teste funcional + validação de export |
| UC09 | RF09 | Manter estoque (alertas) | Estoque/ListaEstoque + utils/estoque | Implementado | Teste unitário (alerta) |
| UC10 | RF13 | Manter serviços | Servicos.jsx | Implementado | Teste unitário + UAT |
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

## 5. Como executar os testes

```bash
# Backend
cd backend && npm test

# Frontend
cd react-app && npm test
```

Saída medida em 16/10/2026: **488 testes unitários/integração/componente aprovados** (291 backend + 197 frontend), lint aprovado nos dois projetos e build de produção aprovado. O Playwright coleta **17 E2E**. A execução E2E e dos dois scripts SQL está incorporada à CI com Supabase efêmero; nesta estação local ela não foi executada por ausência de Docker/Podman.
