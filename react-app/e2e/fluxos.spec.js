import { test, expect } from '@playwright/test'

async function login(page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /gestor@sigauto\.com/ }).click()
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click()
  await expect(page).toHaveURL(/\/$/)
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('busca de clientes filtra a lista', async ({ page }) => {
  await page.getByRole('link', { name: 'Clientes', exact: true }).click()
  const tabela = page.getByRole('table')
  const cliente = tabela.getByText('Carlos Eduardo Ferreira', { exact: true })
  await expect(cliente).toBeVisible({ timeout: 15000 })

  const busca = page.getByPlaceholder(/Buscar clientes/i)
  await busca.fill('Carlos')
  await expect(cliente).toBeVisible()

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

// RF05: o documento da O.S. pode ser salvo ou impresso em qualquer status.
// O conteudo do PDF e coberto em utils/osPdf.test.js; aqui so a disponibilidade
// das acoes na tela real, sem baixar arquivo.
for (const [status, rotulo] of [['aberta', 'aberta'], ['concluida', 'concluída']]) {
  test(`O.S. ${rotulo} oferece Visualizar PDF e Imprimir`, async ({ page }) => {
    await page.getByRole('link', { name: 'Ordens de Servico', exact: true }).click()
    await page.locator('select').filter({ hasText: 'Todos os status' }).selectOption(status)

    const ver = page.getByRole('button', { name: /^Ver$/ }).first()
    await expect(ver).toBeVisible({ timeout: 15000 })
    await ver.click()

    const visualizar = page.getByRole('button', { name: /Visualizar PDF/i })
    await expect(visualizar).toBeVisible()
    await expect(page.getByRole('button', { name: /Imprimir/i })).toBeVisible()

    // O documento abre num visualizador DENTRO da pagina: nova guia dependia de
    // pop-up, que o navegador do usuario bloqueava.
    await visualizar.click()
    const visualizador = page.getByRole('dialog', { name: /Documento da ordem de servi/i })
    await expect(visualizador).toBeVisible({ timeout: 15000 })
    await expect(visualizador.locator('iframe')).toHaveAttribute('src', /^blob:/)
    await expect(visualizador.getByRole('link', { name: /Baixar PDF/i })).toBeVisible()
    await visualizador.getByRole('button', { name: /Fechar visualizador/i }).click()
    await expect(visualizador).toBeHidden()
  })
}
