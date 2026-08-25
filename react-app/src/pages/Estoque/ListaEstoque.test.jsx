// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ListaEstoque } from './ListaEstoque'

// Mock encadeavel do Supabase (select -> eq -> order resolve com os itens).
vi.mock('../../supabaseClient', () => {
  const data = [
    { id: 'i1', codigo: 'FIL-001', nome: 'Filtro de Óleo', unidade: 'UN', quantidade: 10, qtd_minima: 3, preco_unit: 30, ativo: true },
    { id: 'i2', codigo: 'PAS-002', nome: 'Pastilha de Freio', unidade: 'PC', quantidade: 2, qtd_minima: 5, preco_unit: 90, ativo: true },
  ]
  const q = {}
  q.select = () => q
  q.eq = () => q
  q.order = () => Promise.resolve({ data, error: null })
  return { supabaseDb: { from: () => q } }
})

beforeEach(() => vi.clearAllMocks())

describe('Tela de Estoque', () => {
  it('mostra o titulo', () => {
    render(<ListaEstoque />)
    expect(screen.getByRole('heading', { name: /Controle de Estoque/i })).toBeInTheDocument()
  })

  it('carrega e lista os itens do estoque', async () => {
    render(<ListaEstoque />)
    expect(await screen.findByText('Filtro de Óleo')).toBeInTheDocument()
    expect(screen.getByText('Pastilha de Freio')).toBeInTheDocument()
  })
})
