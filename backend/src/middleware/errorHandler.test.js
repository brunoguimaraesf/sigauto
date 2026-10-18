// errorHandler: o que o cliente ve quando algo quebra. O risco aqui e
// vazamento — stack e mensagem interna nao podem sair em producao.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { errorHandler } from './errorHandler.js'

const NODE_ENV_ORIGINAL = process.env.NODE_ENV

function criarRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
}

const REQ = { method: 'POST', originalUrl: '/chatbot/mensagem' }

function tratar(err, ambiente) {
  process.env.NODE_ENV = ambiente
  const res = criarRes()
  errorHandler(err, REQ, res, vi.fn())
  return { res, corpo: res.json.mock.calls[0][0], status: res.status.mock.calls[0][0] }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.env.NODE_ENV = NODE_ENV_ORIGINAL
  vi.restoreAllMocks()
})

describe('errorHandler — fora de desenvolvimento', () => {
  it('nao_devolve_detalhes_nem_stack_em_producao', () => {
    const erro = new Error('senha do banco invalida em postgres://user:segredo@host')

    const { corpo } = tratar(erro, 'production')

    expect(corpo.detalhes).toBeUndefined()
    expect(JSON.stringify(corpo)).not.toContain('at ')
    // A chave existe no literal com valor undefined; o que importa e o corpo
    // serializado, que e o que trafega.
    expect(Object.keys(JSON.parse(JSON.stringify(corpo))).sort()).toEqual(['codigo', 'erro', 'mensagem'])
  })

  it('nao_devolve_detalhes_em_test_nem_com_NODE_ENV_ausente', () => {
    expect(tratar(new Error('x'), 'test').corpo.detalhes).toBeUndefined()

    delete process.env.NODE_ENV
    const res = criarRes()
    errorHandler(new Error('x'), REQ, res, vi.fn())
    expect(res.json.mock.calls[0][0].detalhes).toBeUndefined()
  })

  it('nao_aceita_Development_com_maiuscula_como_desenvolvimento', () => {
    const { corpo } = tratar(new Error('x'), 'Development')

    expect(corpo.detalhes).toBeUndefined()
  })

  it('nao_vaza_a_mensagem_interna_do_erro_em_producao', () => {
    const erro = new Error('connect ECONNREFUSED 10.0.0.7:5432 (db interno)')

    const { status, corpo } = tratar(erro, 'production')

    expect(status).toBe(500)
    expect(corpo.mensagem).toBe('Erro interno do servidor.')
    expect(JSON.stringify(corpo)).not.toContain('10.0.0.7')
  })

  it('deve_usar_mensagem_generica_em_5xx_sem_mensagem_propria', () => {
    const { corpo } = tratar(new Error('detalhe interno do postgres'), 'production')

    expect(corpo.mensagem).toBe('Erro interno do servidor.')
  })
})

describe('errorHandler — em desenvolvimento', () => {
  it('devolve_detalhes_com_stack_e_mensagem_original', () => {
    const erro = new Error('quebrou aqui')

    const { corpo } = tratar(erro, 'development')

    expect(corpo.detalhes).toBeDefined()
    expect(corpo.detalhes.original).toBe('quebrou aqui')
    expect(corpo.detalhes.stack).toContain('Error: quebrou aqui')
  })
})

describe('errorHandler — status, codigo e entradas estranhas', () => {
  it('usa_status_do_erro_quando_presente', () => {
    expect(tratar(Object.assign(new Error('nao achei'), { status: 404 }), 'production').status).toBe(404)
  })

  it('usa_statusCode_quando_nao_ha_status', () => {
    expect(tratar(Object.assign(new Error('invalido'), { statusCode: 422 }), 'production').status).toBe(422)
  })

  it('usa_500_e_ERRO_INTERNO_como_padrao', () => {
    const { status, corpo } = tratar(new Error('x'), 'production')

    expect(status).toBe(500)
    expect(corpo.codigo).toBe('ERRO_INTERNO')
    expect(corpo.erro).toBe(true)
  })

  it('preserva_codigo_e_mensagem_de_dominio_do_erro', () => {
    const erro = Object.assign(new Error('interno'), {
      status: 409,
      codigo: 'OS_JA_ENCERRADA',
      mensagem: 'Esta OS ja foi encerrada.',
    })

    const { corpo, status } = tratar(erro, 'production')

    expect(status).toBe(409)
    expect(corpo.codigo).toBe('OS_JA_ENCERRADA')
    expect(corpo.mensagem).toBe('Esta OS ja foi encerrada.')
  })

  it('aceita_erro_sem_message_e_responde_mensagem_padrao', () => {
    const { corpo, status } = tratar({}, 'production')

    expect(status).toBe(500)
    expect(corpo.mensagem).toBe('Erro interno do servidor.')
  })

  it('aceita_string_lancada_no_lugar_de_Error', () => {
    const { corpo, status } = tratar('falhou feio', 'production')

    expect(status).toBe(500)
    expect(corpo.mensagem).toBe('Erro interno do servidor.')
  })

  it.each(['bad', 0, 99, 600, 500.5])('normaliza_status_invalido_%s_para_500', (statusInvalido) => {
    const { status, corpo } = tratar(
      Object.assign(new Error('detalhe interno'), { status: statusInvalido }),
      'production'
    )

    expect(status).toBe(500)
    expect(corpo.mensagem).toBe('Erro interno do servidor.')
  })

  it('usa_statusCode_valido_quando_status_e_invalido', () => {
    const erro = Object.assign(new Error('invalido'), { status: 'bad', statusCode: 422 })

    expect(tratar(erro, 'production').status).toBe(422)
  })
})
