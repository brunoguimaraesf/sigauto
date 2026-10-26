# Coleção da API do SIGAuto

> Execução funcional local: [30/30 requisições e 91/91 assertions aprovadas em
> 26/10/2026](RESULTADO_POSTMAN_LOCAL_2026-10-26.md), mais a contraprova RN30 com
> e-mail inexistente (3/3 assertions). A pasta de segurança foi executada
> separadamente: 3/3 requisições e 16/16 assertions aprovadas.

Importe [SIGAuto.postman_collection.json](SIGAuto.postman_collection.json) no **Postman**, no formato Collection v2.1. A coleção contém **33 requisições para os 12 pares método/rota** do Express: sucesso, rejeições por autenticação/perfil, validação de entrada, paginação e entradas adversariais. Os exemplos de resposta são fictícios; não representam execução contra um servidor.

O frontend envia credenciais de login ao backend e estabelece a sessão do Supabase com os tokens retornados; os cadastros comuns continuam usando a chave `anon` e RLS. Esta coleção exercita as rotas do backend Express; não cria rotas de clientes, veículos, OS ou estoque. Não precisa de `service_role` nem da chave Gemini no Postman: essas credenciais ficam exclusivamente no backend.

## Preparação

1. Use backend e projeto Supabase de teste, com migrações aplicadas e contas ativas de gestor e de atendente/mecânico. Configure o backend conforme seu README e inicie com `npm run dev` em `backend/`.
2. Importe a coleção. `baseUrl` começa como `http://localhost:3001`, sem `/api/v1` nem barra final. `/health` fica fora do prefixo da API.
3. Preencha as variáveis necessárias na cópia local da coleção. Credenciais, JWTs, refresh token e ID começam vazios. Não exporte nem versione a coleção depois de preenchê-los. Use dados fictícios e e-mails controlados.
4. Não crie variáveis de ambiente com os mesmos nomes de `tokenGestor`, `refreshToken` ou `idUsuarioTeste`: elas sobreporiam os valores capturados pelos scripts na coleção.

| Variável | Uso |
|---|---|
| `baseUrl` | Origem do backend de teste |
| `habilitarEfeitos` | `nao` por padrão; `sim` libera sessão e operações com efeitos reais |
| `emailGestor`, `senhaGestor` | Login de gestor ativo de teste |
| `tokenGestor`, `refreshToken` | Capturados por login/renovação; podem ser preenchidos localmente para executar somente leituras |
| `tokenNaoGestor` | JWT válido de atendente ou mecânico ativo no mesmo projeto, obtido em sessão separada |
| `emailNovoUsuario`, `senhaNovoUsuario` | Conta fictícia nova; e-mail único e senha de pelo menos 8 caracteres |
| `idUsuarioTeste` | Capturado pelo cadastro; revisar antes da alteração |
| `emailRecuperacao` | Endereço controlado para o envio de recuperação |

## Execução e evidências

### Checklist da rodada completa

1. Confirme que o Supabase e o backend são de teste e que `GET {{baseUrl}}/health`
   não aponta para produção. Rode `node docs/api/validar-colecao.cjs` na raiz.
2. Importe a coleção, duplique-a com o nome `Execução AAAA-MM-DD` e preencha somente
   as variáveis da cópia. Não salve tokens ou senhas no arquivo versionado.
3. Com `habilitarEfeitos=nao`, execute a pasta **01** e confirme cinco requisições
   executadas, sem itens ignorados e com todas as assertions aprovadas.
4. Preencha `emailGestor` e `senhaGestor`, mude temporariamente
   `habilitarEfeitos=sim` e execute a pasta **02**. Confirme que `tokenGestor` e
   `refreshToken` foram capturados; depois volte imediatamente para `nao`.
5. Obtenha `tokenNaoGestor` fazendo um login separado com uma conta ativa de
   atendente ou mecânico do mesmo ambiente. Execute as pastas **03** e **04**.
6. Configure o Runner com **1 iteração**, intervalo de **6500 ms** e timeout de
   **30000 ms**. Se ocorrer `429`, aguarde a janela do rate limit e reinicie a
   rodada; não conte essa execução como aprovada.
7. Em ambiente descartável, preencha e-mail/senha fictícios inéditos, revise todas
   as variáveis e execute cada requisição da pasta **05 individualmente**, com
   `habilitarEfeitos=sim`. Execute `Logout` por último.
8. Para RN30, rode `Solicitar recuperação de senha` duas vezes: uma com conta
   controlada existente e outra inexistente. Os dois envelopes devem ser neutros e
   equivalentes, sem revelar cadastro.
9. Registre **33 requisições executadas**, sem `skipped`, e exporte o resumo do
   Runner. Antes de anexá-lo ao TCC, remova tokens, cookies, senhas, e-mails pessoais,
   payloads reais e cabeçalhos de autorização.
10. Volte `habilitarEfeitos` para `nao`, limpe as variáveis sensíveis da cópia local
    e remova as contas fictícias somente pelo ambiente administrativo de teste.

Comece pela pasta **01**, que verifica health e rejeições sem credenciais. Para verificar leituras e permissões, obtenha os JWTs das contas de teste. A pasta **02** realiza login/renovação do gestor com `habilitarEfeitos=sim`, capturando tokens. Volte para `nao` ao terminar essa preparação. Execute então **03** e **04**.

