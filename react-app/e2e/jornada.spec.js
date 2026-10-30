import { test, expect } from '@playwright/test'
import { randomInt } from 'node:crypto'

// Jornada ponta a ponta do atendimento (RF01 a RF07), com usuario real no
// navegador e banco efemero: cadastrar cliente e veiculo na abertura da O.S.,
// lancar servico e peca, conferir o total, recarregar e provar a persistencia,
// mudar o status, finalizar com desconto, gerar o documento e sair.

const sufixo = () => String(Date.now())
const placaUnica = () => {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return `${letras[randomInt(26)]}${letras[randomInt(26)]}${letras[randomInt(26)]}${randomInt(10)}${letras[randomInt(26)]}${String(randomInt(100)).padStart(2, '0')}`
}

// CPF valido gerado a partir de uma base unica por execucao. Isso permite
// repetir a suite no mesmo banco sem colidir com a unicidade do documento.
function cpfValido(base9) {
  const digitos = base9.split('').map(Number)
  const dv = (nums) => {
    const peso = nums.length + 1
    const soma = nums.reduce((total, n, i) => total + n * (peso - i), 0)
    const resto = (soma * 10) % 11
    return resto >= 10 ? 0 : resto
  }
  const d1 = dv(digitos)
  const d2 = dv([...digitos, d1])
  return `${base9}${d1}${d2}`
}

async function entrarComo(page, email, urlEsperada) {
  await page.goto('/login')
  await page.getByRole('button', { name: new RegExp(email.replace('.', '\\.')) }).click()
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click()
  const destino = urlEsperada instanceof RegExp
    ? urlEsperada
    : new URL(urlEsperada, page.url()).href
  await expect(page).toHaveURL(destino, { timeout: 15000 })
}

async function entrarComoGestor(page) {
  await entrarComo(page, 'gestor@sigauto.com', '/')
}

