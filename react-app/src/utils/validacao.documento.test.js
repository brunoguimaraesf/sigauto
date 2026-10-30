import { describe, it, expect } from 'vitest'
import { erroDocumentoCliente, mensagemFalhaGravacaoCliente } from './validacao'

// RN07: regra única usada pelo cadastro principal (Clientes) e pelo cadastro
// rápido da abertura de O.S.
const CPF_VALIDO = '529.982.247-25'
const CNPJ_VALIDO = '04.252.011/0001-10'
const clientes = [
  { id: 'c1', nome: 'Pessoa Física Cadastrada', cpf_cnpj: CPF_VALIDO },
  { id: 'c2', nome: 'Empresa Cadastrada', cpf_cnpj: CNPJ_VALIDO },
]

describe('erroDocumentoCliente', () => {
  it.each([
    ['CPF válido', '390.533.447-05', 'fisica', null],
    ['CPF com dígito verificador inválido', '529.982.247-26', 'fisica', 'CPF inválido. Confira o número informado.'],
    ['CPF com dígitos repetidos', '111.111.111-11', 'fisica', 'CPF inválido. Confira o número informado.'],
    ['CPF ausente', '', 'fisica', 'Informe o CPF do cliente.'],
    ['CPF já cadastrado', CPF_VALIDO, 'fisica', 'CPF/CNPJ já cadastrado para outro cliente.'],
    ['CNPJ válido', '11.222.333/0001-81', 'juridica', null],
    ['CNPJ com dígito verificador inválido', '04.252.011/0001-11', 'juridica', 'CNPJ inválido. Confira o número informado.'],
    ['CNPJ com dígitos repetidos', '11.111.111/1111-11', 'juridica', 'CNPJ inválido. Confira o número informado.'],
    ['CNPJ ausente', '   ', 'juridica', 'Informe o CNPJ do cliente.'],
    ['CNPJ já cadastrado', CNPJ_VALIDO, 'juridica', 'CPF/CNPJ já cadastrado para outro cliente.'],
  ])('%s', (_caso, documento, tipo, esperado) => {
    expect(erroDocumentoCliente(documento, tipo, clientes)).toBe(esperado)
  })

  it('nao acusa duplicidade do proprio cliente em edicao', () => {
    expect(erroDocumentoCliente(CPF_VALIDO, 'fisica', clientes, 'c1')).toBeNull()
  })

  it('compara apenas os digitos, com ou sem mascara', () => {
    expect(erroDocumentoCliente('52998224725', 'fisica', clientes)).toBe('CPF/CNPJ já cadastrado para outro cliente.')
  })

  it('recusa CPF digitado com o tipo pessoa juridica', () => {
    expect(erroDocumentoCliente('390.533.447-05', 'juridica', clientes)).toBe('CNPJ inválido. Confira o número informado.')
  })
})

describe('mensagemFalhaGravacaoCliente', () => {
  it('traduz a violacao de unicidade do banco', () => {
    expect(mensagemFalhaGravacaoCliente({ code: '23505', message: 'duplicate key value' }))
      .toBe('CPF/CNPJ já cadastrado para outro cliente.')
  })

  it('nao expoe o texto tecnico das demais falhas', () => {
    const msg = mensagemFalhaGravacaoCliente(new Error('Failed to fetch'))
    expect(msg).toContain('Os dados digitados foram mantidos')
    expect(msg).not.toContain('Failed to fetch')
  })
})
