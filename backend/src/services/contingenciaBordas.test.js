// Casos de borda da troca de modelo do Gemini que as suítes
// comModeloAlternativo.test.js e modeloNasChamadas.test.js não cobrem:
// lista degenerada, entrada ausente, classificação de erro e o pior caso de
// latência. A troca de modelo é a única contingência do sistema — não há
// resposta local de substituição.
import { describe, it, expect, vi } from 'vitest'
import { comModeloAlternativo, comRetry, ehTransitorio } from './iaService.js'

describe('comModeloAlternativo com lista de modelos degenerada', () => {
  // Antes, lista vazia não executava nenhuma iteração e a função caía fora sem
  // `return` nem `throw`, devolvendo undefined: quem chamava fazia
  // `result.response.text()` e estourava um TypeError sem relação com a causa.
  // Agora falha com mensagem que diz o que aconteceu.
  it('falha dizendo que nao ha modelo configurado quando a lista esta vazia', async () => {
    const fn = vi.fn()
    await expect(comModeloAlternativo(fn, [])).rejects.toThrow('Nenhum modelo de IA configurado')
    expect(fn).not.toHaveBeenCalled()
  })

  it('funciona com um unico modelo e propaga o erro transitorio dele', async () => {
    vi.useFakeTimers()
    const fn = vi.fn(async () => { throw new Error('[503] high demand') })

    const p = comModeloAlternativo(fn, ['so-um'])
    const assertion = expect(p).rejects.toThrow('503')
    await vi.runAllTimersAsync()
    await assertion
    // 3 tentativas do comRetry, sem modelo seguinte para onde escapar
    expect(fn).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('nao chama o segundo modelo quando o primeiro responde na terceira tentativa', async () => {
    vi.useFakeTimers()
    const usados = []
    let n = 0
    const fn = vi.fn(async (modelo) => {
      usados.push(modelo)
      if (++n < 3) throw new Error('[503] overloaded')
      return 'ok no limite'
    })

    const p = comModeloAlternativo(fn, ['modelo-a', 'modelo-b'])
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('ok no limite')
    expect(usados).toEqual(['modelo-a', 'modelo-a', 'modelo-a'])
    vi.useRealTimers()
  })
})

describe('comRetry com contagem de tentativas degenerada', () => {
  // Mesmo buraco do `modelos = []`: zero tentativas devolve undefined em vez de
  // falhar. Não é alcançável pelo código atual (o default é 3), mas é a mesma
  // armadilha de "laço que termina sem return".
  it('devolve undefined sem chamar fn quando tentativas = 0', async () => {
    const fn = vi.fn()
    await expect(comRetry(fn, 0)).resolves.toBeUndefined()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('ehTransitorio com entrada ausente ou de tipo inesperado', () => {
  // O `e?.message || ''` protege contra todos estes; o teste trava essa
  // proteção para que ninguém a remova ao "limpar" o optional chaining.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['objeto sem message', {}],
    ['message vazia', new Error('')],
    ['message nao-string', Object.assign(new Error('x'), { message: 503 })],
  ])('nao classifica %s como transitorio (e nao lanca)', (_rotulo, entrada) => {
    expect(ehTransitorio(entrada)).toBe(false)
  })

  // Um `throw 'texto'` (string crua, sem Error) nunca é retentado, porque a
  // string não tem `.message`. O SDK do Gemini lança Error, então isto é
  // documentação do contrato, não bug: quem fizer um wrapper que relança string
  // perde silenciosamente as 3 tentativas e a troca de modelo.
  it('nao retenta quando o erro lancado e uma string crua com 503 dentro', () => {
    expect(ehTransitorio('503 high demand')).toBe(false)
  })
})

describe('ehTransitorio: numero solto na mensagem nao e codigo HTTP', () => {
  // Guarda de regressao. O regex antigo /\b(500|503|429)\b/ olhava a mensagem
  // inteira, sem exigir que o numero fosse o codigo HTTP: uma falha PERMANENTE
  // que contivesse 500, 503 ou 429 como token isolado (valor em reais, numero de
  // OS, cota ecoada num 401) era retentada 3 vezes x 2 modelos antes de falhar
  // igual. Hoje o codigo so conta se vier do `status`, entre colchetes ou no
  // inicio do texto. Quem voltar a varrer a mensagem inteira fica vermelho aqui.
  it.each([
    '400 invalid argument: item 500 nao encontrado',
    '404 model not found for request 429',
    '401 API key not valid (quota 503)',
  ])('deveria classificar "%s" como permanente', (msg) => {
    expect(ehTransitorio(new Error(msg))).toBe(false)
  })

  // Contraprova de que o \b faz PARTE do trabalho: numero colado em outro
  // digito nao casa. Este passa — mostra que o problema e o token isolado.
  it('nao casa numero embutido em outro numero (1500, 4290)', () => {
    expect(ehTransitorio(new Error('400 payload de 1500 bytes'))).toBe(false)
    expect(ehTransitorio(new Error('400 limite 4290'))).toBe(false)
  })
})

describe('timeout da propria chamada e retentavel', () => {
  // Observado em producao: POST /api/v1/ia/analisar devolvia
  // "AbortError: This operation was aborted" e NAO retentava. O timeout da
  // chamada e implementado pelo SDK com AbortController, e um abort e tempo
  // esgotado — a condicao retentavel canonica. Classificar como permanente
  // fazia a primeira chamada lenta derrubar a operacao inteira, sem retentar e
  // sem tentar o segundo modelo: o oposto do que esta camada existe para fazer.
  it('classifica AbortError como transitorio pelo name', () => {
    const e = new Error('This operation was aborted')
    e.name = 'AbortError'
    expect(ehTransitorio(e)).toBe(true)
  })

  it('classifica abort e timeout pelo texto, para erro sem name', () => {
    expect(ehTransitorio(new Error('This operation was aborted'))).toBe(true)
    expect(ehTransitorio(new Error('request timed out'))).toBe(true)
    expect(ehTransitorio(new Error('ETIMEDOUT'))).toBe(true)
  })

  it('retenta e troca de modelo quando a chamada estoura o tempo', async () => {
    vi.useFakeTimers()
    const usados = []
    const abortar = () => {
      const e = new Error('This operation was aborted')
      e.name = 'AbortError'
      throw e
    }
    const fn = vi.fn(async (modelo) => {
      usados.push(modelo)
      if (modelo === 'modelo-a') abortar()
      return 'resposta do b'
    })

    const p = comModeloAlternativo(fn, ['modelo-a', 'modelo-b'])
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('resposta do b')
    expect(usados).toEqual(['modelo-a', 'modelo-a', 'modelo-a', 'modelo-b'])
    vi.useRealTimers()
  })
})

describe('orcamento total da operacao', () => {
  // Sem orcamento, 6 chamadas x 15 s de teto davam 90 s: a funcao serverless era
  // morta pela plataforma no meio, o usuario esperava o teto inteiro e nada era
  // persistido. O orcamento garante que o pior caso cabe no maxDuration.
  it('passa a cada tentativa o menor entre o teto por chamada e o que resta', async () => {
    const tetos = []
    const fn = vi.fn(async (_modelo, timeout) => {
      tetos.push(timeout)
      return 'ok'
    })

    await comModeloAlternativo(fn, ['so-um'], 5000)
    // Orcamento (5 s) menor que o teto por chamada (15 s): vale o orcamento.
    expect(tetos[0]).toBeLessThanOrEqual(5000)
  })

  it('reserva tempo para o segundo modelo quando o primeiro fica pendurado', async () => {
    vi.useFakeTimers()
    const chamadas = []
    const fn = vi.fn((modelo, timeout) => new Promise((resolve, reject) => {
      chamadas.push({ modelo, timeout })
      setTimeout(() => {
        if (modelo === 'modelo-a') {
          const erro = new Error('This operation was aborted')
          erro.name = 'AbortError'
          reject(erro)
        } else {
          resolve('resposta do b')
        }
      }, modelo === 'modelo-a' ? timeout : 0)
    }))

    const p = comModeloAlternativo(fn, ['modelo-a', 'modelo-b'], 20000)
    const assertion = expect(p).resolves.toBe('resposta do b')
    await vi.runAllTimersAsync()
    await assertion

    expect(chamadas.map(({ modelo }) => modelo)).toEqual(['modelo-a', 'modelo-b'])
    expect(chamadas[0].timeout).toBe(15000)
    expect(chamadas[1].timeout).toBeLessThanOrEqual(5000)
    vi.useRealTimers()
  })

  it('nao dorme o backoff quando a espera nao cabe no orcamento', async () => {
    vi.useFakeTimers()
    const marcos = []
    const t0 = Date.now()
    const fn = vi.fn(async () => {
      marcos.push(Date.now() - t0)
      throw new Error('[503] overloaded')
    })

    // Orcamento de 500 ms: nao cabe o primeiro backoff (800 ms), entao cada
    // modelo recebe UMA tentativa e a operacao desiste sem esperar — 2 chamadas
    // em vez das 6 do caminho normal, e zero tempo de sono.
    const p = comModeloAlternativo(fn, ['modelo-a', 'modelo-b'], 500)
    const assertion = expect(p).rejects.toThrow('503')
    await vi.runAllTimersAsync()
    await assertion

    expect(fn).toHaveBeenCalledTimes(2)
    // Nenhum backoff foi dormido: as duas chamadas saem no mesmo instante.
    expect(marcos).toEqual([0, 0])
    vi.useRealTimers()
  })
})

describe('pior caso de latencia da contingencia', () => {
  // O comentario em iaService.js promete "~4,8 s". Isto confere a
  // aritmetica do backoff: 0,8 s + 1,6 s por modelo, 2 modelos = 4,8 s de
  // espera PURA, fora as 6 idas e voltas reais ao Gemini.
  it('acumula exatamente 4800 ms de backoff em 2 modelos x 3 tentativas', async () => {
    vi.useFakeTimers()
    const marcos = []
    const fn = vi.fn(async () => {
      marcos.push(Date.now())
      throw new Error('[503] overloaded')
    })

    const t0 = Date.now()
    const p = comModeloAlternativo(fn, ['modelo-a', 'modelo-b'])
    const assertion = expect(p).rejects.toThrow('503')
    await vi.runAllTimersAsync()
    await assertion

    expect(fn).toHaveBeenCalledTimes(6)
    // Instantes das 6 chamadas, relativos ao inicio
    expect(marcos.map(t => t - t0)).toEqual([0, 800, 2400, 2400, 3200, 4800])
    vi.useRealTimers()
  })
})
