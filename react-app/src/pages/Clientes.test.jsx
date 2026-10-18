// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Clientes } from './Clientes'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const baseDb = {
  loading: false,
  databaseError: '',
  clientes: [
    { id: 'c1', nome: 'Maria Souza', telefone: '(64) 99999-0000', email: 'maria@x.com', tipo_pessoa: 'fisica', cpf_cnpj: '11122233344' },
    { id: 'c2', nome: 'Auto Peças LTDA', telefone: '(64) 3333-0000', email: 'contato@ap.com', tipo_pessoa: 'juridica', cpf_cnpj: '99000111000155' },
  ],
  veiculos: [{ id: 'v1', cliente_id: 'c1', placa: 'XYZ1A11', marca: 'Fiat', modelo: 'Uno' }],
  addCliente: vi.fn(),
  updateCliente: vi.fn(),
  deleteCliente: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe('Tela de Clientes', () => {
  it('mostra o carregamento', () => {
    useDatabase.mockReturnValue({ ...baseDb, loading: true, clientes: [] })
    render(<Clientes />)
    expect(screen.getByText(/Carregando diretório de clientes/i)).toBeInTheDocument()
  })

  it('mostra estado vazio', () => {
    useDatabase.mockReturnValue({ ...baseDb, clientes: [] })
    render(<Clientes />)
    expect(screen.getByText(/Nenhum cliente cadastrado/i)).toBeInTheDocument()
  })

  it('lista clientes e o veiculo vinculado', () => {
    useDatabase.mockReturnValue(baseDb)
    render(<Clientes />)
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    expect(screen.getByText('Auto Peças LTDA')).toBeInTheDocument()
    expect(screen.getByText('XYZ1A11')).toBeInTheDocument() // placa do veiculo do cliente
  })

  it('filtra pela busca', () => {
    useDatabase.mockReturnValue(baseDb)
    render(<Clientes />)
    const busca = screen.getByPlaceholderText(/Buscar clientes/i)
    fireEvent.change(busca, { target: { value: 'maria' } })
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    expect(screen.queryByText('Auto Peças LTDA')).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validação do formulário (Clientes.jsx:97-103). O app grava direto no
// Supabase: o que o handleSubmit deixar passar vira linha no banco.
// ─────────────────────────────────────────────────────────────────────────────

const CPF_VALIDO = '529.982.247-25'
const CNPJ_VALIDO = '04.252.011/0001-10'

// Preenche o modal de criação e dispara o submit direto no <form>, para exercitar
// o handleSubmit e não a validação nativa do navegador.
function abrirEPreencher({ nome, email, telefone, cpfCnpj, tipoPessoa }) {
  fireEvent.click(screen.getByRole('button', { name: /Novo Cliente/i }))
  if (tipoPessoa) {
    // O <label> 'Tipo de Pessoa' nao tem htmlFor nem id no select (achado de
    // acessibilidade): o seletor cai no primeiro combobox do modal.
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: tipoPessoa } })
  }
  if (nome !== undefined) {
    fireEvent.change(screen.getByPlaceholderText(/Ayrton Senna/i), { target: { value: nome } })
  }
  if (cpfCnpj !== undefined) {
    const rotulo = tipoPessoa === 'juridica' ? /12\.345\.678\/0001-99/ : /123\.456\.789-00/
    fireEvent.change(screen.getByPlaceholderText(rotulo), { target: { value: cpfCnpj } })
  }
  if (email !== undefined) {
    fireEvent.change(screen.getByPlaceholderText(/senna@mclaren\.com/i), { target: { value: email } })
  }
  if (telefone !== undefined) {
    fireEvent.change(screen.getByPlaceholderText(/99876-5432/), { target: { value: telefone } })
  }
  fireEvent.submit(screen.getByRole('button', { name: /Confirmar Cadastro/i }).closest('form'))
}

describe('Clientes — validação do formulário no submit', () => {
  let alerta
  let addCliente

  beforeEach(() => {
    alerta = vi.fn()
    addCliente = vi.fn().mockResolvedValue({})
    vi.stubGlobal('alert', alerta)
    useDatabase.mockReturnValue({ ...baseDb, addCliente })
  })

  it('deve_barrar_submit_quando_nome_e_so_espaco_em_branco', () => {
    render(<Clientes />)
    abrirEPreencher({ nome: '   ', email: 'a@b.com', telefone: '(64) 99999-0000', cpfCnpj: CPF_VALIDO })
    expect(alerta).toHaveBeenCalledWith('Informe o nome do cliente.')
    expect(addCliente).not.toHaveBeenCalled()
  })

  it('deve_barrar_submit_quando_cpf_tem_digito_verificador_invalido', () => {
    render(<Clientes />)
    // 529.982.247-26: só o último dígito muda em relação ao CPF válido.
    abrirEPreencher({ nome: 'Joao', email: 'a@b.com', telefone: '(64) 99999-0000', cpfCnpj: '529.982.247-26' })
    expect(alerta).toHaveBeenCalledWith(expect.stringContaining('CPF inválido'))
    expect(addCliente).not.toHaveBeenCalled()
  })

  it('deve_barrar_submit_quando_cpf_tem_todos_os_digitos_iguais', () => {
    render(<Clientes />)
    abrirEPreencher({ nome: 'Joao', email: 'a@b.com', telefone: '(64) 99999-0000', cpfCnpj: '111.111.111-11' })
    expect(alerta).toHaveBeenCalledWith(expect.stringContaining('CPF inválido'))
    expect(addCliente).not.toHaveBeenCalled()
  })

  it('deve_barrar_submit_quando_cnpj_tem_digito_verificador_invalido', () => {
    render(<Clientes />)
    abrirEPreencher({
      tipoPessoa: 'juridica',
      nome: 'Auto Pecas',
      email: 'a@b.com',
      telefone: '(64) 3333-0000',
      cpfCnpj: '04.252.011/0001-11',
    })
    expect(alerta).toHaveBeenCalledWith(expect.stringContaining('CNPJ inválido'))
    expect(addCliente).not.toHaveBeenCalled()
  })

  it.each([
    ['sem arroba', 'joaoexemplo.com'],
    ['sem dominio', 'joao@'],
    ['sem tld', 'joao@exemplo'],
    ['com espaco', 'joao silva@exemplo.com'],
  ])('deve_barrar_submit_quando_email_e_malformado (%s)', (_caso, email) => {
    render(<Clientes />)
    abrirEPreencher({ nome: 'Joao', email, telefone: '(64) 99999-0000', cpfCnpj: CPF_VALIDO })
    expect(alerta).toHaveBeenCalledWith('E-mail inválido.')
    expect(addCliente).not.toHaveBeenCalled()
  })

  it('deve_aceitar_submit_com_cpf_email_e_telefone_validos', () => {
    render(<Clientes />)
    abrirEPreencher({ nome: 'Joao', email: 'joao@exemplo.com', telefone: '(64) 99999-0000', cpfCnpj: CPF_VALIDO })
    expect(alerta).not.toHaveBeenCalled()
    expect(addCliente).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Joao',
      email: 'joao@exemplo.com',
      cpf_cnpj: CPF_VALIDO,
      tipo_pessoa: 'fisica',
    }))
  })

  it('deve_aceitar_cnpj_valido_quando_tipo_pessoa_e_juridica', () => {
    render(<Clientes />)
    abrirEPreencher({
      tipoPessoa: 'juridica',
      nome: 'Auto Pecas',
      email: 'contato@ap.com',
      telefone: '(64) 3333-0000',
      cpfCnpj: CNPJ_VALIDO,
    })
    expect(alerta).not.toHaveBeenCalled()
    expect(addCliente).toHaveBeenCalledWith(expect.objectContaining({ tipo_pessoa: 'juridica' }))
  })

  // BUG: Clientes.jsx:97-103 não valida telefone. O campo tem `required` no HTML,
  // mas o handleSubmit grava sem checar — submit programático, autofill ou
  // novalidate gravam telefone vazio no banco (RF02).
  it('deve_rejeitar_submit_com_telefone_vazio', () => {
    render(<Clientes />)
    abrirEPreencher({ nome: 'Joao', email: 'joao@exemplo.com', telefone: '', cpfCnpj: CPF_VALIDO })
    expect(addCliente).not.toHaveBeenCalled()
  })

  // BUG: Clientes.jsx:98 só checa o dígito verificador, nunca a unicidade.
  // Cadastrar um CPF que já pertence a outro cliente passa direto pela tela.
  it('deve_rejeitar_cpf_cnpj_ja_cadastrado_em_outro_cliente', () => {
    useDatabase.mockReturnValue({
      ...baseDb,
      addCliente,
      clientes: [{ id: 'c1', nome: 'Maria', cpf_cnpj: CPF_VALIDO, tipo_pessoa: 'fisica' }],
    })
    render(<Clientes />)
    abrirEPreencher({ nome: 'Outro Joao', email: 'joao@exemplo.com', telefone: '(64) 99999-0000', cpfCnpj: CPF_VALIDO })
    expect(addCliente).not.toHaveBeenCalled()
  })

  // BUG: `cliente.nome` é VARCHAR(120) (database/01_schema_base.sql:50) e o input
  // não tem maxLength nem o handleSubmit trunca. O nome gigante só é recusado no
  // PostgREST (22001), depois do estado otimista: round-trip e alert genérico.
  it('documenta_que_nome_com_10000_caracteres_chega_intacto_ao_addCliente', () => {
    render(<Clientes />)
    const gigante = 'a'.repeat(10000)
    fireEvent.click(screen.getByRole('button', { name: /Novo Cliente/i }))
    expect(screen.getByPlaceholderText(/Ayrton Senna/i)).not.toHaveAttribute('maxlength')
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }))
    abrirEPreencher({ nome: gigante, email: 'joao@exemplo.com', telefone: '(64) 99999-0000', cpfCnpj: CPF_VALIDO })
    expect(addCliente).toHaveBeenCalledWith(expect.objectContaining({ nome: gigante }))
  })

  it('deve_escapar_script_no_nome_ao_renderizar_a_lista', () => {
    const payloadXss = '<script>window.__xss = true</script>'
    useDatabase.mockReturnValue({
      ...baseDb,
      addCliente,
      clientes: [{ id: 'c9', nome: payloadXss, telefone: '1', email: 'x@x.com', tipo_pessoa: 'fisica', cpf_cnpj: '1' }],
    })
    const { container } = render(<Clientes />)
    expect(screen.getByText(payloadXss)).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(window.__xss).toBeUndefined()
  })

  it('deve_tratar_nome_com_emoji_e_acento_sem_quebrar_a_listagem', () => {
    useDatabase.mockReturnValue({
      ...baseDb,
      addCliente,
      clientes: [{ id: 'c8', nome: '🚗 José Ñuñez', telefone: '1', email: 'j@x.com', tipo_pessoa: 'fisica', cpf_cnpj: '1' }],
    })
    render(<Clientes />)
    expect(screen.getByText('🚗 José Ñuñez')).toBeInTheDocument()
  })
})
