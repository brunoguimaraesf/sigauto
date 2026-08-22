import { test, expect } from '@playwright/test'

async function login(page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /gestor@sigauto\.com/ }).click()
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click()
  await expect(page).toHaveURL('http://localhost:5173/')
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('busca de clientes filtra a lista', async ({ page }) => {
  await page.getByRole('link', { name: 'Clientes', exact: true }).click()
  await expect(page.getByText('Carlos Eduardo Ferreira')).toBeVisible({ timeout: 15000 })

  const busca = page.getByPlaceholder(/Buscar clientes/i)
  await busca.fill('Carlos')
  await expect(page.getByText('Carlos Eduardo Ferreira')).toBeVisible()

  await busca.fill('zzz-nao-existe-xyz')
  await expect(page.getByText(/Nenhum cliente/i)).toBeVisible()
})

test('abre o modal de novo cliente', async ({ page }) => {
  await page.getByRole('link', { name: 'Clientes', exact: true }).click()
  await page.getByRole('button', { name: /Novo Cliente/i }).click()
  await expect(page.getByRole('heading', { name: /Cadastrar Novo Propriet/i })).toBeVisible()
})

test('fluxo de nova O.S. exige cliente antes do veículo', async ({ page }) => {
  await page.getByRole('link', { name: 'Ordens de Servico', exact: true }).click()
  await page.getByRole('button', { name: /Nova O\.S\./i }).click()

  await expect(page.getByRole('heading', { name: /Abrir Nova O\.S\./i })).toBeVisible()
  // O formulário de abertura carrega com sua orientação ao usuário.
  await expect(page.getByText(/registre a entrada/i)).toBeVisible()
  // O seletor de veículo começa desabilitado até escolher um cliente.
  const veiculoSelect = page.locator('select').filter({ hasText: 'Selecione um cliente primeiro' })
  await expect(veiculoSelect).toBeDisabled()
})
