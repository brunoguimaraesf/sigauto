import { describe, expect, it } from 'vitest'
import { calcularContextoAnalitico } from './contextoAnalitico.js'

const AGORA = new Date('2026-10-13T12:00:00.000Z')

const dados = {
  veiculos: [
    { id: 'v1', marca: 'Ford', modelo: 'Ka' },
    { id: 'v2', marca: 'Chevrolet', modelo: 'Onix' },
    { id: 'v3', marca: ' ford ', modelo: ' ka ' },
  ],
  ordens: [
    { id_veiculo: 'v1', status: 'concluida', valor_total: 100, data_abertura: '2026-08-01T10:00:00Z', data_encerramento: '2026-08-02T10:00:00Z' },
    { id_veiculo: 'v1', status: 'concluida', valor_total: 200, data_abertura: '2026-06-01T10:00:00Z', data_encerramento: '2026-06-02T10:00:00Z' },
    { id_veiculo: 'v2', status: 'aberta', valor_total: 9999, data_abertura: '2026-09-01T10:00:00Z', data_encerramento: null },
    { id_veiculo: 'v2', status: 'cancelada', valor_total: 9999, data_abertura: '2026-09-02T10:00:00Z', data_encerramento: '2026-09-03T10:00:00Z' },
    { id_veiculo: 'v3', status: 'em_andamento', valor_total: 0, data_abertura: '2026-09-04T10:00:00Z', data_encerramento: null },
  ],
  itensEstoque: [
    { id: 'p1', codigo: 'FIL-1', nome: 'Filtro' },
    { id: 'p2', codigo: 'OLE-1', nome: 'Óleo' },
  ],
  movimentacoes: [
    { id_item: 'p1', tipo: 'saida', quantidade: 2, data_hora: '2026-08-05T10:00:00Z' },
    { id_item: 'p1', tipo: 'saida', quantidade: 3, data_hora: '2026-06-05T10:00:00Z' },
    { id_item: 'p2', tipo: 'saida', quantidade: 1, data_hora: '2026-09-05T10:00:00Z' },
    { id_item: 'p2', tipo: 'entrada', quantidade: 99, data_hora: '2026-09-06T10:00:00Z' },
    { id_item: 'p2', tipo: 'ajuste', quantidade: 50, data_hora: '2026-09-07T10:00:00Z' },
  ],
}

describe('calcularContextoAnalitico — RF11/RN43', () => {
  it('calcula faturamento por encerramento e somente de OS concluida', () => {
    const { analises_financeiras: financeiro } = calcularContextoAnalitico(dados, AGORA)

    expect(financeiro.ultimos_3_meses).toMatchObject({
      faturamento: 100,
      ordens_concluidas: 1,
      ticket_medio: 100,
    })
    expect(financeiro.todo_historico).toMatchObject({
      faturamento: 300,
      ordens_concluidas: 2,
      ticket_medio: 150,
    })
  })

  it('conta entradas por OS nao cancelada e agrupa marca/modelo normalizados', () => {
    const { analises_operacionais: operacional } = calcularContextoAnalitico(dados, AGORA)

    expect(operacional.todo_historico.modelos_com_mais_entradas[0]).toEqual({
      nome: 'Ford Ka',
      quantidade_entradas: 3,
    })
    expect(operacional.ultimos_3_meses.modelos_com_mais_entradas[0]).toEqual({
      nome: 'Ford Ka',
      quantidade_entradas: 2,
    })
  })

  it('soma somente movimentacoes de saida e respeita o periodo', () => {
    const { analises_operacionais: operacional } = calcularContextoAnalitico(dados, AGORA)

    expect(operacional.todo_historico.pecas_com_maior_saida[0]).toMatchObject({
      nome: 'Filtro',
      quantidade_saida: 5,
    })
    expect(operacional.ultimos_3_meses.pecas_com_maior_saida[0]).toMatchObject({
      nome: 'Filtro',
      quantidade_saida: 2,
    })
  })
})

