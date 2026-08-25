// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Funcionarios } from './Funcionarios'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const MOCK_FUNCS = [
  { id: 'f1', nome: 'Carlos Mecânico', cargo: 'mecanico', comissao_percentual: 10, comissao_sobre_servicos: true, comissao_sobre_pecas: false, id_usuario: 'u1', ativo: true },
  { id: 'f2', nome: 'Ana Atendente', cargo: 'atendente', comissao_percentual: 0, comissao_sobre_servicos: false, comissao_sobre_pecas: false, id_usuario: null, ativo: true },
]

// Mock do Supabase: Funcionarios busca a tabela completa direto.
vi.mock('../supabaseClient', () => ({
  supabaseDb: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: MOCK_FUNCS, error: null }) }),
    }),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  useDatabase.mockReturnValue({ usuarios: [{ id: 'u1', nome: 'Carlos', email: 'carlos@x.com' }], reloadDatabase: vi.fn() })
})

describe('Tela de Funcionarios', () => {
  it('mostra o titulo', () => {
    render(<Funcionarios />)
    expect(screen.getByRole('heading', { name: 'Funcionarios' })).toBeInTheDocument()
  })

  it('carrega e lista os funcionarios com a comissao', async () => {
    render(<Funcionarios />)
    expect(await screen.findByText('Carlos Mecânico')).toBeInTheDocument()
    expect(screen.getByText('Ana Atendente')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument() // comissao do mecanico
  })
})
