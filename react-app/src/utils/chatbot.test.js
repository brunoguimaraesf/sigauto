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
    expect(buscarResposta('quero abrir uma ordem de serviço')).toBe(RESPOSTAS_LOCAIS.os)
  })

  it('reconhece estoque por várias palavras-chave', () => {
    expect(buscarResposta('como dar entrada de peça?')).toBe(RESPOSTAS_LOCAIS.estoque)
    expect(buscarResposta('preciso repor o estoque')).toBe(RESPOSTAS_LOCAIS.estoque)
  })

  it('reconhece encerrar', () => {
    expect(buscarResposta('Como encerrar uma ordem?')).toBe(RESPOSTAS_LOCAIS.encerrar)
    expect(buscarResposta('como fechar a OS?')).toBe(RESPOSTAS_LOCAIS.encerrar)
  })

  it('reconhece clientes', () => {
    expect(buscarResposta('Como inativar um cliente?')).toBe(RESPOSTAS_LOCAIS.cliente)
  })

  it('reconhece veículos', () => {
    expect(buscarResposta('como cadastrar um veículo?')).toBe(RESPOSTAS_LOCAIS.veiculo)
    expect(buscarResposta('onde informo a placa?')).toBe(RESPOSTAS_LOCAIS.veiculo)
  })

  it('reconhece dashboard, relatórios e usuários', () => {
    expect(buscarResposta('o que aparece no dashboard?')).toBe(RESPOSTAS_LOCAIS.dashboard)
    expect(buscarResposta('como ver os relatórios?')).toBe(RESPOSTAS_LOCAIS.relatorio)
    expect(buscarResposta('como gerenciar usuários?')).toBe(RESPOSTAS_LOCAIS.usuario)
  })

  it('devolve fallback genérico para perguntas fora de escopo', () => {
    expect(buscarResposta('qual a previsão do tempo amanhã?')).toContain('Não encontrei')
    expect(buscarResposta('')).toContain('Não encontrei')
  })
})
