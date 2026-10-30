import { test, expect } from '@playwright/test'

// RN07 nos dois caminhos de cadastro de cliente (formulário principal e
// cadastro rápido da abertura de O.S.), com banco efêmero e dados fictícios.
// Além do aviso na tela, cada caso confere o resultado gravado: a lista de
// clientes é recarregada do banco e pesquisada pelo nome usado no teste.

const sufixo = () => String(Date.now()).slice(-8)

function digitoVerificador(nums, pesos) {
  const soma = nums.reduce((total, n, i) => total + n * pesos[i], 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

function cpfValido(base9) {
  const n = base9.split('').map(Number)
  const d1 = digitoVerificador(n, [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digitoVerificador([...n, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base9}${d1}${d2}`
}

function cnpjValido(base12) {
  const n = base12.split('').map(Number)
  const d1 = digitoVerificador(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digitoVerificador([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base12}${d1}${d2}`
}

// Troca o último dígito verificador por outro, tornando o documento inválido.
const comDvInvalido = (doc) => `${doc.slice(0, -1)}${(Number(doc.at(-1)) + 1) % 10}`

async function entrarComoGestor(page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /gestor@sigauto\.com/ }).click()
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click()
  await expect(page).toHaveURL(new URL('/', page.url()).href, { timeout: 15000 })
}

async function abrirCadastroRapido(page) {
  await page.getByRole('link', { name: 'Ordens de Serviço', exact: true }).click()
  await page.getByRole('button', { name: /Nova O\.S\./i }).click()
  await expect(page.getByRole('heading', { name: 'Abrir Nova O.S.' })).toBeVisible()
  await page.getByRole('button', { name: '+ Novo', exact: true }).first().click()
}

// Preenche e envia o cadastro rápido; devolve a mensagem do aviso, se houver.
async function enviarCadastroRapido(page, { nome, tipo, documento }) {
  await page.getByPlaceholder('Nome *').fill(nome)
  await page.getByLabel('Tipo de Pessoa').selectOption(tipo)
  await page.getByPlaceholder('CPF/CNPJ').fill(documento)
  const aviso = new Promise(resolve => page.once('dialog', async dialog => {
    const mensagem = dialog.message()
    await dialog.dismiss()
    resolve(mensagem)
  }))
  await page.getByRole('button', { name: 'Salvar cliente' }).click()
  return aviso
}

async function clientesGravadosComNome(page, nome) {
  // Espera a lista chegar do banco, para que uma contagem zero signifique
  // ausência do registro, e não lista ainda carregando.
  const carregou = page.waitForResponse(r => r.url().includes('/rest/v1/cliente') && r.ok(), { timeout: 15000 })
  await page.goto('/clientes')
  await carregou
  await expect(page.getByRole('heading', { name: 'Base de Clientes' })).toBeVisible({ timeout: 15000 })
  await page.getByPlaceholder(/Buscar clientes por nome/).fill(nome)
  return page.getByText(nome, { exact: true })
}

test.describe('cadastro rapido de cliente na abertura de O.S. (RN07)', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComoGestor(page)
  })

  const recusados = [
    ['CPF com digito verificador invalido', 'fisica', () => comDvInvalido(cpfValido(`3${sufixo()}`)), 'CPF inválido'],
    ['CPF com digitos repetidos', 'fisica', () => '11111111111', 'CPF inválido'],
    ['CPF ausente', 'fisica', () => '', 'Informe o CPF'],
    ['CNPJ com digito verificador invalido', 'juridica', () => comDvInvalido(cnpjValido(`3${sufixo()}001`)), 'CNPJ inválido'],
    ['CNPJ com digitos repetidos', 'juridica', () => '11111111111111', 'CNPJ inválido'],
    ['CNPJ ausente', 'juridica', () => '', 'Informe o CNPJ'],
  ]

  for (const [caso, tipo, gerarDocumento, aviso] of recusados) {
    test(`${caso}: recusado com aviso e sem gravacao`, async ({ page }) => {
      const nome = `Recusado E2E ${sufixo()} ${tipo}`
      await abrirCadastroRapido(page)
      const mensagem = await enviarCadastroRapido(page, { nome, tipo, documento: gerarDocumento() })
      expect(mensagem).toContain(aviso)
      await expect(page.getByPlaceholder('Nome *')).toHaveValue(nome)

      await expect(await clientesGravadosComNome(page, nome)).toHaveCount(0)
    })
  }

  for (const [tipo, gerarDocumento, rotulo] of [
    ['fisica', () => cpfValido(`4${sufixo()}`), 'CPF'],
    ['juridica', () => cnpjValido(`4${sufixo()}001`), 'CNPJ'],
  ]) {
    test(`${rotulo} valido e gravado e ${rotulo} repetido e recusado`, async ({ page }) => {
      const id = sufixo()
      const documento = gerarDocumento()
      const nome = `Aceito E2E ${id} ${rotulo}`

      await abrirCadastroRapido(page)
      await page.getByPlaceholder('Nome *').fill(nome)
      await page.getByLabel('Tipo de Pessoa').selectOption(tipo)
      await page.getByPlaceholder('CPF/CNPJ').fill(documento)
      await page.getByRole('button', { name: 'Salvar cliente' }).click()
      await expect(page.getByText(nome, { exact: true })).toBeVisible({ timeout: 15000 })

      // Segundo cadastro com o mesmo documento: recusado antes da gravação.
      const nomeRepetido = `Repetido E2E ${id} ${rotulo}`
      await abrirCadastroRapido(page)
      const mensagem = await enviarCadastroRapido(page, { nome: nomeRepetido, tipo, documento })
      expect(mensagem).toContain('já cadastrado')

      // Resultado no banco: o primeiro existe com o documento informado e o
      // segundo não foi gravado.
      const gravado = await clientesGravadosComNome(page, nome)
      await expect(gravado).toHaveCount(1)
      await expect(page.getByText(new RegExp(`${rotulo}: ${documento.slice(0, 2)}`)).first()).toBeVisible()
      await expect(await clientesGravadosComNome(page, nomeRepetido)).toHaveCount(0)
    })
  }
})

