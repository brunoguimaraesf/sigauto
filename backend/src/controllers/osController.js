import { supabase } from '../services/supabaseClient.js'
import { registrarAuditoria } from '../utils/auditLogger.js'

export async function listar(req, res, next) {
  try {
    const { page = 1, limit = 20, status, id_cliente, id_veiculo, placa, data_inicio, data_fim } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let query = supabase
      .from('ordem_servico')
      .select(`
        *,
        cliente:id_cliente(id, nome, cpf_cnpj, telefone),
        veiculo:id_veiculo(id, placa, marca, modelo, ano),
        mecanico:id_usuario(id, nome),
        atendente:id_usuario(id, nome)
      `, { count: 'exact' })
      .order('data_abertura', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1)

    if (status) query = query.eq('status', status)
    if (id_cliente) query = query.eq('id_cliente', id_cliente)
    if (id_veiculo) query = query.eq('id_veiculo', id_veiculo)
    if (placa) {
      const { data: veiculos } = await supabase.from('veiculo').select('id').ilike('placa', `%${placa}%`)
      if (veiculos && veiculos.length > 0) {
        query = query.in('id_veiculo', veiculos.map(v => v.id))
      }
    }
    if (data_inicio) query = query.gte('data_abertura', data_inicio)
    if (data_fim) query = query.lte('data_abertura', data_fim)

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

    const { data: os, error } = await supabase
      .from('ordem_servico')
      .select(`
        *,
        cliente:id_cliente(id, nome, cpf_cnpj, telefone, email),
        veiculo:id_veiculo(id, placa, marca, modelo, ano, cor, km_atual),
        mecanico:id_usuario(id, nome),
        atendente:id_usuario(id, nome)
      `)
      .eq('id', id)
      .single()

    if (error || !os) {
      return res.status(404).json({
        erro: true,
        codigo: 'OS_NAO_ENCONTRADA',
        mensagem: 'Ordem de serviço não encontrada.'
      })
    }

    const { data: movimentacoes } = await supabase
      .from('movimentacao_estoque')
      .select(`
        *,
        item:id_item(id, codigo, descricao, unidade)
      `)
      .eq('id_os', id)
      .order('data_movimentacao', { ascending: false })

    return res.status(200).json({
      erro: false,
      dados: { ...os, pecas_consumidas: movimentacoes || [] }
    })
  } catch (err) {
    next(err)
  }
}

export async function abrir(req, res, next) {
  try {
    const {
        id_cliente,
        id_veiculo,
        id_mecanico,
        id_atendente,
        id_usuario,
        descricao_problema,
      km_entrada,
      observacoes
    } = req.body

    if (!id_cliente || !id_veiculo || !descricao_problema) {
      return res.status(400).json({
        erro: true,
        codigo: 'CAMPOS_OBRIGATORIOS',
        mensagem: 'Cliente, veículo e descrição do problema são obrigatórios.'
      })
    }

    // RN02: verificar se cliente está ativo
    const { data: cliente } = await supabase
      .from('cliente')
      .select('id, ativo')
      .eq('id', id_cliente)
      .single()

    if (!cliente || !cliente.ativo) {
      return res.status(400).json({
        erro: true,
        codigo: 'CLIENTE_INATIVO',
        mensagem: 'Não é possível abrir OS para cliente inativo.'
      })
    }

    // RN09: verificar se veículo pertence ao cliente e está ativo
    const { data: veiculo } = await supabase
      .from('veiculo')
      .select('id, ativo, id_cliente')
      .eq('id', id_veiculo)
      .single()

    if (!veiculo || !veiculo.ativo) {
      return res.status(400).json({
        erro: true,
        codigo: 'VEICULO_INATIVO',
        mensagem: 'Veículo não encontrado ou inativo.'
      })
    }

    if (veiculo.id_cliente !== id_cliente) {
      return res.status(400).json({
        erro: true,
        codigo: 'VEICULO_CLIENTE_DIVERGENTE',
        mensagem: 'O veículo não pertence ao cliente informado.'
      })
    }

    const { data, error } = await supabase
      .from('ordem_servico')
      .insert({
        id_cliente,
        id_veiculo,
        id_usuario: id_usuario || id_mecanico || id_atendente || req.user.id,
        descricao_problema,
        km_entrada,
        observacoes,
        status: 'aberta',
        data_abertura: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'INSERT',
      tabela: 'ordem_servico',
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
    const {
      id_mecanico,
      id_atendente,
      id_usuario,
      descricao_servico,
      status,
      valor_mao_obra,
      valor_total,
      observacoes,
      km_entrada
    } = req.body

    const { data: osAtual, error: errBusca } = await supabase
      .from('ordem_servico')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !osAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'OS_NAO_ENCONTRADA',
        mensagem: 'Ordem de serviço não encontrada.'
      })
    }

    if (['encerrada', 'cancelada'].includes(osAtual.status)) {
      return res.status(400).json({
        erro: true,
        codigo: 'OS_FINALIZADA',
        mensagem: 'Não é possível alterar uma OS encerrada ou cancelada.'
      })
    }

    const atualizacoes = {}
    if (id_usuario !== undefined || id_mecanico !== undefined || id_atendente !== undefined) {
      atualizacoes.id_usuario = id_usuario || id_mecanico || id_atendente
    }
    if (descricao_servico !== undefined) atualizacoes.descricao_servico = descricao_servico
    if (status !== undefined) atualizacoes.status = status
    if (valor_mao_obra !== undefined) atualizacoes.valor_mao_obra = valor_mao_obra
    if (valor_total !== undefined) atualizacoes.valor_total = valor_total
    if (observacoes !== undefined) atualizacoes.observacoes = observacoes
    if (km_entrada !== undefined) atualizacoes.km_entrada = km_entrada

    const { data, error } = await supabase
      .from('ordem_servico')
      .update(atualizacoes)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // RN04: registrar log de auditoria
    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'UPDATE',
      tabela: 'ordem_servico',
      idRegistro: id,
      dadosAntes: osAtual,
      dadosDepois: data,
      ipOrigem: req.ip
    })

    return res.status(200).json({ erro: false, dados: data })
  } catch (err) {
    next(err)
  }
}

