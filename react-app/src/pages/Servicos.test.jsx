// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Servicos } from './Servicos'
import { useDatabase } from '../hooks/useDatabase'

// Isola a tela do banco: o hook de dados é mockado.
vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const baseDb = {
  loading: false,
  addServico: vi.fn(),
  updateServico: vi.fn(),
  deleteServico: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Tela de Serviços', () => {
  it('mostra o título e lista os serviços vindos do hook', () => {
    useDatabase.mockReturnValue({
      ...baseDb,
      servicos: [
        { id: '1', nome: 'Troca de óleo', descricao: 'Motor', preco: 120, ativo: true },
        { id: '2', nome: 'Alinhamento', descricao: 'Suspensão', preco: 80, ativo: true },
      ],
    })
    render(<Servicos />)
    expect(screen.getByRole('heading', { name: 'Catálogo de Serviços' })).toBeInTheDocument()
    expect(screen.getByText('Troca de óleo')).toBeInTheDocument()
    expect(screen.getByText('Alinhamento')).toBeInTheDocument()
  })

  it('mostra o estado vazio quando não há serviços', () => {
    useDatabase.mockReturnValue({ ...baseDb, servicos: [] })
    render(<Servicos />)
    expect(screen.getByText(/Nenhum serviço catalogado/i)).toBeInTheDocument()
  })

  it('mostra o estado de carregamento', () => {
    useDatabase.mockReturnValue({ ...baseDb, servicos: [], loading: true })
    render(<Servicos />)
    expect(screen.getByText(/Carregando catálogo/i)).toBeInTheDocument()
  })

  it('filtra a lista ao digitar na busca', () => {
    useDatabase.mockReturnValue({
      ...baseDb,
      servicos: [
        { id: '1', nome: 'Troca de óleo', descricao: 'Motor', preco: 120, ativo: true },
        { id: '2', nome: 'Alinhamento', descricao: 'Suspensão', preco: 80, ativo: true },
      ],
    })
    render(<Servicos />)
    const busca = screen.getByPlaceholderText(/Buscar serviço/i)
    fireEvent.change(busca, { target: { value: 'alinha' } })
    expect(screen.getByText('Alinhamento')).toBeInTheDocument()
    expect(screen.queryByText('Troca de óleo')).not.toBeInTheDocument()
  })
})
