import { describe, expect, it } from 'vitest'
import { prepararConsultaFinanceira, formatarRespostaFinanceira } from './consultaFinanceiraChatbot.js'

const AGORA = new Date('2026-10-20T15:00:00Z')
const mes = (mes, ano = 2026) => ({ tipo: 'mes', mes, ano })
const argumentos = (periodos = [mes(8)], metrica = 'faturamento') => ({ metrica, periodos })
const preparar = (args = argumentos(), pergunta = 'Qual o faturamento de agosto de 2026?', historico = []) => prepararConsultaFinanceira(args, pergunta, historico, AGORA)
const OS = [
  { status: 'concluida', data_encerramento: '2026-08-01T00:00:00-03:00', valor_total: 1000 },
  { status: 'concluida', data_encerramento: '2026-08-15T12:00:00-03:00', valor_total: '2000.00' },
  { status: 'concluida', data_abertura: '2026-07-01T00:00:00-03:00', data_encerramento: '2026-08-31T23:59:59.999-03:00', valor_total: 500 },
  { status: 'aberta', data_encerramento: null, valor_total: 9000 },
  { status: 'cancelada', data_encerramento: '2026-08-10T12:00:00-03:00', valor_total: 9000 },
  { status: 'concluida', data_encerramento: '2026-07-31T23:59:59.999-03:00', valor_total: 500 },
  { status: 'concluida', data_encerramento: '2026-09-01T00:00:00-03:00', valor_total: 750 },
  { status: 'concluida', data_encerramento: '2025-08-15T12:00:00-03:00', valor_total: 4000 },
]
const semEspacos = texto => texto.replace(/\s/g, '')
const responder = (plano, ordens = OS) => semEspacos(formatarRespostaFinanceira(plano, plano.periodos.map(() => ordens)))

