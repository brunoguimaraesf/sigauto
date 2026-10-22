// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Login } from './Login'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  statusLogin: vi.fn(),
  navegar: vi.fn(),
  recuperarSenha: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: mocks.login, statusLogin: mocks.statusLogin }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navegar }))
vi.mock('../supabaseClient', () => ({
  supabase: { auth: { resetPasswordForEmail: mocks.recuperarSenha } },
}))
vi.mock('../demoLogin', () => ({ DEMO_LOGIN_HABILITADO: false }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.statusLogin.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

const preencherLogin = (container) => {
  fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'usuario@exemplo.com' } })
  fireEvent.change(container.querySelector('input[type="password"]'), { target: { value: 'senha-incorreta' } })
  return screen.getByRole('button', { name: 'Entrar no Sistema' }).closest('form')
}

const falharLogin = async (formulario) => {
  await act(async () => { fireEvent.submit(formulario) })
}

describe('RF08 — autenticação e recuperação de senha', () => {
  it('RN29/RNF-SE04: exibe o bloqueio devolvido pelo servidor e restaura o estado após recarregar', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    const bloqueadoAte = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    mocks.login.mockRejectedValue(Object.assign(new Error('Muitas tentativas incorretas.'), {
      status: 429,
      data: { codigo: 'LOGIN_BLOQUEADO', dados: { bloqueadoAte } },
    }))
    const { container, unmount } = render(<Login />)
    const formulario = preencherLogin(container)
    const entrar = screen.getByRole('button', { name: 'Entrar no Sistema' })

    await falharLogin(formulario)
    expect(mocks.login).toHaveBeenCalledOnce()
    expect(screen.getByText('Muitas tentativas incorretas. Acesso bloqueado por 15 minutos.')).toBeInTheDocument()
    expect(entrar).toBeDisabled()
    expect(screen.getByPlaceholderText('seu@email.com')).toBeDisabled()
    expect(container.querySelector('input[type="password"]')).toBeDisabled()

    // Um novo componente representa o reload: o estado vem do servidor ao consultar o e-mail.
    mocks.statusLogin.mockResolvedValueOnce(bloqueadoAte)
    unmount()
    render(<Login />)
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'usuario@exemplo.com' } })
    await act(async () => {
      fireEvent.blur(screen.getByPlaceholderText('seu@email.com'))
      await Promise.resolve()
    })
    expect(screen.getByText('Muitas tentativas incorretas. Acesso bloqueado por 15 minutos.')).toBeInTheDocument()
    const formularioReload = screen.getByRole('button', { name: 'Entrar no Sistema' }).closest('form')
    await falharLogin(formularioReload)
    expect(mocks.login).toHaveBeenCalledOnce()
    expect(mocks.statusLogin).toHaveBeenCalledWith('usuario@exemplo.com')

    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60 * 1000 - 1) })
    await falharLogin(formularioReload)
    expect(mocks.login).toHaveBeenCalledOnce()
    expect(screen.getByText('Acesso bloqueado. Tente novamente em 1 minuto(s).')).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(screen.getByRole('button', { name: 'Entrar no Sistema' })).toBeEnabled()
  })

  it.each([
    ['sucesso', () => Promise.resolve({ data: {}, error: null })],
    ['erro retornado pelo provedor', () => Promise.resolve({ data: null, error: { message: 'E-mail não cadastrado' } })],
    ['exceção de rede', () => Promise.reject(new Error('fetch failed: e-mail não cadastrado'))],
  ])('RN30: mantém a mesma confirmação de recuperação em caso de %s', async (_cenario, resposta) => {
    mocks.recuperarSenha.mockImplementation(resposta)
    render(<Login />)
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    const enviar = screen.getByRole('button', { name: 'Enviar Link' })
    const formulario = enviar.closest('form')
    fireEvent.change(formulario.querySelector('input[type="email"]'), { target: { value: 'desconhecido@exemplo.com' } })
    fireEvent.submit(formulario)

    await waitFor(() => expect(screen.getByText('Se este e-mail estiver cadastrado, você receberá as instruções em breve.')).toBeInTheDocument())
    expect(mocks.recuperarSenha).toHaveBeenCalledExactlyOnceWith('desconhecido@exemplo.com', {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    expect(screen.queryByRole('button', { name: 'Enviar Link' })).not.toBeInTheDocument()
    expect(screen.queryByText(/E-mail não cadastrado|fetch failed/)).not.toBeInTheDocument()
  })
})
