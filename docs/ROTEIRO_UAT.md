# Roteiro de testes de aceitação (UAT) — SIGAuto

TFC UniRV 2026 · Bruno Gabriel Guimarães Fernandes · versão do roteiro: 20/10/2026

**Situação: preparado para aplicação; execução e aceite ainda não registrados.** Este roteiro complementa o [plano de V&V](VALIDACAO_VERIFICACAO.md). Os campos vazios são preenchidos durante a sessão com o orientador. Testes automatizados aprovados não preenchem estes campos.

## 1. Objetivo e participantes

Verificar se os fluxos UC01–UC15 atendem às tarefas da oficina e registrar dificuldades de uso. O orientador executa as tarefas; o autor prepara o ambiente e observa. Se houver profissionais da oficina, cada participante recebe um identificador e sua própria ficha. Uma pessoa alternando entre três contas continua sendo **um participante**.

Reserve duas sessões de aproximadamente 60 minutos, com pausa entre elas. A duração é uma estimativa de organização, não um requisito de desempenho. Aplique o [questionário SUS](QUESTIONARIO_SUS.md) depois das tarefas e antes da discussão dos problemas.

Excluídos: emissão fiscal, módulo financeiro, folha de pagamento, aplicativo nativo e trilha de auditoria por operação. Relatório de faturamento e cálculo de comissão pertencem ao escopo existente. O orientador avalia a utilidade consultiva da IA; não se exige uma redação específica do modelo.

## 2. Identificação da sessão

| Campo | Preencher antes da execução |
|---|---|
| Código da sessão / participante | ____ / ____ |
| Data, início, fim e fuso horário | ____ |
| Orientador / observador | ____ / ____ |
| URL do frontend / URL do backend | ____ / ____ |
| Branch, commit e identificador do deploy | ____ |
| Projeto Supabase de homologação | ____ |
| Migrações e verificações realizadas no destino | ____ |
| Navegador, versão, sistema e resolução | ____ |
| Familiaridade com oficinas / com o SIGAuto | ____ / ____ |
| Autorização para registrar telas / áudio, se houver | ____ |

Não anexe senhas, tokens, cabeçalhos `Authorization`, chaves, dados reais de clientes ou gravações sem autorização. Registre evidências pelo código do participante. Defina com o orientador o local de armazenamento, quem terá acesso e a data de eliminação antes da sessão; esses campos ainda estão em aberto: ____.

## 3. Preparação do ambiente e massa de dados

O observador prepara uma base **dedicada de homologação**, sem dados reais, com as migrações 01–29 e o frontend/backend compatíveis. A numeração dos scripts, sozinha, não comprova a presença dos objetos: confira o relatório das três suítes SQL no destino. Não aplique migrações nem reinicialize produção para executar este roteiro.

Use uma base recém-preparada para cada rodada. Os nomes e valores abaixo são fixos; UUIDs e números sequenciais da OS são gerados pelo sistema e devem ser anotados. Se já houver registros da rodada anterior, restaure a homologação pelo procedimento administrativo do projeto; não compense saldos ou apague histórico pela interface para simular uma base limpa.

Defina **D** como a data local da sessão. Abra e encerre as OS no mesmo dia D e use o intervalo D–D nos relatórios. Se atravessar a meia-noite, reinicie a rodada ou documente um intervalo que contenha ambas as datas, refazendo os valores esperados. As únicas OS da base devem ser A e B, criadas no roteiro; outros registros invalidam os totais globais previstos.

