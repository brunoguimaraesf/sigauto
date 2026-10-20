import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ consultas: [], ordens: [], falharPagina: null, insercoes: [], tools: [], historicos: 0 }))
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() { return { startChat: () => ({ sendMessage: async () => ({ response: {
      functionCalls: () => estado.tools,
      text: () => 'Nunca usar o total inventado 99999',
    } }) }) } }
  },
}))

vi.mock('../services/supabaseClient.js', () => ({ supabase: { from: tabela => {
  const consulta = { tabela, filtros: [], selecao: null, faixa: null, ordenacao: null, sinal: null }
  const alvo = {
    select: (campos, opcoes) => { consulta.selecao = [campos, opcoes]; return alvo },
    eq: (campo, valor) => { consulta.filtros.push(['eq', campo, valor]); return alvo },
    gte: (campo, valor) => { consulta.filtros.push(['gte', campo, valor]); return alvo },
    lt: (campo, valor) => { consulta.filtros.push(['lt', campo, valor]); return alvo },
    order: (campo, opcoes) => { consulta.ordenacao = [campo, opcoes]; return alvo },
    abortSignal: sinal => { consulta.sinal = sinal; return alvo },
    limit: () => alvo,
    range: (de, ate) => { consulta.faixa = [de, ate]; return alvo },
    insert: linhas => { estado.insercoes.push(linhas); return { abortSignal: async () => ({ error: null }) } },
    then: (ok, falha) => {
      estado.consultas.push(consulta)
      const financeira = consulta.selecao?.[0] === 'id, valor_total, status, data_encerramento'
      let dados = tabela === 'ordem_servico' ? estado.ordens : []
      if (tabela === 'mensagem_chatbot') estado.historicos++
      for (const [operador, campo, valor] of consulta.filtros) dados = dados.filter(linha => operador === 'eq' ? linha[campo] === valor : operador === 'gte' ? linha[campo] >= valor : linha[campo] < valor)
      const count = dados.length
      if (consulta.faixa) dados = dados.slice(consulta.faixa[0], consulta.faixa[1] + 1)
      const error = financeira && consulta.faixa?.[0] === estado.falharPagina ? new Error('falha na página financeira') : null
      return Promise.resolve({ data: error ? null : dados, error, count }).then(ok, falha)
    },
  }
  return alvo
} } }))

const { mensagem } = await import('./chatbotController.js')
const tool = () => ({ name: 'consultar_financeiro', args: { metrica: 'faturamento', periodos: [{ tipo: 'mes', mes: 8, ano: 2026 }] } })
async function executar(perfil = 'gestor', extras = {}) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
  const next = vi.fn()
  await mensagem({ user: { id: 'u1', perfil }, body: { pergunta: 'Qual o faturamento de agosto de 2026?', historico: [], ...extras } }, res, next)
  return { res, next, corpo: res.json.mock.calls[0]?.[0] }
}
const financeiras = () => estado.consultas.filter(consulta => consulta.selecao?.[0] === 'id, valor_total, status, data_encerramento')

beforeEach(() => {
  estado.consultas = []
  estado.ordens = []
  estado.falharPagina = null
  estado.insercoes = []
  estado.tools = [tool()]
  estado.historicos = 0
})

// RF11/RN39/RN43: verifica o controller e serviço reais, substituindo somente os provedores externos.
describe('chatbot financeiro — consulta autorizada e completa', () => {
  it('deve_somar_mais_de_1000_ordens_e_aplicar_campos_status_datas_ordenacao_e_paginas', async () => {
    estado.ordens = Array.from({ length: 1201 }, (_, i) => ({ id: `os-${String(i).padStart(5, '0')}`, valor_total: '1.00', status: 'concluida', data_encerramento: '2026-08-15T12:00:00.000Z' }))
    estado.ordens.push({ id: 'aberta', valor_total: '99999', status: 'aberta', data_encerramento: '2026-08-15T12:00:00.000Z' }, { id: 'fora', valor_total: '99999', status: 'concluida', data_encerramento: '2026-09-01T03:00:00.000Z' })
    const { res, next, corpo } = await executar()
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(corpo.dados.resposta.replace(/\s/g, ' ')).toContain('R$ 1.201,00')
    expect(corpo.dados.resposta).toContain('1201 OS concluída(s)')
    expect(financeiras().map(consulta => consulta.faixa)).toEqual([[0, 499], [500, 999], [1000, 1499]])
    for (const consulta of financeiras()) {
      expect(consulta.tabela).toBe('ordem_servico')
      expect(consulta.selecao).toEqual(['id, valor_total, status, data_encerramento', { count: 'exact' }])
      expect(consulta.ordenacao[0]).toBe('id')
      expect(consulta.sinal).toBeInstanceOf(AbortSignal)
      expect(consulta.filtros).toEqual([['eq', 'status', 'concluida'], ['gte', 'data_encerramento', '2026-08-01T03:00:00.000Z'], ['lt', 'data_encerramento', '2026-09-01T03:00:00.000Z']])
    }
  })

  it.each(['atendente', 'mecanico'])('deve_autorizar_%s_antes_da_consulta_financeira_mesmo_com_perfil_gestor_no_corpo', async perfil => {
    const { corpo, next } = await executar(perfil, { perfil: 'gestor', usuario: { perfil: 'gestor' } })
    expect(next).not.toHaveBeenCalled()
    expect(corpo.dados.resposta).toContain('restritas ao perfil gestor')
    expect(financeiras()).toEqual([])
  })

  it('deve_rejeitar_falha_na_segunda_pagina_sem_persistir_total_parcial_ou_zero', async () => {
    estado.ordens = Array.from({ length: 600 }, (_, i) => ({ id: `os-${i}`, valor_total: 10, status: 'concluida', data_encerramento: '2026-08-15T12:00:00.000Z' }))
    estado.falharPagina = 500
    const { next, res } = await executar()
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 503, codigo: 'DADOS_CHATBOT_INDISPONIVEIS' }))
    expect(res.json).not.toHaveBeenCalled()
    expect(estado.insercoes).toEqual([])
    expect(financeiras()).toHaveLength(2)
  })

  it('deve_rejeitar_argumentos_sql_sem_transforma_los_em_consulta', async () => {
    estado.tools[0].args.sql = 'select * from usuario'
    const { corpo } = await executar()
    expect(corpo.dados.resposta).toMatch(/Confirme|período/i)
    expect(financeiras()).toEqual([])
    expect(estado.consultas.some(consulta => consulta.tabela === 'usuario')).toBe(false)
  })

  it.each(['atendente', 'mecanico'])('deve_ignorar_historico_persistido_para_%s_rebaixado', async perfil => {
    await executar(perfil, { historico: undefined })
    expect(estado.historicos).toBe(0)
    expect(financeiras()).toEqual([])
  })
})
