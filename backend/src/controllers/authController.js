import { supabase } from '../services/supabaseClient.js'
import { registrarAuditoria } from '../utils/auditLogger.js'
import { logger } from '../utils/logger.js'

const PERFIS_VALIDOS = new Set(['gestor', 'atendente', 'mecanico'])
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Operacao administrativa de autenticacao. Fica no backend porque depende de
// auth.admin/service_role; nao e uma rota CRUD generica sobre a tabela usuario.
export async function criarUsuario(req, res, next) {
  let authUserId = null
  try {
    const nome = String(req.body?.nome || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const senha = String(req.body?.senha || '')
    const perfil = String(req.body?.perfil || '')
    const telefone = String(req.body?.telefone || '').trim() || null

    if (!nome || !EMAIL_VALIDO.test(email) || senha.length < 8 || !PERFIS_VALIDOS.has(perfil)) {
      return res.status(400).json({
        erro: true,
        codigo: 'DADOS_USUARIO_INVALIDOS',
        mensagem: 'Informe nome, e-mail valido, senha com ao menos 8 caracteres e um perfil valido.'
      })
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome }
    })
    if (authError || !authData?.user) {
      const duplicado = /already|registered|exists/i.test(authError?.message || '')
      return res.status(duplicado ? 409 : 400).json({
        erro: true,
        codigo: duplicado ? 'EMAIL_JA_CADASTRADO' : 'FALHA_CRIAR_CONTA',
        mensagem: duplicado ? 'Ja existe uma conta com este e-mail.' : (authError?.message || 'Nao foi possivel criar a conta.')
      })
    }
    authUserId = authData.user.id

    const { data: usuario, error: usuarioError } = await supabase
      .from('usuario')
      .upsert({ id: authUserId, nome, email, perfil, telefone, ativo: true })
      .select('id, nome, email, perfil, telefone, ativo')
      .single()
    if (usuarioError) throw usuarioError

    // Mesma regra do backfill da migracao 11: contas criadas pelo gestor ficam
    // vinculadas a um funcionario. Colaboradores sem login continuam validos.
    const { error: funcionarioError } = await supabase
      .from('funcionario')
      .upsert({ nome, cargo: perfil, id_usuario: authUserId, ativo: true }, { onConflict: 'id_usuario' })
    if (funcionarioError) throw funcionarioError

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'CRIAR_USUARIO',
      tabela: 'usuario',
      idRegistro: authUserId,
      dadosAntes: null,
      dadosDepois: { nome, email, perfil, telefone },
      ipOrigem: req.ip
    })

    return res.status(201).json({ erro: false, dados: { usuario } })
  } catch (err) {
    // Compensacao: evita conta Auth orfa quando perfil/funcionario falham.
    if (authUserId) {
      try {
        const { error: cleanupError } = await supabase.auth.admin.deleteUser(authUserId)
        if (cleanupError) {
          logger.error(`Falha ao remover conta incompleta ${authUserId}: ${cleanupError.message}`)
        }
      } catch (cleanupError) {
        logger.error(`Falha ao remover conta incompleta ${authUserId}: ${cleanupError.message}`)
      }
    }
    next(err)
  }
}

