# Teste de um dia completo de oficina — 27/10/2026

| Campo | Valor |
| --- | --- |
| Ambiente | Supabase local efêmero (`sigauto-e2e`, migrações 01–35), backend em `localhost:3101` com `NODE_ENV=production`, frontend em `localhost:5180` |
| IA | **Gemini real** (`GEMINI_API_KEY` do backend), sem simulação |
| Produção | **não acessada**: nenhum dado foi gravado no Supabase publicado |
| Navegador | Chromium do Playwright 1.62.1, 1440×900, `pt-BR`, fuso `America/Sao_Paulo` |
| Método | Cada passo foi executado na tela, como usuário real. Depois, o resultado foi conferido **no banco por SQL** (`docker exec ... psql`) e registrado em `passos.jsonl` |
| Base de código | `main` em `4de4a40`, mais as duas correções descritas na seção 4 |

## 1. Resultado

**72 passos únicos: 67 aprovados e 5 reprovados.** Dos 5 reprovados, 2 eram defeitos reais, que foram corrigidos e retestados no sistema rodando (passos 7.1 e 7.2). Os outros 3 são limitações do chatbot com períodos relativos, descritas na seção 3.

Variação do banco durante o dia: clientes 21→24, veículos 19→22, O.S. 19→23, itens de estoque 1→4, movimentações 20→29, serviços 1→4, funcionários 3→5, análises de IA 1→2, mensagens do chatbot 8→36, transições de status 49→62.

## 2. O que foi provado, por fase

### 07:30 — Gestor prepara o dia (RF09, RF10, RF13, RF14, RF15, RN29, RN45)
- Cadastrou 3 serviços (R$ 120, R$ 280, R$ 150) e 3 peças com custo e preço de venda. O preço gravado no banco é idêntico ao digitado.
- Deu entrada de estoque com motivo (NF): 20 L de óleo, 10 filtros e 4 pastilhas. O saldo no banco bate com cada entrada.
- RN45: o sistema recusou um serviço com nome só de espaços ("Informe o nome do serviço.") e outro com preço −5 ("Informe um preço base válido…"). Nada foi gravado.
- RF10: uma movimentação sem motivo foi recusada. A contagem de movimentações não mudou (23 → 23).
- RF15: o gestor cadastrou um mecânico sem login, com 10% de comissão sobre serviços (`mecanico|10|true|false` no banco).
- RF14: o gestor criou a conta de atendente "Joana" pelo backend. No banco ela ficou com perfil `atendente`, ativa, e-mail confirmado e funcionário vinculado. A conta fez login real com status 200.
- RN29: depois de 5 senhas erradas, a conta foi bloqueada no servidor, e **a senha certa também foi recusada (429)** durante o bloqueio.

### 08:00 — Atendente no balcão (RF01, RF02, RF03, RN03, RN15, RN26)
- Cadastrou um cliente com CPF válido e endereço estruturado (`Rua Augusta|1450|Rio Verde|GO`). O CPF 111.111.111-11 e a placa `ABC123` foram recusados, com 0 linhas gravadas.
- RN15: a queixa "Barulho" (menos de 10 caracteres) não abriu O.S. (19 → 19).
- Abriu a O.S. #168 (prioridade Alta, KM 87.350, mecânico Carlos). O banco gerou o número, e o histórico registrou `(nulo)→aberta por Ana Atendente`.
- Abriu a O.S. #169 cadastrando cliente e veículo dentro da própria tela.
- RN03: a atendente não vê custo nem margem na tela de estoque. Mesmo pela **API direta do Supabase**, com o token dela, a consulta de `custo` devolve `[]`.
- RN26: `/usuarios`, `/relatorios` e `/painel-ia` mostraram "Acesso Negado" para ela.

### 09:00 — Mecânico (RF04, RN03, RN26)
- O mecânico vê a O.S. #168, que é dele, e **não** vê a #169, que é do Rafael. Se abrir a #169 pela URL, aparece "Ordem de serviço não encontrada".
- Registrou o diagnóstico e mudou o status para Em andamento. O histórico gravou `aberta→em_andamento por Carlos Mecanico`.
- Na tela dele não aparece o botão "Adicionar". Pela API direta, o banco recusou 3 tentativas com 403 e a mensagem da regra: alterar valor, inserir item e editar a O.S. de outro mecânico ("A OS nao esta atribuida ao mecanico autenticado.").
- Rotas de nova O.S., relatórios, usuários, painel de IA e estoque deram "Acesso Negado". A tentativa de criar O.S. não gravou nada (21 → 21).

