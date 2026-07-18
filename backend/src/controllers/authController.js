import { supabase } from '../services/supabaseClient.js'
import { registrarAuditoria } from '../utils/auditLogger.js'
import { logger } from '../utils/logger.js'

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
