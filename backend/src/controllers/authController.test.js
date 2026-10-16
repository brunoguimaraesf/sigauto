import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  usuarioUpsert: vi.fn(),
  funcionarioUpsert: vi.fn(),
  registrarAuditoria: vi.fn(),
}))

vi.mock('../services/supabaseClient.js', () => ({
  supabase: {
    auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser } },
    from: (tabela) => {
      if (tabela === 'usuario') {
        return {
          upsert: (payload) => {
            mocks.usuarioUpsert(payload)
            return {
              select: () => ({
                single: async () => ({
                  data: { ...payload },
                  error: null,
                }),
              }),
            }
          },
        }
      }
      if (tabela === 'funcionario') {
        return { upsert: mocks.funcionarioUpsert }
      }
      throw new Error(`Tabela inesperada no teste: ${tabela}`)
    },
  },
}))

vi.mock('../utils/auditLogger.js', () => ({ registrarAuditoria: mocks.registrarAuditoria }))
vi.mock('../utils/logger.js', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const { criarUsuario } = await import('./authController.js')

function resposta() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() }
}

function requisicao(body = {}) {
  return { body, user: { id: 'gestor-1', perfil: 'gestor' }, ip: '127.0.0.1' }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createUser.mockResolvedValue({ data: { user: { id: 'usuario-novo' } }, error: null })
  mocks.deleteUser.mockResolvedValue({ data: {}, error: null })
  mocks.funcionarioUpsert.mockResolvedValue({ data: null, error: null })
  mocks.registrarAuditoria.mockResolvedValue(undefined)
})

describe('criarUsuario', () => {
  it('recusa dados invalidos antes de chamar o Auth administrativo', async () => {
    const res = resposta()
    await criarUsuario(requisicao({ email: 'invalido', senha: '123' }), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('cria conta confirmada e vincula o funcionario correspondente', async () => {
    const req = requisicao({
      nome: 'Carlos Mecânico',
      email: 'CARLOS@EXEMPLO.COM',
      senha: 'Senha1234',
      perfil: 'mecanico',
      telefone: '(64) 99999-0000',
    })
    const res = resposta()
    const next = vi.fn()

    await criarUsuario(req, res, next)

    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'carlos@exemplo.com',
      email_confirm: true,
      password: 'Senha1234',
    }))
    expect(mocks.usuarioUpsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'usuario-novo', perfil: 'mecanico', ativo: true,
    }))
    expect(mocks.funcionarioUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ cargo: 'mecanico', id_usuario: 'usuario-novo', ativo: true }),
      { onConflict: 'id_usuario' },
    )
    expect(mocks.registrarAuditoria).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      idUsuario: 'gestor-1', acao: 'CRIAR_USUARIO', idRegistro: 'usuario-novo',
    }))
    expect(res.status).toHaveBeenCalledWith(201)
    expect(next).not.toHaveBeenCalled()
  })

  it('traduz e-mail duplicado para conflito sem criar funcionario', async () => {
    mocks.createUser.mockResolvedValue({ data: {}, error: { message: 'User already registered' } })
    const res = resposta()

    await criarUsuario(requisicao({ nome: 'Ana', email: 'ana@exemplo.com', senha: 'Senha1234', perfil: 'atendente' }), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'EMAIL_JA_CADASTRADO' }))
    expect(mocks.funcionarioUpsert).not.toHaveBeenCalled()
  })

  it('remove a conta Auth se o vinculo de funcionario falhar', async () => {
    const falha = new Error('falha ao gravar funcionario')
    mocks.funcionarioUpsert.mockResolvedValue({ data: null, error: falha })
    const next = vi.fn()

    await criarUsuario(
      requisicao({ nome: 'Ana', email: 'ana@exemplo.com', senha: 'Senha1234', perfil: 'atendente' }),
      resposta(),
      next,
    )

    expect(mocks.deleteUser).toHaveBeenCalledWith('usuario-novo')
    expect(next).toHaveBeenCalledWith(falha)
  })
})
