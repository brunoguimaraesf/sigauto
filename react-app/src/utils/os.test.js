import { describe, it, expect } from 'vitest'
import { statusOSLabel, statusOSClasse } from './os.js'

describe('statusOSLabel', () => {
  it('mapeia os valores do enum', () => {
    expect(statusOSLabel('aberta')).toBe('Aberta')
    expect(statusOSLabel('em_andamento')).toBe('Em Andamento')
    expect(statusOSLabel('aguardando_peca')).toBe('Aguard. Peça')
    expect(statusOSLabel('concluida')).toBe('Concluída')
    expect(statusOSLabel('cancelada')).toBe('Cancelada')
  })
  it('aceita valores legados em português', () => {
    expect(statusOSLabel('Pendente')).toBe('Aberta')
    expect(statusOSLabel('Concluído')).toBe('Concluída')
  })
  it('retorna o próprio valor quando desconhecido', () => {
    expect(statusOSLabel('qualquer')).toBe('qualquer')
  })
  it('cai em Aberta quando vazio', () => {
    expect(statusOSLabel(undefined)).toBe('Aberta')
  })
})

describe('statusOSClasse', () => {
  it('mapeia para as classes de badge', () => {
    expect(statusOSClasse('concluida')).toBe('status-done')
    expect(statusOSClasse('em_andamento')).toBe('status-progress')
    expect(statusOSClasse('aberta')).toBe('status-pending')
    expect(statusOSClasse('aguardando_peca')).toBe('status-pending')
    expect(statusOSClasse('cancelada')).toBe('status-pending')
  })
  it('usa status-pending como padrão', () => {
    expect(statusOSClasse('desconhecido')).toBe('status-pending')
  })
})
