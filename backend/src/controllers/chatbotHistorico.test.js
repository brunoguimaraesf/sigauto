import { describe, it, expect, vi, beforeEach } from 'vitest'

// Guarda os argumentos do .range() para provar que offset e limite sao inteiros.
const chamadas = []
let resultado = { data: [], error: null, count: 7 }

vi.mock('../services/supabaseClient.js', () => {
  const alvo = {
    select: () => alvo,
    eq: () => alvo,
    order: () => alvo,
    range: (de, ate) => {
      chamadas.push([de, ate])
      return alvo
    },
    then: (ok, falha) => Promise.resolve(resultado).then(ok, falha),
  }
  return { supabase: { from: () => alvo } }
})

const { historico } = await import('./chatbotController.js')

const executar = async (query) => {
  const res = { status: vi.fn(() => res), json: vi.fn(() => res) }
  const next = vi.fn()
  await historico({ user: { id: 'u1' }, query }, res, next)
  return { res, next, corpo: res.json.mock.calls[0]?.[0] }
}

beforeEach(() => {
  chamadas.length = 0
  resultado = { data: [], error: null, count: 7 }
})

// RF11 — regressao: `parseInt('abc')` virava NaN e `.range(NaN, NaN)` estourava
// 500 (que, com NODE_ENV=development em producao, devolvia stack trace);
// `page=0` dava offset negativo; `count` nulo dava `totalPaginas: NaN`.
describe('GET /chatbot/historico — paginacao', () => {
  it('pagina e limite ausentes usam o padrao 1 e 50', async () => {
    const { corpo } = await executar({})
    expect(chamadas[0]).toEqual([0, 49])
    expect(corpo.paginacao).toMatchObject({ pagina: 1, limite: 50, totalPaginas: 1 })
  })

  it('limite nao numerico cai no padrao em vez de virar NaN', async () => {
    await executar({ limit: 'abc' })
    expect(chamadas[0]).toEqual([0, 49])
  })

  it('pagina zero ou negativa nao produz offset negativo', async () => {
    await executar({ page: '0' })
    expect(chamadas[0]).toEqual([0, 49])
    chamadas.length = 0
    await executar({ page: '-3' })
    expect(chamadas[0]).toEqual([0, 49])
  })

  it('pagina e limite validos sao respeitados', async () => {
    const { corpo } = await executar({ page: '3', limit: '10' })
    expect(chamadas[0]).toEqual([20, 29])
    expect(corpo.paginacao).toMatchObject({ pagina: 3, limite: 10, total: 7, totalPaginas: 1 })
  })

  it('limite acima do teto e cortado em 200', async () => {
    await executar({ limit: '99999' })
    expect(chamadas[0]).toEqual([0, 199])
  })

  it('total nulo devolve zero, nao NaN', async () => {
    resultado = { data: [], error: null, count: null }
    const { corpo } = await executar({})
    expect(corpo.paginacao.total).toBe(0)
    expect(corpo.paginacao.totalPaginas).toBe(0)
  })

  it('erro do banco vai para o next, sem responder 200', async () => {
    resultado = { data: null, error: new Error('falha do PostgREST'), count: null }
    const { next, res } = await executar({})
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.json).not.toHaveBeenCalled()
  })
})
