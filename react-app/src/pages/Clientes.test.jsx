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
