import { describe, it, expect } from 'vitest'
import { toMoney, calcOSTotals } from './osFinance'

// Valor digitado com virgula decimal (padrao brasileiro). Remover o tratamento
// da virgula em toMoney passava verde na suite principal (mutante sobrevivente
// da auditoria QA complementar de 25/10/2026).

describe('toMoney — virgula decimal', () => {
  it('le "8,45" como 8.45', () => {
    expect(toMoney('8,45')).toBe(8.45)
  })

  it('valor unitario com virgula entra no total da linha', () => {
    expect(calcOSTotals({ servicos_itens: [{ quantidade: 2, valor_unitario: '19,90' }] }).valorTotal).toBeCloseTo(39.8, 10)
  })

  it('texto invalido vale zero, sem NaN no total', () => {
    expect(toMoney('abc')).toBe(0)
  })
})