| Identificador | Dados sintéticos e estado inicial |
|---|---|
| G | Usuário ativo gestor `uat.gestor@example.test`, já provisionado pelo responsável do ambiente. Senha entregue por canal separado. |
| A | Usuário ativo atendente `uat.atendente@example.test`, com funcionário ativo **UAT Atendente**, comissão de 5% somente sobre peças. |
| M1 | Usuário ativo mecânico `uat.mecanico1@example.test`, com funcionário ativo **UAT Mecânico 1**, comissão de 10% somente sobre serviços. |
| M2 | Usuário ativo mecânico `uat.mecanico2@example.test`, com funcionário ativo **UAT Mecânico 2**, comissão de 0%. |
| R | Caixa de teste controlada pelo observador para recuperação de senha; use o capturador de e-mail do ambiente ou uma caixa de homologação autorizada. Registre seu endereço separadamente. `example.test` não recebe mensagens públicas. |
| Cliente C | Será criado: **UAT Cliente**, pessoa física, CPF de teste `52998224725`, telefone sintético `64999990001`, e-mail opcional `uat.cliente@example.test`. CPF e telefone são entradas de homologação, sem atribuição a pessoa e sem chamadas/envios reais. |
| Veículo V | Será criado para C: placa `UAT1A23`, marca Fiat, modelo Uno, ano 2020. |
| Serviço S | Será criado: **UAT Revisão**, descrição **Revisão de homologação**, preço base R$ 100,00. |
| Peça P | Será criada: código `UAT-P01`, nome **UAT Filtro**, unidade UN, custo R$ 50,00, venda R$ 75,00, mínimo 2. Saldo inicial 0; preparar entrada de 10 UN com motivo **UAT saldo inicial**. |
| Oficina | Cadastro único **Oficina UAT**, CNPJ de teste `11222333000181`, telefone sintético `64999990002`, e-mail `uat.oficina@example.test`; CEP `75900000`, logradouro **Rua de Homologação**, nº 100, bairro **UAT**, cidade **Rio Verde**, UF GO. Preencher o endereço manualmente se a consulta de CEP não o completar. Usar os identificadores somente para validação em homologação, sem atribuí-los a empresa real nem realizar contato. Logotipo opcional, sem marca/dados de terceiros. |

As contas A, M1 e M2 e seus vínculos são pré-condições. Criar conta pela tela de Usuários também cria funcionário: ao preparar a base, edite o vínculo existente em Funcionários; não crie um segundo funcionário para o mesmo usuário.

Use perfis de navegador separados para G, A, M1 e M2. O observador confirma antes da sessão: login funciona, não há fixture com esses códigos, Supabase está acessível e a oficina está configurada para emitir PDF. Senhas devem ter pelo menos oito caracteres. Para IA, registre se existe conectividade real com o Gemini e qual cenário de falha será controlado no servidor de homologação.

## 4. Condução e critérios de registro

Entregue ao participante **a tarefa** de cada caso; mantenha os resultados esperados com o observador. Não indique o botão correto antes da primeira tentativa. Registre auxílio e tempo efetivamente observado, sem converter estimativas em metas de aprovação.

Para cada caso, marque: **NE** não executado; **AP** aprovado, todos os resultados conferidos; **RE** reprovado, resultado divergente; **BL** bloqueado por pré-condição/dependência; **NA** não aplicável, com justificativa. Um caso bloqueado não equivale a aprovado. Se uma parte falhar, registre o subpasso e não aprove o caso inteiro.

Ordem recomendada, respeitando dependências: **01 → 14 → 15 → 09 → 11 → 02 → 03 → 10 (cadastro) → 04 → 05 → 06 → 07 → 08 → 10 (inativação) → 12 → 13**. Faça o bloqueio de login de 15 minutos em um perfil de navegador separado, mantendo a página aberta enquanto as outras tarefas prosseguem.

## 5. Casos de aceitação

### UAT-01 — Autenticação e perfis · UC01 / RF08

**Perfis:** G, A, M1 e uma conta temporária inativada no UAT-14. **Regras:** RN03, RN10, RN27–RN30.

**Tarefa:** entrar no sistema, localizar as atividades do seu perfil, sair e solicitar recuperação de senha.

1. Acesse `/ordens-servico` sem sessão; entre com G, saia e repita com A e M1.
2. Com A e M1, tente navegar diretamente para `/relatorios`, `/painel-ia`, `/funcionarios` e `/usuarios`. Com M1, tente também `/estoque` e a rota de encerramento da OS A, depois que ela existir.
3. Em perfil de navegador separado, forneça credenciais sintéticas incorretas cinco vezes. Anote o horário da quinta falha, tente novamente e aguarde 15 minutos com a página montada; confira que os controles voltam a permitir tentativa. Não recarregue a página durante esta medição.
4. Abra “Esqueci minha senha” para R e para `uat.inexistente@example.test`; compare a mensagem final, sem exigir envio real para endereço inexistente. Não registre a caixa de e-mail na evidência pública.
5. Após UAT-14, tente utilizar a conta inativada; se ela mantinha sessão aberta, tente recarregar os dados e chamar uma funcionalidade autenticada.

