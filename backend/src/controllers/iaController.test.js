import { describe, it, expect, vi, beforeEach } from 'vitest'

const diasAtras = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

// Janela atual (últimos 90 dias): 2 concluídas (100 + 200) + 1 aberta = 3 OS.
// Janela anterior (dos 180 aos 90 dias): 1 concluída de 150.
const ORDENS = [
  { status: 'concluida', valor_total: 100, data_abertura: diasAtras(10) },
  { status: 'concluida', valor_total: 200, data_abertura: diasAtras(20) },
  { status: 'aberta', valor_total: 0, data_abertura: diasAtras(5) },
  { status: 'concluida', valor_total: 150, data_abertura: diasAtras(120) },
]

const ESTOQUE = [
  { codigo: 'A', nome: 'Filtro', quantidade: 1, qtd_minima: 5, preco_unit: 10 },
  { codigo: 'B', nome: 'Óleo', quantidade: 0, qtd_minima: 2, preco_unit: 20 },
  { codigo: 'C', nome: 'Pastilha', quantidade: 50, qtd_minima: 5, preco_unit: 30 },
]

const DADOS = {
  ordem_servico: ORDENS,
  item_estoque: ESTOQUE,
  movimentacao_estoque: [],
}

vi.mock('../services/supabaseClient.js', () => {
  const consulta = (tabela) => {
    const resultado = Promise.resolve({ data: DADOS[tabela] || [], error: null })
    const encadeavel = {
      select: () => encadeavel,
      gte: () => resultado,
      eq: () => resultado,
      insert: () => ({
        select: () => ({ single: async () => ({ data: { id: 'rec-1' }, error: null }) }),
      }),
    }
    return encadeavel
  }
  return { supabase: { from: consulta } }
})

// O modelo devolve métricas propositalmente ERRADAS: o controller deve
// descartá-las e usar o que ele mesmo calculou.
const METRICAS_DO_MODELO = {
  total_os: 999,
  faturamento_estimado: 88888,
  itens_criticos_estoque: 777,
  taxa_crescimento: '+4200%',
}

vi.mock('../services/claudeService.js', () => ({
  gerarRecomendacoesIA: vi.fn(async () => ({
    resumo: 'resumo qualquer',
    recomendacoes: [],
    alertas: [],
    metricas_destaque: METRICAS_DO_MODELO,
  })),
}))

const { analisar } = await import('./iaController.js')

async function chamarAnalisar() {
  const req = { user: { id: 'u1' } }
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  await analisar(req, res, (err) => { throw err })
  return res.json.mock.calls[0][0].dados
}

beforeEach(() => vi.clearAllMocks())

describe('Painel IA — métricas são calculadas, não transcritas pela IA', () => {
  it('ignora os números do modelo e usa os do backend', async () => {
    const dados = await chamarAnalisar()

    expect(dados.metricas_destaque.total_os).toBe(3)
    expect(dados.metricas_destaque.faturamento_estimado).toBe(300)
    expect(dados.metricas_destaque.itens_criticos_estoque).toBe(2)
  })

  it('calcula a taxa de crescimento comparando com os 90 dias anteriores', async () => {
    const dados = await chamarAnalisar()

    // faturamento atual 300 contra 150 do período anterior = +100%
    expect(dados.metricas_destaque.taxa_crescimento).toBe('+100,0%')
  })

  it('preserva o que o modelo respondeu para permitir auditoria', async () => {
    const dados = await chamarAnalisar()

    expect(dados.metricas_do_modelo).toEqual(METRICAS_DO_MODELO)
  })

  it('mantém o texto gerado pela IA intacto', async () => {
    const dados = await chamarAnalisar()

    expect(dados.resumo).toBe('resumo qualquer')
  })
})
