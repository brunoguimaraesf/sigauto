import { describe, it, expect } from 'vitest'
import { getLineTotal, normalizarQuantidade, calcOSTotals } from './osFinance'

// RF04/RN22 — regressao: a tela e a gravacao usavam regras DIFERENTES para a
// quantidade. `item.quantidade || 1` (tela) tratava a string "0" como truthy e
// mostrava R$ 0,00; `Number(x) || 1` (gravacao) tratava 0 como falsy e gravava
// 1, cobrando o item. Agora a regra e uma so: `normalizarQuantidade`.
describe('normalizarQuantidade', () => {
  it('ausente, vazio ou nao numerico vale 1', () => {
    expect(normalizarQuantidade(undefined)).toBe(1)
    expect(normalizarQuantidade(null)).toBe(1)
    expect(normalizarQuantidade('')).toBe(1)
    expect(normalizarQuantidade('   ')).toBe(1)
    expect(normalizarQuantidade('abc')).toBe(1)
  })

  it('zero e negativo sao corrigidos para uma unidade', () => {
    expect(normalizarQuantidade('0')).toBe(1)
    expect(normalizarQuantidade(0)).toBe(1)
    expect(normalizarQuantidade('-5')).toBe(1)
  })

  it('aceita decimal com virgula, como o resto da camada de dinheiro', () => {
    expect(normalizarQuantidade('2,5')).toBe(2.5)
  })
})

describe('getLineTotal com a quantidade normalizada', () => {
  it('quantidade "0" e corrigida antes do calculo', () => {
    expect(getLineTotal({ quantidade: '0', valor_unitario: 100 })).toBe(100)
  })

  it('quantidade ausente cobra uma unidade', () => {
    expect(getLineTotal({ valor_unitario: 100 })).toBe(100)
  })

  it('quantidade negativa e corrigida antes do calculo', () => {
    expect(getLineTotal({ quantidade: '-2', valor_unitario: 100 })).toBe(100)
  })

  it('os totais da OS seguem a mesma regra', () => {
    const totais = calcOSTotals({
      servicos_itens: [{ quantidade: '0', valor_unitario: 100 }],
      pecas_itens: [{ quantidade: '2', valor_unitario: 50 }],
    })
    expect(totais.valorServicos).toBe(100)
    expect(totais.valorPecas).toBe(100)
    expect(totais.valorTotal).toBe(200)
  })
})
