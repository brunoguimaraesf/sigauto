// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AbrirOS } from './AbrirOS'
import { useDatabase } from '../../hooks/useDatabase'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const baseDb = {
  clientes: [{ id: 'c1', nome: 'João Silva' }],
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

beforeEach(() => {
  vi.clearAllMocks()
  useDatabase.mockReturnValue(baseDb)
})

describe('Tela de Abrir O.S.', () => {
  it('renderiza o formulario com o titulo', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Abrir Nova O\.S\./i })).toBeInTheDocument()
  })

  it('oferece o cliente Consumidor e o mecanico no formulario', () => {
    renderPage()
    expect(screen.getByRole('option', { name: 'Consumidor' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Carlos' })).toBeInTheDocument() // mecanico (funcionario)
  })
})
