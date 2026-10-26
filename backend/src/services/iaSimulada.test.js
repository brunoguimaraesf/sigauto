import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('IA simulada para ensaio local', () => {
  it('só ativa com bandeira explícita e Supabase local fora de produção', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('SIGAUTO_AMBIENTE_TESTE', 'on')
    vi.stubEnv('SIGAUTO_IA_SIMULADA', 'on')
    vi.stubEnv('SIGAUTO_IA_SIMULADA_MS', '0')
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321')
    const { gerarRecomendacoesIA, iaSimuladaAtiva } = await import('./iaService.js')

    expect(iaSimuladaAtiva()).toBe(true)
    await expect(gerarRecomendacoesIA({})).resolves.toEqual(expect.objectContaining({
      resumo: 'Análise simulada para ensaio local.',
      recomendacoes: [],
    }))
  })

  it('recusa a simulação em produção ou contra Supabase remoto', async () => {
    vi.stubEnv('SIGAUTO_AMBIENTE_TESTE', 'on')
    vi.stubEnv('SIGAUTO_IA_SIMULADA', 'on')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321')
    let modulo = await import('./iaService.js')
    expect(modulo.iaSimuladaAtiva()).toBe(false)

    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('SUPABASE_URL', 'https://projeto.supabase.co')
    vi.resetModules()
    modulo = await import('./iaService.js')
    expect(modulo.iaSimuladaAtiva()).toBe(false)
  })
})
