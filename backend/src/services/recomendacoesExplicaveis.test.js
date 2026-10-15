import { describe, expect, it } from 'vitest'
import { validarRecomendacoes } from './recomendacoesExplicaveis.js'

const CATALOGO = {
  'faturamento.valor': {
    valor: 450,
    unidade: 'BRL',
    periodo_inicio: '2026-07-16T12:00:00.000Z',
    periodo_fim: '2026-10-14T12:00:00.000Z',
  },
  'estoque.itens_criticos': {
    valor: 2,
    unidade: 'itens',
    periodo_inicio: '2026-07-16T12:00:00.000Z',
    periodo_fim: '2026-10-14T12:00:00.000Z',
  },
}

function recomendacaoValida() {
  return {
    titulo: 'Priorizar reposição',
    descricao: 'Há itens abaixo do estoque mínimo.',
    prioridade: 'alta',
    categoria: 'estoque',
    acao_sugerida: 'Revisar os itens críticos com o responsável pelo estoque.',
    impacto_esperado: 'Melhor previsibilidade para o atendimento.',
    periodo: {
      inicio: '2026-07-16T12:00:00.000Z',
      fim: '2026-10-14T12:00:00.000Z',
    },
    evidencias: [
      { chave: 'faturamento.valor', valor: 450, unidade: 'BRL' },
      { chave: 'estoque.itens_criticos', valor: 2, unidade: 'itens' },
    ],
  }
}

const CAMPOS_TEXTUAIS_RECOMENDACAO = [
  'titulo',
  'descricao',
  'acao_sugerida',
  'impacto_esperado',
]

const ALEGACOES_QUANTITATIVAS = [
  ['algarismo', 'Comprar 500 unidades.'],
  ['moeda', 'Economizar R$ 999.999.'],
  ['percentual', 'Reduzir perdas em 100%.'],
  ['percentual por extenso', 'Aumentar o resultado por cento.'],
  ['numeral por extenso', 'Comprar cem unidades.'],
  ['moeda por extenso', 'Evitar perda de mil reais.'],
  ['moeda singular por extenso', 'Evitar perda de um real.'],
]

const TERMOS_POR_EXTENSO = [
  'dois', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quatorze', 'quinze', 'dezesseis',
  'dezessete', 'dezoito', 'dezenove', 'vinte', 'trinta', 'quarenta', 'cinquenta',
  'sessenta', 'setenta', 'oitenta', 'noventa', 'cem', 'cento', 'duzentos',
  'trezentas', 'quatrocentos', 'quinhentas', 'seiscentos', 'setecentas',
  'oitocentos', 'novecentas', 'mil', 'milhão', 'milhões', 'bilhão', 'bilhões',
  'dobro', 'triplo', 'metade', 'dezenas', 'centenas', 'milhares', 'reais',
  'dólar', 'dólares', 'euro', 'euros',
]

function alterarCampoTextual(recomendacao, campo, texto) {
  switch (campo) {
    case 'titulo': recomendacao.titulo = texto; break
    case 'descricao': recomendacao.descricao = texto; break
    case 'acao_sugerida': recomendacao.acao_sugerida = texto; break
    case 'impacto_esperado': recomendacao.impacto_esperado = texto; break
  }
}

