import { describe, it, expect } from 'vitest'
import { normalizarPlaca, formatarPlaca, placaValida } from './placa.js'

describe('normalizarPlaca', () => {
  it('remove máscara e coloca em maiúsculas', () => {
    expect(normalizarPlaca('abc-1234')).toBe('ABC1234')
    expect(normalizarPlaca('abc 1d23')).toBe('ABC1D23')
    expect(normalizarPlaca('a.b.c-1.2.3.4')).toBe('ABC1234')
  })
  it('trata valor vazio', () => {
    expect(normalizarPlaca('')).toBe('')
    expect(normalizarPlaca(null)).toBe('')
    expect(normalizarPlaca(undefined)).toBe('')
  })
})

describe('formatarPlaca', () => {
  it('formata placa antiga com hífen', () => {
    expect(formatarPlaca('abc1234')).toBe('ABC-1234')
    expect(formatarPlaca('ABC-1234')).toBe('ABC-1234')
  })
  it('mantém placa Mercosul sem hífen', () => {
    expect(formatarPlaca('ABC1D23')).toBe('ABC1D23')
  })
  it('devolve normalizado quando incompleto', () => {
    expect(formatarPlaca('abc12')).toBe('ABC12')
  })
})

describe('placaValida', () => {
  it('aceita formato antigo e Mercosul', () => {
    expect(placaValida('ABC-1234')).toBe(true)
    expect(placaValida('abc1234')).toBe(true)
    expect(placaValida('ABC1D23')).toBe(true)
  })
  it('rejeita formatos inválidos', () => {
    expect(placaValida('AB123')).toBe(false)
    expect(placaValida('1234567')).toBe(false)
    expect(placaValida('ABCD123')).toBe(false)
    expect(placaValida('')).toBe(false)
  })
})
