import { describe, it, expect } from 'vitest'
import { calcDescontoPercentual, calcOSCommissions, calcOSTotals, centesimos, getLineTotal } from './osFinance'

// QA-10 / A-04: a previa da tela tem de dar o mesmo centavo que o banco grava.
// Valores esperados medidos no PostgreSQL do Supabase efemero com a mesma conta
// de finalizar_ordem_servico e fn_snapshot_comissoes_os:
//   round(1.5*8.45,2)=12.68  round(2.5*19.99,2)=49.98  round(0.1*1.15,2)=0.12
//   round(1.5*8.45 + 0.3*8.45, 2)=15.21 (soma da categoria antes de arredondar)
//   round(99.99*10/100,2)=10.00

describe('centesimos', () => {
  it.each([
    ['8.45', 845], ['8,45', 845], [8.45, 845], ['1.005', 101], [1.005, 101],
    ['0.004', 0], ['0.005', 1], ['-2.345', -235], ['', 0], [null, 0], ['abc', 0], [1e-7, 0], [12, 1200],
  ])('%j vira %i', (entrada, esperado) => {
    expect(centesimos(entrada)).toBe(esperado)
  })
})

describe('totais iguais ao banco', () => {
  it.each([
    [[{ quantidade: '1,5', valor_unitario: '8.45' }], 12.68],
    [[{ quantidade: '2,5', valor_unitario: '19.99' }], 49.98],
    [[{ quantidade: '0,1', valor_unitario: '1.15' }], 0.12],
    [[{ quantidade: 1.5, valor_unitario: 8.45 }, { quantidade: 0.3, valor_unitario: 8.45 }], 15.21],
  ])('%j soma %d', (itens, esperado) => {
    expect(calcOSTotals({ servicos_itens: itens }).valorTotal).toBe(esperado)
  })

  it('arredonda cada categoria e soma em centavos inteiros, sem resto de float', () => {
    const totais = calcOSTotals({
      servicos_itens: [{ quantidade: 1, valor_unitario: 0.1 }],
      pecas_itens: [{ quantidade: 1, valor_unitario: 0.2 }],
    })
    expect(totais).toEqual({ valorServicos: 0.1, valorPecas: 0.2, valorTotal: 0.3 })
  })

  it('linha exibida arredondada para centavos', () => {
    expect(getLineTotal({ quantidade: '1,5', valor_unitario: 8.45 })).toBe(12.68)
  })
})

describe('desconto e comissao iguais ao banco', () => {
  it('10% de 99,99 e 10,00', () => {
    expect(calcDescontoPercentual(99.99, 10)).toBe(10)
  })

  it('comissao de 7,5% sobre 12,68 e 0,95 (0,951 arredondado)', () => {
    const mecanico = { comissao_percentual: 7.5, comissao_sobre_servicos: true }
    const { mecanico: comissao, total } = calcOSCommissions(
      { servicos_itens: [{ quantidade: '1,5', valor_unitario: '8.45' }] }, mecanico, null,
    )
    expect(comissao.valor).toBe(0.95)
    expect(total).toBe(0.95)
  })
})