**Esperado:** rota protegida exige sessão; M1 entra na área de OS; áreas exclusivas do gestor são recusadas a A/M1; mecânico não encerra OS nem acessa estoque. Credenciais incorretas produzem mensagem genérica. Na quinta falha a tela bloqueia novas tentativas por 15 minutos, sem enviar novo login; recuperação apresenta a mesma confirmação para ambos os endereços. Conta inativa não obtém dados nem usa a API. A validação de RLS/API exige evidência técnica do observador, além de menus ocultos.

**Limite conhecido a registrar:** `Login.jsx` guarda tentativas e prazo no estado do componente. Este caso mede o bloqueio na tela aberta; não comprova persistência após recarga ou entre abas. A limitação está registrada como divergência #12 no [DER](DER.md). Se o orientador entender RN29 como bloqueio persistente em todo o navegador, registre a lacuna para decisão, sem declarar esse comportamento atendido.

### UAT-02 — Cliente · UC02 / RF01

**Perfil:** A. **Regras:** RN05–RN07. **Pré-condição:** C ainda ausente.

**Tarefa:** cadastrar C, encontrá-lo pela busca e corrigir o nome para **UAT Cliente Revisado**.

1. Antes do cadastro válido, tente CPF `11111111111` e e-mail `sem-arroba`; cancele o e-mail inválido e use os dados de C.
2. Cadastre C, edite o nome, recarregue e pesquise o CPF. Tente cadastrar outro cliente com o mesmo CPF.
3. Depois dos casos de histórico e relatórios, inative um cliente auxiliar **UAT Cliente Inativo**, sem OS, e abra a seleção de cliente de uma nova OS.

**Esperado:** dados inválidos/CPF duplicado não gravam; nome revisado persiste; auxiliar inativo deixa de ser selecionável. C continua ativo durante a jornada, preservando a massa usada nos totais.

### UAT-03 — Veículo · UC03 / RF02

**Perfil:** A. **Regras:** RN01, RN05, RN11–RN13. **Pré-condição:** C ativo.

**Tarefa:** cadastrar V para C e localizá-lo pela placa.

1. Tente salvar sem cliente, com placa `XYZ`, com ano 1949 e com ano D.ano + 2; depois use os dados válidos de V.
2. Tente um segundo veículo com a mesma placa; confira o vínculo de V com C após recarregar.

**Esperado:** somente dados válidos são persistidos; placa duplicada é recusada; V pertence a C. O ano 2020 permanece válido; os limites são 1950 e ano corrente + 1.

### UAT-04 — Abertura da OS · UC04 / RF03

**Perfil:** A. **Regras:** RN02, RN09, RN14–RN16. **Pré-condições:** C, V e equipe ativos; S cadastrado no UAT-10.

**Tarefa:** abrir OS A para C/V, M1 como mecânico e A como atendente, com queixa **Ruído na suspensão dianteira**. Abra OS B para o mesmo C/V e M2, com queixa **Inspeção complementar de homologação**; mantenha B aberta e sem itens.

**Esperado:** veículo é filtrado pelo cliente; queixa com menos de dez caracteres é recusada antes de gravar; OS válidas começam “Aberta”, com autoria da conta A e números automáticos distintos. Anote número/UUID de A: ____; de B: ____. Não presumir que a sequência começa em 1 nem que não há lacunas.

### UAT-05 — Execução e restrições da OS · UC05 / RF04

**Perfis:** M1 e A. **Regras:** RN03, RN17, RN18, RN22. **Pré-condições:** OS A/B abertas.

**Tarefa:** M1 encontra A, registra diagnóstico **Verificação concluída em homologação** e muda para “Em andamento”. A adiciona uma unidade de S por R$ 100,00 e duas UN de P por R$ 75,00 cada.

**Esperado:** M1 visualiza A e não obtém detalhes de B, inclusive por URL direta; pode alterar o diagnóstico/status permitido, sem assumir autoria ou trocar equipe/valores. A salva os itens e, após recarregar, vê serviços R$ 100,00, peças R$ 150,00 e subtotal R$ 250,00. Incluir itens na OS aberta ainda não baixa P: saldo continua 10 UN. Concluída/cancelada bloqueia edição de itens/equipe/valores até reabertura confirmada, verificada após UAT-06.

