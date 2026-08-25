// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AtualizarOS } from './AtualizarOS'
import { useDatabase } from '../../hooks/useDatabase'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

// estoque carregado via supabase no useEffect
vi.mock('../../supabaseClient', () => {
  const q = {}
  q.select = () => q
  q.eq = () => q
  q.order = () => Promise.resolve({ data: [], error: null })
  return { supabaseDb: { from: () => q } }
})

const os = {
  id: 'o1', numero_os: 1001, veiculo_id: 'v1', cliente_id: 'c1', id_usuario: 'u1',
  status: 'aberta', descricao: 'Barulho no motor', diagnostico: '', observacoes: '',
  forma_pagamento: 'a_definir', servicos_itens: [], pecas_itens: [],
}
const baseDb = {
  clientes: [{ id: 'c1', nome: 'João Silva' }],
  veiculos: [{ id: 'v1', cliente_id: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }],
  funcionarios: [],
  servicos: [],
  ordensServico: [os],
  updateOrdemServico: vi.fn(),
}

const renderAt = (id = 'o1') => render(
  <MemoryRouter initialEntries={[`/ordens-servico/${id}`]}>
    <Routes>
      <Route path="/ordens-servico/:id" element={<AtualizarOS />} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => {
  vi.clearAllMocks()
  useDatabase.mockReturnValue(baseDb)
})

describe('Tela de Atualizar O.S.', () => {
  it('renderiza os dados da OS encontrada', () => {
    renderAt('o1')
    expect(screen.getByRole('heading', { name: /O\.S\. #1001/ })).toBeInTheDocument()
    expect(screen.getByText(/Barulho no motor/)).toBeInTheDocument()
  })

  it('mostra aviso quando a OS nao existe', () => {
    renderAt('inexistente')
    expect(screen.getByText(/Ordem de servico nao encontrada/i)).toBeInTheDocument()
  })
})
