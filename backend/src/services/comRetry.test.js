import { describe, it, expect, vi } from 'vitest'
import { comRetry } from './claudeService.js'

describe('comRetry (retry da IA em erros transitórios)', () => {
  it('retorna o resultado quando a função sucede de primeira', async () => {
    const fn = vi.fn(async () => 'ok')
    await expect(comRetry(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retenta em erro 503 e sucede na terceira tentativa', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 3) throw new Error('[503] high demand')
      return 'ok'
    })
    const p = comRetry(fn, 3)
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('retenta em erro 429 (rate limit)', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 2) throw new Error('429 rate limit exceeded')
      return 'pronto'
    })
    const p = comRetry(fn, 3)
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('pronto')
    expect(fn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('NÃO retenta em erro não-transitório (falha imediata)', async () => {
    const fn = vi.fn(async () => { throw new Error('401 unauthorized') })
    await expect(comRetry(fn, 3)).rejects.toThrow('401')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('esgota as tentativas e propaga o erro', async () => {
    vi.useFakeTimers()
    const fn = vi.fn(async () => { throw new Error('503 overloaded') })
    const p = comRetry(fn, 2)
    const assertion = expect(p).rejects.toThrow('503')
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
