import { describe, expect, it } from 'vitest'
import { calcularMetricasPainelIA } from './metricasPainelIA.js'

const REFERENCIA = '2026-10-14T12:00:00.000Z'
const INICIO_ATUAL = '2026-07-16T12:00:00.000Z'
const INICIO_ANTERIOR = '2026-04-17T12:00:00.000Z'

function calcular(dados = {}) {
  return calcularMetricasPainelIA({
    ordens: [],
    itens: [],
    movimentacoes: [],
    funcionarios: [],
    veiculos: [],
    ...dados,
  }, REFERENCIA)
}

describe('calcularMetricasPainelIA', () => {
  it('usa janelas UTC com início inclusivo e fim exclusivo', () => {
    const metricas = calcular({
      ordens: [
        { id: 'inicio-anterior', status: 'aberta', data_abertura: INICIO_ANTERIOR },
        { id: 'fim-anterior', status: 'aberta', data_abertura: INICIO_ATUAL },
        { id: 'fim-atual', status: 'aberta', data_abertura: REFERENCIA },
      ],
    })

    expect(metricas.periodo_atual).toEqual({ inicio: INICIO_ATUAL, fim: REFERENCIA, dias: 90 })
    expect(metricas.periodo_anterior).toEqual({ inicio: INICIO_ANTERIOR, fim: INICIO_ATUAL, dias: 90 })
    expect(metricas.comparacoes.ordens_abertas).toMatchObject({ atual: 1, anterior: 1 })
  })

  it('classifica faturamento e conclusões pela data de encerramento, não pela abertura', () => {
    const metricas = calcular({
      ordens: [
        {
          id: 'concluida-no-periodo',
          status: 'concluida',
          valor_total: 200,
          data_abertura: '2026-04-20T12:00:00.000Z',
          data_encerramento: '2026-07-16T12:00:00.000Z',
        },
        {
          id: 'aberta-no-periodo-encerrada-fora',
          status: 'concluida',
          valor_total: 999,
          data_abertura: '2026-07-20T12:00:00.000Z',
          data_encerramento: REFERENCIA,
        },
      ],
    })

    expect(metricas.metricas_destaque.faturamento).toBe(200)
    expect(metricas.metricas_destaque.ordens_concluidas).toBe(1)
    expect(metricas.comparacoes.faturamento).toMatchObject({ atual: 200, anterior: 0, variacao_percentual: null })
  })

  it('calcula duração só com datas válidas e produz mediana par e ímpar', () => {
    const base = [
      { id: 'a', status: 'concluida', data_abertura: '2026-07-20T12:00:00.000Z', data_encerramento: '2026-07-20T14:00:00.000Z' },
      { id: 'b', status: 'concluida', data_abertura: '2026-07-21T12:00:00.000Z', data_encerramento: '2026-07-21T18:00:00.000Z' },
      { id: 'invalida', status: 'concluida', data_abertura: 'invalida', data_encerramento: '2026-07-22T12:00:00.000Z' },
      { id: 'invertida', status: 'concluida', data_abertura: '2026-07-23T14:00:00.000Z', data_encerramento: '2026-07-23T12:00:00.000Z' },
    ]

    expect(calcular({ ordens: base }).produtividade).toMatchObject({
      tempo_medio_horas: 4,
      tempo_mediano_horas: 4,
    })
    expect(calcular({ ordens: [...base, {
      id: 'c', status: 'concluida', data_abertura: '2026-07-24T12:00:00.000Z', data_encerramento: '2026-07-24T22:00:00.000Z',
    }] }).produtividade.tempo_mediano_horas).toBe(6)
  })

  it('não calcula variação percentual quando não há base anterior', () => {
    const metricas = calcular({
      ordens: [{
        status: 'concluida', valor_total: 100,
        data_abertura: '2026-07-20T12:00:00.000Z', data_encerramento: '2026-07-21T12:00:00.000Z',
      }],
    })

    expect(metricas.comparacoes.ticket_medio.variacao_percentual).toBeNull()
    expect(metricas.comparacoes.duracao_media_horas.variacao_percentual).toBeNull()
  })

  it('considera somente saídas para consumo, cobertura e reposição', () => {
    const metricas = calcular({
      itens: [{ id: 'filtro', codigo: 'F-1', nome: 'Filtro', quantidade: 2, qtd_minima: 5, unidade: 'UN' }],
      movimentacoes: [
        { id_item: 'filtro', tipo: 'saida', quantidade: 9, data_hora: '2026-08-01T12:00:00.000Z' },
        { id_item: 'filtro', tipo: 'entrada', quantidade: 50, data_hora: '2026-08-02T12:00:00.000Z' },
        { id_item: 'filtro', tipo: 'ajuste', quantidade: 50, data_hora: '2026-08-03T12:00:00.000Z' },
      ],
    })
    const [item] = metricas.estoque_inteligente.mais_consumidos

    expect(item).toMatchObject({ quantidade_saida: 9, consumo_diario: 0.1, cobertura_dias: 20, sugestao_reposicao: 6 })
    expect(metricas.comparacoes.quantidade_saidas.atual).toBe(9)
  })

  it('marca item sem saída com cobertura nula e item sem movimentação como parado', () => {
    const metricas = calcular({
      itens: [
        { id: 'sem-saida', codigo: 'A', nome: 'A sem saída', quantidade: 3, qtd_minima: 1, unidade: 'UN' },
        { id: 'parado', codigo: 'B', nome: 'B parado', quantidade: 3, qtd_minima: 1, unidade: 'UN' },
      ],
      movimentacoes: [{ id_item: 'sem-saida', tipo: 'entrada', quantidade: 1, data_hora: '2026-08-01T12:00:00.000Z' }],
    })

    expect(metricas.estoque_inteligente.mais_consumidos.find((item) => item.id === 'sem-saida').cobertura_dias).toBeNull()
    expect(metricas.estoque_inteligente.itens_parados).toEqual([
      expect.objectContaining({ id: 'parado', nome: 'B parado' }),
    ])
  })

  it('limita rankings a 20 e desempata por nome', () => {
    const itens = Array.from({ length: 22 }, (_, indice) => ({
      id: `item-${indice}`,
      codigo: `C-${indice}`,
      nome: indice === 0 ? 'Zeta' : indice === 1 ? 'Alfa' : `Item ${indice}`,
      quantidade: 0,
      qtd_minima: 1,
      unidade: 'UN',
    }))
    const movimentacoes = itens.map((item) => ({
      id_item: item.id, tipo: 'saida', quantidade: 1, data_hora: '2026-08-01T12:00:00.000Z',
    }))
    const metricas = calcular({ itens, movimentacoes })

    expect(metricas.estoque_inteligente.mais_consumidos).toHaveLength(20)
    expect(metricas.estoque_inteligente.mais_consumidos.slice(0, 2).map((item) => item.nome)).toEqual(['Alfa', 'Item 10'])
  })

  it('agrupa conclusões de mecânico inexistente sem falhar', () => {
    const metricas = calcular({
      ordens: [{
        id: 'os-1', status: 'concluida', id_mecanico: 'removido', valor_total: 300,
        data_abertura: '2026-07-20T12:00:00.000Z', data_encerramento: '2026-07-21T12:00:00.000Z',
      }],
    })

    expect(metricas.produtividade.conclusoes_por_mecanico).toEqual([{
      id_mecanico: 'removido', nome: 'Mecânico não identificado', quantidade_concluida: 1, valor_medio: 300,
    }])
  })

  it('compara modelos de veículo e serviços pela abertura da OS, sem IDs e com base anterior nula', () => {
    const metricas = calcular({
      ordens: [
        { id: 'atual-1', id_veiculo: 'v-gol', status: 'aberta', data_abertura: '2026-08-01T12:00:00.000Z' },
        { id: 'atual-2', id_veiculo: 'v-gol', status: 'aberta', data_abertura: '2026-08-02T12:00:00.000Z' },
        { id: 'atual-sem-veiculo', id_veiculo: 'nao-existe', status: 'aberta', data_abertura: '2026-08-03T12:00:00.000Z' },
        { id: 'anterior-1', id_veiculo: 'v-uno', status: 'aberta', data_abertura: '2026-05-01T12:00:00.000Z' },
        { id: 'fora-da-janela', id_veiculo: 'v-gol', status: 'aberta', data_abertura: REFERENCIA },
      ],
      veiculos: [
        { id: 'v-gol', marca: 'Volkswagen', modelo: 'Gol' },
        { id: 'v-uno', marca: 'Fiat', modelo: 'Uno' },
      ],
      servicos: [
        { id_os: 'atual-1', descricao: 'Alinhamento', quantidade: 1 },
        { id_os: 'atual-2', descricao: 'Alinhamento', quantidade: 2 },
        { id_os: 'atual-2', descricao: 'Balanceamento', quantidade: 1 },
        { id_os: 'anterior-1', descricao: 'Alinhamento', quantidade: 1 },
        { id_os: 'atual-sem-veiculo', descricao: '', quantidade: 1 },
        { id_os: 'fora-da-janela', descricao: 'Ignorado', quantidade: 99 },
      ],
    })

    expect(metricas.comparacoes.modelos_veiculo).toEqual([
      { rotulo: 'Volkswagen Gol', atual: 2, anterior: 0, diferenca: 2, variacao_percentual: null },
      { rotulo: 'Veiculo nao identificado', atual: 1, anterior: 0, diferenca: 1, variacao_percentual: null },
      { rotulo: 'Fiat Uno', atual: 0, anterior: 1, diferenca: -1, variacao_percentual: -100 },
    ])
    expect(metricas.comparacoes.servicos_mais_frequentes).toEqual([
      { rotulo: 'Alinhamento', atual: 3, anterior: 1, diferenca: 2, variacao_percentual: 200 },
      { rotulo: 'Balanceamento', atual: 1, anterior: 0, diferenca: 1, variacao_percentual: null },
      { rotulo: 'Servico nao identificado', atual: 1, anterior: 0, diferenca: 1, variacao_percentual: null },
    ])
    expect(JSON.stringify(metricas.comparacoes)).not.toMatch(/atual-1|v-gol|id_os|id_veiculo/)
  })

  it('limita e desempata alfabeticamente os rankings comparativos', () => {
    const ordens = Array.from({ length: 21 }, (_, indice) => ({
      id: `os-${indice}`,
      id_veiculo: `v-${indice}`,
      status: 'aberta',
      data_abertura: '2026-08-01T12:00:00.000Z',
    }))
    const veiculos = ordens.map((ordem, indice) => ({
      id: ordem.id_veiculo,
      marca: '',
      modelo: indice === 0 ? 'Zeta' : indice === 1 ? 'Alfa' : `Modelo ${indice}`,
    }))
    const servicos = ordens.map((ordem, indice) => ({
      id_os: ordem.id,
      descricao: indice === 0 ? 'Zeta' : indice === 1 ? 'Alfa' : `Servico ${indice}`,
      quantidade: 1,
    }))

    const comparacoes = calcular({ ordens, veiculos, servicos }).comparacoes

    expect(comparacoes.modelos_veiculo).toHaveLength(20)
    expect(comparacoes.servicos_mais_frequentes).toHaveLength(20)
    expect(comparacoes.modelos_veiculo[0].rotulo).toBe('Alfa')
    expect(comparacoes.servicos_mais_frequentes[0].rotulo).toBe('Alfa')
  })

  it('não produz valores não finitos nem dados pessoais no retorno', () => {
    const metricas = calcular({
      ordens: [{
        status: 'concluida', valor_total: 'invalido', descricao: 'diagnóstico privado',
        data_abertura: '2026-07-20T12:00:00.000Z', data_encerramento: '2026-07-21T12:00:00.000Z',
      }],
      itens: [{ id: 'x', codigo: 'X', nome: 'Peça', quantidade: 0, qtd_minima: 1, unidade: 'UN', custo: 99, preco_unit: 200 }],
      movimentacoes: [{ id_item: 'x', tipo: 'saida', quantidade: 'invalida', data_hora: '2026-08-01T12:00:00.000Z', motivo: 'cliente X' }],
      veiculos: [{ placa: 'ABC1D23', marca: 'Marca', modelo: 'Modelo' }],
    })
    const serializado = JSON.stringify(metricas)

    expect(serializado).not.toMatch(/NaN|Infinity|diagnóstico privado|cliente X|ABC1D23|custo|preco_unit/)
    expect(metricas.catalogo_evidencias['faturamento.valor']).toMatchObject({
      valor: 0, periodo_inicio: INICIO_ATUAL, periodo_fim: REFERENCIA, unidade: 'BRL',
    })
  })

  it('rejeita referência e coleções inválidas com erro explícito', () => {
    expect(() => calcularMetricasPainelIA({ ordens: [] }, 'data-inválida')).toThrow(/referência/i)
    expect(() => calcularMetricasPainelIA({ ordens: [] }, '2026-10-14T12:00:00')).toThrow(/referência/i)
    expect(() => calcularMetricasPainelIA({ ordens: [] }, new Date(REFERENCIA))).not.toThrow()
    expect(() => calcularMetricasPainelIA({ ordens: {} }, REFERENCIA)).toThrow(/ordens/i)
  })

  it('ignora eventos sem timezone explícito para não depender do fuso do processo', () => {
    const metricas = calcular({
      ordens: [{ id: 'os-local', status: 'aberta', data_abertura: '2026-08-01T12:00:00' }],
      itens: [{ id: 'item-local', codigo: 'L-1', nome: 'Item local', quantidade: 1, qtd_minima: 1, unidade: 'UN' }],
      movimentacoes: [{ id_item: 'item-local', tipo: 'saida', quantidade: 3, data_hora: '2026-08-01T12:00:00' }],
    })

    expect(metricas.metricas_destaque.ordens_abertas).toBe(0)
    expect(metricas.metricas_destaque.quantidade_saidas).toBe(0)
    expect(metricas.estoque_inteligente.itens_parados).toEqual([
      expect.objectContaining({ id: 'item-local' }),
    ])
  })
})
