// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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
  it.each([true, false])('RN46: só solicita a inativação do serviço escolhido se confirmar a remoção (%s)', (confirmado) => {
    useDatabase.mockReturnValue({
      ...baseDb,
      servicos: [
        { id: 'servico-1', nome: 'Troca de óleo', descricao: 'Motor', preco: 120, ativo: true },
        { id: 'servico-2', nome: 'Alinhamento', descricao: 'Suspensão', preco: 80, ativo: true },
      ],
    })
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(confirmado)
    try {
      render(<Servicos />)
      const linha = screen.getByText('Alinhamento').closest('tr')
      // A ação de remover é o botão de ícone, sem texto acessível nesta tela.
      const remover = within(linha).getAllByRole('button').find(botao => botao.textContent === '')
      expect(remover).toBeDefined()
      fireEvent.click(remover)

      expect(confirmar).toHaveBeenCalledExactlyOnceWith('Tem certeza que deseja remover o serviço Alinhamento do catálogo?')
      if (confirmado) {
        expect(baseDb.deleteServico).toHaveBeenCalledExactlyOnceWith('servico-2')
      } else {
        expect(baseDb.deleteServico).not.toHaveBeenCalled()
        expect(screen.getByText('Alinhamento')).toBeInTheDocument()
      }
    } finally {
      confirmar.mockRestore()
    }
  })

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
