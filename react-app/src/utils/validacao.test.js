import { describe, it, expect } from 'vitest'
import { validarCPF, validarCNPJ, validarCpfCnpj, validarEmail } from './validacao'

describe('validarCPF', () => {
  it('aceita CPF valido (com e sem mascara)', () => {
    expect(validarCPF('529.982.247-25')).toBe(true)
    expect(validarCPF('52998224725')).toBe(true)
  })
  it('rejeita digito verificador errado, tamanho e repetido', () => {
    expect(validarCPF('529.982.247-24')).toBe(false)
    expect(validarCPF('111.111.111-11')).toBe(false)
    expect(validarCPF('123')).toBe(false)
    expect(validarCPF('')).toBe(false)
  })
})

describe('validarCNPJ', () => {
  it('aceita CNPJ valido', () => {
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true)
  })
  it('rejeita invalido/repetido', () => {
    expect(validarCNPJ('11.222.333/0001-80')).toBe(false)
    expect(validarCNPJ('00.000.000/0000-00')).toBe(false)
  })
})

describe('validarCpfCnpj', () => {
  it('decide pelo tipo de pessoa', () => {
    expect(validarCpfCnpj('52998224725', 'fisica')).toBe(true)
    expect(validarCpfCnpj('52998224725', 'juridica')).toBe(false)
    expect(validarCpfCnpj('11222333000181', 'juridica')).toBe(true)
  })
  it('sem tipo, decide pelo tamanho', () => {
    expect(validarCpfCnpj('52998224725')).toBe(true)
    expect(validarCpfCnpj('11222333000181')).toBe(true)
  })
})

describe('validarEmail', () => {
  it('aceita e-mail bem formado e rejeita malformado', () => {
    expect(validarEmail('a@b.com')).toBe(true)
    expect(validarEmail('sem-arroba')).toBe(false)
    expect(validarEmail('')).toBe(false)
  })
})
