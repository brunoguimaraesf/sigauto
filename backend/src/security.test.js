import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

// Mocka o Supabase para não tocar em rede/banco.
vi.mock('./services/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('invalid') })),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  },
}))

const { default: app } = await import('./app.js')

describe('Seguranca — headers (Helmet)', () => {
  it('define X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('nao expoe o header X-Powered-By', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('define X-Frame-Options (anti-clickjacking)', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-frame-options']).toBeDefined()
  })
})

describe('Seguranca — matriz de autenticacao (sem token = 401)', () => {
  // Superficie reduzida: o backend so expoe auth, chatbot e IA. O CRUD de dados
  // vai direto ao Supabase (RLS).
  const rotasProtegidas = [
    '/api/v1/chatbot/historico',
    '/api/v1/ia/recomendacoes',
  ]

  it.each(rotasProtegidas)('GET %s sem token responde 401 TOKEN_AUSENTE', async (rota) => {
    const res = await request(app).get(rota)
    expect(res.status).toBe(401)
    expect(res.body.codigo).toBe('TOKEN_AUSENTE')
  })

  it('token malformado responde 401 TOKEN_INVALIDO', async () => {
    const res = await request(app).get('/api/v1/chatbot/historico').set('Authorization', 'Bearer xxx')
    expect(res.status).toBe(401)
    expect(res.body.codigo).toBe('TOKEN_INVALIDO')
  })

  it('header Authorization sem "Bearer" tambem é rejeitado', async () => {
    const res = await request(app).get('/api/v1/chatbot/historico').set('Authorization', 'xxx')
    expect(res.status).toBe(401)
  })
})

describe('Seguranca — superficie reduzida (rotas CRUD legadas removidas)', () => {
  // As antigas rotas de dados rodavam com service_role (bypass de RLS) e foram
  // removidas; agora respondem 404, nao existem mais.
  const rotasRemovidas = ['/api/v1/clientes', '/api/v1/veiculos', '/api/v1/os', '/api/v1/estoque', '/api/v1/usuarios']

  it.each(rotasRemovidas)('GET %s nao existe mais (404)', async (rota) => {
    const res = await request(app).get(rota).set('Authorization', 'Bearer xxx')
    expect(res.status).toBe(404)
  })
})

describe('Seguranca — CORS', () => {
  it('responde ao preflight OPTIONS', async () => {
    const res = await request(app)
      .options('/api/v1/clientes')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
    expect([200, 204]).toContain(res.status)
  })
})
