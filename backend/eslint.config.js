import js from '@eslint/js'
import globals from 'globals'
import security from 'eslint-plugin-security'

// Análise estática do backend (Node + Express, ESM).
// - js.configs.recommended: erros comuns (variável não usada, código morto, etc.)
// - security.configs.recommended: padrões inseguros em Node (eval, regex
//   vulnerável a ReDoS, require dinâmico, acesso a objeto por chave dinâmica)
// - regras extras de qualidade/segurança listadas abaixo
export default [
  { ignores: ['coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  security.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$', caughtErrors: 'none' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Testes rodam no Vitest (describe/it/expect vêm por import, mas vi.mock
    // é hoisted); relaxa regras que só geram ruído em arquivos de teste.
    files: ['**/*.test.js'],
    rules: {
      'security/detect-non-literal-regexp': 'off',
      'security/detect-object-injection': 'off',
    },
  },
]
