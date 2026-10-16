// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from './Dashboard'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const agora = new Date()
const ANO = agora.getFullYear()
const MES = agora.getMonth()

// Datas ancoradas no dia 15 para não escorregarem para outro mês por fuso.
const noMes = (ano, mes, dia = 15) => new Date(ano, mes, dia, 12, 0, 0).toISOString()

const mesAnterior = MES === 0 ? { ano: ANO - 1, mes: 11 } : { ano: ANO, mes: MES - 1 }

const baseDb = {
  loading: false,
  clientes: [{ id: 'c1', nome: 'João Silva' }],
  veiculos: [{ id: 'v1', id_cliente: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }],
  servicos: [],
  ordensServico: [
    // Concluída no mês corrente: entra no faturamento.
    {
      id: 'o1', numero_os: 1, id_veiculo: 'v1', status: 'concluida',
      data_abertura: noMes(ANO, MES, 10), data_encerramento: noMes(ANO, MES, 12),
      valor_total: 1000, servicos_itens: [], pecas_itens: [],
    },
    // Cancelada no mês corrente, COM valor: não pode entrar no faturamento.
    {
      id: 'o2', numero_os: 2, id_veiculo: 'v1', status: 'cancelada',
      data_abertura: noMes(ANO, MES, 11), data_encerramento: null,
      valor_total: 5000, servicos_itens: [], pecas_itens: [],
    },
    // Aberta no mês corrente, COM valor: também não é faturamento.
    {
      id: 'o3', numero_os: 3, id_veiculo: 'v1', status: 'aberta',
      data_abertura: noMes(ANO, MES, 13), data_encerramento: null,
      valor_total: 3000, servicos_itens: [], pecas_itens: [],
    },
    // Concluída no mês ANTERIOR: fora da janela corrente.
    {
      id: 'o4', numero_os: 4, id_veiculo: 'v1', status: 'concluida',
      data_abertura: noMes(mesAnterior.ano, mesAnterior.mes, 5),
      data_encerramento: noMes(mesAnterior.ano, mesAnterior.mes, 8),
      valor_total: 777, servicos_itens: [], pecas_itens: [],
    },
  ],
}

const renderizar = (db = baseDb) => {
  useDatabase.mockReturnValue(db)
  return render(<MemoryRouter><Dashboard /></MemoryRouter>)
}

beforeEach(() => vi.clearAllMocks())

describe('Dashboard', () => {
  it('mostra o carregamento', () => {
    renderizar({ ...baseDb, loading: true })
    expect(screen.getByText(/Carregando painel/i)).toBeInTheDocument()
  })

  it('renderiza a visao geral com os blocos principais', () => {
    renderizar()
    expect(screen.getByRole('heading', { name: 'Visão Geral' })).toBeInTheDocument()
    expect(screen.getByText(/Veículos Cadastrados/i)).toBeInTheDocument()
    expect(screen.getByText(/Faturamento/i)).toBeInTheDocument()
  })

  it('nao tem mais a aba de Ordens de Servico nem o formulario embutido', () => {
    renderizar()
    expect(screen.queryByRole('button', { name: /Ordens de Serviço/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Abertura de Nova Ordem de Serviço/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Todas as Ordens de Serviço/i)).not.toBeInTheDocument()
    // O caminho para a O.S. passa a ser a pagina dedicada.
    expect(screen.getByRole('link', { name: /Ver Todas as O.S./i })).toHaveAttribute('href', '/ordens-servico')
  })

  it('conta no faturamento somente OS concluida, ignorando cancelada e aberta', () => {
    renderizar()
    // 1000 da concluída; 5000 da cancelada e 3000 da aberta ficam de fora.
    expect(screen.getByText('R$ 1.000')).toBeInTheDocument()
    expect(screen.queryByText(/R\$ 9\.000/)).not.toBeInTheDocument()
    expect(screen.getByText(/1 O\.S\. concluída/i)).toBeInTheDocument()
  })

  it('conta as OS do mes pela data de abertura', () => {
    renderizar()
    // 3 aberturas no mês corrente; a quarta OS é do mês anterior.
    expect(screen.getByText(/3 OS em/i)).toBeInTheDocument()
  })

  it('troca o periodo e recalcula o faturamento pelo mes escolhido', () => {
    renderizar()

    fireEvent.change(screen.getByLabelText('Ano de referência'), { target: { value: String(mesAnterior.ano) } })
    fireEvent.change(screen.getByLabelText('Mês de referência'), { target: { value: String(mesAnterior.mes) } })

    expect(screen.getByText('R$ 777')).toBeInTheDocument()
    expect(screen.queryByText('R$ 1.000')).not.toBeInTheDocument()
    expect(screen.getByText(/1 OS em/i)).toBeInTheDocument()
  })

  it('zera o faturamento em mes sem OS concluida, sem quebrar a tela', () => {
    renderizar({ ...baseDb, ordensServico: [] })

    expect(screen.getByText('R$ 0')).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma O\.S\. concluída em/i)).toBeInTheDocument()
  })
})
