# Questionário SUS — SIGAuto

TFC UniRV 2026 · Bruno Gabriel Guimarães Fernandes · instrumento preparado em 20/10/2026

**Situação: pronto para aplicação; sem respostas ou resultados coletados neste documento.** Vincular à sessão do [roteiro UAT](ROTEIRO_UAT.md). Imprimir/entregar ao participante apenas as seções 1–3; cálculo e discussão ficam com o observador após a resposta.

## 1. Identificação e orientação ao participante

| Campo | Preencher |
|---|---|
| Código da sessão / participante | ____ / ____ |
| Data / versão ou deploy avaliado | ____ / ____ |
| Perfis utilizados e tarefas efetivamente realizadas | ____ |
| Experiência anterior com o SIGAuto | ____ |

Responda pensando no **SIGAuto que você acabou de utilizar**, considerando somente sua experiência nesta sessão. “Esse sistema” nas afirmações abaixo refere-se ao SIGAuto. Marque uma opção por linha, na ordem apresentada. Não existem respostas certas ou erradas; suas respostas avaliam o sistema. Responda individualmente, sem consultar respostas de outras pessoas ou discutir os problemas com o autor antes de terminar.

Escala: **1 = discordo totalmente; 2 = discordo; 3 = nem concordo nem discordo; 4 = concordo; 5 = concordo totalmente.** Não deixe nenhuma linha em branco. Se não conseguir formar uma opinião sobre um item, marque o ponto central 3, conforme a orientação do instrumento original; isso deve ser decisão do participante, nunca preenchimento automático do observador. Aplicação após o uso e antes da discussão segue [Brooke (1996), instrumento original e instruções](https://hci-studies.org/methods-and-measures/downloads/SUS_Brooke1996.pdf).

## 2. Escala de Usabilidade de Sistema — versão brasileira

Os dez enunciados seguem a Tabela 1 da adaptação brasileira de **Lourenço, Carmona e Lopes (2022)**, preservando ordem e polaridade. A redação foi mantida, inclusive “pesado” no item 8; não trocar palavras nem explicar sua interpretação durante a resposta. Fonte: [artigo e instrumento em português na Tabela 1](https://aquichan.unisabana.edu.co/index.php/aquichan/article/download/16497/7157?inline=1), DOI [10.5294/aqui.2022.22.2.8](https://doi.org/10.5294/aqui.2022.22.2.8). A [página da revista](https://aquichan.unisabana.edu.co/index.php/aquichan/article/view/16497) informa licenciamento Creative Commons; a reprodução atribui autoria e mantém os enunciados.

| Nº | Afirmação | 1 | 2 | 3 | 4 | 5 |
|---|---|:---:|:---:|:---:|:---:|:---:|
| 1 | Eu acho que gostaria de usar esse sistema frequentemente. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | Eu achei esse sistema desnecessariamente complexo. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | Eu achei esse sistema fácil de usar. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | Eu achei que precisaria de ajuda de uma pessoa técnica para ser capaz de usar esse sistema. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | Eu achei que as várias funções desse sistema foram bem integradas. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | Eu acho que o sistema apresenta muita inconsistência. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | Eu imagino que a maioria das pessoas pode aprender a usar esse sistema rapidamente. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 8 | Eu achei esse sistema muito pesado para usar. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 9 | Eu me senti muito seguro usando o sistema. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 10 | Eu precisei aprender muitas coisas antes que pudesse utilizar esse sistema. | ☐ | ☐ | ☐ | ☐ | ☐ |

## 3. Comentários após responder à escala — opcionais

Estas perguntas exploratórias não fazem parte do SUS e não entram no cálculo. Respondê-las somente depois de finalizar os dez itens.

1. Em qual tarefa você teve maior dificuldade? O que esperava encontrar? ____
2. Em qual momento precisou de ajuda e por quê? ____
3. Que mudança tornaria o sistema mais útil para uma oficina? ____
4. O que ficou pouco claro nas recomendações da IA ou em suas evidências? ____
5. Há alguma observação que os dez itens não permitiram registrar? ____

## 4. Procedimento do observador

Antes da aplicação, registre quais tarefas o participante realmente executou, o auxílio recebido e falhas do ambiente. Entregue os itens sem marcação prévia e sem exemplo preenchido. Leia a orientação sem sugerir notas. Se houver dúvida sobre uma tarefa, registre a dúvida e preserve a resposta espontânea.

Ao receber, confira que existem dez respostas e somente uma marca por linha. Solicite ao próprio participante a correção de omissão/dupla marca enquanto ele estiver disponível, sem escolher por ele. Se uma ficha continuar incompleta, registre-a como **incompleta, sem escore**, com o motivo; não impute média, zero ou 3. Vincule o código à execução UAT, sem nome pessoal na planilha pública. Guarde a ficha original em local autorizado.

## 5. Cálculo do escore

Para respostas `r1…r10` entre 1 e 5:

- Itens ímpares 1, 3, 5, 7 e 9: contribuição = `resposta − 1`.
- Itens pares 2, 4, 6, 8 e 10: contribuição = `5 − resposta`.
- Some as dez contribuições, cada uma entre 0 e 4, e multiplique por **2,5**.

```text
SUS = 2,5 × [(r1−1) + (5−r2) + (r3−1) + (5−r4) + (r5−1)
           + (5−r6) + (r7−1) + (5−r8) + (r9−1) + (5−r10)]
```

O resultado vai de **0 a 100 pontos** e **não é uma porcentagem**. Não usar a média bruta das respostas nem somar itens sem inverter os pares. A regra de pontuação segue a seção de cálculo de [Brooke (1996)](https://hci-studies.org/methods-and-measures/downloads/SUS_Brooke1996.pdf); consultar essa fonte para evitar a inversão textual ambígua dos itens pares na versão inglesa do artigo de adaptação.

**Exemplo didático, sem relação com resultado do SIGAuto:** respostas `4, 2, 4, 2, 4, 2, 4, 2, 4, 2` geram contribuições `3, 3, 3, 3, 3, 3, 3, 3, 3, 3`. Soma = 30; SUS = 30 × 2,5 = **75 pontos**. Não apresentar esse exemplo antes do preenchimento.

| Item | Resposta efetivamente coletada | Operação | Contribuição |
|---|---|---|---|
| 1 | ____ | r1 − 1 | ____ |
| 2 | ____ | 5 − r2 | ____ |
| 3 | ____ | r3 − 1 | ____ |
| 4 | ____ | 5 − r4 | ____ |
| 5 | ____ | r5 − 1 | ____ |
| 6 | ____ | 5 − r6 | ____ |
| 7 | ____ | r7 − 1 | ____ |
| 8 | ____ | 5 − r8 | ____ |
| 9 | ____ | r9 − 1 | ____ |
| 10 | ____ | 5 − r10 | ____ |
| Total | — | Soma das contribuições | ____ / 40 |
| Escore SUS | — | Soma × 2,5 | ____ / 100 |

Calculado por / data: ____ / ____. Conferido por / data: ____ / ____.

## 6. Relato e limites da aplicação

Registre o escore de cada ficha completa, número de participantes, tarefas/perfis usados, familiaridade, ajuda e incidentes. Havendo mais de uma ficha completa, a média é a soma dos escores individuais dividida pelo número de fichas completas; informe também mínimo/máximo e quantidade de fichas incompletas. Três perfis testados pelo mesmo orientador não geram três observações independentes. Reteste após correção deve indicar nova versão e vínculo com a primeira sessão.

O estudo brasileiro apresenta evidências de validade para sua adaptação, sem validar automaticamente este aplicativo ou esta amostra. Uma resposta do orientador descreve sua percepção nesta sessão; não estima a usabilidade de todos os profissionais de oficina. Não calcular confiabilidade da escala com uma ficha nem transformar a nota em taxa de tarefas concluídas. Analise dificuldades com as evidências UAT e perguntas opcionais, sem criar subescalas por item.

O DERS adota média SUS ≥ 70 como critério do projeto; confirmar seu uso e a composição da amostra **antes** da rodada. Esse limiar é uma decisão de aceite do projeto, não aprovação universal do SUS. Nenhum escore compensa falha crítica de acesso, cálculo ou integridade. O DERS também narra média 83,3 de uma avaliação anterior: não copie esse número para esta ficha nem apresente como resultado desta aplicação sem as evidências correspondentes.

| Registro do relatório | Preencher após coleta |
|---|---|
| Fichas completas / incompletas / participantes únicos | ____ / ____ / ____ |
| Escore individual ou média, quando aplicável | ____ |
| Mínimo / máximo, quando aplicável | ____ / ____ |
| Regra de aceite ratificada antes da coleta | ____ |
| Limitações observadas e ações propostas | ____ |
| Data / responsável pelo relatório | ____ / ____ |
