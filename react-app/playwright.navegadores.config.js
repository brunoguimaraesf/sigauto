import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config.js'

// Mesma suite E2E em Chromium, Firefox e WebKit, contra servidores isolados.
//
// Nunca reaproveita servidor: um `npm run dev` esquecido na 5173 pode estar
// apontando para o Supabase publicado, e a jornada E2E grava clientes e O.S.
// A porta vem de E2E_PORTA (padrao 5273) e o Vite sobe com o ambiente do
// processo, que tem prioridade sobre o .env. Exige VITE_SUPABASE_URL local.
//
//   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=... \
//   VITE_API_URL=http://localhost:3101/api/v1 \
//   npx playwright test -c playwright.navegadores.config.js --workers=1
const porta = Number(process.env.E2E_PORTA || 5273)
const urlBanco = process.env.VITE_SUPABASE_URL || ''

if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(urlBanco)) {
  throw new Error('playwright.navegadores: VITE_SUPABASE_URL precisa apontar para o Supabase local/efemero.')
}

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${porta}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    ...base.webServer,
    command: `npm run dev -- --port ${porta} --strictPort`,
    url: `http://localhost:${porta}`,
    reuseExistingServer: false,
  },
})
