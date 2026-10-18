// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ListaOS } from './ListaOS'
import { useDatabase } from '../../hooks/useDatabase'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const renderPage = () => render(<MemoryRouter><ListaOS /></MemoryRouter>)

const baseDb = {
  loading: false,
  clientes: [{ id: 'c1', nome: 'João Silva' }],
  veiculos: [{ id: 'v1', id_cliente: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }],
  funcionarios: [{ id: 'f1', id_usuario: 'u1', cargo: 'mecanico', nome: 'Carlos Mecânico' }],
  ordensServico: [{
    id: 'o1', numero_os: 1001, id_veiculo: 'v1', cliente_id: 'c1',
    id_mecanico: 'f1', status: 'aberta', prioridade: 'normal',
    servicos_itens: [], pecas_itens: [], valor_total: 100, data_abertura: '2026-01-01T10:00:00Z',
  }],
}

beforeEach(() => vi.clearAllMocks())

describe('Tela de Ordens de Serviço', () => {
  it('mostra o estado de carregamento', () => {
    useDatabase.mockReturnValue({ ...baseDb, loading: true, ordensServico: [] })
    renderPage()
    expect(screen.getByText(/Carregando ordens de serviço/i)).toBeInTheDocument()
  })

  it('mostra estado vazio quando nao ha OS', () => {
    useDatabase.mockReturnValue({ ...baseDb, ordensServico: [] })
    renderPage()
    expect(screen.getByText(/Nenhuma O\.S\. encontrada/i)).toBeInTheDocument()
  })

  it('renderiza a OS com cliente, placa e mecanico (via resolveEquipe)', () => {
    useDatabase.mockReturnValue(baseDb)
    renderPage()
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('ABC1D23')).toBeInTheDocument()
    expect(screen.getByText(/Carlos Mecânico/)).toBeInTheDocument()
    expect(screen.getByText('#1001')).toBeInTheDocument()
  })

  it('filtra pela busca (placa/cliente)', () => {
    useDatabase.mockReturnValue(baseDb)
    renderPage()
    const busca = screen.getByPlaceholderText(/Buscar por OS, cliente, placa/i)
    fireEvent.change(busca, { target: { value: 'zzz-nao-existe' } })
    expect(screen.getByText(/Nenhuma O\.S\. encontrada/i)).toBeInTheDocument()
    fireEvent.change(busca, { target: { value: 'joão' } })
    expect(screen.getByText('João Silva')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Filtro de status, incluindo a O.S. legada gravada em portugues, que tem de
// ser encontrada pelo filtro canonico (utils/os.js: statusOSCanonico).
// ---------------------------------------------------------------------------

const clientes = [
  { id: 'c1', nome: 'João Silva' },
  { id: 'c2', nome: 'Maria Souza' },
]
const veiculos = [
  { id: 'v1', id_cliente: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' },
  { id: 'v2', id_cliente: 'c2', placa: 'XYZ9K88', marca: 'Fiat', modelo: 'Uno' },
]

const criarOS = (id, numero, status, clienteId = 'c1', veiculoId = 'v1') => ({
  id, numero_os: numero, id_veiculo: veiculoId, cliente_id: clienteId, status,
  prioridade: 'normal', servicos_itens: [], pecas_itens: [], valor_total: 100,
  data_abertura: '2026-01-01T10:00:00Z',
})

// Pares enum/legado: 1001/1011 abertas, 1002/1012 em andamento, 1004/1014
// concluidas; 1003 aguardando peca e 1005 cancelada nao tem legado.
const ordensVariadas = [
  criarOS('o1', 1001, 'aberta'),
  criarOS('o2', 1002, 'em_andamento'),
  criarOS('o3', 1003, 'aguardando_peca'),
  criarOS('o4', 1004, 'concluida'),
  criarOS('o5', 1005, 'cancelada'),
  criarOS('o6', 1011, 'Pendente', 'c2', 'v2'),
  criarOS('o7', 1012, 'Em Andamento', 'c2', 'v2'),
  criarOS('o8', 1014, 'Concluído', 'c2', 'v2'),
]

const numerosVisiveis = () =>
  screen.queryAllByText(/^#\d+$/).map(el => el.textContent).sort()

const filtrarPor = (status) =>
  fireEvent.change(screen.getByRole('combobox'), { target: { value: status } })

describe('ListaOS — filtro de status', () => {
  beforeEach(() => {
    useDatabase.mockReturnValue({ ...baseDb, clientes, veiculos, ordensServico: ordensVariadas })
  })

  it('mostra todas as O.S. sem filtro', () => {
    renderPage()
    expect(numerosVisiveis()).toHaveLength(8)
  })

  it.each([
    ['aberta', ['#1001', '#1011']],
    ['em_andamento', ['#1002', '#1012']],
    ['aguardando_peca', ['#1003']],
    ['concluida', ['#1004', '#1014']],
    ['cancelada', ['#1005']],
  ])('filtro %s encontra tambem a O.S. legada equivalente', (status, esperados) => {
    renderPage()
    filtrarPor(status)
    expect(numerosVisiveis()).toEqual([...esperados].sort())
  })

  it('O.S. legada em portugues nao fica fora de todos os filtros', () => {
    renderPage()
    // Cada legada tem de aparecer em exatamente um filtro canonico.
    const encontrados = []
    for (const status of ['aberta', 'em_andamento', 'aguardando_peca', 'concluida', 'cancelada']) {
      filtrarPor(status)
      encontrados.push(...numerosVisiveis())
    }
    expect(encontrados).toContain('#1011')
    expect(encontrados).toContain('#1012')
    expect(encontrados).toContain('#1014')
    expect(encontrados).toHaveLength(8)
  })

  it('a O.S. legada concluida nao oferece o botao Encerrar', () => {
    renderPage()
    filtrarPor('concluida')
    expect(numerosVisiveis()).toEqual(['#1004', '#1014'])
    expect(screen.queryByRole('button', { name: /Encerrar/i })).not.toBeInTheDocument()
  })

  it('status desconhecido continua visivel em Todos e fora dos filtros canonicos', () => {
    useDatabase.mockReturnValue({
      ...baseDb, clientes, veiculos,
      ordensServico: [criarOS('o9', 1099, 'status_que_nao_existe')],
    })
    renderPage()
    expect(numerosVisiveis()).toEqual(['#1099'])
    filtrarPor('aberta')
    expect(screen.getByText(/Nenhuma O\.S\. encontrada/i)).toBeInTheDocument()
  })
})

describe('ListaOS — busca combinada com o filtro de status', () => {
  beforeEach(() => {
    useDatabase.mockReturnValue({ ...baseDb, clientes, veiculos, ordensServico: ordensVariadas })
  })

  it('busca por cliente dentro de um status', () => {
    renderPage()
    filtrarPor('concluida')
    fireEvent.change(screen.getByPlaceholderText(/Buscar por OS, cliente, placa/i), { target: { value: 'maria' } })
    expect(numerosVisiveis()).toEqual(['#1014'])
  })

  it('busca por placa que existe em outro status nao devolve nada', () => {
    renderPage()
    filtrarPor('cancelada')
    fireEvent.change(screen.getByPlaceholderText(/Buscar por OS, cliente, placa/i), { target: { value: 'XYZ9K88' } })
    expect(screen.getByText(/Nenhuma O\.S\. encontrada/i)).toBeInTheDocument()
  })

  it('busca por numero da O.S. respeita o filtro de status', () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/Buscar por OS, cliente, placa/i), { target: { value: '101' } })
    expect(numerosVisiveis()).toEqual(['#1011', '#1012', '#1014'])
    filtrarPor('em_andamento')
    expect(numerosVisiveis()).toEqual(['#1012'])
  })

  it('a busca ignora maiusculas e minusculas na placa', () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/Buscar por OS, cliente, placa/i), { target: { value: 'abc1d23' } })
    expect(numerosVisiveis()).toEqual(['#1001', '#1002', '#1003', '#1004', '#1005'])
  })
})
