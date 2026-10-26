# Ensaio de desempenho — RNF-DS01 a RNF-DS05

**Execução local registrada em 22/10/2026.** O ensaio foi executado somente no Supabase efêmero Docker `sigauto-e2e`, em `http://127.0.0.1:54321`; nenhuma chamada foi enviada à produção ou ao Gemini. A ferramenta recusa outros destinos, salvo uma URL HTTPS de homologação autorizada explicitamente.

## Requisitos e critérios

| Requisito | Medição / verificação | Critério literal disponível |
|---|---|---|
| RNF-DS01 | Listagens de clientes, veículos e ordens de serviço, p50/p95/máximo e erros | Retorno em até 2 s em rede estável |
| RNF-DS02 | UPDATE de cliente sob RLS autenticado, p50/p95/máximo e erros | Gravação em até 3 s em condições normais de rede e carga |
| RNF-DS03 | Comparar os mesmos fluxos com 1 e 20 sessões virtuais simultâneas | Suportar até 20 usuários sem degradação perceptível; o requisito não define limite numérico para essa degradação |
| RNF-DS04 | Inspeção de requisições de dados por sessão, em navegador, ao navegar entre telas | Dados principais carregados uma vez e compartilhados; navegação não deve repetir consultas |
| RNF-DS05 | Caso separado do painel, verificando indicador visual durante espera | Latência acima de 3 s é permitida e deve haver indicador de carregamento |

Os limites de 2 s e 3 s vêm do texto da especificação. Para a análise comparativa de DS03, registrar a variação percentual de p95 de 1 para 20 sessões. Como a especificação não quantifica “degradação perceptível”, esse número deve ser apresentado como evidência para decisão do orientador, sem converter uma margem escolhida pela equipe em requisito oficial.

## Ferramenta reproduzível

Arquivo: [`react-app/scripts/medir-desempenho.mjs`](../react-app/scripts/medir-desempenho.mjs).

O script semeia 200 clientes e 200 veículos, autentica sessões virtuais com uma conta de gestor, mede as mesmas consultas de listagem executadas pelo `DataProvider` (incluindo as OS já presentes no ambiente) e atualiza clientes de fixture sob a chave anon/RLS. Não cria nem apaga OS: a migração 33 preserva as transições num ledger append-only. Os níveis são configuráveis e, por padrão, progridem por 1, 5, 10, 20 e 50 sessões; repetições, rampa, duração e limites de parada também podem ser definidos por variáveis de ambiente. Cada saída traz p50, p95, p99, máximo, RPS, erros, respostas 429, timeouts, recuperação e amostras pontuais do container PostgreSQL. Registre no resultado o número de OS já existentes; se a massa for pequena, a latência dessa consulta não representa uma tabela carregada.

Para executar contra o Supabase local, inicie o stack local e configure as variáveis na sessão PowerShell. Use conta gestor sintética/local e nunca imprima os valores das chaves:

```powershell
$env:VITE_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:VITE_SUPABASE_ANON_KEY = '<anon local>'
$env:SUPABASE_SERVICE_ROLE_KEY = '<service role local>'
$env:PERF_GESTOR_EMAIL = '<email do gestor local>'
$env:PERF_GESTOR_PASSWORD = '<senha do gestor local>'
node scripts/medir-desempenho.mjs
```

Rode o comando a partir de `react-app/`. Em homologação, além das mesmas credenciais isoladas, defina `PERF_ALLOWED_SUPABASE_URL` com a URL completa exata autorizada; o script também exige HTTPS. Não use a URL de produção. A chave service role é usada só para criar/remover fixtures e não participa das medições. As requisições medidas usam a chave anon e o JWT da conta de gestor. O script remove por UUID apenas os veículos e clientes criados na execução, em ordem de dependência, inclusive após erro capturado; não cria OS. Se o processo for encerrado à força, confira o UUID de execução no console e limpe manualmente somente as fixtures correspondentes antes de uma nova rodada.

O cenário mede um UPDATE simples de telefone de cliente para cada sessão, não o conjunto de gravações do sistema nem os RPCs compostos para salvar cliente/OS. As listagens de clientes e veículos incluem a massa sintética; OS usam a base existente e devem ser descritas junto dos resultados. Carga, hardware, rede, cache, versão do banco e de navegador devem acompanhar o resultado. Uma execução local/homologação caracteriza esses ambientes; não comprova por si só o desempenho de produção.

