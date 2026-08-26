import { describe, it, expect, vi } from 'vitest'
import { maskCep, cepValido, buscarCep, formatarEndereco, enderecoVazio, UFS } from './endereco'

const respostaOk = (corpo) => ({ ok: true, json: async () => corpo })

const VIACEP = {
  cep: '74000-000',
  logradouro: 'Avenida Goiás',
  bairro: 'Setor Central',
  localidade: 'Goiânia',
  uf: 'GO',
}

describe('maskCep', () => {
  it('formata progressivamente', () => {
    expect(maskCep('7400')).toBe('7400')
    expect(maskCep('74000')).toBe('74000')
    expect(maskCep('74000000')).toBe('74000-000')
  })

  it('descarta letras e excesso de dígitos', () => {
    expect(maskCep('74a000b000999')).toBe('74000-000')
  })
})

describe('cepValido', () => {
  it('aceita 8 dígitos, com ou sem máscara', () => {
    expect(cepValido('74000-000')).toBe(true)
    expect(cepValido('74000000')).toBe(true)
  })

  it('rejeita tamanho errado ou vazio', () => {
    expect(cepValido('7400')).toBe(false)
    expect(cepValido('')).toBe(false)
  })
})

describe('buscarCep', () => {
  it('traduz a resposta do ViaCEP para o formato do formulário', async () => {
    const fetchImpl = vi.fn(async () => respostaOk(VIACEP))

    expect(await buscarCep('74000-000', { fetchImpl })).toEqual({
      cep: '74000000',
      logradouro: 'Avenida Goiás',
      bairro: 'Setor Central',
      cidade: 'Goiânia',
      uf: 'GO',
    })
    expect(fetchImpl).toHaveBeenCalledWith('https://viacep.com.br/ws/74000000/json/', expect.anything())
  })

  it('não chama a rede quando o CEP é inválido', async () => {
    const fetchImpl = vi.fn()

    expect(await buscarCep('740', { fetchImpl })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('devolve null quando o ViaCEP responde { erro: true }', async () => {
    // O serviço responde 200 mesmo para CEP inexistente.
    const fetchImpl = vi.fn(async () => respostaOk({ erro: true }))

    expect(await buscarCep('99999999', { fetchImpl })).toBeNull()
  })

  it('devolve null em erro HTTP', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) }))

    expect(await buscarCep('74000000', { fetchImpl })).toBeNull()
  })

  it('não propaga exceção quando a rede cai', async () => {
    // O preenchimento automático é conveniência: se explodir aqui, o cadastro
    // inteiro trava. Tem de degradar em silêncio.
    const fetchImpl = vi.fn(async () => { throw new Error('network down') })

    await expect(buscarCep('74000000', { fetchImpl })).resolves.toBeNull()
  })
})

describe('formatarEndereco', () => {
  it('monta o endereço completo', () => {
    expect(formatarEndereco({
      logradouro: 'Avenida Goiás', numero: '123', complemento: 'Sala 2',
      bairro: 'Setor Central', cidade: 'Goiânia', uf: 'GO', cep: '74000000',
    })).toBe('Avenida Goiás, 123 - Sala 2 - Setor Central - Goiânia/GO - 74000-000')
  })

  it('pula as partes que faltam sem deixar separador solto', () => {
    expect(formatarEndereco({ logradouro: 'Rua A', cidade: 'Rio Verde', uf: 'GO' }))
      .toBe('Rua A - Rio Verde/GO')
  })

  it('cai no texto legado quando não há endereço estruturado', () => {
    expect(formatarEndereco(null, 'Av. Antiga, 50 - Centro')).toBe('Av. Antiga, 50 - Centro')
  })

  it('cai no texto legado quando o estruturado está vazio', () => {
    expect(formatarEndereco({}, 'Av. Antiga, 50')).toBe('Av. Antiga, 50')
  })

  it('devolve string vazia quando não há nada', () => {
    expect(formatarEndereco(null, '')).toBe('')
  })
})

describe('enderecoVazio', () => {
  it('considera vazio o formulário em branco', () => {
    expect(enderecoVazio({ cep: '', logradouro: '', cidade: '   ' })).toBe(true)
    expect(enderecoVazio(null)).toBe(true)
  })

  it('qualquer campo preenchido já conta', () => {
    expect(enderecoVazio({ cidade: 'Goiânia' })).toBe(false)
    expect(enderecoVazio({ ponto_referencia: 'Perto do posto' })).toBe(false)
  })
})

describe('UFS', () => {
  it('tem as 27 unidades federativas', () => {
    expect(UFS).toHaveLength(27)
    expect(new Set(UFS).size).toBe(27)
  })
})
