import { describe, it, expect } from 'vitest'
import { calcOSTotals, calcUserCommission, calcOSCommissions, resolveEquipe } from './osFinance'

const os = {
  servicos_itens: [
    { descricao: 'Troca de oleo', quantidade: 1, valor_unitario: 120 },
    { descricao: 'Alinhamento', quantidade: 2, valor_unitario: 40 },
  ],
  pecas_itens: [
    { descricao: 'Filtro', quantidade: 3, valor_unitario: 30 },
  ],
}

describe('calcOSTotals', () => {
  it('soma servicos, pecas e total considerando quantidade', () => {
    const t = calcOSTotals(os)
    expect(t.valorServicos).toBe(200) // 120 + 2*40
    expect(t.valorPecas).toBe(90)     // 3*30
    expect(t.valorTotal).toBe(290)
  })

  it('trata OS sem itens', () => {
    expect(calcOSTotals({}).valorTotal).toBe(0)
  })
})

describe('calcUserCommission (funcionario)', () => {
  it('calcula sobre servicos e pecas conforme a base', () => {
    const totals = calcOSTotals(os)
    const func = { comissao_percentual: 10, comissao_sobre_servicos: true, comissao_sobre_pecas: false }
    const c = calcUserCommission(func, totals)
    expect(c.base).toBe(200)
    expect(c.valor).toBe(20) // 10% de 200
  })

  it('retorna zero quando nao ha funcionario', () => {
    expect(calcUserCommission(null, calcOSTotals(os)).valor).toBe(0)
  })
})

describe('calcOSCommissions', () => {
  it('soma comissoes de mecanico e atendente', () => {
    const mecanico = { comissao_percentual: 10, comissao_sobre_servicos: true, comissao_sobre_pecas: false }
    const atendente = { comissao_percentual: 5, comissao_sobre_servicos: false, comissao_sobre_pecas: true }
    const r = calcOSCommissions(os, mecanico, atendente)
    expect(r.mecanico.valor).toBe(20)   // 10% de 200
    expect(r.atendente.valor).toBe(4.5) // 5% de 90
    expect(r.total).toBe(24.5)
  })
})

describe('resolveEquipe', () => {
  const funcionarios = [
    { id: 'f-mec', id_usuario: 'u-mec', cargo: 'mecanico', nome: 'Mecanico' },
    { id: 'f-at', id_usuario: 'u-at', cargo: 'atendente', nome: 'Atendente' },
  ]

  it('resolve pelos ids diretos id_mecanico/id_atendente', () => {
    const { mecanico, atendente } = resolveEquipe({ id_mecanico: 'f-mec', id_atendente: 'f-at' }, funcionarios)
    expect(mecanico?.id).toBe('f-mec')
    expect(atendente?.id).toBe('f-at')
  })

  it('cai no funcionario vinculado ao id_usuario quando faltam os ids (OS antiga)', () => {
    const { mecanico, atendente } = resolveEquipe({ id_usuario: 'u-mec' }, funcionarios)
    expect(mecanico?.id).toBe('f-mec')
    expect(atendente).toBeNull()
  })

  it('nao duplica o mesmo funcionario como mecanico e atendente', () => {
    const { mecanico, atendente } = resolveEquipe({ id_mecanico: 'f-mec', id_atendente: 'f-mec' }, funcionarios)
    expect(mecanico?.id).toBe('f-mec')
    expect(atendente).toBeNull()
  })

  it('retorna vazio quando nao ha correspondencia', () => {
    const { mecanico, atendente } = resolveEquipe({ id_usuario: 'desconhecido' }, funcionarios)
    expect(mecanico).toBeNull()
    expect(atendente).toBeNull()
  })
})
