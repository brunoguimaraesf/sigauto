import { describe, it, expect } from 'vitest'
import { itemEmAlerta, calcularSaldo, formatarMoeda } from './estoque.js'

describe('itemEmAlerta', () => {
  it('sinaliza alerta quando quantidade <= mínimo', () => {
    expect(itemEmAlerta({ quantidade: 2, qtd_minima: 5 })).toBe(true)
    expect(itemEmAlerta({ quantidade: 5, qtd_minima: 5 })).toBe(true)
  })
  it('não sinaliza quando quantidade acima do mínimo', () => {
    expect(itemEmAlerta({ quantidade: 10, qtd_minima: 5 })).toBe(false)
  })
  it('trata item inexistente', () => {
    expect(itemEmAlerta(null)).toBe(false)
  })
})

describe('calcularSaldo', () => {
  it('soma na entrada', () => {
    expect(calcularSaldo(10, 'entrada', 5)).toBe(15)
  })
  it('subtrai na saída', () => {
    expect(calcularSaldo(10, 'saida', 3)).toBe(7)
  })
  it('não permite saldo negativo', () => {
    expect(calcularSaldo(2, 'saida', 5)).toBe(0)
  })
})

describe('formatarMoeda', () => {
  it('formata em reais', () => {
    const s = formatarMoeda(1234.5)
    expect(s).toContain('R$')
    expect(s).toContain('1.234,50')
  })
})
