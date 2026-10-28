// @vitest-environment jsdom
// RN24: a consulta por periodo inclui as O.S. abertas dentro do intervalo,
// inclusive nas datas limite, no dia civil da oficina. A CI roda em UTC, onde o
// defeito de fuso nao aparece; o arquivo fixa America/Sao_Paulo antes de criar
// qualquer data e confere que o fuso realmente valeu.
/* global process */
process.env.TZ = 'America/Sao_Paulo'

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Historico } from './Historico'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const os = (numero, dataAbertura) => ({
  id: `o${numero}`, numero_os: numero, id_veiculo: 'v1', status: 'aberta', data_abertura: dataAbertura,
})

function renderizarComPeriodo(inicio, fim) {
  useDatabase.mockReturnValue({
    loading: false,
    clientes: [{ id: 'c1', nome: 'Cliente Periodo' }],
    veiculos: [{ id: 'v1', id_cliente: 'c1', placa: 'PER1D24', marca: 'Fiat', modelo: 'Uno' }],
    ordensServico: [
      os(101, '2026-09-30T23:30:00-03:00'), // vespera do inicio, hora local
      os(102, '2026-10-01T00:00:00-03:00'), // primeiro instante do inicio
      os(103, '2026-10-31T23:59:59.500-03:00'), // ultimo segundo do fim, com fracao
      os(104, '2026-11-01T00:00:00-03:00'), // dia seguinte ao fim
    ],
  })
  render(<Historico />)
  if (inicio) fireEvent.change(screen.getByLabelText('Data de início'), { target: { value: inicio } })
  if (fim) fireEvent.change(screen.getByLabelText('Data de fim'), { target: { value: fim } })
}

const visiveis = () => [101, 102, 103, 104].filter(n => screen.queryByText(new RegExp(`#?${n}\\b`)))

describe('Historico — RN24 fronteiras do periodo', () => {
  it('roda no fuso da oficina', () => {
    expect(new Date('2026-10-01T12:00:00').getTimezoneOffset()).toBe(180)
  })

  it('exclui a O.S. aberta na noite da vespera da data inicial', () => {
    renderizarComPeriodo('2026-10-01', '')
    expect(visiveis()).toEqual([102, 103, 104])
  })

  it('inclui a O.S. aberta no ultimo segundo da data final, mesmo com fracao de segundo', () => {
    renderizarComPeriodo('', '2026-10-31')
    expect(visiveis()).toEqual([101, 102, 103])
  })

  it('com as duas datas, mantem somente o intervalo fechado do dia civil', () => {
    renderizarComPeriodo('2026-10-01', '2026-10-31')
    expect(visiveis()).toEqual([102, 103])
  })

  it('dia unico: inicio igual ao fim inclui o dia inteiro', () => {
    renderizarComPeriodo('2026-10-31', '2026-10-31')
    expect(visiveis()).toEqual([103])
  })
})
