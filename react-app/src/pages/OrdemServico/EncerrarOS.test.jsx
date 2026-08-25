// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { EncerrarOS } from './EncerrarOS'
import { useDatabase } from '../../hooks/useDatabase'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))
// Evita carregar a lib de PDF (pesada) no ambiente de teste.
vi.mock('jspdf', () => ({ default: vi.fn(() => ({})) }))
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }))

const veic = { id: 'v1', cliente_id: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }
const cli = { id: 'c1', nome: 'João Silva' }

const dbWith = (os) => ({
  clientes: [cli], veiculos: [veic], ordensServico: os ? [os] : [], updateOrdemServico: vi.fn(),
})

const renderAt = (id = 'o1') => render(
  <MemoryRouter initialEntries={[`/ordens-servico/${id}/encerrar`]}>
    <Routes>
      <Route path="/ordens-servico/:id/encerrar" element={<EncerrarOS />} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => vi.clearAllMocks())

describe('Tela de Encerrar O.S.', () => {
  it('mostra aviso quando a OS nao existe', () => {
    useDatabase.mockReturnValue(dbWith(null))
    renderAt('inexistente')
    expect(screen.getByText(/Ordem de serviço não encontrada/i)).toBeInTheDocument()
  })

  it('mostra "ja finalizada" quando a OS esta concluida', () => {
    useDatabase.mockReturnValue(dbWith({
      id: 'o1', numero_os: 1001, veiculo_id: 'v1', cliente_id: 'c1', status: 'concluida',
      servicos_itens: [], pecas_itens: [], valor_total: 200,
    }))
    renderAt('o1')
    expect(screen.getByRole('heading', { name: /O\.S\. já finalizada/i })).toBeInTheDocument()
  })
})
