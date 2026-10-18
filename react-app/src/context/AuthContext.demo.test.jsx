// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useContext, useState } from 'react'

// RN27/RN30 — o caminho que importa de verdade: com a bandeira de demonstracao
// desligada e sem Supabase configurado, `login` tem de RECUSAR a credencial de
// demonstracao, em vez de conceder `perfil: 'gestor'` validando a senha em
// JavaScript. O teste de `Login.demo.test.jsx` prova que o painel some; este
// prova que a concessao de privilegio some junto.
//
// Sem Supabase configurado o `supabaseClient` cai no cliente de contingencia,
// que recusa tudo; por isso o unico caminho possivel aqui seria o demo.

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(async () => ({ data: null, error: new Error('nao configurado') })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
  supabaseDb: { from: vi.fn() },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

// Sonda que expoe o resultado do login e o perfil resultante.
function montarSonda(AuthContext, AuthProvider) {
  function Sonda() {
    const { login, perfil } = useContext(AuthContext)
    const [erro, setErro] = useState('')
    const [entrou, setEntrou] = useState(false)
    return (
      <div>
        <button
          type="button"
          onClick={() => login('gestor@sigauto.com', 'Gestor123').then(
            () => setEntrou(true),
            (e) => setErro(e?.message || 'erro'),
          )}
        >
          entrar
        </button>
        <span data-testid="perfil">{perfil === null || perfil === undefined ? 'sem-perfil' : perfil}</span>
        <span data-testid="erro">{erro}</span>
        <span data-testid="entrou">{String(entrou)}</span>
      </div>
    )
  }
  return (
    <AuthProvider>
      <Sonda />
    </AuthProvider>
  )
}

const montar = async (bandeira) => {
  vi.stubGlobal('__DEMO_LOGIN__', bandeira)
  // Sem isto o `.env` de teste define VITE_SUPABASE_URL, `isSupabaseReal()` da
  // true e o ramo demo nem e alcancado — o teste passaria pelo motivo errado,
  // provando apenas que o cliente de contingencia recusa.
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  vi.resetModules()
  const { AuthContext, AuthProvider } = await import('./AuthContext.jsx')
  render(montarSonda(AuthContext, AuthProvider))
}

describe('AuthContext — login de demonstracao', () => {
  it('com a bandeira desligada, recusa a credencial de demonstracao e nao concede perfil', async () => {
    await montar(false)

    screen.getByRole('button', { name: 'entrar' }).click()

    await waitFor(() => expect(screen.getByTestId('erro').textContent).not.toBe(''))
    expect(screen.getByTestId('entrou')).toHaveTextContent('false')
    expect(screen.getByTestId('perfil')).toHaveTextContent('sem-perfil')
    // Mensagem generica: nao confirma que a conta existe.
    expect(screen.getByTestId('erro').textContent).not.toMatch(/Gestor123/)
  })

  it('com a bandeira ligada (servidor de desenvolvimento), o login de demonstracao funciona', async () => {
    await montar(true)

    screen.getByRole('button', { name: 'entrar' }).click()

    await waitFor(() => expect(screen.getByTestId('entrou')).toHaveTextContent('true'))
    expect(screen.getByTestId('perfil')).toHaveTextContent('gestor')
  })
})