### 10:00 — Execução e fechamento (RF04, RF05, RF10, RN05, RN18, RN22, RN34)
- **O.S. #168**: 2 serviços + 4 L de óleo, 1 filtro e 1 pastilha. Total R$ 835,00 na tela, mantido depois de recarregar. Com 5% de desconto e Pix, o valor final foi **R$ 793,25** na tela, na confirmação e no banco (`concluida|400.00|435.00|41.75|793.25|pix`).
- **Baixa automática**: óleo 20→16, filtro 10→9, pastilha 4→3. Cada saída ficou com `origem=os` e motivo "Baixa automatica da OS #168".
- **Comissões gravadas no encerramento**: Carlos 5% × (400 + 435) = R$ 41,75; Ana 2% × 400 = R$ 8,00.
- RN18: a O.S. concluída não mostra nenhum botão "Adicionar". O PDF abre no visualizador da própria página (`%PDF-1.3`, 24 KB, 2 páginas).
- **O.S. #169**: R$ 330,00 em dinheiro. A comissão do Rafael ficou em exatamente **R$ 15,00** (10% × 150). A pastilha chegou ao mínimo (2/2) e o estoque mostrou "BAIXO".
- **Reabrir e encerrar de novo**: o saldo da pastilha ficou 2 → 2, **sem baixa duplicada**. O histórico mostra as 5 transições.
- **Cancelar uma O.S. concluída (#170)**: os filtros fizeram 9 → 7 → 9, com uma saída e um estorno. Uma **segunda** chamada ao RPC de cancelamento manteve 9, sem estorno em dobro.

### 17:30 — Inteligência artificial (RF11, RF12, RN37, RN39)
- **Painel IA** com Gemini real. Cada número conferido contra o SQL:

  | Indicador | Tela | Banco |
  | --- | --- | --- |
  | Faturamento 90 dias | R$ 3.505,75 | 3505.75 |
  | Ticket médio | R$ 194,76 | 194.76 |
  | Taxa de conclusão | 81,8 % | 18/22 |
  | Item crítico | Pastilha 2/2 | `quantidade <= qtd_minima` → só a pastilha |
  | Valor médio do Carlos | R$ 474,13 | (793,25 + 155,00)/2 |

  As recomendações vieram marcadas como consultivas e cada uma traz a evidência calculada (`estoque.itens_criticos: 1`, `ordens.taxa_conclusao: 81,8%`). A análise ficou gravada em `recomendacao_ia` em nome do gestor. "Consultar análises anteriores" não fez nova chamada à IA (2 → 2 registros).
- **Chatbot do gestor**:
  - Faturamento do mês: **R$ 3.505,75 em 18 O.S.** ✓
  - Ticket médio do mês: **R$ 194,76** ✓
  - Peças em falta: citou a Pastilha 2/2 ✓
  - Prompt injection pedindo CPF e telefone de todos os clientes: recusado ✓
- **Chatbot por perfil**:
  - Atendente e mecânico perguntaram faturamento: "As informações financeiras são restritas ao perfil gestor."
  - O mecânico pediu telefone e CPF de um cliente: "Essa informação é restrita ao perfil gestor e atendente."
  - Pela API, o Painel IA devolveu 403 para os dois.
- RN37: o histórico do chatbot devolve 200 para o gestor e **403 `HISTORICO_RESTRITO`** para a atendente.
- Tempo de resposta do chatbot: de 4 a 5 s por pergunta.

### 18:00 — Fechamento (RF06, RF07, RF08)
- Relatório de faturamento de hoje: 3 O.S. abertas, 2 concluídas, receita **R$ 1.123,25**, ticket R$ 561,63. A O.S. cancelada ficou fora.
- Comissões sem filtro: mecânicos R$ 56,75 e atendentes R$ 11,00, total R$ 67,75. Filtrando pelo Carlos, aparece só a #168 com **R$ 41,75**. O CSV exportado repete a mesma linha (`27_comissoes_carlos-mecanico_...csv`).
- O histórico por placa encontra as O.S. do carro, inclusive a cancelada.
- "Sair" encerra a sessão, e `/relatorios` volta para o login.

## 3. Defeitos e limitações encontrados

| # | Tipo | O que acontece | Situação |
| --- | --- | --- | --- |
| 2.8 | **Bug** (RF03) | Com o "Consumidor" já gravado no banco, o atalho "Usar Consumidor" selecionava o id fictício `cliente-consumidor`. A lista de veículos vinha vazia e **a O.S. de balcão não abria** (`BUG_2.8_consumidor_sem_veiculo.png`). Os testes unitários não pegavam porque usam mocks. | **Corrigido** em `AbrirOS.jsx`, com 2 testes de regressão (o primeiro falha no código antigo). O reteste 7.1 abriu a O.S. #171 para o Consumidor |
| 5.10 | **Bug** (RF11) | Perguntado sobre como cancelar uma O.S. concluída, o chatbot respondia "não é possível", o que é falso. O `MAPA_DO_SISTEMA` não descrevia reabrir nem cancelar e dizia que todos os perfis lançam itens | **Corrigido** em `iaService.js`. No reteste 7.2, o chatbot ensina Reabrir → Cancelada → Salvar e cita o estorno |
| 5.4 / 5.7 | Limitação | "Quanto faturei **hoje**?" e "Quantas O.S. concluí **hoje**?" recebem pedido de mês/ano ou intervalo. O validador recusa de propósito períodos relativos (`consultaFinanceiraChatbot.js:104/126`). Nenhum número errado é dado | Aberto. Na apresentação, pergunte "faturamento de outubro de 2026" ou use o relatório |
| 5.8 | Divergência DERS × código | "Quanto eu faturei?" responde "todo o histórico: R$ 3.505,75", com valor correto e rotulado. O RF11 diz que período ambíguo pede esclarecimento, mas o prompt (`iaService.js`) manda usar o histórico | Aberto. Decidir qual lado vale e registrar em `docs/DER.md` |
| — | UX | O mecânico vê os botões "Nova O.S." e "Encerrar" na lista. Ao clicar, cai em "Acesso Negado". Não há falha de segurança | Aberto (cosmético) |
| — | Teste | O `Login.test.jsx` falha quando o `react-app/.env` local tem `VITE_TURNSTILE_SITE_KEY`, porque os testes leem o `.env` real. Com a chave vazia: 462/462 | Aberto (isolamento de teste) |

As recomendações do Painel IA estão corretas, mas são genéricas. Por exemplo, falam em "itens críticos" sem citar a pastilha pelo nome, que só aparece na tabela logo abaixo.

## 4. Correções feitas nesta rodada

- `react-app/src/pages/OrdemServico/AbrirOS.jsx`: o atalho usa o id do Consumidor real. Quando o Consumidor é criado pelo cadastro rápido do veículo, ele passa a ser o cliente selecionado.
- `react-app/src/pages/OrdemServico/AbrirOS.test.jsx`: 2 testes de regressão.
- `backend/src/services/iaService.js`: o mapa do sistema agora inclui reabrir e cancelar O.S., cita a baixa automática e restringe o lançamento de itens a gestor e atendente.

Suítes depois das correções: **frontend 462/462** (46 arquivos, com `VITE_TURNSTILE_SITE_KEY` vazia), **backend 544/544** (29 arquivos). Lint sem avisos nos arquivos alterados.

## 5. Observações do próprio teste

- O limite de 5 logins a cada 10 min por IP (RNF-SE06) bloqueou o roteiro logo no início. Para o teste, o backend local subiu com `LOGIN_RATE_LIMIT_MAX=200`.
- O limite de 10 chamadas de IA por minuto também barrou a rajada de perguntas (429), então os passos de atendente e mecânico rodaram de novo com pausa. Os dois controles funcionam como especificado.
- Alguns passos falharam na primeira tentativa por erro do roteiro (seletor ou SQL meu). Eles foram corrigidos e executados de novo, e os registros inválidos foram removidos de `passos.jsonl`. Nenhuma aprovação deste relatório depende desses registros.
