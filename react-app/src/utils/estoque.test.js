import { describe, it, expect } from 'vitest'
import { itemEmAlerta, calcularSaldo, formatarMoeda, resumoEstoque } from './estoque.js'

describe('itemEmAlerta', () => {
  it('sinaliza alerta quando quantidade <= mínimo', () => {
    expect(itemEmAlerta({ quantidade: 2, qtd_minima: 5 })).toBe(true)
    expect(itemEmAlerta({ quantidade: 5, qtd_minima: 5 })).toBe(true)
    expect(itemEmAlerta({ quantidade: 0, qtd_minima: 1 })).toBe(true)
  })
  it('não sinaliza quando quantidade acima do mínimo', () => {
    expect(itemEmAlerta({ quantidade: 10, qtd_minima: 5 })).toBe(false)
    expect(itemEmAlerta({ quantidade: 6, qtd_minima: 5 })).toBe(false)
  })
  it('trata item inexistente', () => {
    expect(itemEmAlerta(null)).toBe(false)
    expect(itemEmAlerta(undefined)).toBe(false)
  })
})

describe('calcularSaldo', () => {
  it('soma na entrada', () => {
    expect(calcularSaldo(10, 'entrada', 5)).toBe(15)
    expect(calcularSaldo(0, 'entrada', 3)).toBe(3)
  })
  it('subtrai na saída', () => {
    expect(calcularSaldo(10, 'saida', 3)).toBe(7)
  })
  it('não permite saldo negativo', () => {
    expect(calcularSaldo(2, 'saida', 5)).toBe(0)
  })
  it('trata valores inválidos como zero', () => {
    expect(calcularSaldo(undefined, 'entrada', 4)).toBe(4)
    expect(calcularSaldo(5, 'entrada', undefined)).toBe(5)
  })
})

describe('formatarMoeda', () => {
  it('formata em reais', () => {
    const s = formatarMoeda(1234.5)
    expect(s).toContain('R$')
    expect(s).toContain('1.234,50')
  })
  it('trata zero e valor vazio', () => {
    expect(formatarMoeda(0)).toContain('0,00')
    expect(formatarMoeda(null)).toContain('0,00')
  })
})

describe('resumoEstoque', () => {
  const itens = [
    { quantidade: 2, qtd_minima: 5, preco_unit: 10 },   // alerta
    { quantidade: 10, qtd_minima: 5, preco_unit: 20 },  // ok
    { quantidade: 0, qtd_minima: 3, preco_unit: 100 },  // alerta
  ]
  it('conta total, alertas e valor total', () => {
    const r = resumoEstoque(itens)
    expect(r.total).toBe(3)
    expect(r.emAlerta).toBe(2)
    expect(r.valorTotal).toBe(2 * 10 + 10 * 20 + 0 * 100) // 220
  })
  it('trata lista vazia', () => {
    expect(resumoEstoque([])).toEqual({ total: 0, emAlerta: 0, valorTotal: 0 })
    expect(resumoEstoque()).toEqual({ total: 0, emAlerta: 0, valorTotal: 0 })
  })
})
