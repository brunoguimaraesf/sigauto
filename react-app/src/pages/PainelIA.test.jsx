// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PainelIA } from './PainelIA'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

// estoque carregado via supabase no mount
vi.mock('../supabaseClient', () => {
  const q = {}
  q.select = () => q
  q.eq = () => q
  q.order = () => Promise.resolve({ data: [], error: null })
  return { supabaseDb: { from: () => q } }
})

beforeEach(() => {
  vi.clearAllMocks()
  useDatabase.mockReturnValue({ clientes: [{ id: 'c1' }], veiculos: [{ id: 'v1' }], ordensServico: [{ id: 'o1' }] })
})

describe('Painel de IA', () => {
  it('renderiza titulo, aviso consultivo e o botao de analise', () => {
    render(<PainelIA />)
    expect(screen.getByRole('heading', { name: /Painel de Inteligência Artificial/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Analisar Dados/i })).toBeInTheDocument()
    expect(screen.getByText(/car[áa]ter exclusivamente consultivo/i)).toBeInTheDocument()
  })

  it('mostra o estado inicial antes da analise', () => {
    render(<PainelIA />)
    expect(screen.getByRole('heading', { name: /Pronto para Analisar/i })).toBeInTheDocument()
  })
})