describe('RF11 / RN39 / RN43 — consulta financeira determinística', () => {
  it('CHAT-01/07/08/09: soma valor final de OS concluídas nas fronteiras do mês em São Paulo', () => {
    const plano = preparar()
    expect(plano.periodos[0]).toEqual({ inicio: '2026-08-01T03:00:00.000Z', fim: '2026-09-01T03:00:00.000Z', rotulo: 'agosto de 2026' })
    expect(responder(plano)).toContain('R$3.500,00')
    expect(responder(plano)).toContain('3OS')
    expect(responder(plano)).toContain('apósdesconto')
  })

  it('CHAT-02: não mistura agosto de anos diferentes', () => {
    expect(responder(preparar(argumentos([mes(8, 2025)]), 'Quanto a oficina faturou em agosto de 2025?'))).toContain('R$4.000,00')
  })

  it('CHAT-08: qualificação de abertura não substitui o mês solicitado pelo encerramento', () => {
    const plano = preparar(argumentos(), 'Qual o faturamento de agosto de 2026? Inclua as OS abertas em julho e encerradas em agosto.')
    expect(responder(plano)).toContain('R$3.500,00')
    expect(plano.periodos).toHaveLength(1)
  })

  it('não ignora outra solicitação temporal arbitrária após a pergunta', () => {
    expect(preparar(argumentos(), 'Qual o faturamento de agosto de 2026? Consulte também julho de 2025.')).toHaveProperty('esclarecimento')
  })

  it.each(['Compare o ticket médio de agosto com julho de 2026', 'Compare a quantidade de OS concluídas de agosto com julho de 2026'])('não substitui a métrica de comparação por faturamento: %s', pergunta => {
    expect(preparar(argumentos([mes(8), mes(7)], 'comparacao_faturamento'), pergunta)).toHaveProperty('esclarecimento')
  })

  it('não converte continuação de comparação do ticket em comparação de faturamento', () => {
    expect(preparar(argumentos([mes(8), mes(7)], 'comparacao_faturamento'), 'E qual a diferença de agosto com julho de 2026?', [{ remetente: 'usuario', conteudo: 'Qual o ticket médio de agosto de 2026?' }])).toHaveProperty('esclarecimento')
  })

  it('não ignora o filtro de cliente para responder o total global', () => {
    expect(preparar(argumentos(), 'Qual o faturamento de agosto de 2026 somente do cliente João?')).toHaveProperty('esclarecimento')
  })

  it.each(['Qual o faturamento deste mês até ontem?', 'Qual o faturamento do mês passado até dia 15?'])('esclarece recortes relativos não suportados: %s', pergunta => {
    expect(preparar(argumentos([mes(10)]), pergunta)).toHaveProperty('esclarecimento')
  })

  it.each(['agosto', 'ago.', '08/2026', '2026-08'])('aceita o formato mensal %s preservando o ano informado', periodo => {
    const pergunta = `Faturamento ${periodo}${periodo.includes('2026') ? '' : ' de 2026'}`
    expect(preparar(argumentos(), pergunta)).toEqual(preparar())
  })

  it('CHAT-03: exige ano para mês sem ano mesmo que o modelo forneça um', () => {
    expect(preparar(argumentos(), 'Qual o faturamento do mês de agosto?')).toHaveProperty('esclarecimento')
    expect(preparar(argumentos(), 'Faturamento de agosto?', [{ remetente: 'usuario', conteudo: 'Em julho de 2026?' }])).toHaveProperty('esclarecimento')
  })

  it('CHAT-04: aceita o ano anterior apenas de mensagens do usuário em continuação', () => {
    const historico = [{ remetente: 'usuario', conteudo: 'Qual o faturamento de agosto de 2026?' }, { remetente: 'chatbot', conteudo: 'Em 2025 foram R$ 1,00.' }]
    for (const pergunta of ['E em setembro do mesmo ano?', 'E em setembro?']) {
      const plano = preparar(argumentos([mes(9)]), pergunta, historico)
      expect(plano.periodos[0].rotulo).toBe('setembro de 2026')
      expect(responder(plano)).toContain('R$750,00')
    }
  })

  it('retoma o mês após o usuário esclarecer somente o ano', () => {
    const historico = [{ remetente: 'usuario', conteudo: 'Qual o faturamento de agosto?' }, { remetente: 'chatbot', conteudo: 'Qual ano?' }]
    expect(preparar(argumentos(), '2026', historico)).toEqual(preparar())
  })

  it('não usa ano ou indicador inventado por resposta do modelo', () => {
    expect(preparar(argumentos([mes(9)]), 'E em setembro do mesmo ano?', [{ remetente: 'chatbot', conteudo: 'Faturamento agosto de 2026' }])).toHaveProperty('esclarecimento')
    expect(preparar(argumentos([mes(9)]), 'E em setembro do mesmo ano?', [{ role: 'model', content: 'Faturamento agosto de 2026' }])).toHaveProperty('esclarecimento')
  })

  it('não transforma pergunta de outro assunto em faturamento por causa do histórico', () => {
    const historico = [{ remetente: 'usuario', conteudo: 'Faturamento de agosto de 2026?' }]
    expect(preparar(argumentos([{ tipo: 'historico' }]), 'Qual o meu nome?', historico)).toHaveProperty('esclarecimento')
    expect(preparar(argumentos([mes(9)]), 'E o estoque em setembro de 2026?', historico)).toHaveProperty('esclarecimento')
  })

  it('CHAT-05: calcula ticket médio ao centavo sem refazer descontos', () => {
    expect(responder(preparar(argumentos([mes(8)], 'ticket_medio'), 'Qual o ticket médio em agosto de 2026?'))).toContain('R$1.166,67')
  })

  it('calcula quantidade de OS concluídas', () => {
    expect(responder(preparar(argumentos([mes(8)], 'ordens_concluidas'), 'Quantas OS foram concluídas em agosto de 2026?'))).toContain(':3,considerando3OS')
  })

  it('CHAT-06: compara agosto e julho com aumento de 600%', () => {
    const plano = preparar(argumentos([mes(8), mes(7)], 'comparacao_faturamento'), 'Compare agosto com julho de 2026.')
    const resposta = responder(plano)
    expect(resposta).toContain('R$3.500,00')
    expect(resposta).toContain('R$500,00')
    expect(resposta).toContain('+R$3.000,00')
    expect(resposta).toContain('600%')
  })

  it('CHAT-10: distingue ausência real de conclusões de erro e não divide por zero', () => {
    expect(responder(preparar(argumentos([mes(2)]), 'Faturamento de fevereiro de 2026?'))).toContain('R$0,00,considerando0OS')
    const plano = preparar(argumentos([mes(8), mes(2)], 'comparacao_faturamento'), 'Compare agosto com fevereiro de 2026')
    const resposta = responder(plano)
    expect(resposta).toContain('sembasepercentual')
    expect(resposta).not.toMatch(/Infinity|NaN/)
  })

  it('CHAT-11: período ausente significa histórico completo explicitamente identificado', () => {
    const plano = preparar(argumentos([{ tipo: 'historico' }]), 'Qual o faturamento?')
    expect(responder(plano)).toContain('todoo histórico'.replace(/\s/g, ''))
    expect(responder(plano)).toContain('R$8.750,00')
    expect(preparar(argumentos([{ tipo: 'ultimos_90_dias' }]), 'Qual o faturamento?')).toHaveProperty('esclarecimento')
  })

  it('últimos 90 dias somente se expressos na pergunta', () => {
    const plano = preparar(argumentos([{ tipo: 'ultimos_90_dias' }]), 'Qual o faturamento dos últimos 90 dias?')
    expect(responder(plano)).toContain('R$4.750,00')
    expect(plano.periodos[0].inicio).toBe('2026-07-22T15:00:00.000Z')
  })

  it('CHAT-12: lucro não é faturamento e não direciona a despesas inexistentes em Relatórios', () => {
    const plano = preparar(argumentos([], 'lucro_indisponivel'), 'Qual foi o lucro líquido de agosto?')
    const resposta = formatarRespostaFinanceira(plano, [])
    expect(resposta).toContain('não possui módulo financeiro')
    expect(resposta).not.toContain('Relatórios')
  })

  it.each(['01/08/2026 a 31/08/2026', '2026-08-01 a 2026-08-31'])('aceita intervalo inclusivo %s', periodo => {
    const plano = preparar(argumentos([{ tipo: 'intervalo', inicio: '2026-08-01', fim: '2026-08-31' }]), `Faturamento de ${periodo}`)
    expect(plano.periodos[0].fim).toBe('2026-09-01T03:00:00.000Z')
    expect(responder(plano)).toContain('R$3.500,00')
  })

  it('CHAT-09: respeita fim exclusivo antes da meia-noite de setembro', () => {
    const plano = preparar(argumentos([{ tipo: 'intervalo', inicio: '2026-08-01', fim: '2026-08-31' }]), 'Faturamento de 01/08/2026 00:00:00 até antes de 01/09/2026 00:00:00')
    expect(plano.periodos[0].fim).toBe('2026-09-01T03:00:00.000Z')
    expect(responder(plano)).toContain('R$3.500,00')
  })

  it.each([
    [argumentos([mes(8, 2025)]), 'Faturamento de agosto de 2026'],
    [argumentos([mes(9)]), 'Faturamento de agosto de 2026'],
    [argumentos([mes(8)]), 'Ticket médio de agosto de 2026'],
    [argumentos([mes(8)]), 'Faturamento de agosto de 2026 e 2025'],
    [argumentos([mes(8)]), 'Faturamento anual de 2026'],
    [argumentos([{ tipo: 'intervalo', inicio: '2026-02-30', fim: '2026-03-01' }]), 'Faturamento de 30/02/2026 a 01/03/2026'],
    [argumentos([{ tipo: 'intervalo', inicio: '2026-08-31', fim: '2026-08-01' }]), 'Faturamento de 31/08/2026 a 01/08/2026'],
    [argumentos([mes(8), mes(7)]), 'Faturamento de agosto de 2026'],
    [argumentos([mes(8)], 'comparacao_faturamento'), 'Compare agosto com julho de 2026'],
    [argumentos([mes(8)]), 'Faturamento de 08/2026, mas 2025'],
    [argumentos([mes(8)]), 'Faturamento de agosto e deste mês'],
    [argumentos([mes(9)]), 'Faturamento deste mês e mês passado'],
    [argumentos([{ tipo: 'historico' }]), 'Faturamento de ontem'],
    [argumentos([{ tipo: 'intervalo', inicio: '2026-08-01', fim: '2026-08-31' }]), 'Faturamento de 01/08/2026 12:00:00 a 31/08/2026 23:59:59'],
    [argumentos([{ tipo: 'intervalo', inicio: '2026-08-01', fim: '2026-08-31' }]), 'Faturamento de 01/08/2026 a 31/08/2026, mas 2025'],
  ])('esclarece quando argumentos divergem da pergunta ou datas são inválidas (%#)', (args, pergunta) => {
    expect(preparar(args, pergunta)).toHaveProperty('esclarecimento')
  })

  it.each([
    { ...argumentos(), sql: 'SELECT * FROM usuario' },
    argumentos([{ ...mes(8), tabela: 'usuario' }]),
    argumentos([{ tipo: 'mes', mes: '8', ano: 2026 }]),
    argumentos([{ tipo: 'mes', mes: 13, ano: 2026 }]),
    argumentos([{ tipo: 'mes', mes: 8, ano: 2026.5 }]),
    { metrica: 'SELECT', periodos: [] },
    Object.create(argumentos()),
    argumentos(new Array(1)),
    null,
  ])('recusa parâmetros fora da allowlist sem executar SQL (%#)', args => {
    expect(preparar(args)).toHaveProperty('esclarecimento')
  })

  it('não executa getters de objetos recebidos', () => {
    const args = Object.defineProperty({ periodos: [mes(8)] }, 'metrica', { get: () => { throw new Error('getter executado') } })
    expect(preparar(args)).toHaveProperty('esclarecimento')
  })

  it.each([null, '', '1,00', 'NaN', Infinity, -1, '1.001', Number.MAX_SAFE_INTEGER])('FALHA-01: valor inválido %s nunca vira zero', valor_total => {
    expect(() => responder(preparar(), [{ ...OS[0], valor_total }])).toThrow(/financeiro/)
  })

  it('FALHA-01: consulta incompleta ou data inválida nunca vira zero', () => {
    expect(() => formatarRespostaFinanceira(preparar(), [null])).toThrow()
    expect(() => formatarRespostaFinanceira(preparar(), [])).toThrow()
    expect(() => responder(preparar(), [{ ...OS[0], data_encerramento: null }])).toThrow()
    expect(() => responder(preparar(), [{ ...OS[0], data_encerramento: '2026-08-01T00:00:00' }])).toThrow()
  })

  it('resolve mês atual e anterior pela data local, inclusive na fronteira do ano', () => {
    const agora = new Date('2027-01-01T01:00:00Z') // ainda dezembro em São Paulo
    expect(prepararConsultaFinanceira(argumentos([mes(12)]), 'Faturamento deste mês', [], agora).periodos[0].rotulo).toBe('dezembro de 2026')
    expect(prepararConsultaFinanceira(argumentos([mes(11)]), 'Faturamento do mês passado', [], agora).periodos[0].rotulo).toBe('novembro de 2026')
  })

  it('usa offset histórico do fuso e não fixa -03:00', () => {
    const plano = preparar(argumentos([mes(1, 2018)]), 'Faturamento de janeiro de 2018')
    expect(plano.periodos[0].inicio).toBe('2018-01-01T02:00:00.000Z')
  })
})
