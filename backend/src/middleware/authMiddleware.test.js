// Autenticacao: o token so autentica; quem define perfil e atividade e a
// tabela `usuario`. Estes testes cobrem os caminhos de recusa e provam que o
// perfil declarado no token e ignorado.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  usuarioDoToken: { data: { user: { id: 'u1' } }, error: null },
  linhaUsuario: { data: { id: 'u1', perfil: 'mecanico', email: 'm@of.com', ativo: true }, error: null },
  colunasPedidas: [],
  filtros: [],
  lancarNoGetUser: false,
}))

vi.mock('../services/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => {
        if (estado.lancarNoGetUser) throw new Error('supabase fora do ar')
        return estado.usuarioDoToken
      }),
    },
    from: () => {
      const consulta = {
        select: (colunas) => { estado.colunasPedidas.push(colunas); return consulta },
        eq: (coluna, valor) => { estado.filtros.push({ coluna, valor }); return consulta },
        single: async () => estado.linhaUsuario,
      }
      return consulta
    },
  },
}))

const { authMiddleware } = await import('./authMiddleware.js')
const { requireRole } = await import('./roleMiddleware.js')

function criarRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
}

async function autenticar(headers = { authorization: 'Bearer tok' }) {
  const req = { headers }
  const res = criarRes()
  let erro = null
  let seguiu = false
  await authMiddleware(req, res, (e) => { if (e) erro = e; else seguiu = true })
  return { req, res, erro, seguiu, corpo: res.json.mock.calls[0]?.[0] }
}

beforeEach(() => {
  estado.usuarioDoToken = { data: { user: { id: 'u1' } }, error: null }
  estado.linhaUsuario = { data: { id: 'u1', perfil: 'mecanico', email: 'm@of.com', ativo: true }, error: null }
  estado.colunasPedidas = []
  estado.filtros = []
  estado.lancarNoGetUser = false
  vi.clearAllMocks()
})

describe('authMiddleware — recusas', () => {
  it('deve_recusar_401_TOKEN_AUSENTE_sem_cabecalho', async () => {
    const { res, corpo, seguiu } = await autenticar({})

    expect(res.status).toHaveBeenCalledWith(401)
    expect(corpo.codigo).toBe('TOKEN_AUSENTE')
    expect(seguiu).toBe(false)
  })

  it('deve_recusar_401_TOKEN_AUSENTE_com_esquema_diferente_de_Bearer', async () => {
    const { corpo } = await autenticar({ authorization: 'Basic abc' })

    expect(corpo.codigo).toBe('TOKEN_AUSENTE')
  })

  it('deve_recusar_401_TOKEN_INVALIDO_quando_o_supabase_rejeita_o_token', async () => {
    estado.usuarioDoToken = { data: { user: null }, error: { message: 'jwt expired' } }

    const { res, corpo } = await autenticar()

    expect(res.status).toHaveBeenCalledWith(401)
    expect(corpo.codigo).toBe('TOKEN_INVALIDO')
    expect(corpo.mensagem).not.toContain('jwt expired')
  })

  it('deve_recusar_401_USUARIO_NAO_ENCONTRADO_quando_nao_ha_linha_em_usuario', async () => {
    // Conta existente no auth do Supabase sem linha espelho em `usuario`.
    estado.linhaUsuario = { data: null, error: { code: 'PGRST116', message: 'no rows' } }

    const { res, corpo, seguiu } = await autenticar()

    expect(res.status).toHaveBeenCalledWith(401)
    expect(corpo.codigo).toBe('USUARIO_NAO_ENCONTRADO')
    expect(seguiu).toBe(false)
  })

  it('deve_recusar_401_USUARIO_INATIVO_quando_ativo_e_false', async () => {
    estado.linhaUsuario = { data: { id: 'u1', perfil: 'gestor', email: 'g@of.com', ativo: false }, error: null }

    const { res, corpo, seguiu } = await autenticar()

    expect(res.status).toHaveBeenCalledWith(401)
    expect(corpo.codigo).toBe('USUARIO_INATIVO')
    expect(seguiu).toBe(false)
  })

  it('trata_ativo_nulo_como_inativo', async () => {
    estado.linhaUsuario = { data: { id: 'u1', perfil: 'gestor', email: 'g@of.com', ativo: null }, error: null }

    const { corpo } = await autenticar()

    expect(corpo.codigo).toBe('USUARIO_INATIVO')
  })

  it('deve_encaminhar_excecao_inesperada_ao_errorHandler', async () => {
    estado.lancarNoGetUser = true

    const { erro, res } = await autenticar()

    expect(erro).toBeInstanceOf(Error)
    expect(res.status).not.toHaveBeenCalled()
  })
})

describe('authMiddleware — o perfil vem da tabela, nao do token', () => {
  it('deve_ignorar_o_perfil_declarado_no_token_e_reler_de_usuario', async () => {
    estado.usuarioDoToken = {
      data: { user: { id: 'u1', user_metadata: { perfil: 'gestor' }, app_metadata: { perfil: 'gestor' }, role: 'gestor' } },
      error: null,
    }
    estado.linhaUsuario = { data: { id: 'u1', perfil: 'mecanico', email: 'm@of.com', ativo: true }, error: null }

    const { req, seguiu } = await autenticar()

    expect(seguiu).toBe(true)
    expect(req.user.perfil).toBe('mecanico')
  })

  it('deve_consultar_usuario_pelo_id_do_token_e_so_pelas_colunas_necessarias', async () => {
    await autenticar()

    expect(estado.filtros).toEqual([{ coluna: 'id', valor: 'u1' }])
    expect(estado.colunasPedidas[0]).toBe('id, perfil, email, ativo')
  })

  it('nao_expoe_no_req_user_campos_alem_de_id_perfil_email', async () => {
    estado.linhaUsuario = {
      data: { id: 'u1', perfil: 'gestor', email: 'g@of.com', ativo: true, senha_hash: 'nao-deveria-vazar' },
      error: null,
    }

    const { req } = await autenticar()

    expect(Object.keys(req.user).sort()).toEqual(['email', 'id', 'perfil'])
  })
})

describe('requireRole', () => {
  it('deve_recusar_403_quando_nao_ha_req_user', () => {
    const res = criarRes()
    const proximo = vi.fn()

    requireRole('gestor')({}, res, proximo)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json.mock.calls[0][0].codigo).toBe('SEM_PERMISSAO')
    expect(proximo).not.toHaveBeenCalled()
  })

  it('deve_recusar_403_para_perfil_fora_da_lista', () => {
    const res = criarRes()
    const proximo = vi.fn()

    requireRole('gestor')({ user: { perfil: 'mecanico' } }, res, proximo)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(proximo).not.toHaveBeenCalled()
  })

  it('deve_liberar_perfil_presente_na_lista', () => {
    const res = criarRes()
    const proximo = vi.fn()

    requireRole('gestor', 'atendente')({ user: { perfil: 'atendente' } }, res, proximo)

    expect(proximo).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('requireRole_sem_argumentos_nega_todo_mundo', () => {
    const res = criarRes()
    const proximo = vi.fn()

    requireRole()({ user: { perfil: 'gestor' } }, res, proximo)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(proximo).not.toHaveBeenCalled()
  })

  it('nao_confunde_perfil_por_prefixo_ou_caixa', () => {
    const res = criarRes()
    const proximo = vi.fn()

    requireRole('gestor')({ user: { perfil: 'Gestor' } }, res, proximo)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(proximo).not.toHaveBeenCalled()
  })
})