No Collection Runner, configure **uma iteração**, intervalo de **6500 ms** entre requisições e timeout de pelo menos **30000 ms**. IA e chatbot compartilham o limite de 10 requisições por minuto, inclusive nas negativas; a API permite 100 por minuto. Login tem limite próprio de 5 requisições por 10 minutos. Não repita a coleção rapidamente; `429` indica limite atingido e não satisfaz os códigos esperados. O limite do backend é distinto do bloqueio de 15 minutos no navegador previsto pela RN29, validado na suíte do frontend.

Execute a pasta **05 individualmente**, habilitando `habilitarEfeitos=sim` somente no ambiente dedicado:

- Cadastro cria conta Auth, usuário, funcionário e auditoria. Alteração inativa a conta capturada e o funcionário correspondente. Nunca use o ID do gestor em uso. Um cadastro repetido com o mesmo e-mail retorna `409`; isso não é sucesso do cenário `201`.
- Recuperação pode enviar e-mail. Para RN30, execute com um e-mail cadastrado controlado e outro não cadastrado, registrando os dois envelopes iguais. A requisição valida a mensagem neutra, mas um único envio não prova ambos os casos.
- Chatbot consome cota Gemini e tenta persistir a conversa. Análise consome cota e tenta persistir recomendações. Compare com as leituras depois da execução. `200` do chatbot pode ocorrer mesmo com falha de persistência; `id_analise: null` também exige registro de falha de persistência da análise. Falha externa da IA deve aparecer como falha do cenário de sucesso, sem aceitar indisponibilidade como resultado aprovado.
- Logout deve ser o último. Ele limpa os tokens locais; seu `200` isolado não comprova revogação imediata de um access token já emitido. Não há endpoint de exclusão de conta nesta API: a limpeza das contas fictícias deve ocorrer no ambiente dedicado, fora da coleção.

Os scripts anteriores à requisição usam `pm.execution.skipRequest()` quando faltam variáveis ou quando efeitos estão desabilitados. Use versão do Postman que ofereça essa API. **Requisição ignorada não é teste aprovado.** Para uma rodada completa, registre as 33 requisições executadas e as verificações aprovadas/falhas, sem contar ignoradas como cobertura. Não execute a coleção inteira com efeitos habilitados sem antes revisar os dados de cada operação.

Guarde como evidência: data, versão/commit, ambiente, perfil usado, requisição, código recebido, resultado das assertions e observações de persistência. Exporte o relatório do Runner sem credenciais, tokens, cookies, e-mails pessoais nem conteúdo real da oficina. Esta entrega cria os cenários; a aplicação real e o relatório da rodada ficam a cargo da execução em ambiente dedicado.

## Endpoints e contratos

Todos os sucessos retornam `erro: false`, exceto health. Erros retornam `erro: true`, `codigo` e `mensagem`. Campos adicionais de depuração dependem do ambiente e não são exigidos pelos testes.

| Método e rota | Acesso | Sucesso e verificações |
|---|---|---|
| `GET /health` | Público | `200`, `status: ok`, timestamp válido |
| `POST /api/v1/auth/login` | Público | `200`, `dados.token`, `refresh_token`, `usuario`; captura tokens |
| `POST /api/v1/auth/logout` | Sem middleware de autenticação | `200`, mensagem de logout; envia JWT do gestor nesta coleção |
| `POST /api/v1/auth/refresh` | Refresh token no corpo | `200`, novos tokens; atualiza variáveis |
| `POST /api/v1/auth/forgot-password` | Público | `200`, mesma mensagem neutra para e-mail existente/inexistente |
| `POST /api/v1/auth/usuarios` | Gestor | `201`, conta ativa com perfil solicitado; captura ID |
| `PATCH /api/v1/auth/usuarios/:id` | Gestor | `200`, `dados.usuario.ativo: false` no cenário de inativação |
| `POST /api/v1/chatbot/mensagem` | Usuário ativo | `200`, `dados.resposta` textual |
| `GET /api/v1/chatbot/historico` | Gestor ativo | `200`, array e `paginacao`; somente histórico do titular. Atendente/mecânico recebem `403 HISTORICO_RESTRITO`, pois registros antigos podem conter respostas financeiras de um perfil anterior. |
| `POST /api/v1/ia/analisar` | Gestor | `200`, análise, timestamp e ID anulável; sem métricas brutas do modelo |
| `GET /api/v1/ia/recomendacoes` | Gestor | `200`, array e `paginacao`; sem autoria nem métricas brutas do modelo |

As duas listagens usam `page`/`limit` e retornam `total`, `pagina`, `limite` e `totalPaginas`. A coleção verifica os valores solicitados e normalizados, o teto de itens e `Math.ceil(total / limite)`. O chatbot limita `limit` em 200 (padrão 50); recomendações limita em 50 (padrão 10). Ambas usam página 1 para entrada inválida. Os negativos cobrem `401 TOKEN_AUSENTE` nas seis operações protegidas e `403 SEM_PERMISSAO` nas quatro operações de gestor, além de campos ausentes e entradas inválidas.

## Validação local sem rede

Na raiz do repositório:

```powershell
node docs/api/validar-colecao.cjs
```

O validador usa apenas módulos nativos do Node: lê o JSON, verifica sua estrutura básica e os 12 endpoints contra as rotas locais, compila todos os scripts e executa assertions sobre os exemplos fictícios. Também confirma que HTTP/envelopes incorretos falham e que operações com efeitos são ignoradas com o bloqueio padrão. Ele não faz requisições, não valida disponibilidade do Supabase/Gemini e não substitui uma execução do Runner nem a validação completa pelo JSON Schema oficial.