## Verificação de RNF-DS04

DS04 não é inferido das chamadas repetidas que o harness faz de propósito para formar amostras. Verifique separadamente com o navegador apontado ao mesmo ambiente e uma conta de ensaio:

1. Gere e sirva o build de produção (`npm run build` e
   `npm run preview -- --host 127.0.0.1 --port 4173`) com as variáveis apontando para
   o Supabase e backend isolados. Não use `npm run dev`: em desenvolvimento o
   `React.StrictMode` pode repetir efeitos e falsear a contagem inicial.
2. Abra DevTools → Network, marque `Disable cache`, deixe `Preserve log` desligado,
   limpe o log e autentique. Filtre `/rest/v1/` e registre as chamadas de `cliente`,
   `veiculo` e `ordem_servico` durante a carga inicial.
3. Sem recarregar, navegue por Dashboard, Clientes, Veículos, Ordens de Serviço e
   Histórico, volte às telas e registre quantas chamadas adicionais ocorreram para
   essas três tabelas. Não execute criação, edição, exclusão, busca remota ou o botão
   de recarga explícita.
4. O critério de aprovação desta arquitetura é **zero chamada adicional** dessas
   tabelas durante a navegação; os dados devem vir do `DataProvider`. Retry de rede
   comprovado não conta como nova consulta funcional, mas deve ser anotado.
5. Faça uma recarga completa e repita a contagem como uma segunda sessão. A nova
   carga inicial é esperada e deve ser registrada separadamente.
6. Use capturas da lista de requisições ou uma tabela com método, caminho, horário e
   status. HAR contém cabeçalhos e payloads: só o anexe depois de remover autorização,
   cookies, chaves, parâmetros e dados pessoais.

| Sessão | Registros presentes na carga cliente/veículo/OS | Chamadas extras ao navegar (sem retry/ação explícita) | Resultado DS04 | Evidência |
|---|---:|---:|---|---|
| 1 | 1 GET por tabela na carga inicial; volume não recontado nesta rodada | 0 cliente / 0 veículo / 0 OS em 7 navegações | **Aprovado localmente**; uma recarga completa iniciou nova sessão com 1 GET por tabela | [Relatório e captura](evidencias/RESULTADO_DS04_DS05_2026-10-26.md) |

## Verificação separada de RNF-DS05

Não faz parte do ensaio de carga. Para não consumir chamadas Gemini reais, o script não invoca chatbot nem PainelIA. Verifique o indicador visual com serviço de IA simulado ou ambiente de teste instrumentado: manter a requisição pendente por mais de 3 s, confirmar que o indicador aparece antes da resposta e registrar a latência e evidência visual. Qualquer medição com Gemini real deve ser identificada em separado, com quantidade de chamadas, modelo e horário, e não misturada ao benchmark de banco.

Procedimento manual reproduzível no Chrome/Edge, em ambiente isolado:

1. Abra o build de produção e autentique como gestor. Em DevTools → Network →
   Throttling, crie um perfil `DS05-4s` com **4000 ms de latência** e largura de banda
   alta, para isolar a espera sem transformar o teste em limite de download.
2. Ative o perfil, limpe o log, abra o Painel IA e filtre
   `/api/v1/ia/analisar`. Inicie gravação de tela ou prepare capturas com relógio visível.
3. Clique em `Analisar Dados`. Depois de três segundos, registre que o botão mostra
   `Analisando...` e que o painel mostra `Processando Análise`, antes da resposta.
4. Ao terminar, abra `Timing` da requisição e registre duração superior a 3000 ms,
   horário, ambiente e resultado. O critério DS05 é aprovado quando o indicador fica
   visível durante a espera e desaparece após sucesso ou erro, sem segundo envio.
5. Desative o throttling. Se a chamada usou Gemini real, registre uma chamada, modelo,
   data/hora e ambiente; se usou backend simulado, identifique claramente a simulação.
   Não publique chave, token, prompt com dados reais ou resposta contendo PII.

