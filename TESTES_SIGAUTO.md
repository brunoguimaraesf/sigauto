# Testes — SIGAuto

**Medição consolidada:** 18/10/2026  
**Base:** `1c9d978` na branch `feat/relatorio-filtro-funcionario-e-visualizador-pdf` + alterações locais ainda não commitadas

## Resultado

| Gate | Resultado | Estado |
| --- | --- | --- |
| Frontend — Vitest | **382/382** | **APROVADO** |
| Backend — Vitest | **394/394** | **APROVADO** |
| E2E — Playwright | **24/24** | **APROVADO** |
| SQL — Supabase efêmero | **3/3 scripts** | **APROVADO** |
| Migração 29 | aplicação inicial + reaplicação | **APROVADA LOCALMENTE** |
| ESLint frontend | 0 erros, 3 warnings preexistentes | **APROVADO COM AVISOS** |
| ESLint backend | limpo | **APROVADO** |
| Build frontend | concluído, incluindo verificação do bundle | **APROVADO** |
| `npm audit --omit=dev` backend | 0 vulnerabilidades | **APROVADO** |
| `npm audit --omit=dev` frontend | 1 alta em `xlsx`, sem correção pelo npm | **RISCO RESIDUAL** |

O resultado de 382/382 foi medido após as correções finais e não inclui testes
marcados como falha esperada (`it.fails`), pois não restam ocorrências desse tipo.

## Comandos

```bash
cd react-app && npx vitest run
cd backend && npx vitest run
cd react-app && npx playwright test
cd react-app && npm run lint && npm run build
cd backend && npm run lint
cd react-app && npm audit --omit=dev
cd backend && npm audit --omit=dev
```

Os testes SQL executados no Supabase efêmero são:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/rls_matrix_test.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/estoque_os_test.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/hardening_29_test.sql
```

## Cobertura funcional exercida

### Frontend

Os arquivos de teste cobrem, entre outros caminhos:

- carregamento, busca, filtros e formulários de clientes, veículos, funcionários,
  usuários, serviços, estoque, relatórios e O.S.;
- normalização de quantidade antes do cálculo e do RPC;
- rollback de estado otimista em falha de escrita;
- lançamento e remoção de serviços e peças da O.S.;
- payload do encerramento, desconto limitado ao total/100%, forma de pagamento e
  erros exibidos ao usuário;
- status legados normalizados;
- documento da O.S. e visualizador;
- cancelamento pelo RPC `cancelar_ordem_servico`;
- login de demonstração desligado no build e falha fechada sem Supabase;
- varredura do bundle, incluindo sourcemap e arquivos pré-comprimidos.

Os 382 testes de frontend passaram na execução agregada final.

### Backend

Os 394 testes aprovados exercem:

- autenticação, conta ausente/inativa, perfil relido do banco e `requireRole`
  fail-closed;
- CORS, Helmet, rate limit e respostas 401/403/404;
- paginação de IA e histórico do chatbot;
- pergunta ausente, vazia ou de tipo inválido;
- janela e truncagem do histórico do chatbot;
- falha de persistência após resposta do Gemini sem descartar a resposta já
  gerada;
- ocultação de mensagem interna em erro 5xx de produção e normalização de status;
- parsing de resposta JSON da IA, inclusive `null`, array, JSON malformado e
  texto com mais de um bloco delimitado por chaves;
- retry, modelo alternativo, classificação de erro e orçamento de tempo;
- recorte de dados e canários de PII por perfil;
- métricas determinísticas e recomendações explicáveis.

### E2E

Os 24 testes Playwright passaram contra o Supabase efêmero. A suíte cobre login,
navegação, fluxos existentes de O.S. e a jornada integrada de cadastro e operação.
O resultado é local; não é smoke test do deploy de produção.

### SQL

| Script | O que verifica |
| --- | --- |
| `rls_matrix_test.sql` | leitura de clientes, O.S., estoque, funcionários e comissões por gestor, mecânico e atendente |
| `estoque_os_test.sql` | baixa transacional, ledger, snapshot de comissão, imutabilidade, idempotência, reconclusão, falta de saldo e atomicidade |
| `hardening_29_test.sql` | A-05 a A-10, cancelamento com estorno único, campos protegidos, auto-reativação, ajuste de estoque, allowlist de `SECURITY DEFINER`, grants de views e índices |

A migração 29 foi aplicada e reaplicada no mesmo ambiente. A segunda execução
passou, evidenciando idempotência do script e de suas pós-condições no estado
testado.

## O que o resultado não prova

- Nenhuma porcentagem de cobertura de linhas, branches ou mutações foi medida.
- Os testes SQL medem o banco efêmero; não provam que a migração 29 esteja em
  produção.
- A matriz de RLS não substitui revisão de toda policy nova.
- Não há evidência registrada de corrida real entre duas finalizações ou duas
  baixas concorrentes do mesmo item; os testes de idempotência são sequenciais.
- Os 24 E2E não validam credenciais rotacionadas nem o `NODE_ENV` da Vercel.
- O audit do frontend continua reprovado pelo achado alto de `xlsx`, embora o
  projeto apenas exporte planilhas e não leia arquivo enviado pelo usuário.

## Gate antes do rollout

1. Manter frontend 382/382, backend 394/394, E2E 24/24 e SQL 3/3 após qualquer ajuste concorrente.
2. Aplicar a migração 29 antes do frontend que chama
   `cancelar_ordem_servico`.
3. Repetir os três testes SQL no banco de destino ou em clone fiel antes do
   tráfego.
4. Executar smoke tests de salvar, finalizar, reabrir e cancelar O.S.
5. Confirmar rotação das contas demo e `NODE_ENV` da Vercel separadamente.
