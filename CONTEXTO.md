# CONTEXTO — estado de trabalho do SIGAuto

> Arquivo de transferência entre agentes (Claude ↔ Codex). Quem assume lê este
> arquivo **e o estado real do repositório**; o repositório vence quando os dois
> discordarem. Nunca sobrescreva alteração existente: continue a partir dela.

```
OWNER: claude
HANDOFF_AT: —
ATUALIZADO_EM: 2026-10-14
BRANCH: correcao/remove-fallback-ia-e-hardening
ULTIMO_COMMIT: e9182ac (+1 desta atualizacao)
```

## Regra de convivência

- Só o agente nomeado em `OWNER` edita arquivos. O outro lê.
- Quem assume troca `OWNER`, preenche `HANDOFF_AT` e só então escreve.
- Nenhum dos dois trabalha nos arquivos listados em **Arquivos em edição** sem
  ser o dono.
- A devolução acontece em **ponto seguro**: suítes verdes e árvore de trabalho
  commitada ou com stash nomeado. Nunca no meio de uma edição.

## Tarefa atual

Duas frentes, ambas **implementadas e verificadas, nenhuma commitada**:

1. **Documento da O.S. em PDF (RF05)** — o botão passou de "Salvar PDF"
   (download direto) para "Visualizar PDF", que abre o documento numa nova guia,
   no visualizador do navegador. Corrigido junto o erro `autoTable is not a
   function`.
2. **Hardening de segurança (migração 19)** — fecha os achados de duas
   auditorias: escalonamento para `gestor` no cadastro de conta, `custo` do
   estoque exposto (e apagável) por atendente, e leitura da configuração da
   oficina sem exigir usuário ativo.

## Alterações realizadas

### PDF da O.S.

| Arquivo | O que mudou |
|---|---|
| `react-app/src/utils/osPdf.js` | `import * as pluginAutoTable` + `desenharTabela()`, que resolve o plugin em três caminhos (função exportada → `doc.autoTable` → `applyPlugin`). O `default` do pacote CJS não chegava como função depois do bundle. Novo `abrirDocumentoOS(dados, windowImpl)`: mesmo PDF, blob URL em nova guia, revogada em 60 s, erro explícito se o pop-up for bloqueado. |
| `react-app/src/utils/exportPDF.js` | Mesmo interop no import dinâmico. |
| `react-app/src/components/ui/AcoesDocumentoOS.jsx` | Botão "Visualizar PDF" (ícone `FileText`) chamando `abrirDocumentoOS`. "Imprimir" inalterado. |
| `react-app/src/utils/osPdf.test.js`, `.../AtualizarOS.test.jsx`, `.../EncerrarOS.test.jsx` | Cobrem a nova guia e o caso de pop-up bloqueado. |

Verificado em Chrome real (Playwright headed): a guia abre com o visualizador,
blob `application/pdf` de ~17 KB começando em `%PDF-`, sem erro de console.

### Segurança — `database/19_hardening_signup_e_custo.sql` (novo)

1. `fn_handle_new_auth_user` grava sempre `perfil = 'mecanico'`; ignora
   `raw_user_meta_data->>'perfil'` e os e-mails fixos de demonstração.
   `ON CONFLICT` não toca mais em `perfil`.
2. View `item_estoque_publico` (sem `custo`, com `WHERE
   fn_perfil_usuario_atual() IS NOT NULL`), `REVOKE` de `anon`; leitura da
   **tabela** `item_estoque` restrita a gestor.
3. Trigger `trg_item_estoque_guard_custo` / `fn_guard_custo_gestor`: RLS não
   recorta coluna, e a policy de UPDATE do atendente permitia apagar `custo`.
4. `pol_configuracao_oficina_select_ativo` e `pol_logos_oficina_select_ativo`
   exigem usuário ativo. Nome novo de propósito: reaplicar a 18 reverteria.
5. Pós-condições que abortam a transação (trigger de cadastro, `anon` sem
   SELECT na view, policies de `item_estoque`, guard de custo, policy da
   oficina, views/matviews legíveis por `anon` com filtro de extensão).

Frontend que acompanha: `ListaEstoque.jsx` (fonte por perfil, esconde
Custo/Margem e omite `custo` do payload fora de gestor), `Sidebar.jsx` e
`AtualizarOS.jsx` (leem a view com fallback), `AuthContext.jsx`
(`carregarPerfil` agora devolve `null` em vez de `'gestor'` — era fail-open).
Docs: `docs/DER.md`, `CLAUDE.md`, `AGENTS.md`.

