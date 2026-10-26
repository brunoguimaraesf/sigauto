import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { criarLimitadores } from './rateLimiters.js'

function appIsolado(opcoes) {
  const app = express()
  app.set('trust proxy', 1)
  const { loginRateLimiter, apiRateLimiter, iaRateLimiter } = criarLimitadores(opcoes)
  app.use('/api', apiRateLimiter)
  app.use('/api/login', loginRateLimiter)
  app.use('/api/ia', iaRateLimiter)
  app.use('/api/chatbot', iaRateLimiter)
  app.all('/api/{*rota}', (_req, res) => res.status(200).json({ ok: true }))
  return app
}

describe('rate limiting e recuperação', () => {
  it('limita login, envia Retry-After e recupera depois da janela', async () => {
    const app = appIsolado({ loginMax: 2, loginWindowMs: 80, apiMax: 100 })

    expect((await request(app).post('/api/login')).status).toBe(200)
    expect((await request(app).post('/api/login')).status).toBe(200)
    const bloqueada = await request(app).post('/api/login')

    expect(bloqueada.status).toBe(429)
    expect(bloqueada.body.codigo).toBe('MUITAS_TENTATIVAS')
    expect(Number(bloqueada.headers['retry-after'])).toBeGreaterThanOrEqual(1)

    await new Promise(resolve => setTimeout(resolve, 100))
    expect((await request(app).post('/api/login')).status).toBe(200)
  })

  it('compartilha o limite entre chatbot e IA sem bloquear outro IP', async () => {
    const app = appIsolado({ iaMax: 2, iaWindowMs: 1000, apiMax: 100 })
    const origemA = { 'X-Forwarded-For': '198.51.100.10' }
    const origemB = { 'X-Forwarded-For': '198.51.100.11' }

    expect((await request(app).get('/api/chatbot').set(origemA)).status).toBe(200)
    expect((await request(app).get('/api/ia').set(origemA)).status).toBe(200)
    const bloqueada = await request(app).get('/api/ia').set(origemA)

    expect(bloqueada.status).toBe(429)
    expect(bloqueada.body.codigo).toBe('RATE_LIMIT_IA')
    expect((await request(app).get('/api/ia').set(origemB)).status).toBe(200)
  })

  it('limita a API geral sem derrubar o health externo ao prefixo', async () => {
    const app = appIsolado({ apiMax: 2, apiWindowMs: 1000, iaMax: 100 })
    app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }))

    expect((await request(app).get('/api/qualquer')).status).toBe(200)
    expect((await request(app).get('/api/qualquer')).status).toBe(200)
    expect((await request(app).get('/api/qualquer')).status).toBe(429)
    expect((await request(app).get('/health')).status).toBe(200)
  })
})
