// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const baseDb = {
  loading: false,
  clientes: [{ id: 'c1', nome: 'João Silva' }],
  veiculos: [{ id: 'v1', cliente_id: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }],
  servicos: [],
  ordensServico: [
    { id: 'o1', numero_os: 1001, id_veiculo: 'v1', cliente_id: 'c1', status: 'aberta', servicos_itens: [], pecas_itens: [], valor_total: 100 },
  ],
  addOrdemServico: vi.fn(),
  deleteOrdemServico: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe('Dashboard', () => {
  it('mostra o carregamento', () => {
    useDatabase.mockReturnValue({ ...baseDb, loading: true })
    render(<Dashboard />)
    expect(screen.getByText(/Carregando painel/i)).toBeInTheDocument()
  })

  it('renderiza a visao geral com os blocos principais', () => {
    useDatabase.mockReturnValue(baseDb)
    render(<Dashboard />)
    expect(screen.getByRole('heading', { name: 'Visão Geral' })).toBeInTheDocument()
    expect(screen.getByText(/Veículos Cadastrados/i)).toBeInTheDocument()
    expect(screen.getByText(/Faturamento/i)).toBeInTheDocument()
  })
})
