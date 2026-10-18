import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{js,mjs,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      // __DEMO_LOGIN__ e injetada pelo vite.config.js (true so em `vite serve`).
      globals: { ...globals.browser, __DEMO_LOGIN__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Arquivos que rodam em contexto Node (configs, testes E2E)
    // Contexto Node: configs, E2E e os scripts de build (que leem o disco).
    files: ['*.config.js', 'e2e/**/*.{js,mjs}', 'playwright.config.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
