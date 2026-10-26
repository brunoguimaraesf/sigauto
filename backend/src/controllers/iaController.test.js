import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  respostas: {},
  consultas: [],
  filtros: [],
  insercoes: [],
  resultadoPersistencia: { data: { id: 'rec-1' }, error: null },
  consultasHistorico: [],
  ordenacoesHistorico: [],
  faixasHistorico: [],
  resultadoListagem: { data: [], error: null, count: 0 },
  agregado: null,
}))

vi.mock('../services/supabaseClient.js', () => {
  function criarConsulta(tabela) {
    const consulta = {
      select: vi.fn((colunas) => {
        estado.consultas.push({ tabela, colunas })
        return consulta
      }),
      gte: vi.fn((coluna, valor) => {
        estado.filtros.push({ tabela, tipo: 'gte', coluna, valor })
        return consulta
      }),
      eq: vi.fn((coluna, valor) => {
        estado.filtros.push({ tabela, tipo: 'eq', coluna, valor })
        return consulta
      }),
      then: (resolver, rejeitar) => Promise.resolve(estado.respostas[tabela]).then(resolver, rejeitar),
    }
    return consulta
  }

  function criarConsultaHistorico() {
    const consulta = {
      select: vi.fn((colunas, opcoes) => {
        estado.consultasHistorico.push({ colunas, opcoes })
        return consulta
      }),
      order: vi.fn((coluna, opcoes) => {
        estado.ordenacoesHistorico.push({ coluna, opcoes })
        return consulta
      }),
      range: vi.fn((inicio, fim) => {
        estado.faixasHistorico.push({ inicio, fim })
        return Promise.resolve(estado.resultadoListagem)
      }),
    }
    return consulta
  }

  return {
    supabase: {
      from: vi.fn((tabela) => {
        if (tabela !== 'recomendacao_ia') return criarConsulta(tabela)

        return {
          ...criarConsultaHistorico(),
          insert: vi.fn((dados) => {
            estado.insercoes.push(dados)
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => estado.resultadoPersistencia),
              })),
            }
          }),
        }
      }),
    },
  }
})

vi.mock('../services/metricasPainelIA.js', () => ({
  calcularMetricasPainelIA: vi.fn(() => estado.agregado),
}))

const METRICAS_DO_MODELO = {
  faturamento: 88888,
  ordens_abertas: 999,
  itens_criticos: 777,
}

vi.mock('../services/iaService.js', () => ({
  iaSimuladaAtiva: vi.fn(() => false),
  gerarRecomendacoesIA: vi.fn(async () => ({
    resumo: 'resumo do modelo',
    recomendacoes: [],
    alertas: [],
    metricas_destaque: METRICAS_DO_MODELO,
  })),
}))

const { analisar } = await import('./iaController.js')
const { listarRecomendacoes } = await import('./iaController.js')
const { gerarRecomendacoesIA } = await import('../services/iaService.js')
const { calcularMetricasPainelIA } = await import('../services/metricasPainelIA.js')

const REFERENCIA = new Date('2026-10-14T12:00:00.000Z')
const LIMITE_MOVIMENTACOES = '2026-04-17T12:00:00.000Z'

const ORDENS = [{
  id: 'os-1',
  numero_os: 42,
  id_veiculo: 'veiculo-1',
  id_mecanico: 'funcionario-1',
  status: 'aberta',
  valor_total: 120,
  data_abertura: '2025-01-01T12:00:00.000Z',
  data_encerramento: null,
}]

const ITENS = [{
  id: 'item-1',
  codigo: 'FLT-001',
  nome: 'Filtro',
  unidade: 'UN',
  quantidade: 1,
  qtd_minima: 5,
}]

const MOVIMENTACOES = [{
  id_item: 'item-1',
  tipo: 'saida',
  quantidade: 2,
  data_hora: '2026-10-01T12:00:00.000Z',
}]

const FUNCIONARIOS = [{ id: 'funcionario-1', nome: 'Mecânico' }]
const VEICULOS = [{ id: 'veiculo-1', marca: 'Fiat', modelo: 'Uno' }]
const SERVICOS = [{ id_os: 'os-1', descricao: 'Alinhamento', quantidade: 1 }]

