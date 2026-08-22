import { test, expect } from '@playwright/test'

// Fluxo crítico: o gestor autentica e chega ao Dashboard com os dados carregados.
test('gestor faz login e vê o Dashboard com dados', async ({ page }) => {
  await page.goto('/login')

  // Preenche o formulário pela conta de demonstração do gestor.
  await page.getByRole('button', { name: /gestor@sigauto\.com/ }).click()
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click()

  // Após o login, deve cair no Dashboard (rota raiz).
  await expect(page).toHaveURL('http://localhost:5173/')
  await expect(page.getByRole('heading', { name: 'Visão Geral' })).toBeVisible()

  // Os dados vêm do Supabase — o card de KPI deve aparecer.
  await expect(page.getByText('Veículos Cadastrados')).toBeVisible({ timeout: 15000 })
})

// Verifica que uma rota protegida redireciona para o login quando não autenticado.
test('rota protegida redireciona para o login sem sessão', async ({ page }) => {
  await page.goto('/clientes')
  await expect(page).toHaveURL(/\/login$/)
})
