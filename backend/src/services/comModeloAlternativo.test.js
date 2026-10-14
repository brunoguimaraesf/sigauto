import { describe, it, expect, vi } from 'vitest'
import { comModeloAlternativo, MODELOS, ehTransitorio } from './iaService.js'

describe('ehTransitorio (o que vale retentar ou tentar em outro modelo)', () => {
  it.each([
    ['[503] high demand', true],
    ['429 rate limit exceeded', true],
    ['model is overloaded', true],
    // Observado na API em 13/10/2026 no gemini-3.5-flash-lite: sem isto, um 500
    // nao retenta nem troca de modelo, e cai direto no roteador local.
    ['[500] Internal error encountered.', true],
    ['401 API key not valid', false],
    ['400 invalid argument', false],
    ['404 model is no longer available to new users', false],
  ])('classifica "%s" como transitorio=%s', (msg, esperado) => {
    expect(ehTransitorio(new Error(msg))).toBe(esperado)
  })
})

describe('comModeloAlternativo (segundo modelo antes do fallback local)', () => {
  it('usa o primeiro modelo e nao toca no segundo quando ele responde', async () => {
    const usados = []
    const fn = vi.fn(async (modelo) => {
      usados.push(modelo)
      return 'resposta'
    })

    await expect(comModeloAlternativo(fn, ['modelo-a', 'modelo-b'])).resolves.toBe('resposta')
    expect(usados).toEqual(['modelo-a'])
  })

  it('passa para o segundo modelo quando o primeiro esgota as tentativas em erro transitorio', async () => {
    vi.useFakeTimers()
    const usados = []
    const fn = vi.fn(async (modelo) => {
      usados.push(modelo)
      if (modelo === 'modelo-a') throw new Error('503 high demand')
      return 'resposta do b'
    })

    const p = comModeloAlternativo(fn, ['modelo-a', 'modelo-b'])
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('resposta do b')
    // 3 tentativas no primeiro modelo, depois 1 no segundo
    expect(usados).toEqual(['modelo-a', 'modelo-a', 'modelo-a', 'modelo-b'])
    vi.useRealTimers()
  })

  it('NAO troca de modelo em erro nao-transitorio', async () => {
    const usados = []
    const fn = vi.fn(async (modelo) => {
      usados.push(modelo)
      throw new Error('401 unauthorized')
    })

    await expect(comModeloAlternativo(fn, ['modelo-a', 'modelo-b'])).rejects.toThrow('401')
    expect(usados).toEqual(['modelo-a'])
  })

  it('propaga o erro quando todos os modelos falham', async () => {
    vi.useFakeTimers()
    const fn = vi.fn(async () => { throw new Error('503 overloaded') })

    const p = comModeloAlternativo(fn, ['modelo-a', 'modelo-b'])
    const assertion = expect(p).rejects.toThrow('503')
    await vi.runAllTimersAsync()
    await assertion
    // 3 tentativas em cada um dos 2 modelos
    expect(fn).toHaveBeenCalledTimes(6)
    vi.useRealTimers()
  })

  it('a lista padrao de modelos esta pinada nos dois nomes medidos', () => {
    // Os DOIS nomes ficam pinados. Com `length > 1` apenas, trocar o alternativo
    // por um modelo morto deixava a suite verde e matava a contingencia em
    // producao — e 404 nao e transitorio, logo a troca de modelo nem acontece.
    expect(MODELOS).toEqual(['gemini-flash-lite-latest', 'gemini-3.1-flash-lite'])
  })

  // O ListModels da API anuncia modelos que respondem 404 "no longer available
  // to new users". Estes dois foram verificados como mortos em 13/10/2026; se
  // alguem os reintroduzir, a contingencia para de existir em silencio.
  it.each(['gemini-2.5-flash-lite', 'gemini-2.5-flash'])(
    'nao usa o modelo descontinuado %s',
    (morto) => {
      expect(MODELOS).not.toContain(morto)
    }
  )
})
