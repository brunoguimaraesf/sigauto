import { beforeEach, describe, expect, it, vi } from 'vitest'

// QA-11: o token do CAPTCHA chega ao Supabase Auth, e a recusa do CAPTCHA nao
// conta como senha errada no bloqueio da RN29.

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  criarClienteAutenticacao: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../services/supabaseClient.js', () => ({
  criarClienteAutenticacao: mocks.criarClienteAutenticacao,
  supabase: { rpc: mocks.rpc, from: () => { throw new Error('Tabela inesperada no teste') } },
}))
vi.mock('../utils/auditLogger.js', () => ({ registrarAuditoria: vi.fn() }))
vi.mock('../utils/logger.js', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const { login, forgotPassword } = await import('./authController.js')

const resposta = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
  mocks.rpc.mockResolvedValue({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
  mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  mocks.criarClienteAutenticacao.mockReturnValue({ auth: {
    signInWithPassword: mocks.signInWithPassword,
    resetPasswordForEmail: mocks.resetPasswordForEmail,
  } })
})

describe('QA-11 — CAPTCHA do Supabase Auth', () => {
  it('repassa o captchaToken ao provedor no login', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials', status: 400 } })
    await login({ body: { email: 'ana@exemplo.com', senha: 'x', captchaToken: 'tok-123' }, ip: '1' }, resposta(), vi.fn())
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@exemplo.com', password: 'x', options: { captchaToken: 'tok-123' } })
  })

  it('sem token mantem a chamada sem options', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials', status: 400 } })
    await login({ body: { email: 'ana@exemplo.com', senha: 'x' }, ip: '1' }, resposta(), vi.fn())
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@exemplo.com', password: 'x' })
  })

  it('CAPTCHA recusado responde 400 e libera a reserva sem registrar falha', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'captcha protection: request disallowed (invalid-input-response)', status: 400 } })
    const res = resposta()
    await login({ body: { email: 'ana@exemplo.com', senha: 'x', captchaToken: 'velho' }, ip: '1' }, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'CAPTCHA_INVALIDO' }))
    const operacoes = mocks.rpc.mock.calls.map(([, p]) => p.p_operacao)
    expect(operacoes).toEqual(['reservar', 'liberar'])
  })

  it('repassa o captchaToken na recuperacao de senha', async () => {
    await forgotPassword({ body: { email: 'ana@exemplo.com', captchaToken: 'tok-9' } }, resposta(), vi.fn())
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('ana@exemplo.com', expect.objectContaining({ captchaToken: 'tok-9' }))
  })
})
