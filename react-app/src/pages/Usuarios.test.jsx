// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Usuarios } from './Usuarios'

const { criarUsuario } = vi.hoisted(() => ({ criarUsuario: vi.fn() }))
const reloadDatabase = vi.fn()

vi.mock('../services/api', () => ({ usuariosApi: { criar: criarUsuario } }))
vi.mock('../hooks/useDatabase', () => ({ useDatabase: () => ({ reloadDatabase }) }))

const MOCK = [
  { id: 'u1', nome: 'Gestor Um', email: 'gestor@x.com', perfil: 'gestor', telefone: null, ativo: true },
  { id: 'u2', nome: 'Ana Atendente', email: 'ana@x.com', perfil: 'atendente', telefone: null, ativo: true },
]

vi.mock('../supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn(), signUp: vi.fn(), setSession: vi.fn() } },
  supabaseDb: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: MOCK, error: null }) }) }),
  },
}))

beforeEach(() => vi.clearAllMocks())

describe('Tela de Usuarios', () => {
  it('mostra o titulo', () => {
    render(<Usuarios />)
    expect(screen.getByRole('heading', { name: /Gestao de Usuarios/i })).toBeInTheDocument()
  })

  it('carrega e lista os usuarios', async () => {
    render(<Usuarios />)
    expect(await screen.findByText('Gestor Um')).toBeInTheDocument()
    expect(screen.getByText('Ana Atendente')).toBeInTheDocument()
    expect(screen.getByText('gestor@x.com')).toBeInTheDocument()
  })

  it('cria a conta pelo backend para confirma-la e vincular o funcionario', async () => {
    criarUsuario.mockResolvedValue({ erro: false })
    render(<Usuarios />)
    await screen.findByText('Gestor Um')

    fireEvent.click(screen.getByRole('button', { name: /Novo Usuario/i }))
    fireEvent.change(screen.getByPlaceholderText('Ex: Joao da Silva'), { target: { value: 'Carlos Mecânico' } })
    fireEvent.change(screen.getByPlaceholderText('usuario@oficina.com'), { target: { value: 'carlos@oficina.com' } })
    fireEvent.change(screen.getByPlaceholderText('Min. 8 caracteres'), { target: { value: 'Senha1234' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mecanico' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar Usuario' }))

    await waitFor(() => expect(criarUsuario).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Carlos Mecânico',
      email: 'carlos@oficina.com',
      senha: 'Senha1234',
      perfil: 'mecanico',
    })))
    expect(reloadDatabase).toHaveBeenCalled()
  })
})
