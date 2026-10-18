# SIGAuto — Sistema Inteligente de Gestão de Oficinas Automotivas

**TFC UniRV 2026 | Bruno Gabriel Guimarães Fernandes**

Sistema web para gestão de oficinas automotivas de pequeno e médio porte.

---

## Descrição

O SIGAuto digitaliza os processos operacionais de uma oficina: abertura,
acompanhamento e encerramento de ordens de serviço, controle de estoque de
peças com baixa automática, cadastro de clientes e veículos, equipe com regras
de comissão, relatórios gerenciais e um módulo de Inteligência Artificial
(Google Gemini) com chatbot e recomendações.

### Módulos

| Módulo | O que faz |
|---|---|
| **Ordens de serviço** | Abertura com cliente e veículo, diagnóstico, itens de serviço e de peça, desconto por valor ou percentual, encerramento transacional com baixa de estoque e snapshot de comissão, documento em PDF |
| **Clientes e veículos** | Cadastro com validação de CPF/CNPJ e de placa (padrão antigo e Mercosul), endereço estruturado com preenchimento por CEP, histórico de atendimentos |
| **Estoque** | Itens com saldo, mínimo e custo, ledger de movimentações *append-only* com motivo e responsável, alerta de saldo baixo |
| **Equipe** | Funcionários com cargo e regra de comissão (percentual sobre serviços, peças ou ambos), usuários de acesso e perfis |
| **Relatórios** | Faturamento, atendimentos, estoque, serviços e clientes frequentes e comissões, por período e **por funcionário**, com exportação em CSV |
| **IA** | Chatbot com contexto recortado por perfil e painel de recomendações, ambos sobre o Google Gemini |

---

## Estado atual

Medido em 18/10/2026, contra Supabase efêmero local:

| Verificação | Resultado |
|---|---|
| Testes de frontend (Vitest + React Testing Library) | **382** em 35 arquivos |
| Testes de backend (Vitest + Supertest) | **394** em 20 arquivos |
| Cenários E2E (Playwright) | **24** |
| Suítes SQL (matriz de RLS, estoque/O.S., hardening 29) | **3** |
| `eslint` nos dois projetos | sem erro |
| `npm run build` | aprovado, com verificação do artefato |

A CI (GitHub Actions) roda lint, build e testes dos dois projetos, mais os E2E e
as suítes SQL contra um Supabase efêmero dedicado.

Relatórios da auditoria técnica de 17–18/10/2026, com achados, severidade e
evidências: [`AUDITORIA_SIGAUTO.md`](AUDITORIA_SIGAUTO.md),
[`TESTES_SIGAUTO.md`](TESTES_SIGAUTO.md) e
[`CORRECOES_SIGAUTO.md`](CORRECOES_SIGAUTO.md).

---

## Pré-requisitos

- **Node.js 22** (versão usada na CI; 18 ou superior funciona para o
  desenvolvimento comum)
