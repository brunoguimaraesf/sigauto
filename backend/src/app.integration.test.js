import { beforeEach, describe, it, expect, vi } from 'vitest'
import request from 'supertest'

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  refreshSession: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  criarClienteAutenticacao: vi.fn(),
  rpc: vi.fn(),
  registrarAuditoria: vi.fn(),
}))

// Mocka o cliente Supabase para não tocar em rede/banco real.
vi.mock('./services/supabaseClient.js', () => {
  mocks.criarClienteAutenticacao.mockReturnValue({ auth: {
    signInWithPassword: mocks.signInWithPassword,
    refreshSession: mocks.refreshSession,
    resetPasswordForEmail: mocks.resetPasswordForEmail,
  } })
  const perfisPorToken = new Map([
    ['token-atendente', 'atendente'],
    ['token-mecanico', 'mecanico'],
  ])

  return {
    criarClienteAutenticacao: mocks.criarClienteAutenticacao,
    supabase: {
      auth: {
        getUser: vi.fn(async (token) => {
          const perfil = perfisPorToken.get(token)
          return perfil
            ? { data: { user: { id: `u-${perfil}` } }, error: null }
            : { data: { user: null }, error: new Error('invalid') }
        }),
      },
      rpc: mocks.rpc,
      from: () => ({
        select: () => ({
          eq: (_coluna, id) => ({
            single: async () => {
              const perfil = id === 'u-atendente' ? 'atendente' : 'mecanico'
              return {
                data: { id, perfil, email: `${perfil}@teste.local`, ativo: true },
                error: null,
              }
            },
          }),
        }),
      }),
    },
  }
})

vi.mock('./utils/auditLogger.js', () => ({ registrarAuditoria: mocks.registrarAuditoria }))

const { default: app } = await import('./app.js')

beforeEach(() => {
  // O controlador deriva a chave HMAC do segredo service_role. O cliente
  // Supabase e o RPC são mockados, então use uma chave sintética nos testes.
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
  mocks.criarClienteAutenticacao.mockClear()
  mocks.signInWithPassword.mockReset()
  mocks.refreshSession.mockReset()
  mocks.resetPasswordForEmail.mockReset()
  mocks.rpc.mockReset().mockResolvedValue({ data: [{ permitido: true, reserva_confirmada: true, tentativas: 0, bloqueado_ate: null }], error: null })
  mocks.registrarAuditoria.mockResolvedValue(undefined)
})

describe('API — health e roteamento', () => {
  it('GET /health responde 200 com status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('rota inexistente responde 404', async () => {
    const res = await request(app).get('/api/v1/nao-existe')
    expect(res.status).toBe(404)
    expect(res.body.codigo).toBe('ROTA_NAO_ENCONTRADA')
  })
})

describe('API — autenticação', () => {
  it('faz login usando cliente público isolado e reserva no singleton privilegiado', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials', status: 400 } })
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'ana@teste.local', senha: 'incorreta' })
    expect(res.status).toBe(401)
    expect(mocks.criarClienteAutenticacao).toHaveBeenCalledOnce()
    expect(mocks.signInWithPassword).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('usa cliente isolado em refresh e reset, sem método de login no singleton privilegiado', async () => {
    mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: 'novo', refresh_token: 'refresh-novo' } }, error: null })
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    const refreshRes = await request(app).post('/api/v1/auth/refresh').send({ refresh_token: 'refresh-antigo' })
    const resetRes = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ana@teste.local' })
    expect(refreshRes.status).toBe(200)
    expect(resetRes.status).toBe(200)
    expect(mocks.refreshSession).toHaveBeenCalledOnce()
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledOnce()
    expect(mocks.criarClienteAutenticacao).toHaveBeenCalledTimes(2)
  })

  it('rota protegida sem token responde 401 TOKEN_AUSENTE', async () => {
    const res = await request(app).get('/api/v1/chatbot/historico')
    expect(res.status).toBe(401)
    expect(res.body.codigo).toBe('TOKEN_AUSENTE')
  })

  it('token inválido responde 401 TOKEN_INVALIDO', async () => {
    const res = await request(app)
      .get('/api/v1/chatbot/historico')
      .set('Authorization', 'Bearer token-qualquer')
    expect(res.status).toBe(401)
    expect(res.body.codigo).toBe('TOKEN_INVALIDO')
  })

  it('rota de IA sem token também é bloqueada', async () => {
    const res = await request(app).post('/api/v1/ia/analisar')
    expect(res.status).toBe(401)
  })

  it.each(['atendente', 'mecanico'])(
    'JWT válido de %s recebe 403 nas rotas exclusivas do gestor',
    async (perfil) => {
      const res = await request(app)
        .get('/api/v1/ia/recomendacoes')
        .set('Authorization', `Bearer token-${perfil}`)

      expect(res.status).toBe(403)
      expect(res.body.codigo).toBe('SEM_PERMISSAO')
    },
  )

  it('atendente nao pode criar conta pela operacao administrativa', async () => {
    const res = await request(app)
      .post('/api/v1/auth/usuarios')
      .set('Authorization', 'Bearer token-atendente')
      .send({ nome: 'Novo', email: 'novo@teste.local', senha: 'Senha1234', perfil: 'mecanico' })

    expect(res.status).toBe(403)
    expect(res.body.codigo).toBe('SEM_PERMISSAO')
  })
})

describe('API — rate limit dedicado da IA', () => {
  it('bloqueia após 10 requisições por minuto nas rotas de IA', async () => {
    let bloqueado = false
    for (let i = 0; i < 12; i++) {
      const res = await request(app).get('/api/v1/ia/recomendacoes')
      if (res.status === 429 && res.body.codigo === 'RATE_LIMIT_IA') {
        bloqueado = true
        break
      }
    }
    expect(bloqueado).toBe(true)
  })
})