## Decisões

- **Não reescrever as migrações 15–18**: podem já estar aplicadas no Supabase.
  Tudo entrou na `19`; a próxima é a `20`.
- **Custo é dado de gestor.** Leitura pela view, escrita protegida por trigger.
- **Fail-closed na interface.** Perfil não resolvido não vale gestor.
- **Oráculo de `custo` por UPDATE fica como residual aceito** (atendente pode
  filtrar `?custo=gt.100` e inferir faixas sem ler o valor). Fechar exigiria
  `REVOKE SELECT(custo)`, que cegaria o gestor — mesma role `authenticated`.
- O PDF abre em nova guia em vez de baixar: o visualizador do navegador já tem
  salvar e imprimir.

## Testes

```bash
cd react-app && npx vitest run        # 184 passando (28 arquivos)
cd backend   && npx vitest run        # 104 passando (11 arquivos)
cd react-app && npx playwright test   # E2E — NÃO rodado nesta sessão
```

SQL da `19` validado por parser (`pglast`), **não executado em banco nenhum**.

## Próximos passos

1. Rodar a suíte E2E (`npx playwright test`), a única não exercitada.
2. **Ordem de deploy, obrigatória:** publicar o frontend que lê
   `item_estoque_publico` → validar → só então aplicar a `19` no Supabase.
   Invertido, a tela de estoque fica vazia para atendente.
3. Desabilitar o cadastro público no painel do Supabase
   (Authentication > Providers > Email). Nenhum SQL resolve isso.
4. Promover as contas de demonstração: elas não ganham mais perfil automático.
5. Avaliar uma migração `20` para os endurecimentos restantes (H1, H3–H7 do
   primeiro laudo, dentro das 16 e 18).
6. Abrir o PR: a branch `correcao/remove-fallback-ia-e-hardening` já está no
   remoto, com seis commits (IA sem fallback, oficina + PDF da O.S., migrações
   15–17, migração 19 + frontend, documentação, vigia de handoff).

## Vigia de handoff (`scripts/`)

Processo separado que mede o consumo e passa o trabalho ao Codex antes de o
limite estourar. Mora fora da sessão de propósito: quando a cota acaba, o turno
do agente é cortado no meio e não sobra turno para escrever o handoff.

| Arquivo | O que é |
|---|---|
| `scripts/watcher-handoff.mjs` | O vigia. `--relatorio` mostra o consumo, `--dry-run` não aciona nada, `--once` avalia uma vez |
| `scripts/watcher-handoff.config.json` | Janela, orçamento, limiares, pesos e comando do Codex |
| `scripts/iniciar-watcher.ps1` | Sobe em janela oculta (`-DryRun`, `-Parar`) |

Dois gatilhos: **orçamento** (soma ponderada dos tokens das respostas na janela
de 5 h passou de 80 %) e **parada** (turno em aberto sem registro novo por 12
min, com uso acima de 50 %). O segundo cobre a sessão que morre no meio do
turno. A medição soma **todos os projetos**, porque a cota é da conta.

O vigia não commita, não faz stash e não mexe no git: árvore suja vira aviso no
prompt do Codex. O único arquivo que ele escreve é este `CONTEXTO.md` (bloco de
estado e histórico) e os próprios logs. A devolução ao Claude acontece quando o
processo do Codex termina **e** o uso cai abaixo de `limiarRetorno`.

`orcamentoPonderado` (40 M) é estimativa e precisa de calibração: rode
`--relatorio` quando o limite de verdade bater e ajuste para o valor observado.

## Arquivos em edição (não tocar sem ser o dono)

- `database/19_hardening_signup_e_custo.sql`
- `react-app/src/utils/osPdf.js`, `react-app/src/utils/exportPDF.js`
- `react-app/src/components/ui/AcoesDocumentoOS.jsx`
- `react-app/src/pages/Estoque/ListaEstoque.jsx`
- `react-app/src/context/AuthContext.jsx`
- `react-app/src/components/Sidebar.jsx`
- `react-app/src/pages/OrdemServico/AtualizarOS.jsx`
- `docs/DER.md`, `CLAUDE.md`, `AGENTS.md`
- `scripts/watcher-handoff.mjs`, `scripts/watcher-handoff.config.json`, `scripts/iniciar-watcher.ps1`

## Histórico de transferências

Nenhuma até agora.
