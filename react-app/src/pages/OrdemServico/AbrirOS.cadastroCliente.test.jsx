// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AbrirOS } from './AbrirOS'
import { useDatabase } from '../../hooks/useDatabase'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

// RN07 no cadastro rápido de cliente da abertura de O.S.: a mesma regra de
// documento do cadastro principal (obrigatório, dígitos verificadores e
// unicidade), para pessoa física e jurídica.
const CPF_CADASTRADO = '529.982.247-25'
const CNPJ_CADASTRADO = '04.252.011/0001-10'

let alerta
let addCliente

const db = () => ({
  clientes: [
    { id: 'c1', nome: 'Pessoa Física Cadastrada', cpf_cnpj: CPF_CADASTRADO, tipo_pessoa: 'fisica' },
    { id: 'c2', nome: 'Empresa Cadastrada', cpf_cnpj: CNPJ_CADASTRADO, tipo_pessoa: 'juridica' },
  ],
  veiculos: [],
  funcionarios: [{ id: 'f2', nome: 'Ana', cargo: 'atendente', id_usuario: 'u2' }],
  currentUserId: 'u2',
  addCliente,
  addVeiculo: vi.fn(),
  addOrdemServico: vi.fn(),
})

function cadastrarRapido({ nome = 'Cliente Teste', tipo = 'fisica', documento = '' } = {}) {
  fireEvent.click(screen.getAllByRole('button', { name: '+ Novo' })[0]) // o do cliente
  fireEvent.change(screen.getByPlaceholderText('Nome *'), { target: { value: nome } })
  fireEvent.change(screen.getByLabelText('Tipo de Pessoa'), { target: { value: tipo } })
  fireEvent.change(screen.getByPlaceholderText('CPF/CNPJ'), { target: { value: documento } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar cliente' }))
}

beforeEach(() => {
  alerta = vi.fn()
  vi.stubGlobal('alert', alerta)
  addCliente = vi.fn(async (c) => ({ ...c, id: 'c-novo' }))
  useDatabase.mockImplementation(db)
})

afterEach(() => vi.unstubAllGlobals())

describe('Abrir O.S. — cadastro rápido de cliente', () => {
  it('marca o documento como obrigatorio e oferece o tipo de pessoa', () => {
    render(<MemoryRouter><AbrirOS /></MemoryRouter>)
    fireEvent.click(screen.getAllByRole('button', { name: '+ Novo' })[0])
    expect(screen.getByLabelText('CPF *')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tipo de Pessoa'), { target: { value: 'juridica' } })
    expect(screen.getByLabelText('CNPJ *')).toBeInTheDocument()
  })

  it.each([
    ['CPF válido', 'fisica', '390.533.447-05'],
    ['CNPJ válido', 'juridica', '11.222.333/0001-81'],
  ])('%s: aceito e enviado com o proprio documento', async (_caso, tipo, documento) => {
    render(<MemoryRouter><AbrirOS /></MemoryRouter>)
    cadastrarRapido({ tipo, documento })

    await waitFor(() => expect(addCliente).toHaveBeenCalledTimes(1))
    expect(alerta).not.toHaveBeenCalled()
    expect(addCliente.mock.calls[0][0]).toMatchObject({ cpf_cnpj: documento, tipo_pessoa: tipo })
  })

  it.each([
    ['CPF com dígito verificador inválido', 'fisica', '529.982.247-26', 'CPF inválido. Confira o número informado.'],
    ['CPF com dígitos repetidos', 'fisica', '111.111.111-11', 'CPF inválido. Confira o número informado.'],
    ['CPF já cadastrado', 'fisica', CPF_CADASTRADO, 'CPF/CNPJ já cadastrado para outro cliente.'],
    ['CPF ausente', 'fisica', '', 'Informe o CPF do cliente.'],
    ['CNPJ com dígito verificador inválido', 'juridica', '04.252.011/0001-11', 'CNPJ inválido. Confira o número informado.'],
    ['CNPJ com dígitos repetidos', 'juridica', '11.111.111/1111-11', 'CNPJ inválido. Confira o número informado.'],
    ['CNPJ já cadastrado', 'juridica', CNPJ_CADASTRADO, 'CPF/CNPJ já cadastrado para outro cliente.'],
    ['CNPJ ausente', 'juridica', '', 'Informe o CNPJ do cliente.'],
  ])('%s: recusado antes da gravacao, com aviso e dados mantidos', (_caso, tipo, documento, aviso) => {
    render(<MemoryRouter><AbrirOS /></MemoryRouter>)
    cadastrarRapido({ nome: 'Cliente Recusado', tipo, documento })

    expect(alerta).toHaveBeenCalledWith(aviso)
    expect(addCliente).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Nome *')).toHaveValue('Cliente Recusado')
  })

  it('nao envia identificador provisorio no lugar do documento', () => {
    render(<MemoryRouter><AbrirOS /></MemoryRouter>)
    cadastrarRapido({ documento: '' })
    expect(addCliente).not.toHaveBeenCalled()
  })

  it('falha de gravacao mantem os dados e permite nova tentativa', async () => {
    addCliente = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockImplementationOnce(async (c) => ({ ...c, id: 'c-novo' }))
    render(<MemoryRouter><AbrirOS /></MemoryRouter>)
    cadastrarRapido({ nome: 'Cliente Retentativa', documento: '390.533.447-05' })

    await waitFor(() => expect(alerta).toHaveBeenCalledWith(expect.stringContaining('Os dados digitados foram mantidos')))
    expect(screen.getByPlaceholderText('Nome *')).toHaveValue('Cliente Retentativa')
    expect(screen.getByPlaceholderText('CPF/CNPJ')).toHaveValue('390.533.447-05')

    fireEvent.click(screen.getByRole('button', { name: 'Salvar cliente' }))
    await waitFor(() => expect(addCliente).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByPlaceholderText('Nome *')).not.toBeInTheDocument())
  })
})
