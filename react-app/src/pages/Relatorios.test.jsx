// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Relatorios } from './Relatorios'
import { useDatabase } from '../hooks/useDatabase'
import { supabaseDb } from '../supabaseClient'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))
vi.mock('../supabaseClient', () => ({ supabaseDb: { from: vi.fn() } }))

// RF07/RN22: dois funcionarios de MESMO NOME, para provar que o filtro usa id.
const MECANICO_A = { id: 'f1', nome: 'Carlos Souza', cargo: 'mecanico', ativo: true, comissao_percentual: 10, comissao_sobre_servicos: true, comissao_sobre_pecas: false }
const MECANICO_B = { id: 'f2', nome: 'Carlos Souza', cargo: 'mecanico', ativo: true, comissao_percentual: 10, comissao_sobre_servicos: true, comissao_sobre_pecas: false }
const ATENDENTE = { id: 'f3', nome: 'Ana Lima', cargo: 'atendente', ativo: true, comissao_percentual: 5, comissao_sobre_servicos: true, comissao_sobre_pecas: false }

const hoje = new Date().toISOString()

const os = (id, numero, idMecanico, valorServico) => ({
  id,
  numero_os: numero,
  status: 'concluida',
  veiculo_id: 'v1',
  cliente_id: 'c1',
  id_mecanico: idMecanico,
  id_atendente: ATENDENTE.id,
  data_abertura: hoje,
  data_encerramento: hoje,
  valor_total: valorServico,
  servicos_itens: [{ descricao: 'Troca de oleo', quantidade: 1, valor_unitario: valorServico }],
  pecas_itens: [],
  comissoes_snapshot: {},
})

const db = {
  clientes: [{ id: 'c1', nome: 'Cliente Unico' }],
  veiculos: [{ id: 'v1', cliente_id: 'c1', placa: 'ABC1D23' }],
  ordensServico: [os('o1', 1001, MECANICO_A.id, 1000), os('o2', 1002, MECANICO_B.id, 500)],
  servicos: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  useDatabase.mockReturnValue(db)
  const consulta = {}
  consulta.select = () => consulta
  consulta.eq = () => consulta
  consulta.order = () => Promise.resolve({ data: [MECANICO_A, MECANICO_B, ATENDENTE], error: null })
  supabaseDb.from.mockReturnValue(consulta)
})

const linhasDaTabela = () => Array.from(document.querySelectorAll('tbody tr')).map(
  tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent),
)

const selecionarFuncionario = async (valor) => {
  const select = await screen.findByLabelText(/Funcionario/i)
  await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(4))
  fireEvent.change(select, { target: { value: valor } })
}

describe('Relatorios — filtro por funcionario (RF07)', () => {
  it('separa a comissao de funcionarios homonimos pelo id', async () => {
    render(<Relatorios />)
    fireEvent.click(screen.getByText('Comissoes'))
    await selecionarFuncionario(MECANICO_B.id)

    const linhas = linhasDaTabela()
    expect(linhas).toHaveLength(1)
    // Comissao do mecanico B: 10% sobre os R$ 500,00 da OS 1002.
    expect(linhas[0][2]).toBe('#1002')
    expect(linhas[0][8]).toContain('50,00')
  })

  it('os totais de comissao fecham com as linhas filtradas', async () => {
    render(<Relatorios />)
    fireEvent.click(screen.getByText('Comissoes'))
    await selecionarFuncionario(MECANICO_A.id)

    const totais = screen.getByText('Total Comissoes').parentElement
    expect(within(totais).getByText(/100,00/)).toBeInTheDocument()
    // So o mecanico selecionado entra: a atendente da mesma OS sai do relatorio.
    expect(screen.getByText('Atendentes').parentElement.textContent).toMatch(/R\$\s?0,00/)
    expect(linhasDaTabela()).toHaveLength(1)
  })

  it('filtra as O.S. do faturamento pelo funcionario da equipe', async () => {
    render(<Relatorios />)
    await selecionarFuncionario(MECANICO_A.id)

    const linhas = linhasDaTabela()
    expect(linhas).toHaveLength(1)
    expect(linhas[0][0]).toBe('#1001')
  })

  // RF07/RN22 — regressao: a escolha do snapshot era pelo OBJETO inteiro, entao
  // uma OS encerrada com snapshot so do mecanico zerava a linha do atendente.
  it('usa o snapshot papel por papel, sem zerar o papel que ficou de fora', async () => {
    const osParcial = {
      ...os('o3', 1003, MECANICO_A.id, 1000),
      comissoes_snapshot: {
        mecanico: {
          id_funcionario: MECANICO_A.id,
          nome: MECANICO_A.nome,
          percentual: 10,
          baseServicos: 1000,
          basePecas: 0,
          valor: 100,
          sobreServicos: true,
          sobrePecas: false,
        },
      },
    }
    useDatabase.mockReturnValue({ ...db, ordensServico: [osParcial] })
    render(<Relatorios />)
    fireEvent.click(screen.getByText('Comissoes'))
    await selecionarFuncionario(ATENDENTE.id)

    const linhas = linhasDaTabela()
    expect(linhas).toHaveLength(1)
    // 5% sobre os R$ 1.000,00 de servico, calculado ao vivo: nao e R$ 0,00.
    expect(linhas[0][7]).toContain('5')
    expect(linhas[0][8]).toContain('50,00')
  })

  it('desabilita o filtro no relatorio de estoque, que nao tem funcionario', async () => {
    render(<Relatorios />)
    fireEvent.click(screen.getByText('Estoque'))
    expect(await screen.findByLabelText(/Funcionario/i)).toBeDisabled()
  })

  it('volta a mostrar todos os funcionarios com a opcao Todos', async () => {
    render(<Relatorios />)
    await selecionarFuncionario(MECANICO_A.id)
    expect(linhasDaTabela()).toHaveLength(1)

    await selecionarFuncionario('')
    expect(linhasDaTabela()).toHaveLength(2)
  })
})
