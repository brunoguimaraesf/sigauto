// RN24/RF07: fronteiras do periodo no dia civil local. O fuso e fixado antes de
// qualquer data; a CI roda em UTC, onde o defeito original nao aparece.
/* global process */
process.env.TZ = 'America/Sao_Paulo'

import { describe, it, expect } from 'vitest'
import { dentroDoPeriodo, inicioDoDia } from './periodo'

describe('inicioDoDia', () => {
  it('e meia-noite local, nao meia-noite UTC', () => {
    expect(inicioDoDia('2026-10-01').toISOString()).toBe('2026-10-01T03:00:00.000Z')
  })

  it('desloca para o dia seguinte atravessando mes e ano', () => {
    expect(inicioDoDia('2026-10-31', 1).toISOString()).toBe('2026-11-01T03:00:00.000Z')
    expect(inicioDoDia('2026-12-31', 1).toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })
})

describe('dentroDoPeriodo', () => {
  const casos = [
    ['vespera as 23h59 local', '2026-09-30T23:59:59.999-03:00', false],
    ['primeiro instante do inicio', '2026-10-01T00:00:00-03:00', true],
    ['meio do periodo, em UTC', '2026-10-15T15:00:00Z', true],
    ['ultimo instante do fim, com microssegundos', '2026-10-31T23:59:59.999999-03:00', true],
    ['primeiro instante do dia seguinte', '2026-11-01T00:00:00-03:00', false],
  ]
  it.each(casos)('%s', (_rotulo, valor, esperado) => {
    expect(dentroDoPeriodo(valor, '2026-10-01', '2026-10-31')).toBe(esperado)
  })

  it('limite vazio deixa o lado aberto', () => {
    expect(dentroDoPeriodo('2020-01-01T12:00:00Z', '', '2026-10-31')).toBe(true)
    expect(dentroDoPeriodo('2030-01-01T12:00:00Z', '2026-10-01', '')).toBe(true)
  })

  it('sem limites aceita tudo, inclusive registro sem data', () => {
    expect(dentroDoPeriodo(undefined, '', '')).toBe(true)
  })

  it('com limite, data invalida fica de fora', () => {
    expect(dentroDoPeriodo('nao-e-data', '2026-10-01', '')).toBe(false)
    expect(dentroDoPeriodo(undefined, '', '2026-10-31')).toBe(false)
  })
})
