// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// RN27/RN30 — regressao de seguranca: o painel de contas de demonstracao traz
// e-mail e senha de contas REAIS. So pode aparecer no servidor de
// desenvolvimento; em qualquer build a bandeira e falsa e o bloco nao existe.
//
// O vitest sobe `createServer`, entao `__DEMO_LOGIN__` seria sempre true aqui:
// o estado desligado precisa ser forcado, senao ninguem exercita o caminho que
// protege producao.

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: vi.fn() }) }))
vi.mock('../supabaseClient', () => ({
  supabase: { auth: { resetPasswordForEmail: vi.fn(async () => ({ error: null })) } },
}))

const renderizarLogin = async (bandeira) => {
  vi.stubGlobal('__DEMO_LOGIN__', bandeira)
  vi.resetModules()
  const { Login } = await import('./Login.jsx')
  render(<Login />)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('Login — painel de contas de demonstracao', () => {
  it('nao renderiza o painel nem a senha quando a bandeira esta desligada', async () => {
    await renderizarLogin(false)

    expect(screen.queryByText(/Contas de demonstração/i)).toBeNull()
    expect(screen.queryByText('gestor@sigauto.com')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Gestor123|Atend123|Mec123456/)
    // A tela de login em si continua de pe.
    expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument()
  })

  it('nao renderiza o painel quando a global nem existe', async () => {
    await renderizarLogin(undefined)

    expect(screen.queryByText(/Contas de demonstração/i)).toBeNull()
    expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument()
  })

  it('renderiza o painel no servidor de desenvolvimento', async () => {
    await renderizarLogin(true)

    expect(screen.getByText(/Contas de demonstração/i)).toBeInTheDocument()
    expect(screen.getByText('gestor@sigauto.com')).toBeInTheDocument()
  })
})
