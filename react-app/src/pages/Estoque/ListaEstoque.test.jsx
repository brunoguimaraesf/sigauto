// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ListaEstoque } from './ListaEstoque'
import { AuthContext } from '../../context/AuthContext'

// Mock encadeavel do Supabase (select -> eq -> order resolve com os itens).
vi.mock('../../supabaseClient', () => {
  const data = [
    { id: 'i1', codigo: 'FIL-001', nome: 'Filtro de Óleo', unidade: 'UN', quantidade: 10, qtd_minima: 3, preco_unit: 30, ativo: true },
    { id: 'i2', codigo: 'PAS-002', nome: 'Pastilha de Freio', unidade: 'PC', quantidade: 2, qtd_minima: 5, preco_unit: 90, ativo: true },
  ]
  const from = vi.fn((tabela) => {
    const resposta = { data: tabela === 'movimentacao_estoque' ? [] : data, error: null }
    const q = {}
    q.select = () => q
    q.eq = () => q
    q.order = () => q
    q.limit = () => Promise.resolve(resposta)
    q.then = (resolve, reject) => Promise.resolve(resposta).then(resolve, reject)
    return q
  })
  return { supabaseDb: { from } }
})

import { supabaseDb } from '../../supabaseClient'

const comPerfil = (perfil, no) => (
  <AuthContext.Provider value={{ perfil, user: null, isAuthenticated: true, loading: false, login: () => {}, logout: () => {} }}>
    {no}
  </AuthContext.Provider>
)

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

// Migracao 19: `custo` so existe para gestor. Nao gestor le a view sem a
// coluna e nao ve o campo — se visse vazio, salvar apagaria o custo real.
describe('custo por perfil (migracao 19)', () => {
  it('atendente le item_estoque_publico e nao ve custo nem margem', async () => {
    render(comPerfil('atendente', <ListaEstoque />))
    expect(await screen.findByText('Filtro de Óleo')).toBeInTheDocument()
    expect(supabaseDb.from).toHaveBeenCalledWith('item_estoque_publico')
    expect(supabaseDb.from).not.toHaveBeenCalledWith('item_estoque')
    fireEvent.click(screen.getByRole('button', { name: /Novo Item/i }))
    expect(screen.queryByLabelText(/Custo unitário/i)).toBeNull()
    expect(screen.queryByText('Margem')).toBeNull()
  })

  it('gestor le a tabela e ve custo e margem', async () => {
    render(comPerfil('gestor', <ListaEstoque />))
    expect(await screen.findByText('Filtro de Óleo')).toBeInTheDocument()
    expect(supabaseDb.from).toHaveBeenCalledWith('item_estoque')
    fireEvent.click(screen.getByRole('button', { name: /Novo Item/i }))
    expect(screen.getByText(/Custo unitário/i)).toBeInTheDocument()
    expect(screen.getByText('Margem')).toBeInTheDocument()
  })
})

// Fail-closed: perfil nao resolvido (AuthContext devolve null depois de falhar
// a leitura de `usuario`) nao vale gestor. Se valesse, o formulario vazio
// mandaria `custo: null` e apagaria o custo real.
it('perfil nulo dentro do provider nao libera custo', async () => {
  render(comPerfil(null, <ListaEstoque />))
  expect(await screen.findByText('Filtro de Óleo')).toBeInTheDocument()
  expect(supabaseDb.from).toHaveBeenCalledWith('item_estoque_publico')
  fireEvent.click(screen.getByRole('button', { name: /Novo Item/i }))
  expect(screen.queryByText(/Custo unitário/i)).toBeNull()
})
