// @vitest-environment jsdom
// RF07/RN24: a receita do periodo nao pode puxar O.S. das ultimas horas da
// vespera nem perder a do ultimo segundo do dia final. Fuso fixado antes de
// qualquer data; a CI roda em UTC, onde o defeito nao aparecia.
/* global process */
process.env.TZ = 'America/Sao_Paulo'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Relatorios } from './Relatorios'
import { useDatabase } from '../hooks/useDatabase'
import { supabaseDb } from '../supabaseClient'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))
vi.mock('../supabaseClient', () => ({ supabaseDb: { from: vi.fn() } }))

const concluida = (id, numero, data, valor) => ({
  id, numero_os: numero, status: 'concluida', veiculo_id: 'v1', cliente_id: 'c1',
  data_abertura: data, data_encerramento: data, valor_total: valor,
  servicos_itens: [], pecas_itens: [], comissoes_snapshot: {},
})

beforeEach(() => {
  vi.clearAllMocks()
  useDatabase.mockReturnValue({
    clientes: [{ id: 'c1', nome: 'Cliente Periodo' }],
    veiculos: [{ id: 'v1', cliente_id: 'c1', placa: 'PER1D24' }],
    servicos: [],
    ordensServico: [
      concluida('o1', 201, '2026-09-30T22:00:00-03:00', 1000), // vespera, 22h local
      concluida('o2', 202, '2026-10-01T08:00:00-03:00', 300),
      concluida('o3', 203, '2026-10-31T23:59:59.900-03:00', 200), // ultimo segundo
    ],
  })
  const consulta = {}
  consulta.select = () => consulta
  consulta.eq = () => consulta
  consulta.order = () => Promise.resolve({ data: [], error: null })
  supabaseDb.from.mockReturnValue(consulta)
})

const definirPeriodo = (inicio, fim) => {
  const [campoInicio, campoFim] = document.querySelectorAll('input[type="date"]')
  fireEvent.change(campoInicio, { target: { value: inicio } })
  fireEvent.change(campoFim, { target: { value: fim } })
}

describe('Relatorios — fronteiras do periodo (RF07/RN24)', () => {
  it('faturamento de outubro soma somente as O.S. do dia civil de outubro', () => {
    render(<Relatorios />)
    definirPeriodo('2026-10-01', '2026-10-31')
    const receita = screen.getByText('Receita Total').parentElement
    expect(within(receita).getByText(/500,00/)).toBeInTheDocument()
    const concluidas = screen.getByText('O.S. Concluídas').parentElement
    expect(within(concluidas).getByText('2')).toBeInTheDocument()
  })

  // QA-09: a receita segue a data de encerramento, como chatbot e Painel IA.
  it('faturamento conta a O.S. pelo encerramento, nao pela abertura', () => {
    useDatabase.mockReturnValue({
      clientes: [{ id: 'c1', nome: 'Cliente Periodo' }],
      veiculos: [{ id: 'v1', cliente_id: 'c1', placa: 'PER1D24' }],
      servicos: [],
      ordensServico: [
        { ...concluida('o4', 204, '2026-09-20T10:00:00-03:00', 700), data_encerramento: '2026-10-02T10:00:00-03:00' },
        { ...concluida('o5', 205, '2026-10-20T10:00:00-03:00', 900), data_encerramento: '2026-11-03T10:00:00-03:00' },
      ],
    })
    render(<Relatorios />)
    definirPeriodo('2026-10-01', '2026-10-31')

    const receita = screen.getByText('Receita Total').parentElement
    expect(within(receita).getByText(/700,00/)).toBeInTheDocument()
    const linhas = Array.from(document.querySelectorAll('tbody tr')).map(tr => tr.querySelector('td').textContent)
    expect(linhas).toEqual(['#204'])
  })
})
