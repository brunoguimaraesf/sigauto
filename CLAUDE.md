# CLAUDE.md — SIGAuto

Guia para agentes de IA trabalhando neste repositório. Complementa o [README.md](README.md).

## O que é

SIGAuto — Sistema Inteligente de Gestão de Oficinas Automotivas. TFC UniRV 2026 (Bruno Gabriel Guimarães Fernandes). Web app: OS, clientes, veículos, estoque, relatórios e um módulo de IA (Google Gemini) para recomendações e chatbot.

## Estrutura

- `react-app/` — Frontend React 19 + Vite (o cliente principal).
- `backend/` — API Express (ESM). Em grande parte **legada**: o frontend fala **direto com o Supabase**; a API cobre health, auth e rate-limit da IA. Não presuma que uma feature nova de OS passa pela API.
- `database/` — Scripts SQL numerados, aplicados **em ordem** no Supabase (01 → 11).

## Arquitetura (fatos não óbvios)

- **Dados no frontend:** tudo é carregado uma vez em [`react-app/src/hooks/useDatabase.js`](react-app/src/hooks/useDatabase.js) (`DataProvider` + `useDatabase()`), usando a chave **anon** do Supabase + **RLS**. Ao mexer em leitura/escrita de dados, é aqui, não no backend.
- **Itens da OS são relacionais:** `os_servico` e `os_peca` (não mais JSON). `useDatabase` carrega via JOIN e grava com `syncItensOS` (apaga e reinsere). O objeto de OS na aplicação ainda expõe `servicos_itens`/`pecas_itens` como arrays — não mude esse formato interno sem ajustar as telas que consomem.
- **Funcionário ≠ Usuário:** `usuario` é só acesso/login; `funcionario` é o colaborador (cargo + comissão), 1:1 opcional com usuario. OS referencia `funcionario` em `id_mecanico`/`id_atendente` e `usuario` em `id_usuario` (quem registrou). Resolver a equipe de uma OS: `resolveEquipe(os, funcionarios)` em [`react-app/src/utils/osFinance.js`](react-app/src/utils/osFinance.js).
- **RLS:** toda tabela tem RLS. Tabela nova acessada pelo frontend **precisa** de policies (ver `02_rls_policies.sql` e a seção de RLS no `11`).

## Convenções

- **Design system imutável:** tema escuro + laranja (`--neon-orange: #E8590C`), fonte Manrope, em `react-app/src/index.css`. Não altere cores/tipografia/layout global sem pedido explícito.
- **Idioma:** código, UI e mensagens de commit em **português**.
- **Commits:** não commite a cada alteração; agrupe em commits significativos e **só quando pedido**. **Sem marca de IA** (nada de "Co-Authored-By" ou "Generated with"). Trabalhe em branch, nunca direto na `main`.
- **Migrações de banco:** nunca reescreva scripts já aplicados; adicione um novo arquivo numerado. Migração deve ser transacional e idempotente, com backfill antes de qualquer `DROP` (padrão do `11_normalizacao_relacional.sql`: cria/backfilla primeiro, deixa o drop como "Fase 2" comentada).

## Testes

```bash
cd react-app && npx vitest run        # unit + componente
cd react-app && npx playwright test   # E2E
cd backend   && npx vitest run        # unit + integração da API
```

Rode antes de considerar uma mudança concluída. Ambiente: Windows (PowerShell + Git Bash).

## Deploy

Vercel (frontend e backend serverless). Merge na `main` dispara deploy automático. Variáveis de ambiente ficam no painel da Vercel; `.env` é gitignored.
