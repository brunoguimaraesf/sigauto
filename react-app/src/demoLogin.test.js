import { describe, it, expect, vi, afterEach } from 'vitest'

// RN27/RN30 — regressao de seguranca. O painel de contas de demonstracao e o
// login sem servidor so podem existir no servidor de desenvolvimento. Em build
// de producao a bandeira e falsa, e esses caminhos tem de recusar.
//
// Sem este arquivo, nenhum teste exercitava o estado desligado: o vitest sobe
// `createServer`, entao `command === 'serve'` e a bandeira fica sempre ligada.

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const importarBandeira = async () => (await import('./demoLogin.js')).DEMO_LOGIN_HABILITADO

describe('DEMO_LOGIN_HABILITADO', () => {
  it('e verdadeira quando o define injeta true (servidor de desenvolvimento)', async () => {
    vi.stubGlobal('__DEMO_LOGIN__', true)
    vi.resetModules()
    expect(await importarBandeira()).toBe(true)
  })

  it('e falsa quando o define injeta false (qualquer build)', async () => {
    vi.stubGlobal('__DEMO_LOGIN__', false)
    vi.resetModules()
    expect(await importarBandeira()).toBe(false)
  })

  it('e falsa, sem lancar, quando a global nao existe', async () => {
    vi.stubGlobal('__DEMO_LOGIN__', undefined)
    vi.resetModules()
    await expect(importarBandeira()).resolves.toBe(false)
  })

  it('exige exatamente true: valor truthy qualquer nao habilita', async () => {
    vi.stubGlobal('__DEMO_LOGIN__', 'true')
    vi.resetModules()
    expect(await importarBandeira()).toBe(false)
  })
})
