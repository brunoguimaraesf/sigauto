// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Usuarios } from './Usuarios'

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
})
