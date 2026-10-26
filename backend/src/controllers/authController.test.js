import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  signInWithPassword: vi.fn(),
  refreshSession: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  criarClienteAutenticacao: vi.fn(),
  rpc: vi.fn(),
  usuarioUpsert: vi.fn(),
  funcionarioUpsert: vi.fn(),
  registrarAuditoria: vi.fn(),
}))

vi.mock('../services/supabaseClient.js', () => ({
  criarClienteAutenticacao: mocks.criarClienteAutenticacao,
  supabase: {
    auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser } },
    rpc: mocks.rpc,
    from: (tabela) => {
      if (tabela === 'usuario') {
        return {
          upsert: (payload) => {
            mocks.usuarioUpsert(payload)
            return { select: () => ({ single: async () => ({ data: { ...payload }, error: null }) }) }
          },
          select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'usuario-1', nome: 'Ana', perfil: 'gestor', email: 'ana@exemplo.com', ativo: true }, error: null }) }) }),
        }
      }
      if (tabela === 'funcionario') {
        return { upsert: mocks.funcionarioUpsert }
      }
      throw new Error(`Tabela inesperada no teste: ${tabela}`)
    },
  },
}))

vi.mock('../utils/auditLogger.js', () => ({ registrarAuditoria: mocks.registrarAuditoria }))
vi.mock('../utils/logger.js', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const { criarUsuario, login, statusLogin, refresh, forgotPassword } = await import('./authController.js')

function resposta() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() }
}

function requisicao(body = {}) {
  return { body, user: { id: 'gestor-1', perfil: 'gestor' }, ip: '127.0.0.1' }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createUser.mockResolvedValue({ data: { user: { id: 'usuario-novo' } }, error: null })
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
  mocks.rpc.mockResolvedValue({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
  mocks.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'access', refresh_token: 'refresh' }, user: { id: 'usuario-1' } }, error: null })
  mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: 'novo-access', refresh_token: 'novo-refresh' } }, error: null })
  mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  mocks.criarClienteAutenticacao.mockReturnValue({ auth: {
    signInWithPassword: mocks.signInWithPassword,
    refreshSession: mocks.refreshSession,
    resetPasswordForEmail: mocks.resetPasswordForEmail,
  } })
  mocks.deleteUser.mockResolvedValue({ data: {}, error: null })
  mocks.funcionarioUpsert.mockResolvedValue({ data: null, error: null })
  mocks.registrarAuditoria.mockResolvedValue(undefined)
})

describe('bloqueio persistente de login (RN29/RNF-SE04)', () => {
  it('normaliza o e-mail e registra falha sem revelar se a conta existe', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })
    mocks.rpc.mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
      .mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 1, bloqueado_ate: null }], error: null })
    const res = resposta()
    await login(requisicao({ email: ' Ana@Exemplo.com ', senha: 'incorreta' }), res, vi.fn())

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'registrar_tentativa_login', expect.objectContaining({ p_chave: expect.any(String), p_operacao: 'reservar', p_reserva: expect.any(String) }))
    expect(mocks.rpc.mock.calls[0][1].p_chave).toMatch(/^[0-9a-f]{64}$/)
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'registrar_tentativa_login', expect.objectContaining({ p_operacao: 'falha', p_reserva: mocks.rpc.mock.calls[0][1].p_reserva }))
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.signInWithPassword.mock.invocationCallOrder[0])
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'Email ou senha incorretos.' }))
  })

  it('retorna 429 antes de consultar o provedor quando o bloqueio continua ativo', async () => {
    const bloqueadoAte = new Date(Date.now() + 60_000).toISOString()
    mocks.rpc.mockResolvedValueOnce({ data: [{ permitido: false, reserva_confirmada: false, tentativas: 5, bloqueado_ate: bloqueadoAte }], error: null })
    const res = resposta()
    await login(requisicao({ email: 'ana@exemplo.com', senha: 'qualquer' }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'LOGIN_BLOQUEADO', dados: { bloqueadoAte } }))
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it('recusa a reserva concorrente antes de iniciar outra autenticação', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ permitido: false, reserva_confirmada: false, tentativas: 0, bloqueado_ate: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    })
    const res = resposta()
    await login(requisicao({ email: 'ana@exemplo.com', senha: 'senha' }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(429)
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it('libera a reserva sem contar tentativa quando o provedor falha por transporte', async () => {
    mocks.signInWithPassword.mockRejectedValue(new Error('fetch failed'))
    mocks.rpc.mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
      .mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
    const next = vi.fn()
    await login(requisicao({ email: 'ana@exemplo.com', senha: 'senha' }), resposta(), next)
    expect(mocks.rpc).toHaveBeenLastCalledWith('registrar_tentativa_login', expect.objectContaining({ p_operacao: 'liberar' }))
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }))
  })

  it('propaga o bloqueio do hook nativo sem contar nova falha', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Muitas tentativas incorretas.', status: 429 },
    })
    mocks.rpc.mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
      .mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
    const res = resposta()
    const next = vi.fn()

    await login(requisicao({ email: 'ana@exemplo.com', senha: 'senha' }), res, next)

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'registrar_tentativa_login', expect.objectContaining({ p_operacao: 'reservar' }))
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'registrar_tentativa_login', expect.objectContaining({ p_operacao: 'liberar' }))
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'LOGIN_BLOQUEADO' }))
    expect(next).not.toHaveBeenCalled()
  })

  it('persiste estado consultável por e-mail e apaga tentativas somente após login válido', async () => {
    const resStatus = resposta()
    const bloqueadoAte = new Date(Date.now() + 60_000).toISOString()
    mocks.rpc.mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: false, tentativas: 5, bloqueado_ate: bloqueadoAte }], error: null })
    await statusLogin({ body: { email: 'ANA@EXEMPLO.COM' } }, resStatus, vi.fn())
    expect(resStatus.json).toHaveBeenCalledWith({ erro: false, dados: { bloqueadoAte } })
    const hashConsulta = mocks.rpc.mock.calls[0][1].p_chave

    mocks.rpc.mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
      .mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
    const resLogin = resposta()
    await login(requisicao({ email: 'ana@exemplo.com', senha: 'valida' }), resLogin, vi.fn())
    expect(mocks.rpc.mock.calls[1][1].p_chave).toBe(hashConsulta)
    expect(mocks.rpc).toHaveBeenLastCalledWith('registrar_tentativa_login', expect.objectContaining({ p_operacao: 'sucesso', p_reserva: mocks.rpc.mock.calls[1][1].p_reserva }))
    expect(resLogin.status).toHaveBeenCalledWith(200)
  })

  it('falha fechada se o armazenamento compartilhado estiver indisponível', async () => {
    const indisponivel = new Error('RPC indisponível')
    mocks.rpc.mockResolvedValueOnce({ data: null, error: indisponivel })
    const next = vi.fn()
    await login(requisicao({ email: 'ana@exemplo.com', senha: 'senha' }), resposta(), next)
    expect(next).toHaveBeenCalledWith(indisponivel)
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })
})