export async function encerrar(req, res, next) {
  try {
    const { id } = req.params
    const { valor_total, valor_mao_obra, descricao_servico, km_saida } = req.body

    const { data: osAtual, error: errBusca } = await supabase
      .from('ordem_servico')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !osAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'OS_NAO_ENCONTRADA',
        mensagem: 'Ordem de serviço não encontrada.'
      })
    }

    if (osAtual.status === 'encerrada') {
      return res.status(400).json({
        erro: true,
        codigo: 'OS_JA_ENCERRADA',
        mensagem: 'Esta OS já está encerrada.'
      })
    }

    if (osAtual.status === 'cancelada') {
      return res.status(400).json({
        erro: true,
        codigo: 'OS_CANCELADA',
        mensagem: 'Não é possível encerrar uma OS cancelada.'
      })
    }

    const atualizacoes = {
      status: 'encerrada',
      data_encerramento: new Date().toISOString()
    }
    if (valor_total !== undefined) atualizacoes.valor_total = valor_total
    if (valor_mao_obra !== undefined) atualizacoes.valor_mao_obra = valor_mao_obra
    if (descricao_servico !== undefined) atualizacoes.descricao_servico = descricao_servico
    if (km_saida !== undefined) atualizacoes.km_saida = km_saida

    const { data, error } = await supabase
      .from('ordem_servico')
      .update(atualizacoes)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // RN10: log de auditoria ao encerrar
    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'ENCERRAR',
      tabela: 'ordem_servico',
      idRegistro: id,
      dadosAntes: osAtual,
      dadosDepois: data,
      ipOrigem: req.ip
    })

    return res.status(200).json({ erro: false, dados: data })
  } catch (err) {
    next(err)
  }
}

export async function cancelar(req, res, next) {
  try {
    const { id } = req.params
    const { motivo } = req.body

    const { data: osAtual, error: errBusca } = await supabase
      .from('ordem_servico')
      .select('*')
      .eq('id', id)
      .single()

    if (errBusca || !osAtual) {
      return res.status(404).json({
        erro: true,
        codigo: 'OS_NAO_ENCONTRADA',
        mensagem: 'Ordem de serviço não encontrada.'
      })
    }

    if (['encerrada', 'cancelada'].includes(osAtual.status)) {
      return res.status(400).json({
        erro: true,
        codigo: 'OS_FINALIZADA',
        mensagem: 'Não é possível cancelar uma OS já finalizada.'
      })
    }

    // Apenas gestor pode cancelar OS em andamento
    if (osAtual.status === 'em_andamento' && req.user.perfil !== 'gestor') {
      return res.status(403).json({
        erro: true,
        codigo: 'SEM_PERMISSAO',
        mensagem: 'Apenas o gestor pode cancelar OS em andamento.'
      })
    }

    const { data, error } = await supabase
      .from('ordem_servico')
      .update({
        status: 'cancelada',
        observacoes: motivo ? `${osAtual.observacoes || ''}\nCANCELAMENTO: ${motivo}` : osAtual.observacoes
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await registrarAuditoria(supabase, {
      idUsuario: req.user.id,
      acao: 'CANCELAR',
      tabela: 'ordem_servico',
      idRegistro: id,
      dadosAntes: osAtual,
      dadosDepois: data,
      ipOrigem: req.ip
    })

    return res.status(200).json({ erro: false, dados: data })
  } catch (err) {
    next(err)
  }
}
