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
