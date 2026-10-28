// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Usuarios } from './Usuarios'

const { criarUsuario } = vi.hoisted(() => ({ criarUsuario: vi.fn() }))
const reloadDatabase = vi.fn()

vi.mock('../services/api', () => ({ usuariosApi: { criar: criarUsuario } }))
vi.mock('../hooks/useDatabase', () => ({ useDatabase: () => ({ reloadDatabase }) }))

const MOCK = [
  { id: 'u1', nome: 'Gestor Um', email: 'gestor@x.com', perfil: 'gestor', telefone: null, ativo: true },
  { id: 'u2', nome: 'Ana Atendente', email: 'ana@x.com', perfil: 'atendente', telefone: null, ativo: true },
  // Nome com payload de XSS: o React tem de escapar, nunca executar.
  { id: 'u3', nome: '<script>window.__xssUsuario = true</script>', email: 'xss@x.com', perfil: 'mecanico', telefone: null, ativo: true },
]

vi.mock('../supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn(), signUp: vi.fn(), setSession: vi.fn() } },
  supabaseDb: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: MOCK, error: null }) }) }),
  },
}))

beforeEach(() => vi.clearAllMocks())

describe('Tela de Usuarios', () => {
  it('mostra o titulo', () => {
    render(<Usuarios />)
    expect(screen.getByRole('heading', { name: /Gestão de Usuários/i })).toBeInTheDocument()
  })

  it('carrega e lista os usuarios', async () => {
    render(<Usuarios />)
    expect(await screen.findByText('Gestor Um')).toBeInTheDocument()
    expect(screen.getByText('Ana Atendente')).toBeInTheDocument()
    expect(screen.getByText('gestor@x.com')).toBeInTheDocument()
  })

  it('cria a conta pelo backend para confirma-la e vincular o funcionario', async () => {
    criarUsuario.mockResolvedValue({ erro: false })
    render(<Usuarios />)
    await screen.findByText('Gestor Um')

    fireEvent.click(screen.getByRole('button', { name: /Novo Usuário/i }))
    fireEvent.change(screen.getByPlaceholderText('Ex: Joao da Silva'), { target: { value: 'Carlos Mecânico' } })
    fireEvent.change(screen.getByPlaceholderText('usuario@oficina.com'), { target: { value: 'carlos@oficina.com' } })
    fireEvent.change(screen.getByPlaceholderText('Min. 8 caracteres'), { target: { value: 'Senha1234' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mecanico' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar Usuário' }))

    await waitFor(() => expect(criarUsuario).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Carlos Mecânico',
      email: 'carlos@oficina.com',
      senha: 'Senha1234',
      perfil: 'mecanico',
    })))
    expect(reloadDatabase).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Formulário de usuário na TELA (o backend tem suíte própria para POST
// /auth/usuarios). Aqui: perfil, senha mínima e duplicidade de e-mail.
// ─────────────────────────────────────────────────────────────────────────────

// Abre o modal de criação, preenche e dispara o submit direto no <form>.
async function criarPelaTela({ nome = 'Novo Usuario', email = 'novo@oficina.com', senha = 'Senha1234', perfil } = {}) {
  render(<Usuarios />)
  await screen.findByText('Gestor Um')
  fireEvent.click(screen.getByRole('button', { name: /Novo Usuário/i }))
  const form = screen.getByRole('button', { name: 'Criar Usuário' }).closest('form')
  fireEvent.change(screen.getByPlaceholderText('Ex: Joao da Silva'), { target: { value: nome } })
  fireEvent.change(screen.getByPlaceholderText('usuario@oficina.com'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('Min. 8 caracteres'), { target: { value: senha } })
  if (perfil !== undefined) {
    fireEvent.change(screen.getByRole('combobox'), { target: { value: perfil } })
  }
  fireEvent.submit(form)
  return form
}

describe('Usuarios — validação do formulário na tela', () => {
  it('deve_usar_atendente_como_perfil_padrao', async () => {
    criarUsuario.mockResolvedValue({ erro: false })
    await criarPelaTela({})
    await waitFor(() => expect(criarUsuario).toHaveBeenCalled())
    expect(criarUsuario.mock.calls[0][0].perfil).toBe('atendente')
  })

  it.each(['gestor', 'atendente', 'mecanico'])('deve_enviar_o_perfil_escolhido (%s)', async (perfil) => {
    criarUsuario.mockResolvedValue({ erro: false })
    await criarPelaTela({ perfil })
    await waitFor(() => expect(criarUsuario).toHaveBeenCalled())
    expect(criarUsuario.mock.calls[0][0].perfil).toBe(perfil)
  })

  it('deve_oferecer_apenas_os_tres_perfis_do_enum_sem_opcao_vazia', async () => {
    render(<Usuarios />)
    await screen.findByText('Gestor Um')
    fireEvent.click(screen.getByRole('button', { name: /Novo Usuário/i }))
    const opcoes = within(screen.getByRole('combobox')).getAllByRole('option')
    expect(opcoes.map(o => o.value)).toEqual(['gestor', 'atendente', 'mecanico'])
  })

  // BUG: Usuarios.jsx:81-107 não valida o perfil antes de chamar a API. Só a
  // senha é conferida. Um perfil fora do enum `perfil_usuario` (aqui o select cai para '') sai da tela e
  // depende inteiramente do backend para ser recusado.
  it('deve_rejeitar_perfil_fora_do_enum_antes_de_chamar_a_api', async () => {
    criarUsuario.mockResolvedValue({ erro: false })
    await criarPelaTela({ perfil: 'superadmin' })
    expect(await screen.findByText(/perfil de acesso válido/i)).toBeInTheDocument()
    expect(criarUsuario).not.toHaveBeenCalled()
  })

  it.each([
    ['vazia', ''],
    ['com 7 caracteres', 'Senha12'],
  ])('deve_barrar_senha_%s_sem_chamar_a_api', async (_caso, senha) => {
    await criarPelaTela({ senha })
    expect(await screen.findByText('A senha deve ter pelo menos 8 caracteres.')).toBeInTheDocument()
    expect(criarUsuario).not.toHaveBeenCalled()
  })

  it('deve_aceitar_senha_com_exatamente_8_caracteres', async () => {
    criarUsuario.mockResolvedValue({ erro: false })
    await criarPelaTela({ senha: '12345678' })
    await waitFor(() => expect(criarUsuario).toHaveBeenCalled())
  })

  // BUG: Usuarios.jsx:81-107 não compara o e-mail digitado com a lista já
  // carregada em `usuarios`. 'gestor@x.com' pertence ao usuário u1 e mesmo
  // assim a tela dispara a criação; a recusa depende do Supabase Auth.
  it('deve_rejeitar_email_ja_cadastrado_antes_de_chamar_a_api', async () => {
    criarUsuario.mockResolvedValue({ erro: false })
    await criarPelaTela({ email: 'gestor@x.com' })
    expect(await screen.findByText(/e-mail já está cadastrado/i)).toBeInTheDocument()
    expect(criarUsuario).not.toHaveBeenCalled()
  })

  it('deve_comparar_email_duplicado_sem_diferenciar_maiusculas', async () => {
    await criarPelaTela({ email: 'GESTOR@X.COM' })
    expect(await screen.findByText(/e-mail já está cadastrado/i)).toBeInTheDocument()
    expect(criarUsuario).not.toHaveBeenCalled()
  })

  it('deve_manter_o_modal_aberto_e_reabilitar_o_botao_quando_a_api_falha', async () => {
    criarUsuario.mockRejectedValue(new Error('Falha de rede'))
    await criarPelaTela({})
    expect(await screen.findByText('Falha de rede')).toBeInTheDocument()
    const botao = screen.getByRole('button', { name: 'Criar Usuário' })
    expect(botao).toBeInTheDocument()
    await waitFor(() => expect(botao).not.toBeDisabled())
    expect(reloadDatabase).not.toHaveBeenCalled()
  })

  it('deve_enviar_telefone_nulo_quando_o_campo_fica_vazio', async () => {
    criarUsuario.mockResolvedValue({ erro: false })
    await criarPelaTela({})
    await waitFor(() => expect(criarUsuario).toHaveBeenCalled())
    expect(criarUsuario.mock.calls[0][0].telefone).toBeNull()
  })

  it('deve_escapar_script_no_nome_do_usuario_ao_renderizar_a_lista', async () => {
    const { container } = render(<Usuarios />)
    await screen.findByText('Gestor Um')
    expect(screen.getByText('<script>window.__xssUsuario = true</script>')).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(window.__xssUsuario).toBeUndefined()
  })
})
