import { describe, it, expect } from 'vitest'
import { filtrarClientesPorTermo, descreverResultado } from './clienteBusca'

const CLIENTES = [
  { id: 'c1', nome: 'João Gonçalves', cpf_cnpj: '123.456.789-09', telefone: '(64) 99999-0001', ativo: true },
  { id: 'c2', nome: 'Maria Souza', cpf_cnpj: '987.654.321-00', telefone: '(64) 99999-0002', ativo: true },
  { id: 'c3', nome: 'Auto Pecas LTDA', cpf_cnpj: '12.345.678/0001-95', telefone: '(64) 3333-0003', ativo: true },
  { id: 'c4', nome: 'Cliente Inativo', cpf_cnpj: '111.222.333-44', ativo: false },
]

const VEICULOS = [
  { id: 'v1', id_cliente: 'c1', placa: 'ABC1234', marca: 'Fiat', modelo: 'Uno' },
  { id: 'v2', id_cliente: 'c2', placa: 'XYZ9A88', marca: 'VW', modelo: 'Gol' },
  { id: 'v3', cliente_id: 'c3', placa: 'QRS4B21', marca: 'Ford', modelo: 'Ranger' },
]

const buscar = (termo) => filtrarClientesPorTermo(CLIENTES, VEICULOS, termo)
const nomes = (termo) => buscar(termo).map(r => r.cliente.nome)

describe('filtrarClientesPorTermo', () => {
  it('encontra por nome parcial', () => {
    expect(nomes('maria')).toEqual(['Maria Souza'])
  })

  it('ignora acentos e caixa no nome', () => {
    // Quem digita "goncalves" tem de achar "Gonçalves".
    expect(nomes('goncalves')).toEqual(['João Gonçalves'])
    expect(nomes('JOAO')).toEqual(['João Gonçalves'])
  })

  it('encontra por CPF com ou sem máscara', () => {
    expect(nomes('123.456.789-09')).toEqual(['João Gonçalves'])
    expect(nomes('12345678909')).toEqual(['João Gonçalves'])
  })

  it('encontra por CNPJ', () => {
    expect(nomes('12345678000195')).toEqual(['Auto Pecas LTDA'])
  })

  it('encontra por placa, com ou sem hífen e em minúsculas', () => {
    expect(nomes('ABC1234')).toEqual(['João Gonçalves'])
    expect(nomes('abc-1234')).toEqual(['João Gonçalves'])
  })

  it('encontra por placa Mercosul e por trecho da placa', () => {
    expect(nomes('XYZ9A88')).toEqual(['Maria Souza'])
    expect(nomes('9A88')).toEqual(['Maria Souza'])
  })

  it('acha o veículo pelo dono gravado como cliente_id (formato legado)', () => {
    expect(nomes('QRS4B21')).toEqual(['Auto Pecas LTDA'])
  })

  it('informa por que cada resultado casou', () => {
    expect(buscar('maria')[0].motivo).toBe('nome')
    expect(buscar('12345678909')[0].motivo).toBe('documento')

    const porPlaca = buscar('ABC1234')[0]
    expect(porPlaca.motivo).toBe('placa')
    expect(porPlaca.veiculo.placa).toBe('ABC1234')
  })

  it('não devolve cliente inativo', () => {
    expect(nomes('Inativo')).toEqual([])
  })

  it('termo vazio ou só espaços não devolve nada', () => {
    // Sem isso a lista inteira apareceria ao abrir a tela.
    expect(buscar('')).toEqual([])
    expect(buscar('   ')).toEqual([])
  })

  it('não busca documento nem placa com menos de 3 caracteres', () => {
    // "12" traria meia base; abaixo de 3 dígitos o ruído supera a utilidade.
    expect(nomes('12')).toEqual([])
  })

  it('respeita o limite de resultados', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({
      id: `x${i}`, nome: `Teste ${i}`, cpf_cnpj: '', ativo: true,
    }))
    expect(filtrarClientesPorTermo(muitos, [], 'teste', 5)).toHaveLength(5)
  })

  it('aguenta listas vazias e campos ausentes', () => {
    expect(filtrarClientesPorTermo([], [], 'algo')).toEqual([])
    expect(filtrarClientesPorTermo([{ id: 'z', ativo: true }], [], 'algo')).toEqual([])
  })
})

describe('descreverResultado', () => {
  it('mostra a placa e o modelo quando o casamento foi por placa', () => {
    expect(descreverResultado(buscar('ABC1234')[0])).toBe('Placa ABC1234 — Fiat Uno')
  })

  it('mostra o documento quando o casamento foi por documento', () => {
    expect(descreverResultado(buscar('12345678909')[0])).toBe('123.456.789-09')
  })

  it('mostra o telefone quando o casamento foi por nome', () => {
    expect(descreverResultado(buscar('maria')[0])).toBe('(64) 99999-0002')
  })
})