### UAT-06 — Encerramento, baixa e documento · UC06 / RF05

**Perfil:** A; G para conferir comissão. **Regras:** RN18–RN22, RN33, RN34. **Pré-condições:** OS A em andamento, saldo P = 10 e oficina configurada.

1. Antes de encerrar, emita o PDF da OS aberta/em andamento. Feche o visualizador.
2. Aumente P na OS A para 11 UN; tente encerrar com pagamento Pix. Confira erro de saldo, status ainda não concluído, saldo 10 e ausência de saída parcial; restaure duas UN.
3. Tente encerrar sem pagamento. Depois selecione Pix, desconto percentual 10% e observação **UAT entrega conferida**; confira a prévia e confirme uma vez.
4. Recarregue, consulte histórico de estoque, emita o PDF concluído, baixe e abra o diálogo de impressão; cancele a impressão se não houver impressora.
5. Confirme que itens/equipe/valores estão bloqueados. Abra a confirmação de reabertura e **cancele**; mantenha A concluída para os próximos casos. Tentativa de repetição do encerramento não pode gerar outra baixa.

**Esperado:** falha de saldo não conclui nem grava baixa parcial; pagamento é obrigatório. Encerramento válido persiste serviços R$ 100,00 + peças R$ 150,00 − desconto R$ 25,00 = **R$ 225,00**, pagamento Pix, observação e data de conclusão. P cai uma única vez de 10 para **8 UN**; movimento automático relaciona a OS A e o responsável. Snapshot de comissão: M1 = 10% de R$ 100,00 = **R$ 10,00**; A = 5% de R$ 150,00 = **R$ 7,50**; total **R$ 17,50**, conforme bases dos funcionários, sem descontar o abatimento da OS dessas bases.

O PDF usa oficina, cliente revisado, placa, equipe, itens, desconto e total persistidos. Abre em visualizador na própria página; Baixar PDF e Imprimir usam esse documento. A impressão é conferida pela prévia/diálogo se não houver saída física. Não aprovar a impressão física sem executá-la.

### UAT-07 — Histórico · UC07 / RF06

**Perfis:** A e M1. **Regras:** RN23, RN24. **Pré-condição:** A concluída e B aberta em D.

**Tarefa:** localizar A pela OS/cliente/placa e consultar o intervalo D–D; comparar com intervalo que exclua D. Repita como M1.

**Esperado:** A concluída mantém diagnóstico, itens e total de R$ 225,00 consultáveis; filtro com os dois limites em D inclui A; período sem D a exclui. M1 não amplia seu conjunto autorizado de OS por meio da consulta de histórico. Registrar número, filtros e resultados; não pressupor visibilidade de B para M1.

### UAT-08 — Relatórios e exportação · UC08 / RF07

**Perfil:** G. **Regras:** RN25, RN26. **Pré-condições:** somente A concluída/B aberta; ambas abertas em D; S ainda ativo.

**Tarefa:** emitir Faturamento em D–D, exportar CSV, abrir o arquivo e comparar com a tela; aplicar o filtro de funcionário M1, emitir Comissões e depois remover o filtro de funcionário.

**Esperado:** sem filtro de funcionário: duas OS no período, uma concluída, receita **R$ 225,00** e ticket médio **R$ 225,00**. Com M1: apenas A; em Comissões filtrado por M1, apenas R$ 10,00. Ao remover o filtro: M1 R$ 10,00 e A R$ 7,50; total R$ 17,50. CSV reproduz linhas/valores/filtros do tipo selecionado; saldo na posição de estoque é 8 UN para P. Atendente/mecânico não acessam a página. Compare o faturamento pelo período de abertura da OS; o Painel IA usa encerramento para as métricas de conclusão, portanto não extrapole esse resultado para datas diferentes.

### UAT-09 — Cadastro de estoque · UC09 / RF09

**Perfis:** G e A. **Regras:** RN31, RN32, RN34–RN36. **Pré-condição:** P ausente.

**Tarefa:** G cadastra P; consulte o item como A. Registre entrada inicial de 10 UN antes do UAT-11.

**Esperado:** código duplicado é recusado; mínimo 0 é recusado; unidades disponíveis são UN, PC, LT, MT, KG e CX. Cadastro inicia saldo 0, com alerta; entrada inicial leva a 10, acima do mínimo. Para custo 50 e venda 75, margem sobre custo é **50,0%**. A vê o item e preço de venda; custo/margem restritos ao gestor não aparecem e não podem ser alterados por A. Não confundir falta de autorização para custo com estoque vazio.