function criarAgregado() {
  return {
    periodo_atual: { inicio: '2026-07-16T12:00:00.000Z', fim: REFERENCIA.toISOString(), dias: 90 },
    periodo_anterior: { inicio: LIMITE_MOVIMENTACOES, fim: '2026-07-16T12:00:00.000Z', dias: 90 },
    metricas_destaque: { faturamento: 450, ordens_abertas: 3, itens_criticos: 1 },
    estoque_inteligente: { itens_criticos: [{ codigo: 'FLT-001', quantidade: 1 }] },
    produtividade: {
      total_por_status: { aberta: 1 },
      os_abertas_mais_antigas: [{ id: 'os-1', numero_os: 42, status: 'aberta' }],
      conclusoes_por_mecanico: [{
        id_mecanico: 'funcionario-sentinela',
        nome: 'Mecânico sentinela',
        quantidade_concluida: 2,
        valor_medio: 300,
      }],
    },
    comparacoes: { faturamento: { atual: 450, anterior: 150, diferenca: 300, variacao_percentual: 200 } },
    catalogo_evidencias: {
      'faturamento.valor': {
        valor: 450,
        unidade: 'BRL',
        periodo_inicio: '2026-07-16T12:00:00.000Z',
        periodo_fim: REFERENCIA.toISOString(),
      },
    },
  }
}

function prepararDados() {
  estado.respostas = {
    ordem_servico: { data: ORDENS, error: null },
    item_estoque: { data: ITENS, error: null },
    movimentacao_estoque: { data: MOVIMENTACOES, error: null },
    funcionario: { data: FUNCIONARIOS, error: null },
    veiculo: { data: VEICULOS, error: null },
    os_servico: { data: SERVICOS, error: null },
  }
  estado.consultas = []
  estado.filtros = []
  estado.insercoes = []
  estado.resultadoPersistencia = { data: { id: 'rec-1' }, error: null }
  estado.consultasHistorico = []
  estado.ordenacoesHistorico = []
  estado.faixasHistorico = []
  estado.resultadoListagem = { data: [], error: null, count: 0 }
  estado.agregado = criarAgregado()
}

async function chamarAnalisar() {
  const req = { user: { id: 'u1' } }
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  const next = vi.fn()
  await analisar(req, res, next)
  return { res, next }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(REFERENCIA)
  prepararDados()
})

