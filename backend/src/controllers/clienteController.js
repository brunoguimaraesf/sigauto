import { supabase } from '../services/supabaseClient.js'
import { registrarAuditoria } from '../utils/auditLogger.js'
import { validarCPF, validarCNPJ, validarEmail } from '../utils/validators.js'

export async function listar(req, res, next) {
  try {
    const { page = 1, limit = 20, nome, cpf_cnpj, ativo } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let query = supabase
      .from('cliente')
      .select('*', { count: 'exact' })
      .order('nome', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1)

    if (nome) query = query.ilike('nome', `%${nome}%`)
    if (cpf_cnpj) query = query.ilike('cpf_cnpj', `%${cpf_cnpj.replace(/\D/g, '')}%`)
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

export async function detalhe(req, res, next) {
  try {
    const { id } = req.params

    const { data: cliente, error } = await supabase
      .from('cliente')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !cliente) {
      return res.status(404).json({
        erro: true,
        codigo: 'CLIENTE_NAO_ENCONTRADO',
        mensagem: 'Cliente não encontrado.'
      })
    }

    const { data: veiculos } = await supabase
      .from('veiculo')
      .select('*')
      .eq('id_cliente', id)
      .order('placa', { ascending: true })

    return res.status(200).json({
      erro: false,
      dados: { ...cliente, veiculos: veiculos || [] }
    })
  } catch (err) {
    next(err)
  }
}

export async function criar(req, res, next) {
  try {
    const { nome, cpf_cnpj, tipo_pessoa, email, telefone, endereco } = req.body

    if (!nome || !cpf_cnpj || !tipo_pessoa) {
      return res.status(400).json({
        erro: true,
        codigo: 'CAMPOS_OBRIGATORIOS',
        mensagem: 'Nome, CPF/CNPJ e tipo de pessoa são obrigatórios.'
      })
    }

    const docLimpo = cpf_cnpj.replace(/\D/g, '')
    if (tipo_pessoa === 'PF' && !validarCPF(docLimpo)) {
      return res.status(400).json({
        erro: true,
        codigo: 'CPF_INVALIDO',
        mensagem: 'CPF inválido.'
      })
    }
    if (tipo_pessoa === 'PJ' && !validarCNPJ(docLimpo)) {
      return res.status(400).json({
        erro: true,
        codigo: 'CNPJ_INVALIDO',
        mensagem: 'CNPJ inválido.'
      })
    }

    if (email && !validarEmail(email)) {
      return res.status(400).json({
        erro: true,
        codigo: 'EMAIL_INVALIDO',
        mensagem: 'Email inválido.'
      })
    }

    const { data: existe } = await supabase
      .from('cliente')
      .select('id')
      .eq('cpf_cnpj', docLimpo)
      .single()

    if (existe) {
      return res.status(409).json({
        erro: true,
        codigo: 'CPF_CNPJ_DUPLICADO',
        mensagem: 'Já existe um cliente cadastrado com este CPF/CNPJ.'
      })
    }

    const { data, error } = await supabase
      .from('cliente')
      .insert({
        nome,
        cpf_cnpj: docLimpo,
        tipo_pessoa,
        email,
        telefone,
        endereco,
        ativo: true
      })
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'INSERT',
      tabela: 'cliente',
      idRegistro: data.id,
      dadosAntes: null,
      dadosDepois: data,
      ipOrigem: req.ip
    })

    return res.status(201).json({ erro: false, dados: data })
  } catch (err) {
    next(err)
  }
}

export async function atualizar(req, res, next) {
  try {
    const { id } = req.params
    const { nome, email, telefone, endereco } = req.body

    const { data: clienteAtual, error: errBusca } = await supabase
      .from('cliente')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !clienteAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'CLIENTE_NAO_ENCONTRADO',
        mensagem: 'Cliente não encontrado.'
      })
    }

    if (email && !validarEmail(email)) {
      return res.status(400).json({
        erro: true,
        codigo: 'EMAIL_INVALIDO',
        mensagem: 'Email inválido.'
      })
    }

    const atualizacoes = {}
    if (nome !== undefined) atualizacoes.nome = nome
    if (email !== undefined) atualizacoes.email = email
    if (telefone !== undefined) atualizacoes.telefone = telefone
    if (endereco !== undefined) atualizacoes.endereco = endereco

    const { data, error } = await supabase
      .from('cliente')
      .update(atualizacoes)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'UPDATE',
      tabela: 'cliente',
      idRegistro: id,
      dadosAntes: clienteAtual,
      dadosDepois: data,
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

    const { data: clienteAtual, error: errBusca } = await supabase
      .from('cliente')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !clienteAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'CLIENTE_NAO_ENCONTRADO',
        mensagem: 'Cliente não encontrado.'
      })
    }

    const { data: osAbertas } = await supabase
      .from('ordem_servico')
      .select('id')
      .eq('id_cliente', id)
      .in('status', ['aberta', 'em_andamento'])

    if (osAbertas && osAbertas.length > 0) {
      return res.status(409).json({
        erro: true,
        codigo: 'OS_ABERTAS',
        mensagem: `Cliente possui ${osAbertas.length} ordem(s) de serviço em aberto. Encerre-as antes de inativar o cliente.`
      })
    }

    const { data, error } = await supabase
      .from('cliente')
      .update({ ativo: false })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'INATIVAR',
      tabela: 'cliente',
      idRegistro: id,
      dadosAntes: clienteAtual,
      dadosDepois: data,
      ipOrigem: req.ip
    })

    return res.status(200).json({ erro: false, dados: data })
  } catch (err) {
    next(err)
  }
}
