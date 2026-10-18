// Bandeira unica do login de demonstracao.
//
// `__DEMO_LOGIN__` e injetada pelo vite.config.js. Ler a global direto quebra
// com ReferenceError em qualquer consumidor sem esse `define` (vitest.config
// proprio, Storybook, import em Node) — e como o AuthContext e importado pela
// raiz, seria tela branca em todas as rotas. Aqui a ausencia da bandeira vale
// DESABILITADO: falha fechada, sem derrubar o app.
export const DEMO_LOGIN_HABILITADO =
  typeof __DEMO_LOGIN__ !== 'undefined' && __DEMO_LOGIN__ === true