export async function atualizarUsuario(req, res, next) {
  let anterior = null
  try {
    const id = String(req.params?.id || '')
    const nome = String(req.body?.nome || '').trim()
    const perfil = String(req.body?.perfil || '')
    const telefone = String(req.body?.telefone || '').trim() || null
    if (!/^[0-9a-f-]{36}$/i.test(id) || !nome || !PERFIS_VALIDOS.has(perfil)) {
      return res.status(400).json({
        erro: true,
        codigo: 'DADOS_USUARIO_INVALIDOS',
        mensagem: 'Informe usuario, nome e perfil validos.'
      })
    }

    const { data: atual, error: leituraError } = await supabase
      .from('usuario')
      .select('id, nome, email, perfil, telefone, ativo')
      .eq('id', id)
      .single()
    if (leituraError || !atual) {
      return res.status(404).json({ erro: true, codigo: 'USUARIO_NAO_ENCONTRADO', mensagem: 'Usuario nao encontrado.' })
    }
    anterior = atual
    const ativo = typeof req.body?.ativo === 'boolean' ? req.body.ativo : atual.ativo

    const { data: usuario, error: usuarioError } = await supabase
      .from('usuario')
      .update({ nome, perfil, telefone, ativo })
      .eq('id', id)
      .select('id, nome, email, perfil, telefone, ativo')
      .single()
    if (usuarioError) throw usuarioError

    const { error: funcionarioError } = await supabase
      .from('funcionario')
      .upsert({ nome, cargo: perfil, id_usuario: id, ativo }, { onConflict: 'id_usuario' })
    if (funcionarioError) {
      await supabase.from('usuario').update({
        nome: anterior.nome,
        perfil: anterior.perfil,
        telefone: anterior.telefone,
        ativo: anterior.ativo
      }).eq('id', id)
      throw funcionarioError
    }

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'ATUALIZAR_USUARIO',
      tabela: 'usuario',
      idRegistro: id,
      dadosAntes: { nome: anterior.nome, perfil: anterior.perfil, telefone: anterior.telefone },
      dadosDepois: { nome, perfil, telefone, ativo },
      ipOrigem: req.ip
    })

    return res.status(200).json({ erro: false, dados: { usuario } })
  } catch (err) {
    next(err)
  }
}

export async function login(req, res, next) {
  try {
    const { email, senha } = req.body

    if (!email || !senha) {
      return res.status(400).json({
        erro: true,
        codigo: 'CAMPOS_OBRIGATORIOS',
        mensagem: 'Email e senha são obrigatórios.'
      })
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    })

    if (error || !data.session) {
      return res.status(401).json({
        erro: true,
        codigo: 'CREDENCIAIS_INVALIDAS',
        mensagem: 'Email ou senha incorretos.'
      })
    }

    const { data: usuario } = await supabase
      .from('usuario')
      .select('id, nome, perfil, email, ativo')
      .eq('id', data.user.id)
      .single()

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({
        erro: true,
        codigo: 'USUARIO_INATIVO',
        mensagem: 'Usuário inativo ou não encontrado.'
      })
    }

    await registrarAuditoria(supabase, {
      idUsuario: usuario.id,
      acao: 'LOGIN',
      tabela: 'usuario',
      idRegistro: usuario.id,
      dadosAntes: null,
      dadosDepois: { email, perfil: usuario.perfil },
      ipOrigem: req.ip
    })

    logger.info(`Login realizado: ${email}`)

    return res.status(200).json({
      erro: false,
      dados: {
        token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          perfil: usuario.perfil
        }
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function logout(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) {
        await supabase.auth.admin.signOut(user.id)
      }
    }

    return res.status(200).json({
      erro: false,
      mensagem: 'Logout realizado com sucesso.'
    })
  } catch (err) {
    next(err)
  }
}

export async function refresh(req, res, next) {
  try {
    const { refresh_token } = req.body

    if (!refresh_token) {
      return res.status(400).json({
        erro: true,
        codigo: 'REFRESH_TOKEN_AUSENTE',
        mensagem: 'Refresh token não fornecido.'
      })
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token })

    if (error || !data.session) {
      return res.status(401).json({
        erro: true,
        codigo: 'REFRESH_TOKEN_INVALIDO',
        mensagem: 'Refresh token inválido ou expirado.'
      })
    }

    return res.status(200).json({
      erro: false,
      dados: {
        token: data.session.access_token,
        refresh_token: data.session.refresh_token
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        erro: true,
        codigo: 'EMAIL_OBRIGATORIO',
        mensagem: 'Email é obrigatório.'
      })
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL}/reset-password`
    })

    if (error) {
      logger.warn(`Erro ao enviar email de recuperação para ${email}: ${error.message}`)
    }

    // Sempre retorna sucesso para não expor se o email existe
    return res.status(200).json({
      erro: false,
      mensagem: 'Se o email estiver cadastrado, você receberá as instruções de recuperação.'
    })
  } catch (err) {
    next(err)
  }
}
