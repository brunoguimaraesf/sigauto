# SIGAuto — Sistema Inteligente de Gestão de Oficinas Automotivas

**TFC UniRV 2026 | Bruno Gabriel Guimarães Fernandes**

Sistema web completo para gestão de oficinas automotivas de pequeno e médio porte.

---

## Descrição

O SIGAuto digitaliza e centraliza os processos operacionais de uma oficina: abertura e encerramento de ordens de serviço, controle de estoque de peças, cadastro de clientes e veículos, relatórios gerenciais e um painel de recomendações com Inteligência Artificial (Google Gemini).

---

## Pré-requisitos

- **Node.js** 18 ou superior
- **Conta no Supabase** (gratuita): [supabase.com](https://supabase.com)
- **Chave Google Gemini** (para chatbot e IA): [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **Git**

---

## Estrutura do Projeto

```
SIGAUTO/
├── react-app/       ← Frontend (React + Vite)
├── backend/         ← API (Node.js + Express): auth, chatbot e IA
├── database/        ← Scripts SQL (Supabase), 01 → 27
├── docs/            ← DERS, requisitos gerados, modelo de dados e plano de V&V
├── CLAUDE.md        ← Guia para agentes de IA (= AGENTS.md)
└── README.md
```

### Documentação

| Arquivo | Conteúdo |
|---|---|
| [`docs/Desenvolvimento_DERS_BrunoGabrielGuimaraes.docx`](docs/Desenvolvimento_DERS_BrunoGabrielGuimaraes.docx) | DERS oficial e fonte dos requisitos acadêmicos |
| [`docs/REQUISITOS.md`](docs/REQUISITOS.md) | Especificação gerada do DERS por `docs/importar-ders.py` |
| [`docs/DER.md`](docs/DER.md) | Modelo entidade-relacionamento, em Mermaid, extraído de `database/` |
| [`docs/VALIDACAO_VERIFICACAO.md`](docs/VALIDACAO_VERIFICACAO.md) | Plano de V&V e matriz de rastreabilidade UC → RF → implementação → teste |



---

## 1. Configuração do Banco de Dados (Supabase)

1. Crie um novo projeto em [app.supabase.com](https://app.supabase.com)
2. Acesse **SQL Editor** no painel
3. Execute os scripts **na ordem** (SQL Editor):
   - `01_schema.sql` — Tabelas e tipos base
   - `02_rls_policies.sql` — Políticas de segurança (RLS)
   - `03_functions.sql` — Funções e procedures
   - `04_seed_data.sql` — Dados iniciais
   - `05_os_finance_columns.sql` — Campos financeiros da OS
   - `06_servico_catalogo.sql` — Catálogo de serviços
   - `07_fix_rls_recursion.sql` — Ajuste de RLS
   - `08_comissoes_os.sql` — Comissões (legado)
   - `09_fix_recomendacao_ia.sql` — Ajuste da tabela de recomendações da IA
   - `10_seed_demo.sql` — Massa de dados de demonstração
   - `11_normalizacao_relacional.sql` — **Normalização do modelo**: cria a entidade `funcionario` e as tabelas `os_servico`/`os_peca` (substituem a comissão em `usuario` e os campos JSON da OS), com backfill e ajuste de RLS. A remoção definitiva dos legados ocorre nas migrações 23–24.
   - `12_hardening_rls_funcionario.sql` — **Endurecimento de RLS**: impede o mecânico de reatribuir a OS a outro funcionário e restringe a leitura de `funcionario` (que expunha a comissão a todos), criando a view `funcionario_publico`. Rode **depois** de publicar o frontend que lê essa view.
   - `13_endereco_cliente.sql` — **Endereço estruturado**: cria a entidade `endereco` (1:1 com `cliente`) com preenchimento pelo CEP, em vez do texto livre `cliente.endereco`. A migração 25 remove o texto antigo somente depois de validar o backfill.
   - `14_hardening_advisor.sql` — **Achados do Security Advisor**: revoga `EXECUTE` de funções `SECURITY DEFINER` que a chave pública (`anon`) podia chamar por RPC para ler dados do negócio sem login, fixa o `search_path` e indexa chaves estrangeiras.
   - `15_custo_item_estoque.sql` — **Custo do estoque**: acrescenta `item_estoque.custo` (anulável: `NULL` = não informado, `0` = custo zero), exigido pelo RF09/RN35 e que faltava no schema.
   - `16_hardening_execute_restante.sql` — **Fecha o que a 14 deixou aberto**: três funções `SECURITY DEFINER` continuaram com `EXECUTE` para `PUBLIC`, e duas delas (`get_clientes_frequentes`, `get_relatorio_atendimentos`) devolviam nome, CPF/CNPJ e telefone de cliente a quem chamasse por RPC com a chave `anon`, **sem login**. Revoga o `EXECUTE`, fixa o `search_path`, fecha com `REVOKE` explícito a view `funcionario_publico` (que ignora RLS por design e nunca teve `REVOKE` de `anon`) e termina com uma pós-condição que falha se alguma `SECURITY DEFINER` ou view que ignore RLS ainda estiver acessível por `anon`.
   - `17_check_preco_unit.sql` — **Preço não negativo**: o `CHECK` que faltava em `item_estoque.preco_unit`, em script próprio para que um dado ruim não aborte o hardening de segurança da 16.
   - `18_configuracao_oficina.sql` — **Cadastro único da oficina e logotipo** usado no documento da O.S.
   - `19_hardening_signup_e_custo.sql` — **Hardening de cadastro e custo**: impede elevação de perfil por metadado do signup, restringe custo a gestor e endurece oficina/Storage.
   - `20_fix_rls_cliente_mecanico.sql` — **RLS do mecânico e vínculo de funcionário**: corrige a leitura do cliente das O.S. atribuídas e cria os vínculos ausentes para os seletores de equipe.
   - `21_os_desconto_observacoes.sql` — **Fechamento da O.S.**: persiste tipo/valor/percentual do desconto e observações finais.
   - `22_baixa_automatica_estoque_os.sql` — **Baixa automática transacional**: conclui a O.S., valida o saldo e grava movimentos imutáveis com motivo, responsável e origem, sem duplicar a baixa.
   - `23_os_comissao_snapshot.sql` — **Snapshot relacional de comissão** antes da remoção do JSON legado.
   - `24_remocao_legados_os_usuario.sql` — **Remove legados da O.S. e usuário** após backfills e pós-condições contra perda de dados.
   - `25_remocao_endereco_legado.sql` — **Remove o endereço textual**, preservando antes qualquer texto restante na entidade estruturada.
   - `26_enforcement_os_estoque.sql` — **Enforcement pós-frontend**: ledger append-only, guards de saldo/finalização e bloqueio dos itens de O.S. concluída.
   - `27_repara_trigger_estoque.sql` — **Reparo da baixa de estoque**: reinstala o trigger do ledger, reconcilia movimentos automáticos pendentes e restaura a view autenticada do histórico.

   > Deploy das migrações 20–27: aplique 20–23, publique frontend e backend, valide, aplique 24–26 e finalize com a 27. Essa separação evita incompatibilidade entre a versão antiga da tela e as restrições/remoções novas.
4. Anote a **URL** e as **chaves** (anon e service_role) em **Project Settings > API**

---

## 2. Configuração do Backend

```bash
cd backend
cp .env.example .env
# Edite .env com suas credenciais
npm install
npm run dev
```

### Variáveis de ambiente (`backend/.env`):

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do seu projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role (acesso total ao banco) |
| `SUPABASE_JWT_SECRET` | JWT Secret (Project Settings > API > JWT Settings) |
| `GEMINI_API_KEY` | Chave da API do Google Gemini para o chatbot e IA |
| `PORT` | Porta da API (padrão: 3001) |
| `NODE_ENV` | `development` ou `production` |
| `FRONTEND_URL` | URL do frontend para configuração do CORS |

---

## 3. Configuração do Frontend

```bash
cd react-app
cp .env.example .env
# Edite .env com suas credenciais
npm install
npm run dev
```

### Variáveis de ambiente (`react-app/.env`):

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do seu projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon (pública, segura para o frontend) |
| `VITE_API_URL` | URL do backend (ex: `http://localhost:3001/api/v1`) |

---

## 4. Executar o Sistema

Em terminais separados:

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd react-app && npm run dev
```

Acesse: **http://localhost:5173**

---

## Perfis de Acesso

| Perfil | Permissões |
|---|---|
| **Gestor** | Acesso total: OS, clientes, veículos, estoque, relatórios, IA, usuários |
| **Atendente** | OS, clientes, veículos, estoque (sem exclusão definitiva) |
| **Mecânico** | Consulta e diagnóstico das OS atribuídas |

---

## Endpoints da API (`/api/v1/`)

O backend expõe **apenas** o que não pode rodar no navegador, porque depende da chave do Gemini ou da `service_role`:

| Recurso | Rotas | Limite de taxa |
|---|---|---|
| Auth | `POST /auth/login`, `/logout`, `/refresh`, `/forgot-password`; `POST /auth/usuarios` (gestor, conta já confirmada e vinculada a funcionário) | 5 tentativas / 10 min por IP no login |
| Chatbot | `POST /chatbot/mensagem`, `GET /chatbot/historico` | 10 req/min |
| IA | `POST /ia/analisar`, `GET /ia/recomendacoes` | 10 req/min |
| Health | `GET /health` (fora do `/api/v1`) | — |

> **As antigas rotas de CRUD foram removidas** — clientes, veículos, ordens de serviço, estoque, movimentações, relatórios e usuários. Elas rodavam com a `service_role`, ignorando o RLS, e sem checagem de dono eram uma superfície de IDOR e de bypass das políticas. Todo o CRUD de dados passa **direto pelo Supabase**, com a chave `anon` + RLS. Não crie rota nova de cadastro aqui.

---

## Stack Tecnológica

**Frontend:** React 19 + Vite + React Router DOM + Lucide React + Recharts + jsPDF + xlsx

**Backend:** Node.js + Express + Supabase JS (service role) + @google/generative-ai + Helmet + express-rate-limit

**Banco de dados:** Supabase (PostgreSQL) com Row Level Security (RLS)

**IA:** Google Gemini — `gemini-flash-lite-latest` para chatbot e análise, com `gemini-3.5-flash-lite` como modelo de contingência quando o primeiro está sobrecarregado. **Não há resposta de contingência local:** se os dois modelos falharem, a tela declara a indisponibilidade da IA e nenhum número é estimado — divergência deliberada das RN38/RN42, registrada em [`docs/DER.md`](docs/DER.md)

**Testes:** Vitest + React Testing Library (frontend), Supertest (API) e Playwright (E2E)

**Deploy:** Vercel (frontend e backend como função serverless)

---

## Testes

```bash
# Frontend (unitários + componente)
cd react-app && npx vitest run

# Frontend (E2E — sobe o Vite automaticamente)
cd react-app && npx playwright test

# Backend (unitários + integração da API)
cd backend && npx vitest run
```

Cobertura medida em 16/10/2026: **197** testes de frontend (28 arquivos) + **291** de backend (14 arquivos), todos aprovados, e **17** cenários E2E coletados. A CI executa os E2E e os testes SQL de RLS/estoque contra um Supabase efêmero dedicado.

---

## Observações de Segurança

- Nunca exponha a `SUPABASE_SERVICE_ROLE_KEY` no frontend
- O frontend usa apenas a chave `anon` + RLS para proteção
- O backend valida todos os JWTs via Supabase Auth
- Rate limiting ativo na rota de login (5 tentativas / 10 min por IP)
- Todas as recomendações da IA têm **caráter exclusivamente consultivo**

---

*Desenvolvido como Trabalho de Conclusão de Curso (TFC) — UniRV 2026*
