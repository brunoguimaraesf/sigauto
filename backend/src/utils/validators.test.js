import { describe, it, expect } from 'vitest'
import { validarCPF, validarCNPJ, validarPlaca, validarEmail, validarSenha } from './validators.js'

describe('validarCPF', () => {
  it('aceita CPF válido (com e sem máscara)', () => {
    expect(validarCPF('111.444.777-35')).toBe(true)
    expect(validarCPF('11144477735')).toBe(true)
  })
  it('rejeita CPF com dígito verificador errado', () => {
    expect(validarCPF('11144477700')).toBe(false)
  })
  it('rejeita CPF com tamanho inválido', () => {
    expect(validarCPF('123')).toBe(false)
  })
  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(validarCPF('00000000000')).toBe(false)
    expect(validarCPF('11111111111')).toBe(false)
  })
  it('rejeita valor vazio', () => {
    expect(validarCPF('')).toBe(false)
    expect(validarCPF(null)).toBe(false)
  })
})

describe('validarCNPJ', () => {
  it('aceita CNPJ válido (com e sem máscara)', () => {
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true)
    expect(validarCNPJ('11222333000181')).toBe(true)
  })
  it('rejeita CNPJ com dígito verificador errado', () => {
    expect(validarCNPJ('11222333000100')).toBe(false)
  })
  it('rejeita CNPJ com tamanho inválido', () => {
    expect(validarCNPJ('123456')).toBe(false)
  })
  it('rejeita CNPJ com todos os dígitos iguais', () => {
    expect(validarCNPJ('00000000000000')).toBe(false)
  })
})

describe('validarPlaca', () => {
  it('aceita formato antigo (AAA-9999)', () => {
    expect(validarPlaca('ABC-1234')).toBe(true)
    expect(validarPlaca('abc1234')).toBe(true)
  })
  it('aceita formato Mercosul (AAA9A99)', () => {
    expect(validarPlaca('ABC1D23')).toBe(true)
  })
  it('rejeita placa com tamanho ou formato inválido', () => {
    expect(validarPlaca('AB123')).toBe(false)
    expect(validarPlaca('1234567')).toBe(false)
    expect(validarPlaca('')).toBe(false)
  })
})

describe('validarEmail', () => {
  it('aceita e-mail bem formado', () => {
    expect(validarEmail('usuario@oficina.com.br')).toBe(true)
  })
  it('rejeita e-mail malformado', () => {
    expect(validarEmail('usuario@')).toBe(false)
    expect(validarEmail('usuario.com')).toBe(false)
    expect(validarEmail('')).toBe(false)
  })
})

describe('validarSenha', () => {
  it('aceita senha com 8+ caracteres, maiúscula e número', () => {
    expect(validarSenha('Gestor123')).toBe(true)
  })
  it('rejeita senha curta', () => {
    expect(validarSenha('Abc123')).toBe(false)
  })
  it('rejeita senha sem maiúscula', () => {
    expect(validarSenha('senha1234')).toBe(false)
  })
  it('rejeita senha sem número', () => {
    expect(validarSenha('SenhaSemNum')).toBe(false)
  })
})
