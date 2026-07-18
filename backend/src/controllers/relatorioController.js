import { supabase } from '../services/supabaseClient.js'

function getPeriodo(req) {
  const { data_inicio, data_fim } = req.query
  const fim = data_fim || new Date().toISOString().split('T')[0]
  const inicio = data_inicio || (() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })()
  return { inicio, fim }
}

export async function atendimentos(req, res, next) {
  try {
    const { inicio, fim } = getPeriodo(req)

    const { data, error } = await supabase
      .from('ordem_servico')
      .select('status, data_abertura, data_encerramento')
      .gte('data_abertura', inicio)
      .lte('data_abertura', fim + 'T23:59:59')

    if (error) throw error

    const resumo = {
      total: data.length,
      por_status: {},
      periodo: { inicio, fim }
    }

    for (const os of data) {
      resumo.por_status[os.status] = (resumo.por_status[os.status] || 0) + 1
    }

    return res.status(200).json({ erro: false, dados: resumo })
  } catch (err) {
    next(err)
  }
}

export async function faturamento(req, res, next) {
  try {
    const { inicio, fim } = getPeriodo(req)

    const { data, error } = await supabase
      .from('ordem_servico')
      .select('valor_total, valor_mao_obra, data_encerramento, status')
      .eq('status', 'encerrada')
      .gte('data_encerramento', inicio)
      .lte('data_encerramento', fim + 'T23:59:59')

    if (error) throw error

    const totalFaturamento = data.reduce((acc, os) => acc + (os.valor_total || 0), 0)
    const totalMaoObra = data.reduce((acc, os) => acc + (os.valor_mao_obra || 0), 0)
    const totalPecas = totalFaturamento - totalMaoObra

    return res.status(200).json({
      erro: false,
      dados: {
        total_os_encerradas: data.length,
        faturamento_total: totalFaturamento,
        total_mao_obra: totalMaoObra,
        total_pecas: totalPecas > 0 ? totalPecas : 0,
        periodo: { inicio, fim }
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function estoqueAtual(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('item_estoque')
      .select('*')
      .eq('ativo', true)
      .order('descricao', { ascending: true })

    if (error) throw error

    const itensComAlerta = data.map(item => ({
      ...item,
      em_alerta: item.quantidade_atual <= item.quantidade_minima
    }))

    const alertas = itensComAlerta.filter(i => i.em_alerta)
    const valorTotalEstoque = data.reduce((acc, item) => acc + (item.quantidade_atual * item.preco_custo), 0)

    return res.status(200).json({
      erro: false,
      dados: {
        total_itens: data.length,
        itens_em_alerta: alertas.length,
        valor_total_estoque: valorTotalEstoque,
        itens: itensComAlerta
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function servicosFrequentes(req, res, next) {
  try {
    const { inicio, fim } = getPeriodo(req)
    const { limit = 10 } = req.query

    const { data, error } = await supabase
      .from('ordem_servico')
      .select('descricao_servico, descricao_problema')
      .gte('data_abertura', inicio)
      .lte('data_abertura', fim + 'T23:59:59')
      .not('descricao_servico', 'is', null)

    if (error) throw error

    const frequencia = {}
    for (const os of data) {
      if (os.descricao_servico) {
        const chave = os.descricao_servico.trim().toLowerCase()
        frequencia[chave] = (frequencia[chave] || 0) + 1
      }
    }

    const ranking = Object.entries(frequencia)
      .map(([servico, count]) => ({ servico, quantidade: count }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, parseInt(limit))

    return res.status(200).json({
      erro: false,
      dados: {
        ranking,
        periodo: { inicio, fim }
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function clientesFrequentes(req, res, next) {
  try {
    const { inicio, fim } = getPeriodo(req)
    const { limit = 10 } = req.query

    const { data, error } = await supabase
      .from('ordem_servico')
      .select(`
        id_cliente,
        cliente:id_cliente(id, nome, cpf_cnpj, telefone)
      `)
      .gte('data_abertura', inicio)
      .lte('data_abertura', fim + 'T23:59:59')

    if (error) throw error

    const contagem = {}
    const dadosCliente = {}

    for (const os of data) {
      if (os.id_cliente) {
        contagem[os.id_cliente] = (contagem[os.id_cliente] || 0) + 1
        if (!dadosCliente[os.id_cliente]) {
          dadosCliente[os.id_cliente] = os.cliente
        }
      }
    }

    const ranking = Object.entries(contagem)
      .map(([id_cliente, quantidade]) => ({
        id_cliente,
        quantidade,
        cliente: dadosCliente[id_cliente]
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, parseInt(limit))

    return res.status(200).json({
      erro: false,
      dados: {
        ranking,
        periodo: { inicio, fim }
      }
    })
  } catch (err) {
    next(err)
  }
}
