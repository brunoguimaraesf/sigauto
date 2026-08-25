import { describe, it, expect, vi, beforeEach } from 'vitest'

const DADOS = {
  cliente: [{ id: 'c1', nome: 'Rodrigo Rocha' }],
  veiculo: [{ id: 'v1', id_cliente: 'c1' }],
  ordem_servico: [
    { id_veiculo: 'v1', valor_total: 6495, status: 'concluida', data_abertura: '2026-08-01' },
  ],
  item_estoque: [{ nome: 'Filtro de oleo', quantidade: 1, qtd_minima: 5 }],
  servico_catalogo: [{ nome: 'Troca de oleo', preco: 120 }],
}

vi.mock('../services/supabaseClient.js', () => {
  const consulta = (tabela) => {
    const resultado = { data: DADOS[tabela] || [], error: null }
    // Precisa ser encadeável (.select().eq()) e aguardável em qualquer ponto.
    const alvo = {
      select: () => alvo,
      eq: () => alvo,
      order: () => alvo,
      limit: () => alvo,
      insert: async () => ({ data: null, error: null }),
      then: (ok, falha) => Promise.resolve(resultado).then(ok, falha),
    }
    return alvo
  }
  return { supabase: { from: consulta } }
})

const responderChatbot = vi.fn(async () => 'resposta qualquer')
vi.mock('../services/claudeService.js', () => ({ responderChatbot }))

const { mensagem } = await import('./chatbotController.js')

// Devolve o contexto exatamente como o modelo o recebeu.
async function contextoEnviadoAoModelo(perfil) {
  const req = {
    user: { id: 'u1', perfil },
    body: { pergunta: 'qual o faturamento da oficina?', historico: [] },
  }
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  await mensagem(req, res, (err) => { throw err })
  return responderChatbot.mock.calls[0][3]
}

beforeEach(() => vi.clearAllMocks())

describe('chatbot — o contexto entregue ao modelo respeita o perfil', () => {
  it('repassa o perfil de quem perguntou ao montar o contexto', async () => {
    await contextoEnviadoAoModelo('mecanico')

    expect(responderChatbot.mock.calls[0][1]).toBe('mecanico')
  })

  it('gestor recebe o faturamento', async () => {
    const contexto = await contextoEnviadoAoModelo('gestor')

    expect(contexto.totais.faturamento_total).toBe(6495)
    expect(contexto.ranking_clientes[0].total_gasto).toBe(6495)
  })

  it('mecanico não recebe faturamento, ranking nem estoque', async () => {
    const contexto = await contextoEnviadoAoModelo('mecanico')

    expect(contexto.totais.faturamento_total).toBeUndefined()
    expect(contexto.ranking_clientes).toBeUndefined()
    expect(contexto.estoque_em_alerta).toBeUndefined()
    expect(JSON.stringify(contexto)).not.toContain('6495')
  })

  it('atendente recebe cadastros e estoque, mas não valores financeiros', async () => {
    const contexto = await contextoEnviadoAoModelo('atendente')

    expect(contexto.totais.clientes).toBe(1)
    expect(contexto.estoque_em_alerta).toHaveLength(1)
    expect(contexto.totais.faturamento_total).toBeUndefined()
    expect(JSON.stringify(contexto)).not.toContain('6495')
  })
})
