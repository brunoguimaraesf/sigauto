import { describe, it, expect } from 'vitest'
import { buscarResposta, RESPOSTAS_LOCAIS } from './chatbot.js'

describe('buscarResposta (roteamento de respostas locais)', () => {
  // Regressão: "reabastecidOS" contém "os", mas a pergunta é sobre estoque.
  // Antes, a regra casava "os" antes de "estoque" e devolvia a resposta errada.
  it('pergunta sobre reabastecer estoque NÃO cai na resposta de OS', () => {
    const r = buscarResposta('quais itens do estoque devem ser reabastecidos?')
    expect(r).toBe(RESPOSTAS_LOCAIS.estoque)
    expect(r).not.toBe(RESPOSTAS_LOCAIS.os)
  })

  it('reconhece perguntas sobre abrir OS', () => {
    expect(buscarResposta('Como abrir uma nova OS?')).toBe(RESPOSTAS_LOCAIS.os)
  })

  it('reconhece perguntas sobre encerrar', () => {
    expect(buscarResposta('Como encerrar uma ordem?')).toBe(RESPOSTAS_LOCAIS.encerrar)
  })

  it('reconhece perguntas sobre clientes', () => {
    expect(buscarResposta('Como inativar um cliente?')).toBe(RESPOSTAS_LOCAIS.cliente)
  })

  it('devolve fallback genérico para perguntas fora de escopo', () => {
    const r = buscarResposta('qual a previsão do tempo amanhã?')
    expect(r).toContain('Não encontrei')
  })
})
