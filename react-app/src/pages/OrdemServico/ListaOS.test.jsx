// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ListaOS } from './ListaOS'
import { useDatabase } from '../../hooks/useDatabase'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const renderPage = () => render(<MemoryRouter><ListaOS /></MemoryRouter>)

const baseDb = {
  loading: false,
  clientes: [{ id: 'c1', nome: 'João Silva' }],
  veiculos: [{ id: 'v1', id_cliente: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }],
  funcionarios: [{ id: 'f1', id_usuario: 'u1', cargo: 'mecanico', nome: 'Carlos Mecânico' }],
  ordensServico: [{
    id: 'o1', numero_os: 1001, id_veiculo: 'v1', cliente_id: 'c1',
    id_mecanico: 'f1', status: 'aberta', prioridade: 'normal',
    servicos_itens: [], pecas_itens: [], valor_total: 100, data_abertura: '2026-01-01T10:00:00Z',
  }],
}

beforeEach(() => vi.clearAllMocks())

describe('Tela de Ordens de Serviço', () => {
  it('mostra o estado de carregamento', () => {
    useDatabase.mockReturnValue({ ...baseDb, loading: true, ordensServico: [] })
    renderPage()
    expect(screen.getByText(/Carregando ordens de serviço/i)).toBeInTheDocument()
  })

  it('mostra estado vazio quando nao ha OS', () => {
    useDatabase.mockReturnValue({ ...baseDb, ordensServico: [] })
    renderPage()
    expect(screen.getByText(/Nenhuma O\.S\. encontrada/i)).toBeInTheDocument()
  })

  it('renderiza a OS com cliente, placa e mecanico (via resolveEquipe)', () => {
    useDatabase.mockReturnValue(baseDb)
    renderPage()
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('ABC1D23')).toBeInTheDocument()
    expect(screen.getByText(/Carlos Mecânico/)).toBeInTheDocument()
    expect(screen.getByText('#1001')).toBeInTheDocument()
  })

  it('filtra pela busca (placa/cliente)', () => {
    useDatabase.mockReturnValue(baseDb)
    renderPage()
    const busca = screen.getByPlaceholderText(/Buscar por OS, cliente, placa/i)
    fireEvent.change(busca, { target: { value: 'zzz-nao-existe' } })
    expect(screen.getByText(/Nenhuma O\.S\. encontrada/i)).toBeInTheDocument()
    fireEvent.change(busca, { target: { value: 'joão' } })
    expect(screen.getByText('João Silva')).toBeInTheDocument()
  })
})