| Execução | Ambiente / simulação | Latência observada | Indicador durante a espera | Resultado DS05 |
|---|---|---:|---|---|
| 26/10/2026 | Build de produção; resposta sintética atrasada em 4.200 ms, sem Gemini | 5.072 ms | `Analisando...` e `Processando Análise` visíveis aos 3.200 ms; ausentes após a resposta | **Aprovado localmente** |

## Registro formal dos resultados

A auditoria progressiva adicional de 26/10/2026, com níveis de 1 a 50 sessões e
1.720 requisições medidas sem erros, 429 ou timeout, está registrada em
[`RELATORIO_AUDITORIA_SEGURANCA_PERFORMANCE.md`](RELATORIO_AUDITORIA_SEGURANCA_PERFORMANCE.md).
Ela complementa, sem substituir, a rodada formal abaixo.

Execução: **22/10/2026 13:38 BRT** (JSON UTC: `2026-10-22T16:38:30.152Z`); HEAD `1b42bac` com alterações locais não commitadas; Windows, Node `v24.19.0`; Supabase local efêmero Docker; perfil gestor sintético; 200 clientes e 200 veículos sintéticos, **6 OS existentes**. Trinta rodadas em concorrência 1 e 600 amostras por operação em concorrência 20. O teste não altera OS nem chama o Gemini. RTT, CPU/RAM do host e navegador não foram coletados; as métricas são tempo de ida e volta do PostgREST sobre loopback. Não extrapolar estes números para produção.

|---:|---|---:|---:|---:|---:|---:|---:|---|
| Concorrência | Operação | Amostras | p50 (ms) | p95 (ms) | Máximo (ms) | Erros | Limite RNF | Resultado |
|---:|---|---:|---:|---:|---:|---:|---:|---|
| 1 | Clientes (200) | 30 | 31,82 | 57,94 | 94,76 | 0 | 2.000 ms | Atende no ambiente local |
| 1 | Veículos (200) | 30 | 27,67 | 60,32 | 82,07 | 0 | 2.000 ms | Atende no ambiente local |
| 1 | OS (6 existentes) | 30 | 23,29 | 48,28 | 87,32 | 0 | 2.000 ms | Atende; base de OS pequena |
| 1 | Gravação: UPDATE cliente | 30 | 17,89 | 63,99 | 74,57 | 0 | 3.000 ms | Atende no ambiente local |
| 20 | Clientes (200) | 600 | 122,85 | 185,08 | 374,86 | 0 | 2.000 ms | Atende; p95 +219,4% vs. 1 sessão |
| 20 | Veículos (200) | 600 | 55,45 | 166,20 | 310,46 | 0 | 2.000 ms | Atende; p95 +175,5% vs. 1 sessão |
| 20 | OS (6 existentes) | 600 | 107,50 | 174,77 | 366,44 | 0 | 2.000 ms | Atende; p95 +261,9%, massa insuficiente |
| 20 | Gravação: UPDATE cliente | 600 | 19,13 | 58,25 | 93,04 | 0 | 3.000 ms | Atende; p95 -9,0% vs. 1 sessão |

| Operação | Aumento de p95 de 1 para 20 sessões | Observação |
|---|---:|---|
| Clientes | +219,4% | p95 permaneceu em 185,08 ms; sem limite quantitativo oficial para “perceptível” |
| Veículos | +175,5% | p95 permaneceu em 166,20 ms; sem limite quantitativo oficial para “perceptível” |
| Ordens de serviço | +261,9% | p95 permaneceu em 174,77 ms; apenas 6 OS disponíveis |
| Gravação | -9,0% | p95 de 58,25 ms; variação compatível com ruído de uma rodada local |

**Conclusão:** DS01 e DS02 atenderam aos limites numéricos nesta execução local; DS03 suportou 20 sessões sem erros e com p95 abaixo de 200 ms, embora a especificação não defina um teto quantitativo para degradação perceptível. A amostra de OS é pequena. Em 26/10/2026, DS04 foi aprovado com uma carga inicial por tabela e nenhuma consulta extra durante sete navegações SPA; DS05 foi aprovado com os dois indicadores visíveis após 3,2 s de espera controlada e removidos após a resposta. Estes resultados caracterizam somente o ambiente local e não comprovam produção.
