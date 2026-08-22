import { test, expect } from '@playwright/test'

// Fluxo crítico: o gestor autentica e chega ao Dashboard com os dados carregados.
test('gestor faz login e vê o Dashboard com dados', async ({ page }) => {
  await page.goto('/login')

  await page.getByRole('button', { name: /gestor@sigauto\.com/ }).click()
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click()

  await expect(page).toHaveURL('http://localhost:5173/')
  await expect(page.getByRole('heading', { name: 'Visão Geral' })).toBeVisible()
  await expect(page.getByText('Veículos Cadastrados')).toBeVisible({ timeout: 15000 })
})

// Rota protegida sem sessão deve redirecionar para o login.
test('rota protegida redireciona para o login sem sessão', async ({ page }) => {
  await page.goto('/clientes')
  await expect(page).toHaveURL(/\/login$/)
})

// Credenciais inválidas devem exibir erro e manter na tela de login.
test('login com senha errada mostra erro', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('seu@email.com').fill('gestor@sigauto.com')
  await page.getByPlaceholder('••••••••').fill('senha-errada-123')
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click()

  await expect(page.getByText(/incorret|inválid|erro/i)).toBeVisible({ timeout: 10000 })
  await expect(page).toHaveURL(/\/login$/)
})