describe('Painel IA — coleta segura e métricas determinísticas (RF12/RN40/RN43)', () => {
  it('consulta exclusivamente as colunas e filtros contratados nas seis coleções', async () => {
    await chamarAnalisar()

    expect(estado.consultas).toEqual([
      { tabela: 'ordem_servico', colunas: 'id, numero_os, id_veiculo, id_mecanico, status, valor_total, data_abertura, data_encerramento' },
      { tabela: 'item_estoque', colunas: 'id, codigo, nome, unidade, quantidade, qtd_minima' },
      { tabela: 'movimentacao_estoque', colunas: 'id_item, tipo, quantidade, data_hora' },
      { tabela: 'funcionario', colunas: 'id, nome' },
      { tabela: 'veiculo', colunas: 'id, marca, modelo' },
      { tabela: 'os_servico', colunas: 'id_os, descricao, quantidade' },
    ])
    expect(estado.filtros).toEqual([
      { tabela: 'item_estoque', tipo: 'eq', coluna: 'ativo', valor: true },
      { tabela: 'movimentacao_estoque', tipo: 'gte', coluna: 'data_hora', valor: LIMITE_MOVIMENTACOES },
    ])
  })

  it('entrega as seis coleções e a única referência ao motor', async () => {
    await chamarAnalisar()

    expect(calcularMetricasPainelIA).toHaveBeenCalledWith({
      ordens: ORDENS,
      itens: ITENS,
      movimentacoes: MOVIMENTACOES,
      funcionarios: FUNCIONARIOS,
      veiculos: VEICULOS,
      servicos: SERVICOS,
    }, REFERENCIA)
  })

  it('envia e persiste somente o agregado saneado, sem PII nem linhas individuais de OS', async () => {
    await chamarAnalisar()

    const agregadoEnviado = gerarRecomendacoesIA.mock.calls[0][0]
    const agregadoPersistido = estado.insercoes[0].dados_analisados
    const recomendacoesPersistidas = estado.insercoes[0].recomendacoes
    const serializado = JSON.stringify({
      agregadoEnviado,
      agregadoPersistido,
      recomendacoesPersistidas,
    })

    expect(agregadoPersistido).toBe(agregadoEnviado)
    expect(agregadoEnviado.produtividade).not.toHaveProperty('os_abertas_mais_antigas')
    expect(agregadoEnviado.produtividade).not.toHaveProperty('conclusoes_por_mecanico')
    expect(recomendacoesPersistidas.produtividade).not.toHaveProperty('os_abertas_mais_antigas')
    expect(recomendacoesPersistidas.produtividade).not.toHaveProperty('conclusoes_por_mecanico')
    expect(serializado).not.toContain('os-1')
    expect(serializado).not.toContain('funcionario-sentinela')
    expect(serializado).not.toContain('Mecânico sentinela')
    expect(serializado).not.toMatch(/descri[cç][aã]o|motivo|placa|cpf|cnpj|telefone|e-mail|email|endere[cç]o/i)
  })

  it('mantém texto do modelo, mas sobrescreve todos os blocos calculados', async () => {
    const { res } = await chamarAnalisar()
    const dados = res.json.mock.calls[0][0].dados

    expect(dados.resumo).toBe('resumo do modelo')
    expect(dados.metricas_destaque).toEqual(estado.agregado.metricas_destaque)
    expect(dados.periodo_atual).toEqual(estado.agregado.periodo_atual)
    expect(dados.periodo_anterior).toEqual(estado.agregado.periodo_anterior)
    expect(dados.estoque_inteligente).toEqual(estado.agregado.estoque_inteligente)
    expect(dados.produtividade).toEqual(estado.agregado.produtividade)
    expect(dados.produtividade.os_abertas_mais_antigas).toEqual(
      estado.agregado.produtividade.os_abertas_mais_antigas,
    )
    expect(dados.produtividade.conclusoes_por_mecanico).toEqual(
      estado.agregado.produtividade.conclusoes_por_mecanico,
    )
    expect(dados.comparacoes).toEqual(estado.agregado.comparacoes)
    expect(dados.catalogo_evidencias).toEqual(estado.agregado.catalogo_evidencias)
    expect(dados).not.toHaveProperty('metricas_do_modelo')
    expect(estado.insercoes[0].recomendacoes.metricas_do_modelo).toEqual(METRICAS_DO_MODELO)
  })

  it('descarta recomendação com evidência adulterada e mantém os números calculados', async () => {
    gerarRecomendacoesIA.mockResolvedValueOnce({
      resumo: 'O modelo sugere revisar o estoque.',
      recomendacoes: [{
        titulo: 'Revisar estoque',
        descricao: 'Há itens críticos.',
        prioridade: 'alta',
        categoria: 'estoque',
        acao_sugerida: 'Conferir o saldo dos itens críticos.',
        impacto_esperado: 'Melhor disponibilidade para o atendimento.',
        periodo: {
          inicio: '2026-07-16T12:00:00.000Z',
          fim: REFERENCIA.toISOString(),
        },
        evidencias: [{ chave: 'faturamento.valor', valor: 999999, unidade: 'BRL' }],
      }],
      alertas: [],
      metricas_destaque: METRICAS_DO_MODELO,
    })

    const { res } = await chamarAnalisar()
    const dados = res.json.mock.calls[0][0].dados

    expect(dados.recomendacoes).toEqual([])
    expect(estado.insercoes[0].recomendacoes.recomendacoes).toEqual([])
    expect(dados.metricas_destaque).toEqual(estado.agregado.metricas_destaque)
    expect(dados).not.toHaveProperty('metricas_do_modelo')
    expect(estado.insercoes[0].recomendacoes.metricas_do_modelo).toEqual(METRICAS_DO_MODELO)
  })

  it('elimina resumo e alertas numéricos da resposta e da persistência', async () => {
    gerarRecomendacoesIA.mockResolvedValueOnce({
      resumo: 'O faturamento foi R$ 999.999.',
      recomendacoes: [],
      alertas: [{ tipo: 'estoque', mensagem: '100 itens estão críticos.', urgencia: 'alta' }],
      metricas_destaque: METRICAS_DO_MODELO,
    })

    const { res } = await chamarAnalisar()
    const dados = res.json.mock.calls[0][0].dados
    const recomendacoesPersistidas = estado.insercoes[0].recomendacoes

    expect(dados.resumo).toBe('')
    expect(dados.alertas).toEqual([])
    expect(dados).not.toHaveProperty('metricas_do_modelo')
    expect(recomendacoesPersistidas.resumo).toBe('')
    expect(recomendacoesPersistidas.alertas).toEqual([])
    expect(recomendacoesPersistidas.metricas_do_modelo).toEqual(METRICAS_DO_MODELO)
  })

  it('elimina recomendação quantitativa da resposta, persistência e histórico', async () => {
    gerarRecomendacoesIA.mockResolvedValueOnce({
      resumo: 'Revisar as prioridades da oficina.',
      recomendacoes: [{
        titulo: 'Economizar R$ 999.999',
        descricao: 'Há oportunidade de melhoria.',
        prioridade: 'alta',
        categoria: 'financeiro',
        acao_sugerida: 'Revisar os processos com a equipe.',
        impacto_esperado: 'Melhor previsibilidade para a oficina.',
        periodo: {
          inicio: '2026-07-16T12:00:00.000Z',
          fim: REFERENCIA.toISOString(),
        },
        evidencias: [{ chave: 'faturamento.valor', valor: 450, unidade: 'BRL' }],
      }],
      alertas: [],
      metricas_destaque: METRICAS_DO_MODELO,
    })

    const { res } = await chamarAnalisar()
    const dadosResposta = res.json.mock.calls[0][0].dados
    const recomendacoesPersistidas = estado.insercoes[0].recomendacoes

    expect(dadosResposta.recomendacoes).toEqual([])
    expect(recomendacoesPersistidas.recomendacoes).toEqual([])

    estado.resultadoListagem = {
      data: [{
        id: 'rec-1',
        id_usuario: 'u1',
        criado_em: REFERENCIA.toISOString(),
        recomendacoes: recomendacoesPersistidas,
      }],
      error: null,
      count: 1,
    }
    const reqHistorico = { query: {} }
    const resHistorico = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const nextHistorico = vi.fn()

    await listarRecomendacoes(reqHistorico, resHistorico, nextHistorico)

    const registroHistorico = resHistorico.json.mock.calls[0][0].dados[0]
    expect(nextHistorico).not.toHaveBeenCalled()
    expect(registroHistorico.recomendacoes.recomendacoes).toEqual([])
    expect(JSON.stringify({ dadosResposta, recomendacoesPersistidas, registroHistorico }))
      .not.toContain('R$ 999.999')
  })

  it.each(['ordem_servico', 'item_estoque', 'movimentacao_estoque', 'funcionario', 'veiculo', 'os_servico'])(
    'encaminha o erro de %s sem chamar Gemini nem persistir',
    async (tabela) => {
      const erro = new Error(`falha em ${tabela}`)
      estado.respostas[tabela] = { data: null, error: erro }

      const { next, res } = await chamarAnalisar()

      expect(next).toHaveBeenCalledWith(erro)
      expect(gerarRecomendacoesIA).not.toHaveBeenCalled()
      expect(estado.insercoes).toEqual([])
      expect(res.json).not.toHaveBeenCalled()
    },
  )

  it('mantém sucesso sem id quando a persistência falha e registra o erro', async () => {
    const erro = new Error('falha ao salvar')
    estado.resultadoPersistencia = { data: null, error: erro }
    const erroConsole = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { res, next } = await chamarAnalisar()

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json.mock.calls[0][0].dados.id_analise).toBeNull()
    expect(erroConsole).toHaveBeenCalledWith('[IA] Erro ao salvar recomendação:', erro.message)
  })
})

