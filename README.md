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
├── backend/         ← API REST (Node.js + Express)
├── database/        ← Scripts SQL (Supabase)
└── README.md
```

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
   - `11_normalizacao_relacional.sql` — **Normalização do modelo**: cria a entidade `funcionario` e as tabelas `os_servico`/`os_peca` (substituem a comissão em `usuario` e os campos JSON da OS), com backfill e ajuste de RLS. A "Fase 2" (drop das colunas antigas) fica comentada no fim — rode só após validar a aplicação.
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

| Recurso | Rotas |
|---|---|
| Auth | `POST /auth/login`, `/logout`, `/refresh`, `/forgot-password` |
| Clientes | `GET/POST /clientes`, `GET/PUT/PATCH /clientes/:id` |
| Veículos | `GET/POST /veiculos`, `GET/PUT/PATCH /veiculos/:id` |
| Ordens de Serviço | `GET/POST /ordens-servico`, `PUT/PATCH /ordens-servico/:id` |
| Estoque | `GET/POST /estoque`, `POST /estoque/:id/entrada`, `POST /estoque/:id/saida` |
| Movimentações | `GET /movimentacoes` |
| Relatórios | `GET /relatorios/atendimentos`, `/faturamento`, `/estoque`, `/servicos-frequentes`, `/clientes-frequentes` |
| Chatbot | `POST /chatbot/mensagem`, `GET /chatbot/historico` |
| IA | `POST /ia/analisar`, `GET /ia/recomendacoes` |
| Usuários | `GET/POST /usuarios`, `PUT/PATCH /usuarios/:id` |

---

## Stack Tecnológica

**Frontend:** React 19 + Vite + React Router DOM + Lucide React + Recharts + jsPDF + xlsx

**Backend:** Node.js + Express + Supabase JS (service role) + @google/generative-ai + Helmet + express-rate-limit

**Banco de dados:** Supabase (PostgreSQL) com Row Level Security (RLS)

**IA:** Google Gemini (gemini-flash-lite-latest para chatbot e análise)

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

Cobertura atual: **47** testes de frontend + **29** de backend + **11** E2E.

---

## Observações de Segurança

- Nunca exponha a `SUPABASE_SERVICE_ROLE_KEY` no frontend
- O frontend usa apenas a chave `anon` + RLS para proteção
- O backend valida todos os JWTs via Supabase Auth
- Rate limiting ativo na rota de login (5 tentativas / 10 min por IP)
- Todas as recomendações da IA têm **caráter exclusivamente consultivo**

---

*Desenvolvido como Trabalho de Conclusão de Curso (TFC) — UniRV 2026*
