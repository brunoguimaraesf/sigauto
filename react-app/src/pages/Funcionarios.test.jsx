// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { Funcionarios } from './Funcionarios'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const MOCK_FUNCS = [
  { id: 'f1', nome: 'Carlos Mecânico', cargo: 'mecanico', comissao_percentual: 10, comissao_sobre_servicos: true, comissao_sobre_pecas: false, id_usuario: 'u1', ativo: true },
  { id: 'f2', nome: 'Ana Atendente', cargo: 'atendente', comissao_percentual: 0, comissao_sobre_servicos: false, comissao_sobre_pecas: false, id_usuario: null, ativo: true },
]

// Mock do Supabase: Funcionarios busca a tabela completa direto e grava por
// insert/update. `escritas` guarda o payload que sairia para o PostgREST.
const mocks = vi.hoisted(() => ({ escritas: [], erroEscrita: null, linhas: [] }))

vi.mock('../supabaseClient', () => ({
  supabaseDb: {
    from: (tabela) => {
      const consulta = {
        select: () => ({ order: () => Promise.resolve({ data: mocks.linhas, error: null }) }),
        insert: (payload) => {
          mocks.escritas.push({ tabela, op: 'insert', payload })
          return Promise.resolve({ data: null, error: mocks.erroEscrita })
        },
        update: (payload) => {
          mocks.escritas.push({ tabela, op: 'update', payload })
          return { eq: (_col, valor) => {
            mocks.escritas[mocks.escritas.length - 1].id = valor
            return Promise.resolve({ data: null, error: mocks.erroEscrita })
          } }
        },
      }
      return consulta
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.escritas = []
  mocks.erroEscrita = null
  mocks.linhas = MOCK_FUNCS
  useDatabase.mockReturnValue({ usuarios: [{ id: 'u1', nome: 'Carlos', email: 'carlos@x.com' }], reloadDatabase: vi.fn() })
})

describe('Tela de Funcionarios', () => {
  it('mostra o titulo', () => {
    render(<Funcionarios />)
    expect(screen.getByRole('heading', { name: 'Funcionarios' })).toBeInTheDocument()
  })

  it('carrega e lista os funcionarios com a comissao', async () => {
    render(<Funcionarios />)
    expect(await screen.findByText('Carlos Mecânico')).toBeInTheDocument()
    expect(screen.getByText('Ana Atendente')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument() // comissao do mecanico
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Formulário (Funcionarios.jsx:66-86) e o clamp da comissão em 0..100 (linha 73).
// ─────────────────────────────────────────────────────────────────────────────

// Abre o modal de criação, preenche e dispara o submit direto no <form>.
async function cadastrarFuncionario({ nome = 'Novo Func', cargo, percentual } = {}) {
  render(<Funcionarios />)
  await screen.findByText('Carlos Mecânico')
  fireEvent.click(screen.getByRole('button', { name: /Novo Funcionario/i }))
  const form = screen.getByRole('button', { name: /Criar Funcionario/i }).closest('form')
  fireEvent.change(within(form).getByPlaceholderText(/Joao da Silva/i), { target: { value: nome } })
  if (cargo !== undefined) {
    fireEvent.change(within(form).getAllByRole('combobox')[0], { target: { value: cargo } })
  }
  if (percentual !== undefined) {
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: percentual } })
  }
  fireEvent.submit(form)
  return form
}

describe('Funcionarios — validação e clamp da comissão', () => {
  it('deve_barrar_submit_quando_nome_e_so_espaco_em_branco', async () => {
    await cadastrarFuncionario({ nome: '   ' })
    expect(await screen.findByText('Informe o nome do funcionário.')).toBeInTheDocument()
    expect(mocks.escritas).toHaveLength(0)
  })

  it('deve_gravar_nome_sem_espacos_nas_bordas', async () => {
    await cadastrarFuncionario({ nome: '  Joao da Silva  ', percentual: '7' })
    await waitFor(() => expect(mocks.escritas).toHaveLength(1))
    expect(mocks.escritas[0].payload.nome).toBe('Joao da Silva')
  })

  it.each([
    ['acima de 100', '150', 100],
    ['no limite superior', '100', 100],
    ['logo acima do limite', '100.01', 100],
    ['absurdo', '999999', 100],
    ['negativo', '-5', 0],
    ['negativo grande', '-1000', 0],
    ['zero', '0', 0],
    ['vazio', '', 0],
    ['texto', 'abc', 0],
    ['fracionario valido', '12.5', 12.5],
  ])('deve_limitar_comissao_entre_0_e_100 (%s)', async (_caso, entrada, esperado) => {
    await cadastrarFuncionario({ percentual: entrada })
    await waitFor(() => expect(mocks.escritas).toHaveLength(1))
    expect(mocks.escritas[0].payload.comissao_percentual).toBe(esperado)
  })

  it('deve_usar_mecanico_como_cargo_padrao_quando_nada_e_escolhido', async () => {
    await cadastrarFuncionario({})
    await waitFor(() => expect(mocks.escritas).toHaveLength(1))
    expect(mocks.escritas[0].payload.cargo).toBe('mecanico')
  })

  it.each(['mecanico', 'atendente', 'gestor'])('deve_gravar_o_cargo_escolhido (%s)', async (cargo) => {
    await cadastrarFuncionario({ cargo })
    await waitFor(() => expect(mocks.escritas).toHaveLength(1))
    expect(mocks.escritas[0].payload.cargo).toBe(cargo)
  })

  it('deve_oferecer_apenas_os_tres_cargos_do_enum_sem_opcao_vazia', async () => {
    render(<Funcionarios />)
    await screen.findByText('Carlos Mecânico')
    fireEvent.click(screen.getByRole('button', { name: /Novo Funcionario/i }))
    const form = screen.getByRole('button', { name: /Criar Funcionario/i }).closest('form')
    const opcoes = within(within(form).getAllByRole('combobox')[0]).getAllByRole('option')
    expect(opcoes.map(o => o.value)).toEqual(['mecanico', 'atendente', 'gestor'])
  })

  // BUG: Funcionarios.jsx:66-86 só valida o nome. O cargo não é conferido antes
  // do insert: um valor fora do enum `cargo_funcionario` (aqui forçado no select,
  // como faria um submit programático ou uma extensão) só é recusado pelo
  // Postgres — a tela nem tenta impedir.
  it('deve_rejeitar_cargo_vazio_antes_de_chamar_o_banco', async () => {
    await cadastrarFuncionario({ cargo: '' })
    expect(await screen.findByText(/cargo valido/i)).toBeInTheDocument()
    expect(mocks.escritas).toHaveLength(0)
  })

  it('deve_rejeitar_cargo_fora_do_enum', async () => {
    await cadastrarFuncionario({ cargo: 'superadmin' })
    expect(await screen.findByText(/cargo valido/i)).toBeInTheDocument()
    expect(mocks.escritas).toHaveLength(0)
  })

  it('deve_mostrar_o_erro_do_banco_e_manter_o_modal_aberto', async () => {
    mocks.erroEscrita = { message: 'new row violates row-level security policy' }
    await cadastrarFuncionario({ nome: 'Joao' })
    expect(await screen.findByText(/row-level security/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Criar Funcionario/i })).toBeInTheDocument()
  })

  it('deve_editar_pela_rota_de_update_preservando_o_clamp', async () => {
    render(<Funcionarios />)
    await screen.findByText('Carlos Mecânico')
    fireEvent.click(screen.getAllByRole('button', { name: /Editar/i })[0])
    const form = screen.getByRole('button', { name: /Salvar Alteracoes/i }).closest('form')
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '250' } })
    fireEvent.submit(form)
    await waitFor(() => expect(mocks.escritas).toHaveLength(1))
    expect(mocks.escritas[0].op).toBe('update')
    expect(mocks.escritas[0].id).toBe('f1')
    expect(mocks.escritas[0].payload.comissao_percentual).toBe(100)
  })

  it('deve_descartar_id_usuario_que_nao_e_uuid', async () => {
    await cadastrarFuncionario({ nome: 'Sem login' })
    await waitFor(() => expect(mocks.escritas).toHaveLength(1))
    expect(mocks.escritas[0].payload.id_usuario).toBeNull()
  })
})