describe('Histórico do Painel IA', () => {
  it('omite as métricas brutas do modelo sem alterar o registro de auditoria, paginação ou ordenação', async () => {
    const registroAuditado = {
      id: 'analise-1',
      id_usuario: 'u1',
      criado_em: '2026-10-14T12:00:00.000Z',
      recomendacoes: {
        resumo: 'Revisar o estoque.',
        recomendacoes: [],
        alertas: [],
        metricas_destaque: { faturamento: 450 },
        metricas_do_modelo: { faturamento: 999999 },
      },
    }
    estado.resultadoListagem = { data: [registroAuditado], error: null, count: 11 }
    const req = { query: { page: '2', limit: '5' } }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()

    await listarRecomendacoes(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(estado.consultasHistorico).toEqual([{
      colunas: 'id, recomendacoes, criado_em',
      opcoes: { count: 'exact' },
    }])
    expect(estado.ordenacoesHistorico).toEqual([{
      coluna: 'criado_em',
      opcoes: { ascending: false },
    }])
    expect(estado.faixasHistorico).toEqual([{ inicio: 5, fim: 9 }])
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      erro: false,
      dados: [{
        id: 'analise-1',
        criado_em: '2026-10-14T12:00:00.000Z',
        recomendacoes: {
          resumo: 'Revisar o estoque.',
          recomendacoes: [],
          alertas: [],
          metricas_destaque: { faturamento: 450 },
        },
      }],
      paginacao: { total: 11, pagina: 2, limite: 5, totalPaginas: 3 },
    })
    expect(res.json.mock.calls[0][0].dados[0]).not.toHaveProperty('id_usuario')
    expect(registroAuditado.recomendacoes.metricas_do_modelo).toEqual({ faturamento: 999999 })
  })

  it('normaliza parâmetros de paginação inválidos antes de consultar o histórico', async () => {
    const req = { query: { page: '2abc', limit: '-1' } }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()

    await listarRecomendacoes(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(estado.faixasHistorico).toEqual([{ inicio: 0, fim: 9 }])
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      paginacao: { total: 0, pagina: 1, limite: 10, totalPaginas: 0 },
    }))
  })
})
