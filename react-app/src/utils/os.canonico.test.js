import { describe, it, expect } from 'vitest'
import { statusOSCanonico } from './os'

// RF06 — regressao: o filtro da lista comparava `os.status` cru com o valor do
// seletor. OS legada gravada em portugues ("Concluído") nao era achada por
// nenhum filtro, e o seletor tinha "Em Andamento" duas vezes.
describe('statusOSCanonico', () => {
  it('devolve o proprio valor do enum', () => {
    for (const status of ['aberta', 'em_andamento', 'aguardando_peca', 'concluida', 'cancelada']) {
      expect(statusOSCanonico(status)).toBe(status)
    }
  })

  it('traduz os legados em portugues, com e sem acento', () => {
    expect(statusOSCanonico('Pendente')).toBe('aberta')
    expect(statusOSCanonico('Em Andamento')).toBe('em_andamento')
    expect(statusOSCanonico('Concluido')).toBe('concluida')
    expect(statusOSCanonico('Concluído')).toBe('concluida')
  })

  it('status ausente conta como aberta', () => {
    expect(statusOSCanonico(undefined)).toBe('aberta')
    expect(statusOSCanonico('')).toBe('aberta')
  })
})