### UAT-10 — Serviços e inativação · UC10 / RF13

**Perfil:** A. **Regras:** RN05, RN45, RN46. **Pré-condição:** cadastro de S antes do UAT-04; inativação depois do UAT-08.

**Tarefa:** tente cadastrar serviço sem nome/preço, depois cadastre S por R$ 100,00. Ao fim da jornada, cancele a primeira confirmação de remoção e confirme a segunda. Consulte OS A e a seleção de serviço de uma OS nova, sem salvar outra OS.

**Esperado:** nome/preço obrigatórios; cancelar a remoção mantém S; confirmar a remoção o inativa, retirando-o do catálogo ativo e da seleção para novas inclusões. OS A conserva a linha de serviço e os valores históricos. Recarregar não faz S reaparecer. O botão de remoção representa inativação, não exclusão física.

### UAT-11 — Movimentação manual · UC11 / RF10

**Perfis:** A para entrada/saída; G para ajuste absoluto. **Regras:** RN32–RN34. **Pré-condição:** entrada inicial realizada, saldo P = 10.

**Tarefa:** registrar entrada de 5 UN com motivo **UAT compra**; saída de 2 UN com motivo **UAT consumo manual**; tentar saída de 14 UN; como G, ajustar saldo para 10 com motivo **UAT contagem**.

**Esperado:** saldos sucessivos **15 → 13 → 13 (saída recusada) → 10 UN**; recusa não cria movimento nem saldo negativo. Histórico informa tipo, quantidade, motivo, data e autor; ajuste é saldo final 10, não entrada adicional de 10. Atendente não consegue ajuste absoluto autorizado, mesmo que a interface ainda ofereça a opção. Depois do UAT-06, o movimento da OS A reduz de 10 para 8 UN. Conferir também o alerta com um item auxiliar zerado ou no mínimo, preservando P e os totais da rodada.

### UAT-12 — Chatbot · UC12 / RF11

**Perfis:** G, A e M1. **Regras:** RN37–RN39, RN44.

**Tarefa:** perguntar **Como consultar o histórico de uma ordem de serviço?**; fechar e reabrir a janela do chatbot; depois trocar de conta e, com M1, perguntar sobre OS não atribuídas. Em homologação, o observador provoca indisponibilidade da rota de IA ou do provedor e repete a pergunta.

**Esperado:** resposta em português ou falha explícita; conversa persistida pertence ao usuário autenticado e não revela conversa de outro usuário. O observador confere a persistência pela API/histórico autorizado: a janela mantém a conversa da sessão em memória e não oferece carregamento do histórico após recarga. O chatbot não fornece dados operacionais fora do perfil. Na falha, informa indisponibilidade e permite continuar nos demais módulos; não apresenta resposta local como se viesse da IA. Bloquear uma rota no navegador verifica a apresentação da falha; **não comprova** o retry/troca de modelo no backend. Essa camada depende da evidência técnica automatizada ou de falha controlada no servidor.

**Divergência:** RN38 ainda pede orientações locais predefinidas; o código removeu essa resposta. Registre “comportamento implementado conferido, RN38 divergente” e submeta a ressalva ao orientador. Não marque conformidade integral com RN38. O limite de dez chamadas por minuto pode ser conferido pelo observador na coleção de API, evitando consumir chamadas reais do Gemini durante a tarefa de usabilidade.

### UAT-13 — Painel IA · UC13 / RF12

**Perfil:** G. **Regras:** RN08, RN26, RN40–RN44. **Pré-condição:** A concluída e B aberta; período exibido pelo painel contém D. A tela solicita a análise sem seletor de período; anote os limites devolvidos pelo backend.

**Tarefa:** solicitar análise, interpretar uma recomendação e suas evidências; consultar um registro do histórico. O observador provoca indisponibilidade e verifica que Clientes/OS continuam utilizáveis.

