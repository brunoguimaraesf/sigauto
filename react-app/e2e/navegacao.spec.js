import { test, expect } from '@playwright/test'

// Loga como gestor antes de cada teste de navegação.
async function login(page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /gestor@sigauto\.com/ }).click()
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click()
  await expect(page).toHaveURL('http://localhost:5173/')
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('navega até Clientes', async ({ page }) => {
  await page.getByRole('link', { name: 'Clientes', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Base de Clientes/ })).toBeVisible()
})

test('navega até Veículos', async ({ page }) => {
  await page.getByRole('link', { name: 'Veiculos', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Ve[íi]culos/ })).toBeVisible()
})

test('navega até Estoque', async ({ page }) => {
  await page.getByRole('link', { name: 'Estoque', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Controle de Estoque/ })).toBeVisible()
})

test('navega até Relatórios', async ({ page }) => {
  await page.getByRole('link', { name: 'Relatorios', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Relat/ })).toBeVisible()
})

test('abre o assistente (chatbot)', async ({ page }) => {
  await page.getByRole('button', { name: 'Abrir assistente' }).click()
  await expect(page.getByText(/Assistente SIGAuto/i)).toBeVisible()
})
