// @vitest-environment jsdom
// QA-11: com VITE_TURNSTILE_SITE_KEY definida, o login exige o token do
// CAPTCHA e o envia; sem a chave, a tela segue igual (testes de Login.test.jsx).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Login } from './Login'
import { useAuth } from '../context/AuthContext'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../supabaseClient', () => ({ supabase: { auth: { resetPasswordForEmail: vi.fn() } } }))

let login
let resolverCaptcha

beforeEach(() => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'chave-publica-teste')
  login = vi.fn().mockRejectedValue(Object.assign(new Error('E-mail ou senha incorretos.'), { status: 401 }))
  useAuth.mockReturnValue({ login, statusLogin: vi.fn() })
  window.turnstile = {
    render: vi.fn((_el, opcoes) => { resolverCaptcha = opcoes.callback; return 'w1' }),
    reset: vi.fn(),
    remove: vi.fn(),
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete window.turnstile
})

const preencherEEnviar = () => {
  fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'ana@exemplo.com' } })
  fireEvent.change(document.querySelector('input[type="password"]'), { target: { value: 'Senha1234' } })
  fireEvent.submit(document.querySelector('form'))
}

describe('Login — CAPTCHA (QA-11)', () => {
  it('nao chama o login sem o token do CAPTCHA', async () => {
    render(<MemoryRouter><Login /></MemoryRouter>)
    await waitFor(() => expect(window.turnstile.render).toHaveBeenCalled())
    preencherEEnviar()
    expect(await screen.findByText(/verificação de segurança/i)).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('envia o token e renova o widget depois da tentativa', async () => {
    render(<MemoryRouter><Login /></MemoryRouter>)
    await waitFor(() => expect(window.turnstile.render).toHaveBeenCalled())
    resolverCaptcha('tok-abc')
    preencherEEnviar()
    await waitFor(() => expect(login).toHaveBeenCalledWith('ana@exemplo.com', 'Senha1234', 'tok-abc'))
    await waitFor(() => expect(window.turnstile.reset).toHaveBeenCalledWith('w1'))
  })
})
