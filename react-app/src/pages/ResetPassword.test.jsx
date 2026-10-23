// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResetPassword } from './ResetPassword'

const mocks = vi.hoisted(() => ({
  setSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  navegar: vi.fn(),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navegar }))
vi.mock('../supabaseClient', () => ({
  supabase: { auth: { setSession: mocks.setSession, updateUser: mocks.updateUser, signOut: mocks.signOut } },
}))

const FRAGMENTO_VALIDO = '#access_token=acesso&refresh_token=renovacao&type=recovery'

const abrirComFragmento = (fragmento) => {
  window.history.replaceState(null, '', `/reset-password${fragmento}`)
}

const preencher = (nova, confirmacao) => {
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: nova } })
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: confirmacao } })
}

const enviar = async () => {
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Redefinir senha' }).closest('form')) })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.setSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
  mocks.updateUser.mockResolvedValue({ data: {}, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('RF08 — redefinição de senha pelo link do e-mail', () => {
  it('abre a sessão de recuperação do fragmento e remove os tokens da URL', async () => {
    abrirComFragmento(FRAGMENTO_VALIDO)
    render(<ResetPassword />)

    expect(await screen.findByLabelText('Nova senha')).toBeInTheDocument()
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'acesso', refresh_token: 'renovacao' })
    expect(window.location.hash).toBe('')
  })

  it('recusa link sem tokens de recuperação, sem tentar abrir sessão', async () => {
    abrirComFragmento('')
    render(<ResetPassword />)

    expect(await screen.findByText(/Link inválido ou expirado/)).toBeInTheDocument()
    expect(mocks.setSession).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument()
  })

  it('recusa fragmento de outro tipo de link', async () => {
    abrirComFragmento('#access_token=a&refresh_token=r&type=signup')
    render(<ResetPassword />)

    expect(await screen.findByText(/Link inválido ou expirado/)).toBeInTheDocument()
    expect(mocks.setSession).not.toHaveBeenCalled()
  })

  it('trata link expirado quando o Supabase recusa a sessão', async () => {
    abrirComFragmento(FRAGMENTO_VALIDO)
    mocks.setSession.mockResolvedValue({ data: { session: null }, error: new Error('expirado') })
    render(<ResetPassword />)

    expect(await screen.findByText(/Link inválido ou expirado/)).toBeInTheDocument()
  })

  it('exige senha com ao menos 8 caracteres', async () => {
    abrirComFragmento(FRAGMENTO_VALIDO)
    render(<ResetPassword />)
    await screen.findByLabelText('Nova senha')

    preencher('curta', 'curta')
    await enviar()

    expect(screen.getByRole('alert')).toHaveTextContent('pelo menos 8 caracteres')
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('exige que a confirmação seja igual à nova senha', async () => {
    abrirComFragmento(FRAGMENTO_VALIDO)
    render(<ResetPassword />)
    await screen.findByLabelText('Nova senha')

    preencher('senha-nova-1', 'senha-nova-2')
    await enviar()

    expect(screen.getByRole('alert')).toHaveTextContent('As senhas não conferem.')
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('troca a senha, encerra todas as sessões e leva ao login', async () => {
    abrirComFragmento(FRAGMENTO_VALIDO)
    render(<ResetPassword />)
    await screen.findByLabelText('Nova senha')

    preencher('senha-nova-1', 'senha-nova-1')
    await enviar()

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'senha-nova-1' })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(await screen.findByText(/Senha redefinida com sucesso/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ir para o login' }))
    expect(mocks.navegar).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('mostra erro específico quando a nova senha é igual à atual e não encerra a sessão', async () => {
    abrirComFragmento(FRAGMENTO_VALIDO)
    mocks.updateUser.mockResolvedValue({ data: null, error: Object.assign(new Error('same'), { code: 'same_password' }) })
    render(<ResetPassword />)
    await screen.findByLabelText('Nova senha')

    preencher('senha-nova-1', 'senha-nova-1')
    await enviar()

    expect(screen.getByRole('alert')).toHaveTextContent('diferente da senha atual')
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(screen.queryByText(/Senha redefinida com sucesso/)).not.toBeInTheDocument()
  })

  it('avisa quando o encerramento global das sessões devolve erro, sem afirmar sucesso total', async () => {
    abrirComFragmento(FRAGMENTO_VALIDO)
    // O supabase-js devolve `{ error }` em falha de rede/5xx, nao lanca excecao.
    mocks.signOut.mockResolvedValue({ error: new Error('rede') })
    render(<ResetPassword />)
    await screen.findByLabelText('Nova senha')

    preencher('senha-nova-1', 'senha-nova-1')
    await enviar()

    expect(await screen.findByText(/Senha redefinida com sucesso/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível encerrar as outras sessões')
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('não mostra aviso de sessões quando o encerramento global funciona', async () => {
    abrirComFragmento(FRAGMENTO_VALIDO)
    render(<ResetPassword />)
    await screen.findByLabelText('Nova senha')

    preencher('senha-nova-1', 'senha-nova-1')
    await enviar()

    await screen.findByText(/Senha redefinida com sucesso/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })

  it('descarta a sessão de recuperação quando a pessoa sai sem trocar a senha', async () => {
    abrirComFragmento(FRAGMENTO_VALIDO)
    const { unmount } = render(<ResetPassword />)
    await screen.findByLabelText('Nova senha')
    expect(mocks.signOut).not.toHaveBeenCalled()

    unmount()

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('não descarta a sessão ao desmontar enquanto o link ainda está sendo validado', () => {
    abrirComFragmento(FRAGMENTO_VALIDO)
    mocks.setSession.mockReturnValue(new Promise(() => {}))
    const { unmount } = render(<ResetPassword />)

    unmount()

    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