test.describe('jornada completa do atendimento', () => {
  test('cadastra cliente e veiculo, abre O.S., lanca itens, persiste, finaliza e encerra sessao', async ({ page }) => {
    test.slow()
    const id = sufixo()
    const nomeCliente = `Cliente E2E ${id}`
    const placa = placaUnica()
    const cpf = cpfValido(`7${id.slice(-8)}`)

    await entrarComoGestor(page)

    // 1. Abrir O.S. e cadastrar cliente pelo fluxo rapido da propria tela.
    await page.getByRole('link', { name: 'Ordens de Serviço', exact: true }).click()
    await page.getByRole('button', { name: /Nova O\.S\./i }).click()
    await expect(page.getByRole('heading', { name: 'Abrir Nova O.S.' })).toBeVisible()

    await page.getByRole('button', { name: '+ Novo', exact: true }).first().click()
    await page.getByPlaceholder('Nome *').fill(nomeCliente)
    await page.getByPlaceholder('(00) 00000-0000').fill('(64) 99111-2233')
    await page.getByPlaceholder('E-mail').fill(`e2e${id}@teste.local`)
    await page.getByPlaceholder('CPF/CNPJ').fill(cpf)
    await page.getByRole('button', { name: 'Salvar cliente' }).click()
    await expect(page.getByText(nomeCliente, { exact: true })).toBeVisible({ timeout: 15000 })

    // 2. Cadastrar o veiculo associado sem sair da abertura da O.S.
    await page.getByRole('button', { name: '+ Novo', exact: true }).nth(1).click()
    await page.getByPlaceholder('Placa *').fill(placa)
    await page.getByPlaceholder('Marca *').fill('Fiat')
    await page.getByPlaceholder('Modelo *').fill('Argo')
    await page.getByPlaceholder('Ano').fill('2024')
    await page.getByPlaceholder('Cor').fill('Prata')
    await page.getByPlaceholder('KM atual').fill('12000')
    await page.getByRole('button', { name: 'Salvar veículo' }).click()
    await expect(page.getByText(placa, { exact: true })).toBeVisible({ timeout: 15000 })

    await page.getByPlaceholder(/Descreva a queixa do cliente/i).fill('Barulho na suspensao dianteira ao passar em lombada.')
    await page.getByRole('button', { name: 'Confirmar Abertura' }).click()

    await expect(page.getByRole('heading', { name: 'O.S. Aberta com Sucesso' })).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(new RegExp(placa))).toBeVisible()
    await page.getByRole('button', { name: 'Ver O.S.' }).click()

    // 3. Abrir exatamente a O.S. criada, sem depender da ordem da tabela.
    const linhaOS = page.getByRole('row').filter({ hasText: placa })
    await expect(linhaOS).toHaveCount(1, { timeout: 15000 })
    await linhaOS.getByRole('button', { name: 'Ver', exact: true }).click()
    await expect(page.getByRole('heading', { name: /O\.S\. #/ })).toBeVisible()
    await expect(page.getByText(new RegExp(placa))).toBeVisible()

    // 4. Lancar um servico do catalogo.
    const secaoServicos = page.getByRole('heading', { name: 'Serviços', exact: true }).locator('..')
    const painelServicos = secaoServicos.locator('..')
    await secaoServicos.getByRole('button', { name: 'Adicionar', exact: true }).click()
    const modalServico = page.locator('.modal-content').filter({
      has: page.getByRole('heading', { name: 'Adicionar servicos', exact: true }),
    })
    const servico = modalServico.getByRole('row').filter({ hasText: 'Troca de oleo' })
    await expect(servico).toHaveCount(1)
    await servico.getByRole('button', { name: 'Adicionar', exact: true }).click()
    await modalServico.getByRole('button', { name: 'Salvar selecionados' }).click()
    await expect(modalServico).toBeHidden({ timeout: 15000 })
    await expect(painelServicos.getByRole('row').filter({ hasText: 'Troca de oleo' })).toBeVisible()

    // 5. Lancar uma peca do estoque.
    const secaoPecas = page.getByRole('heading', { name: 'Produtos e peças', exact: true }).locator('..')
    const painelPecas = secaoPecas.locator('..')
    await secaoPecas.getByRole('button', { name: 'Adicionar', exact: true }).click()
    const modalPeca = page.locator('.modal-content').filter({
      has: page.getByRole('heading', { name: 'Adicionar produtos/pecas', exact: true }),
    })
    const peca = modalPeca.getByRole('row').filter({ hasText: 'Filtro de Oleo' })
    await expect(peca).toHaveCount(1)
    await peca.getByRole('button', { name: 'Adicionar', exact: true }).click()
    await modalPeca.getByRole('button', { name: 'Salvar selecionados' }).click()
    await expect(modalPeca).toBeHidden({ timeout: 15000 })
    await expect(painelPecas.getByRole('row').filter({ hasText: 'Filtro de Oleo' })).toBeVisible()

    const resumoTotal = page.getByText('Total', { exact: true }).first().locator('..')
    await expect(resumoTotal).toContainText('R$ 165,00')

    // 6. Alterar o status e persistir os dados tecnicos.
    const botaoSalvar = page.getByRole('button', { name: 'Salvar alterações' })
    const formTecnico = page.locator('form').filter({ has: botaoSalvar })
    const seletorStatus = formTecnico.getByText('Status', { exact: true }).locator('..').getByRole('combobox')
    await seletorStatus.selectOption('em_andamento')
    await botaoSalvar.click()
    await expect(formTecnico.getByText('Salvo', { exact: true })).toBeVisible({ timeout: 15000 })

    // 7. Recarregar prova que itens, total e status vieram novamente do banco.
    await page.reload()
    await expect(page.getByText(new RegExp(placa))).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('row').filter({ hasText: 'Troca de oleo' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Filtro de Oleo' })).toBeVisible()
    await expect(page.getByText('Total', { exact: true }).first().locator('..')).toContainText('R$ 165,00')
    await expect(page.locator('form').filter({ has: page.getByRole('button', { name: 'Salvar alterações' }) })
      .getByText('Status', { exact: true }).locator('..').getByRole('combobox')).toHaveValue('em_andamento')

    // 8. Finalizar com 10% de desconto e conferir o valor calculado.
    await page.getByRole('button', { name: 'Finalizar O.S.' }).click()
    await expect(page.getByRole('heading', { name: /Finalizar O\.S\. #/ })).toBeVisible()
    const botaoFinalizar = page.getByRole('button', { name: 'Finalizar O.S.' })
    const formFechamento = page.locator('form').filter({ has: botaoFinalizar })
    await formFechamento.getByText('Desconto', { exact: true }).locator('..').getByRole('spinbutton').fill('10')
    await formFechamento.getByText(/Forma de pagamento/).locator('..').getByRole('combobox').selectOption('pix')
    await page.getByPlaceholder('Garantia, recomendações ao cliente...').fill('Garantia E2E de 90 dias.')
    await expect(formFechamento.getByText('Valor final', { exact: true }).locator('..')).toContainText('R$ 148,50')
    await botaoFinalizar.click()
    await expect(page.getByText(/Confirmar finalização com/)).toContainText('R$ 148,50')
    await page.getByRole('button', { name: 'Confirmar finalização' }).click()
    await expect(page.getByRole('heading', { name: 'O.S. Finalizada' })).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Desconto aplicado: R$ 16,50')).toBeVisible()

    // 9. O documento abre no visualizador da propria pagina.
    await page.getByRole('button', { name: 'Visualizar PDF' }).click()
    const visualizador = page.getByRole('dialog', { name: /Documento da ordem de servi/i })
    await expect(visualizador).toBeVisible({ timeout: 20000 })
    await expect(visualizador.locator('iframe')).toHaveAttribute('src', /^blob:/)
    await visualizador.getByRole('button', { name: 'Fechar visualizador' }).click()
    await expect(visualizador).toBeHidden()

    // 10. Logout e obrigatorio: a ausencia do botao deve falhar o teste.
    await page.getByRole('button', { name: 'Sair', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/, { timeout: 15000 })
  })
})

test.describe('caminhos alternativos e dados invalidos', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComoGestor(page)
  })

  test('cliente com CPF invalido nao e cadastrado', async ({ page }) => {
    await page.getByRole('link', { name: 'Clientes', exact: true }).click()
    await page.getByRole('button', { name: 'Novo Cliente' }).click()

    await page.getByPlaceholder('Ex: Ayrton Senna da Silva').fill('Cliente CPF Invalido')
    await page.getByPlaceholder('123.456.789-00').fill('111.111.111-11')
    await page.getByPlaceholder('Ex: senna@mclaren.com').fill('cpf-invalido@teste.local')
    await page.getByPlaceholder('(11) 99876-5432').fill('(64) 90000-0000')

    const mensagemAviso = new Promise(resolve => page.once('dialog', async dialog => {
      const mensagem = dialog.message()
      await dialog.dismiss()
      resolve(mensagem)
    }))
    const [, mensagem] = await Promise.all([
      page.getByRole('button', { name: 'Confirmar Cadastro' }).click(),
      mensagemAviso,
    ])
    expect(mensagem).toContain('CPF inválido')
    await expect(page.getByRole('heading', { name: 'Cadastrar Novo Proprietário' })).toBeVisible()
  })

  test('veiculo com placa invalida e recusado', async ({ page }) => {
    await page.getByRole('link', { name: 'Veículos', exact: true }).click()
    await page.getByRole('button', { name: 'Novo Veículo' }).click()

    const modal = page.locator('.modal-content').filter({
      has: page.getByRole('heading', { name: 'Cadastrar Novo Veículo' }),
    })
    await modal.getByLabel('Proprietário *').selectOption({ index: 1 })
    await modal.getByLabel('Placa do veículo *').fill('ABC123')
    await modal.getByLabel('Marca *').fill('Fiat')
    await modal.getByLabel('Modelo *').fill('Argo')
    await modal.getByLabel('Ano *').fill('2024')
    await modal.getByLabel('Cor *').fill('Prata')

    const mensagemAviso = new Promise(resolve => page.once('dialog', async dialog => {
      const mensagem = dialog.message()
      await dialog.dismiss()
      resolve(mensagem)
    }))
    const [, mensagem] = await Promise.all([
      modal.getByRole('button', { name: 'Cadastrar Veículo' }).click(),
      mensagemAviso,
    ])
    expect(mensagem).toContain('Placa inválida')
    await expect(page.getByRole('heading', { name: 'Cadastrar Novo Veículo' })).toBeVisible()
  })

  test('busca sem resultado mostra estado vazio, e nao erro', async ({ page }) => {
    await page.getByRole('link', { name: 'Ordens de Serviço', exact: true }).click()
    await page.getByPlaceholder('Buscar por OS, cliente, placa...').fill('zzz-inexistente-999')
    await expect(page.getByText('Nenhuma O.S. encontrada.')).toBeVisible({ timeout: 10000 })
  })

  test('falha de rede ao carregar clientes mostra erro, e nao tela em branco', async ({ page }) => {
    await page.getByRole('link', { name: 'Clientes', exact: true }).click()
    await page.route('**/rest/v1/cliente*', route => route.abort())
    await page.reload()

    await expect(page.getByRole('heading', { name: 'Base de Clientes' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Falha ao carregar clientes do banco/)).toBeVisible({ timeout: 15000 })
  })
})

test.describe('restricoes de acesso por perfil (RN26)', () => {
  test('mecanico nao alcanca Relatorios nem Usuarios', async ({ page }) => {
    await entrarComo(page, 'mecanico@sigauto.com', /\/ordens-servico$/)

    // Navegacao direta pela URL, que e o que um usuario curioso faz.
    await page.goto('/relatorios')
    await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible({ timeout: 15000 })

    await page.goto('/usuarios')
    await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible({ timeout: 15000 })
  })

  test('atendente nao alcanca Usuarios, mas alcanca Clientes', async ({ page }) => {
    await entrarComo(page, 'atendente@sigauto.com', '/')

    await page.goto('/clientes')
    await expect(page.getByRole('heading', { name: 'Base de Clientes' })).toBeVisible({ timeout: 15000 })

    await page.goto('/usuarios')
    await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible({ timeout: 15000 })
  })
})