test.describe('falha de gravacao no cadastro de clientes', () => {
  test('mantem a janela e os dados apos falha e grava na nova tentativa', async ({ page }) => {
    await entrarComoGestor(page)
    const id = sufixo()
    const nome = `Retentativa E2E ${id}`
    const cpf = cpfValido(`5${id}`)

    await page.getByRole('link', { name: 'Clientes', exact: true }).click()
    await page.getByRole('button', { name: 'Novo Cliente' }).click()
    await page.getByPlaceholder('Ex: Ayrton Senna da Silva').fill(nome)
    await page.getByPlaceholder('123.456.789-00').fill(cpf)
    await page.getByPlaceholder('(11) 99876-5432').fill('(64) 90000-0000')

    // Falha controlada: a primeira chamada de gravação é interrompida.
    await page.route('**/rest/v1/rpc/salvar_cliente_com_endereco*', route => route.abort(), { times: 1 })
    const aviso = new Promise(resolve => page.once('dialog', async dialog => {
      const mensagem = dialog.message()
      await dialog.dismiss()
      resolve(mensagem)
    }))
    await page.getByRole('button', { name: 'Confirmar Cadastro' }).click()
    expect(await aviso).toContain('Os dados digitados foram mantidos')
    await expect(page.getByRole('heading', { name: 'Cadastrar Novo Proprietário' })).toBeVisible()
    await expect(page.getByPlaceholder('Ex: Ayrton Senna da Silva')).toHaveValue(nome)
    await expect(page.getByPlaceholder('123.456.789-00')).not.toHaveValue('')

    // Nova tentativa sem redigitar: grava e fecha a janela.
    await page.getByRole('button', { name: 'Confirmar Cadastro' }).click()
    await expect(page.getByRole('heading', { name: 'Cadastrar Novo Proprietário' })).toHaveCount(0, { timeout: 15000 })

    await expect(await clientesGravadosComNome(page, nome)).toHaveCount(1)
  })
})
