// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AbrirOS } from './AbrirOS'
import { useDatabase } from '../../hooks/useDatabase'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const baseDb = {
  clientes: [
    { id: 'c1', nome: 'João Silva', cpf_cnpj: '123.456.789-09' },
    { id: 'c2', nome: 'Maria Souza', cpf_cnpj: '987.654.321-00' },
  ],
  veiculos: [{ id: 'v1', cliente_id: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }],
  funcionarios: [
    { id: 'f1', nome: 'Carlos', cargo: 'mecanico', id_usuario: 'u1' },
    { id: 'f2', nome: 'Ana', cargo: 'atendente', id_usuario: 'u2' },
  ],
  currentUserId: 'u2',
  addCliente: vi.fn(),
  addVeiculo: vi.fn(),
  addOrdemServico: vi.fn(),
}

const renderPage = () => render(<MemoryRouter><AbrirOS /></MemoryRouter>)
const campoBusca = () => screen.getByLabelText(/Buscar cliente por nome/i)

beforeEach(() => {
  vi.clearAllMocks()
  useDatabase.mockReturnValue(baseDb)
})

describe('Tela de Abrir O.S.', () => {
  it('renderiza o formulario com o titulo', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Abrir Nova O\.S\./i })).toBeInTheDocument()
  })

  it('oferece o atalho de Consumidor e o mecanico no formulario', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /Consumidor/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Carlos' })).toBeInTheDocument() // mecanico (funcionario)
  })

  it('nao lista clientes antes de o atendente digitar', () => {
    // A lista inteira aparecendo de cara era justamente o problema do <select>.
    renderPage()
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })

  it('busca cliente por nome', () => {
    renderPage()
    fireEvent.change(campoBusca(), { target: { value: 'maria' } })

    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })

  it('busca cliente por CPF', () => {
    renderPage()
    fireEvent.change(campoBusca(), { target: { value: '98765432100' } })

    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
  })

  it('busca cliente pela placa do veiculo e mostra qual carro casou', () => {
    renderPage()
    fireEvent.change(campoBusca(), { target: { value: 'ABC1D23' } })

    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText(/Placa ABC1D23/i)).toBeInTheDocument()
  })

  it('avisa quando nada casa com o termo', () => {
    renderPage()
    fireEvent.change(campoBusca(), { target: { value: 'zzzzz' } })

    expect(screen.getByText(/Nenhum cliente encontrado/i)).toBeInTheDocument()
  })

  it('selecionar um resultado troca a busca pelo cliente escolhido', () => {
    renderPage()
    fireEvent.change(campoBusca(), { target: { value: 'maria' } })
    fireEvent.click(screen.getByText('Maria Souza'))

    expect(screen.queryByLabelText(/Buscar cliente por nome/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Trocar/i })).toBeInTheDocument()
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
  })
})
