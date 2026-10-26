import { beforeEach, describe, expect, it, vi } from 'vitest'

// RN29: cinco falhas bloqueiam por 15 minutos. A suite principal simula o RPC
// e nunca conferia os parametros enviados a ele: trocar o limite para 6 ou a
// duracao para 14 minutos passava verde (mutantes sobreviventes da auditoria
// QA complementar de 25/10/2026, docs/AUDITORIA_QA_COMPLEMENTAR.md).

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  criarClienteAutenticacao: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../services/supabaseClient.js', () => ({
  criarClienteAutenticacao: mocks.criarClienteAutenticacao,
  supabase: { rpc: mocks.rpc, from: () => { throw new Error('Tabela inesperada no teste') } },
}))
vi.mock('../utils/auditLogger.js', () => ({ registrarAuditoria: vi.fn() }))
vi.mock('../utils/logger.js', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const { login } = await import('./authController.js')

const resposta = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() })
const requisicao = () => ({ body: { email: 'ana@exemplo.com', senha: 'qualquer' }, ip: '127.0.0.1' })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })
  mocks.criarClienteAutenticacao.mockReturnValue({ auth: { signInWithPassword: mocks.signInWithPassword } })
})

describe('RN29 — parametros do bloqueio e reserva recusada', () => {
  it('envia limite de 5 tentativas e bloqueio de 900 segundos em toda chamada ao RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 1, bloqueado_ate: null }], error: null })
    await login(requisicao(), resposta(), vi.fn())

    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    for (const [, parametros] of mocks.rpc.mock.calls) {
      expect(parametros).toMatchObject({ p_limite: 5, p_duracao_segundos: 900 })
    }
  })

  it('reserva nao permitida responde 429 sem consultar o provedor, mesmo sem prazo informado', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ permitido: false, reserva_confirmada: false, tentativas: 5, bloqueado_ate: null }], error: null })
    const res = resposta()
    await login(requisicao(), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'LOGIN_BLOQUEADO' }))
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })
})
