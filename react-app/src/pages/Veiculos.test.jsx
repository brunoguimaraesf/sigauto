// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Veiculos } from './Veiculos'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const baseDb = {
  loading: false,
  clientes: [{ id: 'c1', nome: 'Maria Souza' }],
  veiculos: [
    { id: 'v1', cliente_id: 'c1', placa: 'XYZ1A11', marca: 'Fiat', modelo: 'Uno', ano: 2020, cor: 'Prata', status: 'Pendente' },
    { id: 'v2', cliente_id: 'c1', placa: 'DEF4G55', marca: 'VW', modelo: 'Gol', ano: 2018, cor: 'Preto', status: 'Pendente' },
  ],
  addVeiculo: vi.fn(),
  updateVeiculo: vi.fn(),
  deleteVeiculo: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe('Tela de Veiculos', () => {
  it('mostra o carregamento', () => {
    useDatabase.mockReturnValue({ ...baseDb, loading: true, veiculos: [] })
    render(<Veiculos />)
    expect(screen.getByText(/Buscando veiculos/i)).toBeInTheDocument()
  })

  it('mostra estado vazio', () => {
    useDatabase.mockReturnValue({ ...baseDb, veiculos: [] })
    render(<Veiculos />)
    expect(screen.getByText(/Nenhum veiculo encontrado/i)).toBeInTheDocument()
  })

  it('lista veiculos com placa, modelo e proprietario', () => {
    useDatabase.mockReturnValue(baseDb)
    render(<Veiculos />)
    expect(screen.getByText('XYZ1A11')).toBeInTheDocument()
    expect(screen.getByText('Fiat Uno')).toBeInTheDocument()
    expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0)
  })

  it('filtra pela busca (placa)', () => {
    useDatabase.mockReturnValue(baseDb)
    render(<Veiculos />)
    const busca = screen.getByPlaceholderText(/Buscar veiculo/i)
    fireEvent.change(busca, { target: { value: 'DEF4G55' } })
    expect(screen.getByText('VW Gol')).toBeInTheDocument()
    expect(screen.queryByText('Fiat Uno')).not.toBeInTheDocument()
  })
})
