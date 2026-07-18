import { supabase } from '../services/supabaseClient.js'
import { registrarAuditoria } from '../utils/auditLogger.js'
import { logger } from '../utils/logger.js'

export async function listar(req, res, next) {
  try {
    const { page = 1, limit = 20, descricao, codigo, alerta, ativo } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let query = supabase
      .from('item_estoque')
      .select('*', { count: 'exact' })
      .order('descricao', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1)

    if (descricao) query = query.ilike('descricao', `%${descricao}%`)
    if (codigo) query = query.ilike('codigo', `%${codigo}%`)
    if (ativo !== undefined) query = query.eq('ativo', ativo === 'true')

    const { data, error, count } = await query

    if (error) throw error

    const dadosComAlerta = (data || []).map(item => ({
      ...item,
      em_alerta: item.quantidade_atual <= item.quantidade_minima
    }))

    let resultado = dadosComAlerta
    if (alerta === 'true') {
      resultado = dadosComAlerta.filter(i => i.em_alerta)
    }

    return res.status(200).json({
      erro: false,
      dados: resultado,
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
      .from('item_estoque')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return res.status(404).json({
        erro: true,
        codigo: 'ITEM_NAO_ENCONTRADO',
        mensagem: 'Item de estoque não encontrado.'
      })
    }

    return res.status(200).json({
      erro: false,
      dados: {
        ...data,
        em_alerta: data.quantidade_atual <= data.quantidade_minima
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function criar(req, res, next) {
  try {
    const { codigo, descricao, unidade, preco_custo, preco_venda, quantidade_atual, quantidade_minima, localizacao } = req.body

    if (!codigo || !descricao || !unidade) {
      return res.status(400).json({
        erro: true,
        codigo: 'CAMPOS_OBRIGATORIOS',
        mensagem: 'Código, descrição e unidade são obrigatórios.'
      })
    }

    const { data: codigoExiste } = await supabase
      .from('item_estoque')
      .select('id')
      .eq('codigo', codigo)
      .single()

    if (codigoExiste) {
      return res.status(409).json({
        erro: true,
        codigo: 'CODIGO_DUPLICADO',
        mensagem: 'Já existe um item cadastrado com este código.'
      })
    }

    const { data, error } = await supabase
      .from('item_estoque')
      .insert({
        codigo,
        descricao,
        unidade,
        preco_custo: preco_custo || 0,
        preco_venda: preco_venda || 0,
        quantidade_atual: quantidade_atual || 0,
        quantidade_minima: quantidade_minima || 0,
        localizacao,
        ativo: true
      })
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'INSERT',
      tabela: 'item_estoque',
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
    const { descricao, unidade, preco_custo, preco_venda, quantidade_minima, localizacao } = req.body

    const { data: itemAtual, error: errBusca } = await supabase
      .from('item_estoque')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !itemAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'ITEM_NAO_ENCONTRADO',
        mensagem: 'Item de estoque não encontrado.'
      })
    }

    const atualizacoes = {}
    if (descricao !== undefined) atualizacoes.descricao = descricao
    if (unidade !== undefined) atualizacoes.unidade = unidade
    if (preco_custo !== undefined) atualizacoes.preco_custo = preco_custo
    if (preco_venda !== undefined) atualizacoes.preco_venda = preco_venda
    if (quantidade_minima !== undefined) atualizacoes.quantidade_minima = quantidade_minima
    if (localizacao !== undefined) atualizacoes.localizacao = localizacao

    const { data, error } = await supabase
      .from('item_estoque')
      .update(atualizacoes)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'UPDATE',
      tabela: 'item_estoque',
      idRegistro: id,
      dadosAntes: itemAtual,
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

    const { data: itemAtual, error: errBusca } = await supabase
      .from('item_estoque')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !itemAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'ITEM_NAO_ENCONTRADO',
        mensagem: 'Item de estoque não encontrado.'
      })
    }

    const { data, error } = await supabase
      .from('item_estoque')
      .update({ ativo: false })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'INATIVAR',
      tabela: 'item_estoque',
      idRegistro: id,
      dadosAntes: itemAtual,
      dadosDepois: data,
      ipOrigem: req.ip
    })

    return res.status(200).json({ erro: false, dados: data })
  } catch (err) {
    next(err)
  }
}

