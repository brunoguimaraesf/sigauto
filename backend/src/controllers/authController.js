import { createHmac, randomUUID } from 'node:crypto'
import { criarClienteAutenticacao, supabase } from '../services/supabaseClient.js'
import { registrarAuditoria } from '../utils/auditLogger.js'
import { logger } from '../utils/logger.js'

const PERFIS_VALIDOS = new Set(['gestor', 'atendente', 'mecanico'])
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LIMITE_TENTATIVAS_LOGIN = 5
const DURACAO_BLOQUEIO_SEGUNDOS = 15 * 60

function chaveTentativaLogin(email) {
  const segredo = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!segredo) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente para o controle de login.')
  return createHmac('sha256', segredo).update(String(email).trim().toLowerCase()).digest('hex')
}

async function atualizarBloqueioLogin(email, operacao, reserva = null) {
  const chave = chaveTentativaLogin(email)
  const { data, error } = await supabase.rpc('registrar_tentativa_login', {
    p_chave: chave,
    p_operacao: operacao,
    p_limite: LIMITE_TENTATIVAS_LOGIN,
    p_duracao_segundos: DURACAO_BLOQUEIO_SEGUNDOS,
    p_reserva: reserva
  })
  if (error || !data) throw error || new Error('Resposta vazia do controle de login.')
  return Array.isArray(data) ? data[0] : data
}

export async function statusLogin(req, res, next) {
  try {
    const email = String(req.body?.email || '')
    if (!EMAIL_VALIDO.test(email.trim())) {
      return res.status(200).json({ erro: false, dados: { bloqueadoAte: null } })
    }
    const estado = await atualizarBloqueioLogin(email, 'consultar')
    return res.status(200).json({ erro: false, dados: { bloqueadoAte: estado.bloqueado_ate || null } })
  } catch (err) {
    next(err)
  }
}

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
  let reserva = null
  let reservaAberta = false
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const senha = req.body?.senha

    if (!EMAIL_VALIDO.test(email) || typeof senha !== 'string' || !senha) {
      return res.status(400).json({
        erro: true,
        codigo: 'CAMPOS_OBRIGATORIOS',
        mensagem: 'Email e senha são obrigatórios.'
      })
    }

    reserva = randomUUID()
    const estado = await atualizarBloqueioLogin(email, 'reservar', reserva)
    if (!estado.permitido || (estado.bloqueado_ate && new Date(estado.bloqueado_ate).getTime() > Date.now() && !estado.reserva_confirmada)) {
      return res.status(429).json({
        erro: true,
        codigo: 'LOGIN_BLOQUEADO',
        mensagem: 'Muitas tentativas incorretas. Tente novamente após o término do bloqueio.',
        dados: { bloqueadoAte: estado.bloqueado_ate }
      })
    }
    reservaAberta = true

    let data
    let error
    try {
      ({ data, error } = await criarClienteAutenticacao().auth.signInWithPassword({ email, password: senha }))
    } catch (erroProvedor) {
      await atualizarBloqueioLogin(email, 'liberar', reserva)
      reservaAberta = false
      throw Object.assign(new Error('Não foi possível validar as credenciais agora. Tente novamente.'), { status: 503, cause: erroProvedor })
    }

    if (error || !data.session) {
      const ehFalhaCredencial = /invalid login credentials|email not confirmed|invalid credentials/i.test(error?.message || '')
        || [400, 401].includes(error?.status)
      const bloqueio = await atualizarBloqueioLogin(email, ehFalhaCredencial ? 'falha' : 'liberar', reserva)
      reservaAberta = false
      if (!bloqueio.reserva_confirmada && ehFalhaCredencial) {
        if (bloqueio.bloqueado_ate && new Date(bloqueio.bloqueado_ate).getTime() > Date.now()) {
          return res.status(429).json({
            erro: true,
            codigo: 'LOGIN_BLOQUEADO',
            mensagem: 'Muitas tentativas incorretas. Tente novamente após o término do bloqueio.',
            dados: { bloqueadoAte: bloqueio.bloqueado_ate }
          })
        }
        throw Object.assign(new Error('A tentativa de autenticação expirou. Tente novamente.'), { status: 503 })
      }
      if (!ehFalhaCredencial) {
        throw Object.assign(new Error('Não foi possível validar as credenciais agora. Tente novamente.'), { status: 503 })
      }
      if (bloqueio.bloqueado_ate && new Date(bloqueio.bloqueado_ate).getTime() > Date.now()) {
        return res.status(429).json({
          erro: true,
          codigo: 'LOGIN_BLOQUEADO',
          mensagem: 'Muitas tentativas incorretas. Tente novamente após o término do bloqueio.',
          dados: { bloqueadoAte: bloqueio.bloqueado_ate }
        })
      }
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
      await atualizarBloqueioLogin(email, 'liberar', reserva)
      reservaAberta = false
      return res.status(401).json({
        erro: true,
        codigo: 'CREDENCIAIS_INVALIDAS',
        mensagem: 'Email ou senha incorretos.'
      })
    }

    const finalizacao = await atualizarBloqueioLogin(email, 'sucesso', reserva)
    reservaAberta = false
    if (!finalizacao.reserva_confirmada) {
      throw Object.assign(new Error('A tentativa de autenticação expirou. Tente novamente.'), { status: 503 })
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
    if (reservaAberta && reserva) {
      try {
        await atualizarBloqueioLogin(String(req.body?.email || ''), 'liberar', reserva)
      } catch (erroLiberacao) {
        logger.error(`Falha ao liberar reserva de tentativa de login: ${erroLiberacao.message}`)
      }
    }
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

    const { data, error } = await criarClienteAutenticacao().auth.refreshSession({ refresh_token })

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

    const { error } = await criarClienteAutenticacao().auth.resetPasswordForEmail(email, {
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
