import { supabase } from '../services/supabaseClient.js'
import { registrarAuditoria } from '../utils/auditLogger.js'
import { validarPlaca } from '../utils/validators.js'

export async function listar(req, res, next) {
  try {
    const { page = 1, limit = 20, placa, id_cliente, ativo } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let query = supabase
      .from('veiculo')
      .select('*, cliente:id_cliente(id, nome, cpf_cnpj)', { count: 'exact' })
      .order('placa', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1)

    if (placa) query = query.ilike('placa', `%${placa}%`)
    if (id_cliente) query = query.eq('id_cliente', id_cliente)
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

    const { data, error } = await supabase
      .from('veiculo')
      .select('*, cliente:id_cliente(id, nome, cpf_cnpj, telefone, email)')
      .eq('id', id)
      .single()

    if (error || !data) {
      return res.status(404).json({
        erro: true,
        codigo: 'VEICULO_NAO_ENCONTRADO',
        mensagem: 'Veículo não encontrado.'
      })
    }

    return res.status(200).json({ erro: false, dados: data })
  } catch (err) {
    next(err)
  }
}

export async function criar(req, res, next) {
  try {
    const { id_cliente, placa, marca, modelo, ano, cor, km_atual, observacoes } = req.body

    if (!id_cliente || !placa || !marca || !modelo) {
      return res.status(400).json({
        erro: true,
        codigo: 'CAMPOS_OBRIGATORIOS',
        mensagem: 'Cliente, placa, marca e modelo são obrigatórios.'
      })
    }

    const placaLimpa = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (!validarPlaca(placaLimpa)) {
      return res.status(400).json({
        erro: true,
        codigo: 'PLACA_INVALIDA',
        mensagem: 'Placa inválida. Use o formato antigo (AAA-9999) ou Mercosul (AAA9A99).'
      })
    }

    // RN01: cliente deve estar ativo
    const { data: cliente, error: errCliente } = await supabase
      .from('cliente')
      .select('id, ativo')
      .eq('id', id_cliente)
      .single()

    if (errCliente || !cliente) {
      return res.status(404).json({
        erro: true,
        codigo: 'CLIENTE_NAO_ENCONTRADO',
        mensagem: 'Cliente não encontrado.'
      })
    }

    if (!cliente.ativo) {
      return res.status(400).json({
        erro: true,
        codigo: 'CLIENTE_INATIVO',
        mensagem: 'Não é possível cadastrar veículo para um cliente inativo.'
      })
    }

    const { data: placaExiste } = await supabase
      .from('veiculo')
      .select('id')
      .eq('placa', placaLimpa)
      .single()

    if (placaExiste) {
      return res.status(409).json({
        erro: true,
        codigo: 'PLACA_DUPLICADA',
        mensagem: 'Já existe um veículo cadastrado com esta placa.'
      })
    }

    const { data, error } = await supabase
      .from('veiculo')
      .insert({
        id_cliente,
        placa: placaLimpa,
        marca,
        modelo,
        ano,
        cor,
        km_atual,
        observacoes,
        ativo: true
      })
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'INSERT',
      tabela: 'veiculo',
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
    const { marca, modelo, ano, cor, km_atual, observacoes } = req.body

    const { data: veiculoAtual, error: errBusca } = await supabase
      .from('veiculo')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !veiculoAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'VEICULO_NAO_ENCONTRADO',
        mensagem: 'Veículo não encontrado.'
      })
    }

    const atualizacoes = {}
    if (marca !== undefined) atualizacoes.marca = marca
    if (modelo !== undefined) atualizacoes.modelo = modelo
    if (ano !== undefined) atualizacoes.ano = ano
    if (cor !== undefined) atualizacoes.cor = cor
    if (km_atual !== undefined) atualizacoes.km_atual = km_atual
    if (observacoes !== undefined) atualizacoes.observacoes = observacoes

    const { data, error } = await supabase
      .from('veiculo')
      .update(atualizacoes)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'UPDATE',
      tabela: 'veiculo',
      idRegistro: id,
      dadosAntes: veiculoAtual,
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

    const { data: veiculoAtual, error: errBusca } = await supabase
      .from('veiculo')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !veiculoAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'VEICULO_NAO_ENCONTRADO',
        mensagem: 'Veículo não encontrado.'
      })
    }

    const { data, error } = await supabase
      .from('veiculo')
      .update({ ativo: false })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'INATIVAR',
      tabela: 'veiculo',
      idRegistro: id,
      dadosAntes: veiculoAtual,
      dadosDepois: data,
      ipOrigem: req.ip
    })

    return res.status(200).json({ erro: false, dados: data })
  } catch (err) {
    next(err)
  }
}
