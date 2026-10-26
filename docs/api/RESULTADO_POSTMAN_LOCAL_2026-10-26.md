# Resultado Postman CLI — 26/10/2026

## Escopo

- Postman CLI `1.77.0`.
- Commit base `4cfc18d`, com alterações locais ainda não commitadas.
- Backend Express isolado em `http://127.0.0.1:3102`.
- Supabase efêmero local em `http://127.0.0.1:54321`.
- Migração 34 presente; nenhuma requisição foi enviada ao banco de produção.
- Relato sanitizado: sem tokens, cookies, chaves, senhas ou e-mails pessoais.

## Resultado da coleção completa

| Medida | Resultado |
|---|---:|
| Iterações | 1/1 |
| Requisições | **30/30 executadas; 0 falhas** |
| Scripts de teste | 30/30; 0 falhas |
| Scripts anteriores | 19/19; 0 falhas |
| Assertions | **91/91; 0 falhas** |
| Duração total | 4 min 0,3 s |
| Tempo médio de resposta | 1.382 ms |
| Menor / maior resposta | 13 ms / 19 s |
| Dados recebidos | aproximadamente 11,91 KB |

Foram exercitados os 12 pares método/rota: health, estado de bloqueio, login,
renovação, recuperação, cadastro e inativação administrativa, chatbot, histórico,
análise e recomendações de IA e logout. Os cenários incluíram sucesso, ausência de
token, perfil insuficiente, entrada inválida e normalização de paginação.

As chamadas reais locais do chatbot e do Painel IA responderam `200`; levaram,
respectivamente, aproximadamente 19 s e 18,4 s. Usaram somente dados sintéticos do
Supabase efêmero. Esses tempos não são uma medição de DS05, pois o Postman não observa
o indicador visual do frontend.

## Contraprova RN30

A coleção completa executou a recuperação para uma conta controlada existente e
aprovou o envelope neutro. Em seguida, a mesma requisição foi executada isoladamente
com um endereço inexistente:

| Medida | Resultado |
|---|---:|
| Requisições | **1/1; 0 falhas** |
| Assertions | **3/3; 0 falhas** |
| HTTP | 200 |
| Duração | 183 ms |

Os dois casos retornaram o mesmo texto neutro previsto pela RN30, sem revelar se o
endereço estava cadastrado.

## Controles da execução

- Intervalo de 6.500 ms entre as 30 requisições para respeitar os rate limits.
- Timeout de 30.000 ms por requisição e 900.000 ms para a rodada.
- `--no-report-events`, sem login no Postman e sem publicação do resultado em nuvem.
- Conta fictícia criada pela coleção foi inativada pelo próprio cenário e removida
  do Auth e de `public.usuario` após a rodada; contagem final zero.
- Backend isolado encerrado e porta 3102 confirmada sem listener.

Duas passagens diagnósticas não entram na contagem: a primeira confirmou que variáveis
dinâmicas vazias no ambiente fazem requisições serem ignoradas; a segunda mostrou que
uma cópia temporária precisa preservar UTF-8 para não corromper a assertion da RN30.
O resultado aceito acima foi obtido depois dessas correções no runner temporário; a
coleção versionada não precisou ser alterada.
