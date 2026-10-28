// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Veiculos } from './Veiculos'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const baseDb = {
  loading: false,
  clientes: [{ id: 'c1', nome: 'Maria Souza' }],
  veiculos: [
    { id: 'v1', cliente_id: 'c1', placa: 'XYZ1A11', marca: 'Fiat', modelo: 'Uno', ano: 2020, cor: 'Prata', status: 'Pendente' },
    { id: 'v2', cliente_id: 'c1', placa: 'DEF4G55', marca: 'VW', modelo: 'Gol', ano: 2018, cor: 'Preto', status: 'Pendente' },
  ],
  addVeiculo: vi.fn(),
  updateVeiculo: vi.fn(),
  deleteVeiculo: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe('Tela de Veiculos', () => {
  it('mostra o carregamento', () => {
    useDatabase.mockReturnValue({ ...baseDb, loading: true, veiculos: [] })
    render(<Veiculos />)
    expect(screen.getByText(/Buscando veículos/i)).toBeInTheDocument()
  })

  it('mostra estado vazio', () => {
    useDatabase.mockReturnValue({ ...baseDb, veiculos: [] })
    render(<Veiculos />)
    expect(screen.getByText(/Nenhum veículo encontrado/i)).toBeInTheDocument()
  })

  it('lista veiculos com placa, modelo e proprietario', () => {
    useDatabase.mockReturnValue(baseDb)
    render(<Veiculos />)
    expect(screen.getByText('XYZ1A11')).toBeInTheDocument()
    expect(screen.getByText('Fiat Uno')).toBeInTheDocument()
    expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0)
  })

  it('filtra pela busca (placa)', () => {
    useDatabase.mockReturnValue(baseDb)
    render(<Veiculos />)
    const busca = screen.getByPlaceholderText(/Buscar veículo/i)
    fireEvent.change(busca, { target: { value: 'DEF4G55' } })
    expect(screen.getByText('VW Gol')).toBeInTheDocument()
    expect(screen.queryByText('Fiat Uno')).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validação do formulário (Veiculos.jsx:62-81): proprietário obrigatório,
// formato de placa e duplicidade insensível a hífen e a caixa.
// ─────────────────────────────────────────────────────────────────────────────

const CLIENTE_ATIVO = { id: 'c1', nome: 'Maria Souza', telefone: '(64) 99999-0000', ativo: true }
const CLIENTE_INATIVO = { id: 'c2', nome: 'Joao Inativo', telefone: '(64) 98888-0000', ativo: false }

// Preenche o modal de criação e dispara o submit direto no <form>, para exercitar
// o handleSubmit e não a validação nativa do navegador.
function cadastrarVeiculo({ clienteId, placa, marca = 'Fiat', modelo = 'Uno', ano = '2020', cor = 'Prata' }) {
  fireEvent.click(screen.getByRole('button', { name: /Adicionar Veículo/i }))
  if (clienteId !== undefined) {
    fireEvent.change(screen.getByRole('combobox'), { target: { value: clienteId } })
  }
  if (placa !== undefined) {
    fireEvent.change(screen.getByPlaceholderText(/ABC1D23/i), { target: { value: placa } })
  }
  // Marca/Modelo/Ano/Cor nao tem <label htmlFor> (achado de acessibilidade):
  // o seletor usa a ordem dentro do <form>, nao da pagina — a busca do topo
  // tambem e um textbox e deslocaria os indices.
  const form = screen.getAllByRole('button', { name: /Adicionar Veículo/i })[1].closest('form')
  const campos = within(form).getAllByRole('textbox')
  // ordem no form: placa, marca, modelo, ano, cor, observacoes
  fireEvent.change(campos[1], { target: { value: marca } })
  fireEvent.change(campos[2], { target: { value: modelo } })
  fireEvent.change(campos[3], { target: { value: ano } })
  fireEvent.change(campos[4], { target: { value: cor } })
  fireEvent.submit(form)
}

describe('Veiculos — validação do formulário no submit', () => {
  let alerta
  let addVeiculo

  const montar = (veiculos = [], clientes = [CLIENTE_ATIVO]) => {
    useDatabase.mockReturnValue({ ...baseDb, clientes, veiculos, addVeiculo })
    render(<Veiculos />)
  }

  beforeEach(() => {
    alerta = vi.fn()
    addVeiculo = vi.fn().mockResolvedValue({})
    vi.stubGlobal('alert', alerta)
  })

  it('deve_barrar_submit_sem_proprietario_associado', () => {
    montar()
    cadastrarVeiculo({ clienteId: '', placa: 'ABC1D23' })
    expect(alerta).toHaveBeenCalledWith('Associe um proprietário ao veículo.')
    expect(addVeiculo).not.toHaveBeenCalled()
  })

  it.each([
    ['curta demais', 'ABC123'],
    ['so letras', 'ABCDEFG'],
    ['so numeros', '1234567'],
    ['antigo com letra no lugar do numero', 'ABC-123D'],
    ['mercosul com dois numeros no meio', 'ABC12D3'],
    ['longa demais', 'ABC1D234'],
    ['vazia', ''],
  ])('deve_barrar_placa_em_formato_invalido (%s)', (_caso, placa) => {
    montar()
    cadastrarVeiculo({ clienteId: 'c1', placa })
    expect(alerta).toHaveBeenCalledWith(expect.stringContaining('Placa inválida'))
    expect(addVeiculo).not.toHaveBeenCalled()
  })

  it('deve_aceitar_placa_no_formato_mercosul', () => {
    montar()
    cadastrarVeiculo({ clienteId: 'c1', placa: 'ABC1D23' })
    expect(alerta).not.toHaveBeenCalled()
    expect(addVeiculo).toHaveBeenCalledWith(expect.objectContaining({ placa: 'ABC1D23', cliente_id: 'c1' }))
  })

  it('deve_aceitar_placa_no_formato_antigo_e_grava_la_hifenizada', () => {
    montar()
    cadastrarVeiculo({ clienteId: 'c1', placa: 'ABC1234' })
    expect(alerta).not.toHaveBeenCalled()
    expect(addVeiculo).toHaveBeenCalledWith(expect.objectContaining({ placa: 'ABC-1234' }))
  })

  it.each([
    ['mesma grafia', 'ABC-1234'],
    ['sem hifen', 'ABC1234'],
    ['em minuscula', 'abc-1234'],
    ['minuscula sem hifen', 'abc1234'],
    ['com espacos', ' ABC 1234 '],
  ])('deve_barrar_placa_ja_cadastrada (%s)', (_caso, placa) => {
    montar([{ id: 'v1', cliente_id: 'c1', placa: 'ABC-1234', marca: 'VW', modelo: 'Gol' }])
    cadastrarVeiculo({ clienteId: 'c1', placa })
    expect(alerta).toHaveBeenCalledWith(expect.stringContaining('já está cadastrada'))
    expect(addVeiculo).not.toHaveBeenCalled()
  })

  it('deve_barrar_placa_mercosul_duplicada_em_caixa_diferente', () => {
    montar([{ id: 'v1', cliente_id: 'c1', placa: 'XYZ1A11', marca: 'Fiat', modelo: 'Uno' }])
    cadastrarVeiculo({ clienteId: 'c1', placa: 'xyz1a11' })
    expect(alerta).toHaveBeenCalledWith(expect.stringContaining('já está cadastrada'))
    expect(addVeiculo).not.toHaveBeenCalled()
  })

  it('deve_nomear_o_dono_atual_da_placa_na_mensagem_de_duplicidade', () => {
    montar([{ id: 'v1', cliente_id: 'c1', placa: 'ABC-1234' }])
    cadastrarVeiculo({ clienteId: 'c1', placa: 'ABC1234' })
    expect(alerta).toHaveBeenCalledWith(expect.stringContaining('Maria Souza'))
  })

  it('deve_permitir_salvar_o_proprio_veiculo_em_edicao_sem_acusar_duplicidade', () => {
    const updateVeiculo = vi.fn()
    useDatabase.mockReturnValue({
      ...baseDb,
      clientes: [CLIENTE_ATIVO],
      veiculos: [{ id: 'v1', cliente_id: 'c1', placa: 'ABC-1234', marca: 'VW', modelo: 'Gol', ano: 2018, cor: 'Preto' }],
      updateVeiculo,
    })
    render(<Veiculos />)
    fireEvent.click(screen.getByRole('button', { name: /Editar/i }))
    fireEvent.submit(screen.getByRole('button', { name: /Salvar Alterações/i }).closest('form'))
    expect(alerta).not.toHaveBeenCalled()
    expect(updateVeiculo).toHaveBeenCalledWith('v1', expect.objectContaining({ placa: 'ABC-1234' }))
  })

  // BUG: Veiculos.jsx:62-81 não checa `ativo` do cliente. O select só não lista
  // o inativo porque useDatabase já filtra `ativo = true` na leitura — não há
  // regra na tela. Com o cliente inativo presente na lista (p. ex. inativado em
  // outra aba antes do reload), o veículo é aceito e gravado nele.
  it('deve_rejeitar_veiculo_novo_para_cliente_inativo', () => {
    montar([], [CLIENTE_ATIVO, CLIENTE_INATIVO])
    cadastrarVeiculo({ clienteId: 'c2', placa: 'ABC1D23' })
    expect(addVeiculo).not.toHaveBeenCalled()
  })

  it('deve_rejeitar_cliente_que_nao_existe_na_lista_atual', () => {
    montar([], [CLIENTE_ATIVO])
    cadastrarVeiculo({ clienteId: 'cliente-removido', placa: 'ABC1D23' })
    expect(addVeiculo).not.toHaveBeenCalled()
  })

})