- **Conta no Supabase**: [supabase.com](https://supabase.com)
- **Chave do Google Gemini**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **Git**
- **Docker** — opcional, só para rodar E2E e as suítes SQL localmente contra o
  Supabase efêmero (ver [Testes](#testes))

---

## Estrutura do projeto

```
SIGAUTO/
├── react-app/       ← Frontend (React 19 + Vite). O cliente principal
│   ├── e2e/         ← Testes Playwright e fixtures do banco efêmero
│   ├── scripts/     ← verifica-bundle.mjs (checagem do artefato de build)
│   └── src/
├── backend/         ← API Express (ESM): auth, chatbot e IA — nada de CRUD
├── database/        ← Scripts SQL do Supabase, 01 → 29, aplicados em ordem
│   └── tests/       ← Suítes SQL de RLS, estoque/O.S. e hardening
├── docs/            ← DERS, requisitos gerados, modelo de dados e plano de V&V
├── CLAUDE.md        ← Guia para agentes de IA (idêntico ao AGENTS.md)
└── README.md
```

### Documentação

| Arquivo | Conteúdo |
|---|---|
| [`docs/Desenvolvimento_DERS_BrunoGabrielGuimaraes.docx`](docs/Desenvolvimento_DERS_BrunoGabrielGuimaraes.docx) | DERS oficial e **fonte** dos requisitos acadêmicos |
| [`docs/REQUISITOS.md`](docs/REQUISITOS.md) | Especificação gerada do DERS por `docs/importar-ders.py` — não edite à mão |
| [`docs/DER.md`](docs/DER.md) | Modelo entidade-relacionamento, em Mermaid, extraído de `database/`, e a lista de divergências entre especificação e schema |
| [`docs/VALIDACAO_VERIFICACAO.md`](docs/VALIDACAO_VERIFICACAO.md) | Plano de V&V e matriz de rastreabilidade UC → RF → implementação → teste |

Requisito novo ou alterado entra pelo `.docx`, seguido de
`python docs/importar-ders.py`.

---

## 1. Banco de dados (Supabase)

1. Crie um projeto em [app.supabase.com](https://app.supabase.com).
2. Abra o **SQL Editor**.
3. Execute os scripts de `database/` **na ordem numérica**, do `01` ao `29`.
4. Anote a **URL** e as chaves **anon** e **service_role** em
   **Project Settings → API**.

### O que cada migração faz

| Script | Conteúdo |
|---|---|
| `01`–`03` | Tabelas e tipos base, políticas de RLS iniciais, funções |
| `04`, `10` | Dados iniciais e massa de demonstração (**pule os dois em produção**) |
| `05`–`06` | Campos financeiros da O.S. e catálogo de serviços |
| `07`–`09` | Ajuste de recursão no RLS, comissões (legado) e correção da tabela de recomendações |
| `11` | **Normalização**: cria `funcionario`, `os_servico` e `os_peca`, substituindo a comissão em `usuario` e os campos JSON da O.S., com backfill |
| `12` | **Endurecimento de RLS**: impede o mecânico de reatribuir a O.S. e restringe a leitura de `funcionario`, que expunha comissão; cria a view `funcionario_publico` |
| `13` | **Endereço estruturado**: entidade `endereco` 1:1 com `cliente`, com preenchimento por CEP |
| `14` | **Security Advisor**: revoga `EXECUTE` de funções `SECURITY DEFINER` que a chave `anon` podia chamar por RPC para ler dados do negócio **sem login** |
| `15` | `item_estoque.custo` anulável (`NULL` = não informado, `0` = custo zero) |
| `16` | Fecha o que a `14` deixou aberto: três funções ainda com `EXECUTE` para `PUBLIC`, duas delas devolvendo nome, CPF/CNPJ e telefone de cliente a quem chamasse com a chave `anon` |
| `17` | `CHECK` de não-negatividade em `item_estoque.preco_unit`, em script próprio para que um dado ruim não aborte o hardening da `16` |
| `18` | Cadastro único da oficina e logotipo usado no documento da O.S. |
| `19` | Impede elevação de perfil por metadado de signup, restringe o custo ao gestor e endurece oficina e Storage |
| `20` | Corrige a leitura de cliente pelo mecânico e cria os vínculos de funcionário ausentes |
| `21` | Persiste tipo, valor e percentual do desconto e as observações finais |
| `22` | **Baixa automática transacional**: `finalizar_ordem_servico` valida saldo, grava movimentos imutáveis e conclui a O.S. sem duplicar baixa |
| `23` | Snapshot relacional de comissão (`os_comissao`) e RPCs transacionais de O.S. e de cliente |
| `24`–`25` | Remove os legados (JSON da O.S., comissão em `usuario`, endereço textual) após backfill e pós-condição |
| `26` | Enforcement pós-frontend: ledger *append-only*, guards de saldo e de finalização, bloqueio dos itens de O.S. encerrada |
| `27` | Reinstala o trigger do ledger e reconcilia movimentos pendentes |
| `28` | Reinstala os objetos que a `19` não aplicou no banco publicado e revoga escrita das views que ignoram RLS **nominalmente de `authenticated`** — `REVOKE ... FROM PUBLIC` não apaga concessão nominal |
| `29` | Recorta por perfil as colunas editáveis da O.S., congela o cabeçalho de O.S. encerrada, exige o RPC `cancelar_ordem_servico` com estorno idempotente, impede auto-reativação de usuário e reserva o ajuste absoluto de estoque ao gestor |

### Ordem de aplicação

> **Lote 20–27, em três fases:** aplique `20`–`23` (aditivas), publique frontend
> e backend, valide, e só então aplique `24`–`27` (remoção, enforcement e
> reparo). A separação evita que a tela antiga encontre as restrições novas.

> **Migração 29:** é restritiva e o cancelamento de O.S. passa a exigir o RPC
> `cancelar_ordem_servico`. Aplique a migração e publique o frontend em sequência
> coordenada — sem o RPC no banco, cancelar O.S. falha. O.S. canceladas **antes**
> dela, que ficaram com baixa de estoque sem estorno, exigem conciliação manual.

> **Nunca reexecute `01` nem `02` em banco já provisionado:** eles recriam o
> trigger de signup vulnerável e a policy de estoque que a `19` removeu. O mesmo
> vale para reaplicar `22` ou `27` **depois** da `28`: as duas recriam views
> revogando privilégio só de `PUBLIC` e `anon`, e o default do Supabase devolve
> escrita a `authenticated`.

---

## 2. Backend

```bash
cd backend
cp .env.example .env     # edite com suas credenciais
npm install
npm run dev
```

| Variável (`backend/.env`) | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave `service_role` — acesso total ao banco, **só no backend** |
| `SUPABASE_JWT_SECRET` | JWT Secret (Project Settings → API → JWT Settings) |
| `GEMINI_API_KEY` | Chave do Google Gemini, para o chatbot e o painel de IA |
| `PORT` | Porta da API (padrão: 3001) |
| `NODE_ENV` | `development` ou `production` |
| `FRONTEND_URL` | Origem do frontend, usada no CORS |

> `NODE_ENV=development` faz o `errorHandler` devolver stack trace ao cliente. O
> `.env.example` vem com `development` para o desenvolvimento local — **confira
> que o ambiente de produção está com `production`**. A Vercel define isso sozinha
> no runtime, então um valor `development` em produção significa que alguém o
> fixou no painel.

---

## 3. Frontend

```bash
cd react-app
cp .env.example .env     # edite com suas credenciais
npm install
npm run dev
```

| Variável (`react-app/.env`) | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave `anon` — pública por natureza, protegida por RLS |
| `VITE_API_URL` | URL do backend (padrão: `http://localhost:3001/api/v1`) |

Um `react-app/.env.local` tem precedência sobre o `.env` e é ignorado pelo git —
é o lugar certo para apontar o frontend a um banco local sem mexer na
configuração principal.

---

## 4. Executar

Em terminais separados:

```bash
# Terminal 1 — API
cd backend && npm run dev

# Terminal 2 — frontend
cd react-app && npm run dev
```

Acesse **http://localhost:5173**.

No servidor de desenvolvimento a tela de login mostra contas de demonstração que
preenchem o formulário com um clique. Elas **não existem em nenhum build**: ver
[Verificação do artefato](#verificação-do-artefato-de-build).

---

## Perfis de acesso

| Perfil | Alcance |
|---|---|
| **Gestor** | Tudo: O.S., clientes, veículos, serviços, estoque com custo, relatórios, painel de IA, funcionários, usuários e configuração da oficina |
| **Atendente** | Operação completa sobre O.S., clientes, veículos, serviços e estoque **sem a coluna de custo**; sem relatórios, IA, equipe ou configuração |
| **Mecânico** | Só as O.S. atribuídas a ele, e apenas `diagnostico`, `observacoes` e andamento; o histórico das próprias O.S. e a própria comissão |

A autorização é aplicada em três camadas independentes: as rotas do frontend
(`ProtectedRoute`), o middleware da API (`requireRole`, que relê perfil e
`ativo` da tabela, ignorando o que vem no token) e as policies de RLS no banco,
que são a camada que de fato decide.

| Tela | Perfis |
|---|---|
| `/` (Dashboard), `/clientes`, `/veiculos`, `/servicos`, `/estoque` | gestor, atendente |
| `/ordens-servico`, `/ordens-servico/:id`, `/historico` | gestor, atendente, mecânico |
| `/ordens-servico/nova`, `/ordens-servico/:id/encerrar` | gestor, atendente |
| `/relatorios`, `/analytics`, `/painel-ia`, `/funcionarios`, `/usuarios`, `/configuracao-oficina` | gestor |

---

## Endpoints da API (`/api/v1/`)

O backend expõe **apenas** o que não pode rodar no navegador, porque depende da
chave do Gemini ou da `service_role`:

| Recurso | Rotas | Limite de taxa |
|---|---|---|
| Auth | `POST /auth/login`, `/logout`, `/refresh`, `/forgot-password`; `POST /auth/usuarios` e `PATCH /auth/usuarios/:id` (gestor) | 5 tentativas / 10 min por IP no login |
| Chatbot | `POST /chatbot/mensagem`, `GET /chatbot/historico` | 10 req/min |
| IA | `POST /ia/analisar`, `GET /ia/recomendacoes` (gestor) | 10 req/min |
| Health | `GET /health` (fora do `/api/v1`) | — |

> **As antigas rotas de CRUD foram removidas** — clientes, veículos, ordens de
> serviço, estoque, movimentações, relatórios e usuários. Elas rodavam com a
> `service_role`, ignorando o RLS, e sem checagem de dono eram superfície de IDOR
> e de bypass das políticas. Todo o CRUD passa **direto pelo Supabase**, com a
> chave `anon` + RLS. Não crie rota nova de cadastro aqui.

---

## Stack

**Frontend:** React 19, Vite, React Router DOM 7, Lucide React, Recharts,
jsPDF 4 com jspdf-autotable 5, xlsx

**Backend:** Node.js, Express 5, Supabase JS (`service_role`),
`@google/generative-ai`, Helmet, `express-rate-limit`

**Banco:** Supabase (PostgreSQL 17) com Row Level Security em todas as tabelas

**IA:** Google Gemini — `gemini-flash-lite-latest`, com `gemini-3.1-flash-lite`
como contingência quando o primeiro falha por erro transitório. São duas camadas:
três tentativas com backoff, e depois a troca de modelo, tudo dentro de um
orçamento de 20 s. **Não existe resposta de contingência local:** se os dois
modelos falharem, a tela declara a indisponibilidade e nenhum número é estimado
— divergência deliberada das RN38/RN42, registrada em
[`docs/DER.md`](docs/DER.md).

**Testes:** Vitest + React Testing Library (frontend), Vitest + Supertest (API),
Playwright (E2E) e psql (suítes SQL)

**Deploy:** Vercel — frontend estático e backend como função serverless

---

## Testes

### Unitários, de componente e de integração

```bash
cd react-app && npx vitest run     # 382 testes
cd backend   && npx vitest run     # 394 testes
```

### E2E e suítes SQL

Precisam de um banco real. **Não use produção.** O Supabase efêmero sobe local,
com Docker:

```bash
# 1. copiar as migrações no formato que o CLI espera (pulando as de seed)
mkdir -p supabase/migrations && rm -f supabase/migrations/*.sql
for arquivo in database/[0-9][0-9]_*.sql; do
  base="$(basename "$arquivo")"
  case "$base" in 04_seed_data.sql|10_seed_demo.sql) continue ;; esac
  cp "$arquivo" "supabase/migrations/202610150000${base%%_*}_${base#*_}"
done

# 2. subir e migrar
npx supabase start
npx supabase db reset --local --no-seed
npx supabase status -o env          # pega as chaves locais

# 3. fixtures determinísticas
cd react-app
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=<anon local> \
SUPABASE_SERVICE_ROLE_KEY=<service local> \
  node e2e/setup-database.mjs

# 4. suítes SQL
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/rls_matrix_test.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/estoque_os_test.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/hardening_29_test.sql

# 5. E2E (aponte o frontend ao banco local por .env.local antes de rodar)
npx playwright test
```

Sem `psql` na máquina, rode as suítes dentro do container do banco:

```bash
docker cp database/tests/rls_matrix_test.sql supabase_db_sigauto-e2e:/tmp/rls.sql
docker exec supabase_db_sigauto-e2e psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f /tmp/rls.sql
```

Ao terminar: apague o `react-app/.env.local` (senão o desenvolvimento continua
apontando para o banco local), `npx supabase stop` e descarte
`supabase/migrations/`, que é gerado e está no `.gitignore`.

### Verificação do artefato de build

As contas de demonstração existem **apenas** no servidor de desenvolvimento. O
gate é a bandeira `__DEMO_LOGIN__`, definida em `react-app/vite.config.js` a
partir do comando (`serve`, em modo diferente de produção) — e **não** de
`import.meta.env.DEV`, que o Vite deriva de `NODE_ENV` e que portanto deixaria a
senha voltar ao bundle num build com `NODE_ENV=development`.

Como esconder segredo atrás de bandeira só vale se alguém conferir o resultado,
`react-app/scripts/verifica-bundle.mjs` roda como plugin do Vite em todo
`vite build`, sobre o diretório que o build acabou de escrever. Ele falha
fechado, inspeciona sourcemaps e arquivos pré-comprimidos, e nunca imprime o
trecho encontrado — só o caminho.

```bash
cd react-app && npm run build          # a verificação roda junto
cd react-app && npm run verifica:bundle # ou isolada, sobre dist/
```

---

## Qualidade

```bash
cd react-app && npm run lint
cd backend   && npm run lint
```

A CI roda, em três jobs: lint, build e testes do frontend; lint e testes do
backend; e os E2E mais as suítes SQL contra Supabase efêmero. Merge na `main`
dispara o deploy automático na Vercel.

---

## Segurança

O que o projeto garante, e foi verificado:

- A chave `anon` do bundle **não lê dado de negócio nenhum**: RLS está ligada em
  todas as tabelas e não existe policy para o papel `anon`.
- `SUPABASE_SERVICE_ROLE_KEY` e `GEMINI_API_KEY` existem só no backend; o
  frontend recusa ativamente uma chave `sb_secret_`.
- O perfil nunca vem do cliente: o middleware relê `perfil` e `ativo` da tabela
  `usuario` pelo `sub` do JWT validado, e rejeita conta inativa.
- O cadastro por signup nasce `mecanico` e **inativo**; promover é `UPDATE` de
  gestor, e o próprio usuário não consegue alterar o próprio perfil nem se
  reativar.
- O contexto enviado ao Gemini é recortado por perfil **antes** de o texto do
  usuário existir no prompt, então injeção de prompt não alcança dado que o
  perfil não pode ver. Nenhum CPF/CNPJ, telefone ou e-mail de cliente é enviado
  ao provedor de IA.
- As recomendações da IA têm **caráter exclusivamente consultivo**; os números
  exibidos vêm do motor determinístico, não do modelo.

Práticas ao contribuir:

- Tabela nova acessada pelo frontend **precisa** de policies de RLS.
- Função nova no banco precisa de `search_path` fixo e `EXECUTE` revogado de
  `anon`. A migração `29` instala uma allowlist que falha a transação se alguma
  `SECURITY DEFINER` ficar chamável por quem não devia.
- View que ignora RLS precisa de `REVOKE` **nominal** de `authenticated`.
- Nunca commite `.env`. Credencial de demonstração não entra em código.

---

*Desenvolvido como Trabalho de Conclusão de Curso (TFC) — UniRV 2026*
