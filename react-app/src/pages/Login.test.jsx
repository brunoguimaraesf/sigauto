// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Login } from './Login'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  navegar: vi.fn(),
  recuperarSenha: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: mocks.login }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navegar }))
vi.mock('../supabaseClient', () => ({
  supabase: { auth: { resetPasswordForEmail: mocks.recuperarSenha } },
}))
vi.mock('../demoLogin', () => ({ DEMO_LOGIN_HABILITADO: false }))

beforeEach(() => {
  vi.resetAllMocks()
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
  it('RN29: bloqueia na quinta falha, impede novas chamadas antes de 15 minutos e libera na fronteira', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    mocks.login.mockRejectedValue(new Error('E-mail ou senha incorretos.'))
    const { container } = render(<Login />)
    const formulario = preencherLogin(container)
    const entrar = screen.getByRole('button', { name: 'Entrar no Sistema' })

    for (let tentativa = 1; tentativa <= 4; tentativa += 1) {
      await falharLogin(formulario)
      expect(mocks.login).toHaveBeenCalledTimes(tentativa)
      expect(entrar).toBeEnabled()
      expect(screen.getByText('E-mail ou senha incorretos.')).toBeInTheDocument()
    }

    await falharLogin(formulario)
    expect(mocks.login).toHaveBeenCalledTimes(5)
    expect(screen.getByText('Muitas tentativas incorretas. Acesso bloqueado por 15 minutos.')).toBeInTheDocument()
    expect(entrar).toBeDisabled()
    expect(screen.getByPlaceholderText('seu@email.com')).toBeDisabled()
    expect(container.querySelector('input[type="password"]')).toBeDisabled()

    // Disparar o submit também exercita a guarda, além do botão desabilitado.
    await falharLogin(formulario)
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60 * 1000 - 1) })
    await falharLogin(formulario)
    expect(mocks.login).toHaveBeenCalledTimes(5)
    expect(entrar).toBeDisabled()
    expect(screen.getByText('Acesso bloqueado. Tente novamente em 1 minuto(s).')).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(entrar).toBeEnabled()
    mocks.login.mockResolvedValueOnce(undefined)
    await act(async () => { fireEvent.submit(formulario) })
    expect(mocks.login).toHaveBeenCalledTimes(6)
    expect(mocks.login).toHaveBeenLastCalledWith('usuario@exemplo.com', 'senha-incorreta')
    expect(mocks.navegar).toHaveBeenCalledWith('/')
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
