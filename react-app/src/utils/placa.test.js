import { describe, it, expect } from 'vitest'
import { normalizarPlaca, formatarPlaca, placaValida } from './placa.js'

describe('normalizarPlaca', () => {
  it('remove máscara e coloca em maiúsculas', () => {
    expect(normalizarPlaca('abc-1234')).toBe('ABC1234')
    expect(normalizarPlaca('abc 1d23')).toBe('ABC1D23')
  })
  it('trata valor vazio', () => {
    expect(normalizarPlaca('')).toBe('')
    expect(normalizarPlaca(null)).toBe('')
  })
})

describe('formatarPlaca', () => {
  it('formata placa antiga com hífen', () => {
    expect(formatarPlaca('abc1234')).toBe('ABC-1234')
  })
  it('mantém placa Mercosul sem hífen', () => {
    expect(formatarPlaca('ABC1D23')).toBe('ABC1D23')
  })
})

describe('placaValida', () => {
  it('aceita formato antigo e Mercosul', () => {
    expect(placaValida('ABC-1234')).toBe(true)
    expect(placaValida('ABC1D23')).toBe(true)
  })
  it('rejeita formatos inválidos', () => {
    expect(placaValida('AB123')).toBe(false)
    expect(placaValida('1234567')).toBe(false)
  })
})
