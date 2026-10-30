// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AbrirOS } from './AbrirOS'
import { useDatabase } from '../../hooks/useDatabase'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const baseDb = {
  clientes: [
    { id: 'c1', nome: 'João Silva', cpf_cnpj: '123.456.789-09' },
    { id: 'c2', nome: 'Maria Souza', cpf_cnpj: '987.654.321-00' },
  ],
  veiculos: [{ id: 'v1', cliente_id: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }],
  funcionarios: [
    { id: 'f1', nome: 'Carlos', cargo: 'mecanico', id_usuario: 'u1' },
    { id: 'f2', nome: 'Ana', cargo: 'atendente', id_usuario: 'u2' },
  ],
  currentUserId: 'u2',
  addCliente: vi.fn(),
  addVeiculo: vi.fn(),
  addOrdemServico: vi.fn(),
}

const renderPage = () => render(<MemoryRouter><AbrirOS /></MemoryRouter>)
const campoBusca = () => screen.getByLabelText(/Buscar cliente por nome/i)

beforeEach(() => {
  vi.clearAllMocks()
  useDatabase.mockReturnValue(baseDb)
})

describe('Tela de Abrir O.S.', () => {
  it('renderiza o formulario com o titulo', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Abrir Nova O\.S\./i })).toBeInTheDocument()
  })

  it('organiza o fluxo em etapas e identifica os campos obrigatorios', () => {
    renderPage()

    expect(screen.getByText('* Campos obrigatórios')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1. Cliente e veículo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2. Responsáveis' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '3. Dados da entrada' })).toBeInTheDocument()
    expect(screen.getByText('Cliente *')).toBeInTheDocument()
    expect(screen.getByText('Veículo *')).toBeInTheDocument()
    expect(screen.getByLabelText('Atendente responsável *')).toBeRequired()
    expect(screen.getByLabelText('Queixa / Descrição do problema *')).toBeRequired()
  })

  it('pede confirmacao antes de cancelar uma O.S. parcialmente preenchida', () => {
    const confirmar = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirmar)
    renderPage()

    fireEvent.change(campoBusca(), { target: { value: 'maria' } })
    fireEvent.click(screen.getByText('Maria Souza'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(confirmar).toHaveBeenCalledWith('Descartar os dados preenchidos da O.S.?')
    expect(screen.getByRole('heading', { name: /Abrir Nova O\.S\./i })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('oferece o atalho de Consumidor e o mecanico no formulario', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /Consumidor/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Carlos' })).toBeInTheDocument() // mecanico (funcionario)
  })

  it('nao lista clientes antes de o atendente digitar', () => {
    // A lista inteira aparecendo de cara era justamente o problema do <select>.
    renderPage()
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })

  it('busca cliente por nome', () => {
    renderPage()
    fireEvent.change(campoBusca(), { target: { value: 'maria' } })

    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })

  it('busca cliente por CPF', () => {
    renderPage()
    fireEvent.change(campoBusca(), { target: { value: '98765432100' } })

    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
  })

  it('busca cliente pela placa do veiculo e mostra qual carro casou', () => {
    renderPage()
    fireEvent.change(campoBusca(), { target: { value: 'ABC1D23' } })

    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText(/Placa ABC1D23/i)).toBeInTheDocument()
  })

  it('avisa quando nada casa com o termo', () => {
    renderPage()
    fireEvent.change(campoBusca(), { target: { value: 'zzzzz' } })

    expect(screen.getByText(/Nenhum cliente encontrado/i)).toBeInTheDocument()
  })

  it('selecionar um resultado troca a busca pelo cliente escolhido', () => {
    renderPage()
    fireEvent.change(campoBusca(), { target: { value: 'maria' } })
    fireEvent.click(screen.getByText('Maria Souza'))

    expect(screen.queryByLabelText(/Buscar cliente por nome/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Trocar/i })).toBeInTheDocument()
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
  })

  // RF05: a O.S. referencia o veiculo por FK. Com o cadastro rapido, o insert
  // do veiculo e o da O.S. saiam juntos e o banco recusava a O.S. com
  // `ordem_servico_id_veiculo_fkey` (o veiculo ainda nao tinha sido gravado).
  it('so grava a O.S. depois que o veiculo novo foi persistido', async () => {
    let gravarVeiculo
    const addVeiculo = vi.fn(() => new Promise(resolve => { gravarVeiculo = resolve }))
    const addOrdemServico = vi.fn().mockResolvedValue({ numero_os: 7 })
    useDatabase.mockReturnValue({ ...baseDb, addVeiculo, addOrdemServico })

    renderPage()
    fireEvent.change(campoBusca(), { target: { value: 'joao' } })
    fireEvent.click(screen.getByText('João Silva'))
    fireEvent.click(screen.getAllByRole('button', { name: '+ Novo' }).at(-1)) // o do veiculo
    fireEvent.change(screen.getByPlaceholderText('Placa *'), { target: { value: 'XYZ9A87' } })
    fireEvent.change(screen.getByPlaceholderText('Marca *'), { target: { value: 'Fiat' } })
    fireEvent.change(screen.getByPlaceholderText('Modelo *'), { target: { value: 'Uno' } })
    fireEvent.change(screen.getByPlaceholderText(/Descreva a queixa/i), { target: { value: 'Barulho na suspensao dianteira' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Abertura/i }))

    await waitFor(() => expect(addVeiculo).toHaveBeenCalled())
    expect(addOrdemServico).not.toHaveBeenCalled()

    await act(async () => { gravarVeiculo({ id: 'v-gravado', placa: 'XYZ9A87', marca: 'Fiat', modelo: 'Uno' }) })

    await waitFor(() => expect(addOrdemServico).toHaveBeenCalledTimes(1))
    expect(addOrdemServico.mock.calls[0][0]).toMatchObject({ id_veiculo: 'v-gravado', cliente_id: 'c1' })
  })

  // RF03: com o Consumidor ja gravado (id real), o atalho selecionava o id
  // ficticio 'cliente-consumidor'; a lista de veiculos vinha vazia e a O.S. de
  // balcao nao abria. Achado no teste do dia completo de 27/10/2026.
  it('Usar Consumidor ja gravado lista os veiculos dele e abre a O.S.', async () => {
    const addOrdemServico = vi.fn().mockResolvedValue({ numero_os: 8 })
    useDatabase.mockReturnValue({
      ...baseDb,
      clientes: [...baseDb.clientes, { id: 'uuid-consumidor', nome: 'Consumidor', cpf_cnpj: '000.000.000-00' }],
      veiculos: [...baseDb.veiculos, { id: 'v-balcao', id_cliente: 'uuid-consumidor', placa: 'BAL8C97', marca: 'Fiat', modelo: 'Strada' }],
      addOrdemServico,
    })

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Usar "Consumidor"/i }))
    const veiculo = screen.getByRole('option', { name: /BAL8C97/ })
    fireEvent.change(veiculo.closest('select'), { target: { value: 'v-balcao' } })
    fireEvent.change(screen.getByPlaceholderText(/Descreva a queixa/i), { target: { value: 'Alinhamento e balanceamento no balcao' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Abertura/i }))

    await waitFor(() => expect(addOrdemServico).toHaveBeenCalledTimes(1))
    expect(addOrdemServico.mock.calls[0][0]).toMatchObject({ id_veiculo: 'v-balcao', cliente_id: 'uuid-consumidor' })
  })

  it('Consumidor criado pelo cadastro rapido do veiculo passa a ser o cliente da O.S.', async () => {
    const addCliente = vi.fn().mockResolvedValue({ id: 'uuid-novo-consumidor', nome: 'Consumidor' })
    const addVeiculo = vi.fn().mockResolvedValue({ id: 'v-novo', id_cliente: 'uuid-novo-consumidor', placa: 'BAL1C23', marca: 'Fiat', modelo: 'Strada' })
    const addOrdemServico = vi.fn().mockResolvedValue({ numero_os: 9 })
    useDatabase.mockReturnValue({ ...baseDb, addCliente, addVeiculo, addOrdemServico })

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Usar "Consumidor"/i }))
    fireEvent.click(screen.getAllByRole('button', { name: '+ Novo' }).at(-1))
    fireEvent.change(screen.getByPlaceholderText('Placa *'), { target: { value: 'BAL1C23' } })
    fireEvent.change(screen.getByPlaceholderText('Marca *'), { target: { value: 'Fiat' } })
    fireEvent.change(screen.getByPlaceholderText('Modelo *'), { target: { value: 'Strada' } })
    fireEvent.change(screen.getByPlaceholderText(/Descreva a queixa/i), { target: { value: 'Alinhamento e balanceamento no balcao' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Abertura/i }))

    await waitFor(() => expect(addOrdemServico).toHaveBeenCalledTimes(1))
    expect(addVeiculo.mock.calls[0][0]).toMatchObject({ id_cliente: 'uuid-novo-consumidor' })
    expect(addOrdemServico.mock.calls[0][0]).toMatchObject({ id_veiculo: 'v-novo', cliente_id: 'uuid-novo-consumidor' })
  })

  it('nao grava a O.S. se o veiculo novo foi recusado pelo banco', async () => {
    const addVeiculo = vi.fn().mockRejectedValue(new Error('duplicate key value violates unique constraint "veiculo_placa_key"'))
    const addOrdemServico = vi.fn()
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {})
    useDatabase.mockReturnValue({ ...baseDb, addVeiculo, addOrdemServico })

    renderPage()
    fireEvent.change(campoBusca(), { target: { value: 'joao' } })
    fireEvent.click(screen.getByText('João Silva'))
    fireEvent.click(screen.getAllByRole('button', { name: '+ Novo' }).at(-1)) // o do veiculo
    fireEvent.change(screen.getByPlaceholderText('Placa *'), { target: { value: 'XYZ9A87' } })
    fireEvent.change(screen.getByPlaceholderText('Marca *'), { target: { value: 'Fiat' } })
    fireEvent.change(screen.getByPlaceholderText('Modelo *'), { target: { value: 'Uno' } })
    fireEvent.change(screen.getByPlaceholderText(/Descreva a queixa/i), { target: { value: 'Barulho na suspensao dianteira' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Abertura/i }))

    await waitFor(() => expect(alerta).toHaveBeenCalled())
    expect(addOrdemServico).not.toHaveBeenCalled()
    alerta.mockRestore()
  })
})