**Esperado:** indicadores e períodos têm origem identificável nos registros; quando a janela contém toda a rodada e nenhuma outra conclusão, há uma OS concluída com receita R$ 225,00. Evidências quantitativas são verificáveis, recomendações têm caráter consultivo e nenhuma altera OS/estoque automaticamente. A redação pode variar e recomendações sem evidência válida podem ser descartadas; não exigir quantidade fixa de cartões. Sem dados no período anterior, comparação não inventa variação percentual. Consulta de histórico não gera nova análise. Após esgotar tentativas/modelos, painel informa indisponibilidade sem fabricar análise/recomendação/números, conforme a **RN42 atual**. A/M1 são recusados.

Se o provedor estiver indisponível, aprove apenas o subcenário de falha que foi observado e marque o de sucesso como BL; não substitua a chamada real por uma resposta fabricada para completar o aceite.

### UAT-14 — Usuários · UC14 / RF14

**Perfil:** G. **Regras:** RN05, RN27, RN50.

**Tarefa:** criar **UAT Acesso Temporário**, perfil atendente, e-mail `uat.temporario@example.test`; primeiro tente senha de sete caracteres, depois use senha temporária com pelo menos oito, entregue separadamente. Tente duplicar o e-mail; edite o nome; inative a conta.

**Esperado:** senha curta/e-mail duplicado recusados; criação válida também vincula um funcionário; editar nome não permite mudar o e-mail. Inativação preserva cadastro, impede uso de dados/API e não inativa a conta G do observador. Confira a recusa no UAT-01. Não registre a senha nos anexos.

### UAT-15 — Funcionários e comissão · UC15 / RF15

**Perfil:** G. **Regras:** RN05, RN47–RN49.

**Tarefa:** conferir vínculos A/M1/M2 e ajustar as comissões para a massa da seção 3; criar **UAT Colaborador sem Login**, cargo mecânico e comissão 0%, sem usuário. Tente vincular a outro funcionário um usuário já associado. Ao final, inative somente o colaborador sem login.

**Esperado:** funcionário existe sem conta; seleção não oferece usuário já vinculado; percentuais armazenados ficam entre 0 e 100, com bases de serviços/peças identificadas. Comissão de A/M1 corresponde à massa; G pode consultar suas regras, sem exposição a terceiros não autorizados. Funcionário auxiliar inativo não é oferecido para nova equipe. Não inative M1/A antes de terminar as verificações históricas e de relatórios. Evidência de leitura restrita de comissão usa a matriz SQL/RLS, porque bloquear a tela de Funcionários não prova sozinho a autorização no banco.

## 6. Verificações complementares de maior risco

Execute depois de registrar os totais principais e aplicar o SUS; essas ações mudam a massa:

| Caso | Ação e resultado esperado |
|---|---|
| UAT-C01 · RF04/RF05, RN18/RN33/RN34 | Com G/A, reabra A com confirmação. Sem mudar itens, encerre novamente: saldo permanece 8, sem segunda baixa. Reabra A outra vez; na atualização selecione Cancelada e confirme ao salvar: status Cancelada, estorno das duas UN e saldo 10. Sem reabrir, a tela volta a bloquear alterações; recarregar não gera outro estorno. Repetição direta do RPC é verificação técnica das suítes SQL, não demonstrada pelo bloqueio visual. Registre os movimentos e PDF cancelado. |
| UAT-C02 · RF01/RF02, RN05 | Depois de consultar o histórico, inative V e C. Reabra a consulta de A por seu número e confira a preservação do registro histórico. Qualquer perda de identificação/ligação é incidente; não considerar ausência na lista ativa como prova de preservação. |
| UAT-C03 · RF05 | Em homologação alternativa sem configuração de oficina, tente emitir PDF: aviso impede geração. Restaure o cadastro por fluxo autorizado antes de encerrar a sessão. |

Não compare os relatórios posteriores ao cancelamento com os R$ 225,00 da seção principal: a massa mudou. Arquive a evidência anterior e identifique claramente o instante de cada extração.

## 7. Ficha de execução e incidentes

Copie esta linha para **cada** UAT-01–15 e C01–C03; acrescente subpassos se o resultado for parcial.

| Caso / subpasso | Participante / perfil | Início / fim | Estado NE/AP/RE/BL/NA | Resultado observado | Auxílio recebido | Evidência / incidente |
|---|---|---|---|---|---|---|
| ____ | ____ | ____ | ____ | ____ | ____ | ____ |

Nome sugerido de evidência: `<sessao>-<participante>-UAT-06-03.png`. Anexe CSV/PDF quando relevante e registre o número da OS. Não anexe exportação de rede completa contendo credenciais.

