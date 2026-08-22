import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Testes unitários (Vitest) ficam em src/. A pasta e2e/ é do Playwright.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
