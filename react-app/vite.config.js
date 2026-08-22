import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Ambiente padrão node (rápido) para os testes de função pura.
    // Os testes de componente declaram jsdom via "// @vitest-environment jsdom".
    setupFiles: ['./src/test/setup.js'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