| Incidente | Caso / requisito | Passos e dados usados | Esperado / observado | Gravidade | Evidência | Responsável / ação / reteste |
|---|---|---|---|---|---|---|
| INC-____ | ____ | ____ | ____ / ____ | ____ | ____ | ____ |

Gravidade: **crítica** = acesso indevido, exposição de dados ou perda/corrupção; **alta** = impede fluxo principal, cálculo/estoque incorreto; **média** = tarefa possível com desvio; **baixa** = apresentação sem impedir tarefa. Em incidente crítico, interrompa o cenário afetado e preserve a evidência de homologação. Não use a sessão para explorar dados reais.

## 8. Aceite e encerramento

Proposta de critério para esta aplicação: todos os UC01–UC15 executados; sem incidente crítico/alto aberto; cálculos, baixa/rollback, inativação e restrições por perfil conferidos; ressalva RN38 decidida explicitamente. Caso bloqueado exige nova execução ou exclusão de escopo formalmente justificada. Esse critério pertence ao roteiro e deve ser ratificado pelo orientador antes da sessão: ____.

O SUS registra usabilidade percebida e não substitui aceite funcional. O DERS menciona limiar médio de 70 pontos; confirmar com o orientador sua aplicação nesta rodada e sua amostra antes da coleta. Uma única resposta do orientador não demonstra usabilidade da população de oficinas.

| Campo de fechamento | Preencher após execução |
|---|---|
| Casos AP / RE / BL / NA / NE | ____ / ____ / ____ / ____ / ____ |
| Incidentes abertos e ressalvas aceitas | ____ |
| Decisão | ☐ Aceito ☐ Aceito com ressalvas ☐ Não aceito |
| Justificativa e casos que exigem reteste | ____ |
| Código do SUS vinculado / data de resposta | ____ / ____ |
| Orientador / data / assinatura | ____ |
| Autor / data / assinatura | ____ |

## 9. Fontes consultadas, divergências e decisões pendentes

Base deste roteiro: [DERS original](Desenvolvimento_DERS_BrunoGabrielGuimaraes.docx), [requisitos gerados](REQUISITOS.md), [DER e divergências](DER.md), [V&V](VALIDACAO_VERIFICACAO.md); migração `29_hardening_os_usuario_estoque.sql`; `App.jsx`, `Login.jsx`, `Servicos.jsx`, `Usuarios.jsx`, `Funcionarios.jsx`, `Relatorios.jsx`, `Historico.jsx`, `PainelIA.jsx`, `OrdemServico/AbrirOS.jsx`, `OrdemServico/AtualizarOS.jsx`, `OrdemServico/EncerrarOS.jsx`, `Estoque/ListaEstoque.jsx`, `components/ui/Chatbot.jsx`, `hooks/useDatabase.js`, `utils/osFinance.js`, `backend/src/controllers/iaController.js` e `backend/src/services/metricasPainelIA.js`. Não se criou requisito novo nem se alterou o documento acadêmico.

**Divergências identificadas:** RN38 ainda prevê fallback local ausente; RN42 já foi corrigida no DERS, nos requisitos gerados e no V&V; RN29 tem limitação de persistência documentada no DER (#12); PDF abre na página, enquanto o DERS ainda descreve nova guia; cadastro de custo publicado pode divergir da nulidade versionada; rollout da 29 deve ser comprovado no destino. Consulte o DER para o histórico dessas questões.

**Risco identificado por leitura, sem execução UAT nesta entrega:** `useDatabase` consulta somente clientes/veículos ativos e `Historico.jsx` resolve nomes/placas por essas listas, usando `N/A` quando faltam. O UAT-C02 verifica se a inativação mantém também a identificação visível no histórico; não declarar esse resultado aprovado apenas porque a OS continua no banco.

**Pontos em aberto para decisão/evidência humana:** versão e ambiente que serão avaliados; datas e participantes; autorização e retenção das evidências; aprovação da ressalva RN38; interpretação da persistência do bloqueio RN29; aceite e limiar SUS da rodada. O capítulo de avaliação do DERS já narra três profissionais e média SUS 83,3: este roteiro não atesta esses resultados, não os transfere para a sessão com o orientador e não substitui a localização das fichas/evidências originais.