describe('validarRecomendacoes', () => {
  it('mantém recomendação válida com duas evidências calculadas', () => {
    const resposta = {
      resumo: 'Resumo executivo.',
      recomendacoes: [recomendacaoValida()],
      alertas: [{ tipo: 'estoque', mensagem: 'Há itens críticos.', urgencia: 'alta' }],
      metricas_destaque: { faturamento: 999999 },
    }

    expect(validarRecomendacoes(resposta, CATALOGO)).toEqual({
      resumo: 'Resumo executivo.',
      recomendacoes: [recomendacaoValida()],
      alertas: [{ tipo: 'estoque', mensagem: 'Há itens críticos.', urgencia: 'alta' }],
      metricas_do_modelo: { faturamento: 999999 },
    })
  })

  it('remove evidências inexistentes, herdadas, adulteradas, com unidade ou período divergentes', () => {
    const catalogoComHeranca = Object.create({ 'herdada.perigosa': CATALOGO['faturamento.valor'] })
    Object.assign(catalogoComHeranca, CATALOGO)
    const recomendacao = recomendacaoValida()
    recomendacao.evidencias = [
      { chave: 'nao.existe', valor: 1, unidade: 'itens' },
      { chave: 'herdada.perigosa', valor: 450, unidade: 'BRL' },
      { chave: 'faturamento.valor', valor: 451, unidade: 'BRL' },
      { chave: 'faturamento.valor', valor: 450, unidade: 'real' },
      { chave: 'estoque.itens_criticos', valor: 2, unidade: 'itens' },
    ]
    recomendacao.periodo.fim = '2026-10-13T12:00:00.000Z'

    expect(validarRecomendacoes({ recomendacoes: [recomendacao] }, catalogoComHeranca).recomendacoes).toEqual([])
  })

  it('descarta recomendação com prioridade, categoria ou texto obrigatório inválido', () => {
    const prioridadeInvalida = recomendacaoValida()
    prioridadeInvalida.prioridade = 'urgente'
    const categoriaInvalida = recomendacaoValida()
    categoriaInvalida.categoria = 'marketing'
    const textoVazio = recomendacaoValida()
    textoVazio.acao_sugerida = '   '

    const resultado = validarRecomendacoes({
      recomendacoes: [prioridadeInvalida, categoriaInvalida, textoVazio],
    }, CATALOGO)

    expect(resultado.recomendacoes).toEqual([])
  })

  it.each(CAMPOS_TEXTUAIS_RECOMENDACAO.flatMap((campo) => (
    ALEGACOES_QUANTITATIVAS.map(([categoria, texto]) => [campo, categoria, texto])
  )))(
    'descarta recomendação quando %s contém %s fora das evidências',
    (campo, _categoria, texto) => {
      const recomendacao = recomendacaoValida()
      alterarCampoTextual(recomendacao, campo, texto)

      expect(validarRecomendacoes({ recomendacoes: [recomendacao] }, CATALOGO).recomendacoes).toEqual([])
    },
  )

  it('não lança para resposta ou listas malformadas', () => {
    expect(() => validarRecomendacoes(null, null)).not.toThrow()
    expect(validarRecomendacoes(null, null)).toEqual({
      resumo: '',
      recomendacoes: [],
      alertas: [],
      metricas_do_modelo: null,
    })
    expect(validarRecomendacoes({ resumo: 42, recomendacoes: {}, alertas: 'alerta' }, CATALOGO)).toMatchObject({
      resumo: '',
      recomendacoes: [],
      alertas: [],
      metricas_do_modelo: null,
    })
  })

  it('descarta alerta sem texto obrigatório ou urgência permitida', () => {
    const resultado = validarRecomendacoes({
      alertas: [
        { tipo: 'estoque', mensagem: 'Item abaixo do mínimo.', urgencia: 'media' },
        { tipo: '', mensagem: 'Sem tipo.', urgencia: 'alta' },
        { tipo: 'estoque', mensagem: '   ', urgencia: 'alta' },
        { tipo: 'estoque', mensagem: 'Urgência inválida.', urgencia: 'agora' },
      ],
    }, CATALOGO)

    expect(resultado.alertas).toEqual([
      { tipo: 'estoque', mensagem: 'Item abaixo do mínimo.', urgencia: 'media' },
    ])
  })

  it.each([
    ['algarismos', 'Há 100 itens críticos.'],
    ['moeda', 'O faturamento foi R$ 999.999.'],
    ['percentual', 'A demanda cresceu 12%.'],
    ['percentual por extenso', 'A demanda cresceu por cento.'],
  ])('descarta resumo com alegação quantitativa por %s', (_tipo, resumo) => {
    expect(validarRecomendacoes({ resumo }, CATALOGO).resumo).toBe('')
  })

  it.each(TERMOS_POR_EXTENSO)('descarta termo quantitativo por extenso no resumo: %s', (termo) => {
    expect(validarRecomendacoes({ resumo: `Há ${termo} pendências.` }, CATALOGO).resumo).toBe('')
  })

  it.each([
    ['algarismos na mensagem', 'estoque', '100 itens estão críticos.'],
    ['moeda na mensagem', 'financeiro', 'O impacto é de R$ 999.999.'],
    ['percentual na mensagem', 'operacional', 'A variação foi de 12%.'],
    ['algarismos no tipo', '2 pendências', 'Atenção ao estoque.'],
  ])('descarta alerta com %s', (_caso, tipo, mensagem) => {
    const resultado = validarRecomendacoes({
      alertas: [{ tipo, mensagem, urgencia: 'alta' }],
    }, CATALOGO)

    expect(resultado.alertas).toEqual([])
  })

  it.each(TERMOS_POR_EXTENSO)('descarta termo quantitativo por extenso em alerta: %s', (termo) => {
    const resultado = validarRecomendacoes({
      alertas: [{ tipo: 'estoque', mensagem: `Há ${termo} pendências.`, urgencia: 'alta' }],
    }, CATALOGO)

    expect(resultado.alertas).toEqual([])
  })

  it('mantém artigos indefinidos e palavras maiores que apenas contêm os termos', () => {
    const recomendacao = recomendacaoValida()
    recomendacao.titulo = 'Uma avaliação de equipamento'
    recomendacao.descricao = 'Um processo pode ser melhorado com calma.'
    recomendacao.acao_sugerida = 'Revisar o documento milhagem antes do atendimento.'
    recomendacao.impacto_esperado = 'Uma rotina mais clara para a equipe.'

    expect(validarRecomendacoes({ recomendacoes: [recomendacao] }, CATALOGO).recomendacoes)
      .toEqual([recomendacao])
  })

  it('mantém real qualitativo no resumo e em todos os campos da recomendação', () => {
    const recomendacao = recomendacaoValida()
    recomendacao.titulo = 'Impacto real na operação'
    recomendacao.descricao = 'Avaliar o resultado real do processo.'
    recomendacao.acao_sugerida = 'Registrar o impacto real observado pela equipe.'
    recomendacao.impacto_esperado = 'Uma visão real das prioridades da oficina.'

    const resultado = validarRecomendacoes({
      resumo: 'Há impacto real na operação.',
      recomendacoes: [recomendacao],
    }, CATALOGO)

    expect(resultado.resumo).toBe('Há impacto real na operação.')
    expect(resultado.recomendacoes).toEqual([recomendacao])
  })

  it.each(['um real', 'cem reais', 'mil reais'])('descarta moeda por extenso no resumo: %s', (moeda) => {
    expect(validarRecomendacoes({ resumo: `Evitar perda de ${moeda}.` }, CATALOGO).resumo).toBe('')
  })

  it('preserva as métricas do modelo apenas para auditoria', () => {
    const metricasDoModelo = { faturamento: 999999 }
    const resultado = validarRecomendacoes({ metricas_destaque: metricasDoModelo }, CATALOGO)

    expect(resultado.metricas_do_modelo).toBe(metricasDoModelo)
    expect(resultado).not.toHaveProperty('metricas_destaque')
  })
})
