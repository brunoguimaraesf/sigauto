# SIGAuto — Frontend

Interface web do SIGAuto (Sistema Inteligente de Gestão de Oficinas Automotivas), construída em **React 19 + Vite**.

> Guia completo de instalação (banco, backend, variáveis) no [README da raiz](../README.md).

## Executar

```bash
npm install
cp .env.example .env   # preencha as variáveis abaixo
npm run dev            # http://localhost:5173
```

## Variáveis de ambiente (`.env`)

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon (pública; o acesso é protegido por RLS) |
| `VITE_API_URL` | URL do backend (ex.: `http://localhost:3001/api/v1`) |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Ambiente de desenvolvimento (HMR) |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários e de componente (Vitest) |
| `npm run test:e2e` | Testes E2E (Playwright) |

## Arquitetura

- **Dados:** o frontend acessa o Supabase diretamente (chave anon + RLS). O carregamento é centralizado em [`src/hooks/useDatabase.js`](src/hooks/useDatabase.js) (`DataProvider` + `useDatabase()`), que traz clientes, veículos, OS (com os itens de `os_servico`/`os_peca` via JOIN), serviços, usuários e funcionários em uma única carga compartilhada por todas as telas.
- **Rotas e perfis:** protegidas por `ProtectedRoute` conforme o perfil (gestor/atendente/mecânico).
- **Design system:** tema escuro com laranja (`--neon-orange: #E8590C`), fonte Manrope. Definido em [`src/index.css`](src/index.css) — **imutável** salvo pedido explícito.
- **Cálculos de OS:** totais e comissões em [`src/utils/osFinance.js`](src/utils/osFinance.js) (`resolveEquipe` resolve mecânico/atendente a partir de `funcionario`).

## Estrutura

```
src/
├── pages/          Telas (OS, Clientes, Veículos, Estoque, Relatórios, Funcionários, ...)
├── components/     Sidebar, Header, GlassPanel, Chatbot, ProtectedRoute
├── hooks/          useDatabase (camada de dados)
├── context/        AuthContext
├── utils/          osFinance, estoque, placa, masks, chatbot, export PDF/XLSX
└── supabaseClient.js
e2e/                Testes Playwright
```