describe('cliente Supabase isolado para Auth', () => {
  it('usa cliente descartável com chave pública no login, sem autenticar o singleton privilegiado', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
      .mockResolvedValueOnce({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
    await login(requisicao({ email: 'ana@exemplo.com', senha: 'valida' }), resposta(), vi.fn())
    expect(mocks.criarClienteAutenticacao).toHaveBeenCalledOnce()
    expect(mocks.signInWithPassword).toHaveBeenCalledOnce()
  })

  it('isola refresh e redefinição de senha do singleton service_role', async () => {
    const resRefresh = resposta()
    await refresh({ body: { refresh_token: 'refresh-entrada' } }, resRefresh, vi.fn())
    expect(mocks.refreshSession).toHaveBeenCalledWith({ refresh_token: 'refresh-entrada' })
    expect(resRefresh.status).toHaveBeenCalledWith(200)

    const resReset = resposta()
    await forgotPassword({ body: { email: 'ana@exemplo.com' } }, resReset, vi.fn())
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('ana@exemplo.com', expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') }))
    expect(resReset.status).toHaveBeenCalledWith(200)
    expect(mocks.criarClienteAutenticacao).toHaveBeenCalledTimes(2)
  })
})

describe('criarUsuario', () => {
  it('recusa dados invalidos antes de chamar o Auth administrativo', async () => {
    const res = resposta()
    await criarUsuario(requisicao({ email: 'invalido', senha: '123' }), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('cria conta confirmada e vincula o funcionario correspondente', async () => {
    const req = requisicao({
      nome: 'Carlos Mecânico',
      email: 'CARLOS@EXEMPLO.COM',
      senha: 'Senha1234',
      perfil: 'mecanico',
      telefone: '(64) 99999-0000',
    })
    const res = resposta()
    const next = vi.fn()

    await criarUsuario(req, res, next)

    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'carlos@exemplo.com',
      email_confirm: true,
      password: 'Senha1234',
    }))
    expect(mocks.usuarioUpsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'usuario-novo', perfil: 'mecanico', ativo: true,
    }))
    expect(mocks.funcionarioUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ cargo: 'mecanico', id_usuario: 'usuario-novo', ativo: true }),
      { onConflict: 'id_usuario' },
    )
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      idUsuario: 'gestor-1', acao: 'CRIAR_USUARIO', idRegistro: 'usuario-novo',
    }))
    expect(res.status).toHaveBeenCalledWith(201)
    expect(next).not.toHaveBeenCalled()
  })

  it('traduz e-mail duplicado para conflito sem criar funcionario', async () => {
    mocks.createUser.mockResolvedValue({ data: {}, error: { message: 'User already registered' } })
    const res = resposta()

    await criarUsuario(requisicao({ nome: 'Ana', email: 'ana@exemplo.com', senha: 'Senha1234', perfil: 'atendente' }), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'EMAIL_JA_CADASTRADO' }))
    expect(mocks.funcionarioUpsert).not.toHaveBeenCalled()
  })

  it('remove a conta Auth se o vinculo de funcionario falhar', async () => {
    const falha = new Error('falha ao gravar funcionario')
    mocks.funcionarioUpsert.mockResolvedValue({ data: null, error: falha })
    const next = vi.fn()

    await criarUsuario(
      requisicao({ nome: 'Ana', email: 'ana@exemplo.com', senha: 'Senha1234', perfil: 'atendente' }),
      resposta(),
      next,
    )

    expect(mocks.deleteUser).toHaveBeenCalledWith('usuario-novo')
    expect(next).toHaveBeenCalledWith(falha)
  })
})
