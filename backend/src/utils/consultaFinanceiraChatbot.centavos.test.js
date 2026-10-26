import { describe, expect, it } from 'vitest'
import { prepararConsultaFinanceira, formatarRespostaFinanceira } from './consultaFinanceiraChatbot.js'

// RF11/RN39: o PostgREST pode devolver NUMERIC com uma casa ("10.5"). Ler essa
// fracao como 5 centavos em vez de 50 passava verde na suite principal
// (mutante sobrevivente da auditoria QA complementar de 25/10/2026).

const AGORA = new Date('2026-10-20T15:00:00Z')
const plano = () => prepararConsultaFinanceira(
  { metrica: 'faturamento', periodos: [{ tipo: 'mes', mes: 8, ano: 2026 }] },
  'Qual o faturamento de agosto de 2026?', [], AGORA,
)
const concluida = valor => ({ status: 'concluida', data_encerramento: '2026-08-10T12:00:00-03:00', valor_total: valor })
const responder = ordens => formatarRespostaFinanceira(plano(), [ordens]).replace(/\s/g, '')

describe('consulta financeira — centavos', () => {
  it('fracao de uma casa vale dezenas de centavos', () => {
    expect(responder([concluida('10.5'), concluida('0.1')])).toContain('R$10,60')
  })

  it('soma sem erro de ponto flutuante', () => {
    expect(responder([concluida('0.10'), concluida('0.20')])).toContain('R$0,30')
  })
})
