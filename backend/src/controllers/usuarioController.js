import { supabase } from '../services/supabaseClient.js'
import { registrarAuditoria } from '../utils/auditLogger.js'
import { validarEmail, validarSenha } from '../utils/validators.js'

export async function listar(req, res, next) {
  try {
    const { page = 1, limit = 20, nome, perfil, ativo } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let query = supabase
      .from('usuario')
      .select('id, nome, email, perfil, telefone, comissao_percentual, comissao_sobre_servicos, comissao_sobre_pecas, ativo, criado_em', { count: 'exact' })
      .order('nome', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1)

    if (nome) query = query.ilike('nome', `%${nome}%`)
    if (perfil) query = query.eq('perfil', perfil)
    if (ativo !== undefined) query = query.eq('ativo', ativo === 'true')

    const { data, error, count } = await query

    if (error) throw error

    return res.status(200).json({
      erro: false,
      dados: data,
      paginacao: {
        total: count,
        pagina: parseInt(page),
        limite: parseInt(limit),
        totalPaginas: Math.ceil(count / parseInt(limit))
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function criar(req, res, next) {
  try {
    const { nome, email, senha, perfil, telefone, comissao_percentual, comissao_sobre_servicos, comissao_sobre_pecas } = req.body

    if (!nome || !email || !senha || !perfil) {
      return res.status(400).json({
        erro: true,
        codigo: 'CAMPOS_OBRIGATORIOS',
        mensagem: 'Nome, email, senha e perfil são obrigatórios.'
      })
    }

    if (!validarEmail(email)) {
      return res.status(400).json({
        erro: true,
        codigo: 'EMAIL_INVALIDO',
        mensagem: 'Email inválido.'
      })
    }

    if (!validarSenha(senha)) {
      return res.status(400).json({
        erro: true,
        codigo: 'SENHA_FRACA',
        mensagem: 'A senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número.'
      })
    }

    const perfisValidos = ['gestor', 'atendente', 'mecanico']
    if (!perfisValidos.includes(perfil)) {
      return res.status(400).json({
        erro: true,
        codigo: 'PERFIL_INVALIDO',
        mensagem: `Perfil inválido. Opções: ${perfisValidos.join(', ')}.`
      })
    }

    const { data: authUser, error: errAuth } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true
    })

    if (errAuth) {
      if (errAuth.message.includes('already registered')) {
        return res.status(409).json({
          erro: true,
          codigo: 'EMAIL_DUPLICADO',
          mensagem: 'Já existe um usuário cadastrado com este email.'
        })
      }
      throw errAuth
    }

    const { data: usuario, error: errUsuario } = await supabase
      .from('usuario')
      .insert({
        id: authUser.user.id,
        nome,
        email,
        perfil,
        telefone: telefone || null,
        comissao_percentual: ['atendente', 'mecanico'].includes(perfil) ? Number(comissao_percentual || 0) : 0,
        comissao_sobre_servicos: ['atendente', 'mecanico'].includes(perfil) ? Boolean(comissao_sobre_servicos) : false,
        comissao_sobre_pecas: ['atendente', 'mecanico'].includes(perfil) ? Boolean(comissao_sobre_pecas) : false,
        ativo: true
      })
      .select()
      .single()

    if (errUsuario) {
      await supabase.auth.admin.deleteUser(authUser.user.id)
      throw errUsuario
    }

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'INSERT',
      tabela: 'usuario',
      idRegistro: usuario.id,
      dadosAntes: null,
      dadosDepois: { nome, email, perfil },
      ipOrigem: req.ip
    })

    return res.status(201).json({
      erro: false,
      dados: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        telefone: usuario.telefone,
        comissao_percentual: usuario.comissao_percentual,
        comissao_sobre_servicos: usuario.comissao_sobre_servicos,
        comissao_sobre_pecas: usuario.comissao_sobre_pecas,
        ativo: usuario.ativo
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function atualizar(req, res, next) {
  try {
    const { id } = req.params
    const { nome, perfil, telefone, comissao_percentual, comissao_sobre_servicos, comissao_sobre_pecas } = req.body

    const { data: usuarioAtual, error: errBusca } = await supabase
      .from('usuario')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !usuarioAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'USUARIO_NAO_ENCONTRADO',
        mensagem: 'Usuário não encontrado.'
      })
    }

    const atualizacoes = {}
    if (nome !== undefined) atualizacoes.nome = nome
    if (telefone !== undefined) atualizacoes.telefone = telefone || null
    if (perfil !== undefined) {
      const perfisValidos = ['gestor', 'atendente', 'mecanico']
      if (!perfisValidos.includes(perfil)) {
        return res.status(400).json({
          erro: true,
          codigo: 'PERFIL_INVALIDO',
          mensagem: `Perfil inválido. Opções: ${perfisValidos.join(', ')}.`
        })
      }
      atualizacoes.perfil = perfil
    }
    const perfilFinal = perfil || usuarioAtual.perfil
    const permiteComissao = ['atendente', 'mecanico'].includes(perfilFinal)
    if (comissao_percentual !== undefined) atualizacoes.comissao_percentual = permiteComissao ? Number(comissao_percentual || 0) : 0
    if (comissao_sobre_servicos !== undefined) atualizacoes.comissao_sobre_servicos = permiteComissao ? Boolean(comissao_sobre_servicos) : false
    if (comissao_sobre_pecas !== undefined) atualizacoes.comissao_sobre_pecas = permiteComissao ? Boolean(comissao_sobre_pecas) : false

    const { data, error } = await supabase
      .from('usuario')
      .update(atualizacoes)
      .eq('id', id)
      .select('id, nome, email, perfil, telefone, comissao_percentual, comissao_sobre_servicos, comissao_sobre_pecas, ativo')
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'UPDATE',
      tabela: 'usuario',
      idRegistro: id,
      dadosAntes: { nome: usuarioAtual.nome, perfil: usuarioAtual.perfil },
      dadosDepois: atualizacoes,
      ipOrigem: req.ip
    })

    return res.status(200).json({ erro: false, dados: data })
  } catch (err) {
    next(err)
  }
}

export async function inativar(req, res, next) {
  try {
    const { id } = req.params

    if (id === req.user.id) {
      return res.status(400).json({
        erro: true,
        codigo: 'INATIVAR_PROPRIO',
        mensagem: 'Você não pode inativar sua própria conta.'
      })
    }

    const { data: usuarioAtual, error: errBusca } = await supabase
      .from('usuario')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !usuarioAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'USUARIO_NAO_ENCONTRADO',
        mensagem: 'Usuário não encontrado.'
      })
    }

    const { data, error } = await supabase
      .from('usuario')
      .update({ ativo: false })
      .eq('id', id)
      .select('id, nome, email, perfil, telefone, comissao_percentual, comissao_sobre_servicos, comissao_sobre_pecas, ativo')
      .single()

    if (error) throw error

    await supabase.auth.admin.updateUserById(id, { ban_duration: 'none' })

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'INATIVAR',
      tabela: 'usuario',
      idRegistro: id,
      dadosAntes: usuarioAtual,
      dadosDepois: data,
      ipOrigem: req.ip
    })

    return res.status(200).json({ erro: false, dados: data })
  } catch (err) {
    next(err)
  }
}
