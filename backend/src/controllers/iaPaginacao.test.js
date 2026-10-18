// Paginacao de GET /ia/recomendacoes com query string hostil. A query vem do
// cliente: nao pode virar offset negativo, NaN no range nem leitura gigante.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  faixas: [],
  resultado: { data: [], error: null, count: 0 },
}))

vi.mock('../services/supabaseClient.js', () => ({
  supabase: {
    from: () => {
      const consulta = {
        select: () => consulta,
        order: () => consulta,
        range: (de, ate) => {
          estado.faixas.push({ de, ate })
          return Promise.resolve(estado.resultado)
        },
      }
      return consulta
    },
  },
}))

vi.mock('../services/iaService.js', () => ({ gerarRecomendacoesIA: vi.fn() }))

const { listarRecomendacoes } = await import('./iaController.js')

async function listar(query) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
  let erro = null
  await listarRecomendacoes({ query, user: { id: 'u1', perfil: 'gestor' } }, res, (e) => { erro = e })
  return { res, erro, corpo: res.json.mock.calls[0]?.[0], faixa: estado.faixas.at(-1) }
}

beforeEach(() => {
  estado.faixas = []
  estado.resultado = { data: [], error: null, count: 0 }
})

describe('listarRecomendacoes — paginacao invalida', () => {
  it('deve_usar_pagina_1_e_limite_10_sem_query', async () => {
    const { corpo, faixa } = await listar({})

    expect(corpo.paginacao).toMatchObject({ pagina: 1, limite: 10 })
    expect(faixa).toEqual({ de: 0, ate: 9 })
  })

  it.each([
    ['page nao numerica', { page: 'abc' }],
    ['page zero', { page: '0' }],
    ['page negativa', { page: '-5' }],
    ['page fracionaria', { page: '2.7' }],
    ['page em notacao cientifica', { page: '1e3' }],
    ['page vazia', { page: '' }],
    ['page nula', { page: null }],
    ['page booleana', { page: true }],
    ['page com injecao', { page: '1; DROP TABLE usuario' }],
    ['page com espacos', { page: ' 1 ' }],
    ['page Infinity', { page: 'Infinity' }],
  ])('deve_cair_para_pagina_1_com_%s', async (_nome, query) => {
    const { corpo, faixa } = await listar(query)

    expect(corpo.paginacao.pagina).toBe(1)
    expect(faixa.de).toBe(0)
  })

  it.each([
    ['limit nao numerico', { limit: 'muitos' }],
    ['limit zero', { limit: '0' }],
    ['limit negativo', { limit: '-20' }],
    ['limit vazio', { limit: '' }],
  ])('deve_cair_para_limite_10_com_%s', async (_nome, query) => {
    const { corpo } = await listar(query)

    expect(corpo.paginacao.limite).toBe(10)
  })

  it('deve_limitar_o_limite_em_50_mesmo_pedindo_10000', async () => {
    const { corpo, faixa } = await listar({ limit: '10000' })

    expect(corpo.paginacao.limite).toBe(50)
    expect(faixa).toEqual({ de: 0, ate: 49 })
  })

  it('deve_limitar_a_pagina_em_100000', async () => {
    const { corpo } = await listar({ page: '99999999999' })

    expect(corpo.paginacao.pagina).toBe(100000)
  })

  it('nunca_gera_offset_negativo_nem_NaN_no_range', async () => {
    for (const query of [{ page: '-1' }, { page: '0', limit: '0' }, { page: 'abc', limit: 'xyz' }, { page: '0.5' }]) {
      const { faixa } = await listar(query)
      expect(Number.isSafeInteger(faixa.de)).toBe(true)
      expect(Number.isSafeInteger(faixa.ate)).toBe(true)
      expect(faixa.de).toBeGreaterThanOrEqual(0)
      expect(faixa.ate).toBeGreaterThanOrEqual(faixa.de)
    }
  })

  it('deve_calcular_o_offset_a_partir_de_pagina_e_limite_validos', async () => {
    const { faixa, corpo } = await listar({ page: '3', limit: '20' })

    expect(faixa).toEqual({ de: 40, ate: 59 })
    expect(corpo.paginacao).toMatchObject({ pagina: 3, limite: 20 })
  })

  it('deve_calcular_totalPaginas_com_count_do_banco', async () => {
    estado.resultado = { data: [], error: null, count: 57 }

    const { corpo } = await listar({ limit: '20' })

    expect(corpo.paginacao).toMatchObject({ total: 57, totalPaginas: 3 })
  })

  it('deve_tratar_count_nulo_como_zero', async () => {
    estado.resultado = { data: [], error: null, count: null }

    const { corpo } = await listar({})

    expect(corpo.paginacao).toMatchObject({ total: 0, totalPaginas: 0 })
  })

  it('deve_encaminhar_erro_do_banco_ao_errorHandler', async () => {
    estado.resultado = { data: null, error: new Error('relation nao existe'), count: null }

    const { erro, res } = await listar({})

    expect(erro).toBeInstanceOf(Error)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('page_como_array_repetido_na_query_cai_no_padrao', async () => {
    // `?page=1&page=2` chega como array no Express.
    const { corpo } = await listar({ page: ['1', '2'] })

    expect(corpo.paginacao.pagina).toBe(1)
  })

  it('remove_id_usuario_e_metricas_do_modelo_da_projecao_do_historico', async () => {
    estado.resultado = {
      data: [{
        id: 'r1',
        id_usuario: 'u-secreto',
        criado_em: '2026-10-01',
        recomendacoes: { resumo: 'ok', metricas_do_modelo: { prompt: 'bruto' } },
      }],
      error: null,
      count: 1,
    }

    const { corpo } = await listar({})

    expect(corpo.dados[0].id_usuario).toBeUndefined()
    expect(corpo.dados[0].recomendacoes.metricas_do_modelo).toBeUndefined()
    expect(corpo.dados[0].recomendacoes.resumo).toBe('ok')
  })

  it('a_listagem_nao_filtra_por_usuario_e_devolve_analises_de_qualquer_gestor', async () => {
    // Observacao, nao bug confirmado: iaController.js:152-155 nao aplica
    // `.eq('id_usuario', req.user.id)`. A rota e restrita a gestor e o
    // id_usuario e removido da projecao, entao nao ha vazamento de identidade;
    // fica registrado porque difere do historico do chatbot, que filtra.
    await listar({})

    expect(estado.faixas).toHaveLength(1)
  })
})
