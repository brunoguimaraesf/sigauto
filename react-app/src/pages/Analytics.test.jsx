// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Analytics } from './Analytics'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const baseDb = {
  loading: false,
  veiculos: [{ id: 'v1', marca: 'VW', modelo: 'Gol' }],
  servicos: [],
  ordensServico: [{ id: 'o1', status: 'concluida', preco_final: 250 }],
}

beforeEach(() => vi.clearAllMocks())

describe('Analytics', () => {
  it('mostra o carregamento', () => {
    useDatabase.mockReturnValue({ ...baseDb, loading: true })
    render(<Analytics />)
    expect(screen.getByText(/Carregando relatórios/i)).toBeInTheDocument()
  })

  it('renderiza o painel com os blocos financeiros', () => {
    useDatabase.mockReturnValue(baseDb)
    render(<Analytics />)
    expect(screen.getByRole('heading', { name: /Painel de Relatórios/i })).toBeInTheDocument()
    expect(screen.getByText(/Receita Bruta Total/i)).toBeInTheDocument()
    expect(screen.getByText(/Ticket Médio/i)).toBeInTheDocument()
  })
})
