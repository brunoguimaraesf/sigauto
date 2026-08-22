import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

// Mocka o cliente Supabase para não tocar em rede/banco real.
vi.mock('./services/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async (token) =>
        token === 'valido'
          ? { data: { user: { id: 'u1' } }, error: null }
          : { data: { user: null }, error: new Error('invalid') },
      ),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }),
  },
}))

const { default: app } = await import('./app.js')

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
  it('rota protegida sem token responde 401 TOKEN_AUSENTE', async () => {
    const res = await request(app).get('/api/v1/clientes')
    expect(res.status).toBe(401)
    expect(res.body.codigo).toBe('TOKEN_AUSENTE')
  })

  it('token inválido responde 401 TOKEN_INVALIDO', async () => {
    const res = await request(app)
      .get('/api/v1/clientes')
      .set('Authorization', 'Bearer token-qualquer')
    expect(res.status).toBe(401)
    expect(res.body.codigo).toBe('TOKEN_INVALIDO')
  })

  it('rota de IA sem token também é bloqueada', async () => {
    const res = await request(app).post('/api/v1/ia/analisar')
    expect(res.status).toBe(401)
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
