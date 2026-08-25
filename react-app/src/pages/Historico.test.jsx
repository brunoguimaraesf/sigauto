// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Historico } from './Historico'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const baseDb = {
  loading: false,
  clientes: [{ id: 'c1', nome: 'João Silva' }],
  veiculos: [{ id: 'v1', cliente_id: 'c1', id_cliente: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }],
  ordensServico: [
    { id: 'o1', numero_os: 1001, id_veiculo: 'v1', cliente_id: 'c1', status: 'concluida', data_abertura: '2026-01-01T10:00:00Z' },
  ],
}

beforeEach(() => vi.clearAllMocks())

describe('Historico', () => {
  it('mostra o carregamento', () => {
    useDatabase.mockReturnValue({ ...baseDb, loading: true, ordensServico: [] })
    render(<Historico />)
    expect(screen.getByText(/Carregando histórico/i)).toBeInTheDocument()
  })

  it('mostra estado vazio', () => {
    useDatabase.mockReturnValue({ ...baseDb, ordensServico: [] })
    render(<Historico />)
    expect(screen.getByText(/Nenhuma O\.S\. encontrada com os filtros/i)).toBeInTheDocument()
  })

  it('lista o historico com cliente e placa', () => {
    useDatabase.mockReturnValue(baseDb)
    render(<Historico />)
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('ABC1D23')).toBeInTheDocument()
  })

  it('filtra pela busca', () => {
    useDatabase.mockReturnValue(baseDb)
    render(<Historico />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar cliente, placa/i), { target: { value: 'zzz' } })
    expect(screen.getByText(/Nenhuma O\.S\. encontrada com os filtros/i)).toBeInTheDocument()
  })
})