export async function entrada(req, res, next) {
  try {
    const { id } = req.params
    const { quantidade, id_os, observacao, preco_custo } = req.body

    if (!quantidade || quantidade <= 0) {
      return res.status(400).json({
        erro: true,
        codigo: 'QUANTIDADE_INVALIDA',
        mensagem: 'Quantidade deve ser maior que zero.'
      })
    }

    const { data: item, error: errItem } = await supabase
      .from('item_estoque')
      .select('*')
      .eq('id', id)
      .single()

    if (errItem || !item) {
      return res.status(404).json({
        erro: true,
        codigo: 'ITEM_NAO_ENCONTRADO',
        mensagem: 'Item de estoque não encontrado.'
      })
    }

    const novaQuantidade = item.quantidade_atual + quantidade

    const { data: movimentacao, error: errMov } = await supabase
      .from('movimentacao_estoque')
      .insert({
        id_item: id,
        id_os: id_os || null,
        tipo: 'entrada',
        quantidade,
        preco_unitario: preco_custo || item.preco_custo,
        observacao,
        id_usuario: req.user.id,
        data_movimentacao: new Date().toISOString()
      })
      .select()
      .single()

    if (errMov) throw errMov

    const atualizacoes = { quantidade_atual: novaQuantidade }
    if (preco_custo) atualizacoes.preco_custo = preco_custo

    const { data: itemAtualizado, error: errUpdate } = await supabase
      .from('item_estoque')
      .update(atualizacoes)
      .eq('id', id)
      .select()
      .single()

    if (errUpdate) throw errUpdate

    return res.status(200).json({
      erro: false,
      dados: {
        movimentacao,
        item: itemAtualizado
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function saida(req, res, next) {
  try {
    const { id } = req.params
    const { quantidade, id_os, observacao } = req.body

    if (!quantidade || quantidade <= 0) {
      return res.status(400).json({
        erro: true,
        codigo: 'QUANTIDADE_INVALIDA',
        mensagem: 'Quantidade deve ser maior que zero.'
      })
    }

    const { data: item, error: errItem } = await supabase
      .from('item_estoque')
      .select('*')
      .eq('id', id)
      .single()

    if (errItem || !item) {
      return res.status(404).json({
        erro: true,
        codigo: 'ITEM_NAO_ENCONTRADO',
        mensagem: 'Item de estoque não encontrado.'
      })
    }

    // RN07: validar saldo disponível
    if (item.quantidade_atual < quantidade) {
      return res.status(400).json({
        erro: true,
        codigo: 'SALDO_INSUFICIENTE',
        mensagem: `Saldo insuficiente. Disponível: ${item.quantidade_atual} ${item.unidade}.`
      })
    }

    const novaQuantidade = item.quantidade_atual - quantidade

    const { data: movimentacao, error: errMov } = await supabase
      .from('movimentacao_estoque')
      .insert({
        id_item: id,
        id_os: id_os || null,
        tipo: 'saida',
        quantidade,
        preco_unitario: item.preco_venda,
        observacao,
        id_usuario: req.user.id,
        data_movimentacao: new Date().toISOString()
      })
      .select()
      .single()

    if (errMov) throw errMov

    const { data: itemAtualizado, error: errUpdate } = await supabase
      .from('item_estoque')
      .update({ quantidade_atual: novaQuantidade })
      .eq('id', id)
      .select()
      .single()

    if (errUpdate) throw errUpdate

    // RN06: verificar alerta de estoque mínimo
    if (novaQuantidade <= item.quantidade_minima) {
      logger.warn(`ALERTA ESTOQUE: Item "${item.descricao}" (${item.codigo}) atingiu quantidade crítica: ${novaQuantidade} ${item.unidade}`)
    }

    return res.status(200).json({
      erro: false,
      dados: {
        movimentacao,
        item: {
          ...itemAtualizado,
          em_alerta: novaQuantidade <= item.quantidade_minima
        }
      }
    })
  } catch (err) {
    next(err)
  }
}
