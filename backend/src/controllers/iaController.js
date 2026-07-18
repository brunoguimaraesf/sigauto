import { supabase } from '../services/supabaseClient.js'
import { gerarRecomendacoesIA } from '../services/claudeService.js'

export async function analisar(req, res, next) {
  try {
    const dataLimite = new Date()
    dataLimite.setDate(dataLimite.getDate() - 90)
    const dataLimiteStr = dataLimite.toISOString()

    // Coletar dados dos últimos 90 dias
    const [resOS, resEstoque, resMovimentacoes] = await Promise.all([
      supabase
        .from('ordem_servico')
        .select('status, valor_total, valor_mao_obra, data_abertura, data_encerramento, descricao_servico')
        .gte('data_abertura', dataLimiteStr),
      supabase
        .from('item_estoque')
        .select('codigo, descricao, quantidade_atual, quantidade_minima, preco_custo, preco_venda')
        .eq('ativo', true),
      supabase
        .from('movimentacao_estoque')
        .select('tipo, quantidade, preco_unitario, data_movimentacao')
        .gte('data_movimentacao', dataLimiteStr)
    ])

    const ordens = resOS.data || []
    const itensEstoque = resEstoque.data || []
    const movimentacoes = resMovimentacoes.data || []

    const totalOS = ordens.length
    const osEncerradas = ordens.filter(o => o.status === 'encerrada')
    const faturamentoTotal = osEncerradas.reduce((acc, o) => acc + (o.valor_total || 0), 0)
    const itensAlerta = itensEstoque.filter(i => i.quantidade_atual <= i.quantidade_minima)

    const dadosHistorico = {
      periodo_dias: 90,
      ordens_servico: {
        total: totalOS,
        por_status: ordens.reduce((acc, o) => {
          acc[o.status] = (acc[o.status] || 0) + 1
          return acc
        }, {}),
        faturamento_total: faturamentoTotal,
        ticket_medio: osEncerradas.length > 0 ? faturamentoTotal / osEncerradas.length : 0
      },
      estoque: {
        total_itens: itensEstoque.length,
        itens_em_alerta: itensAlerta.length,
        itens_criticos: itensAlerta.map(i => ({
          codigo: i.codigo,
          descricao: i.descricao,
          quantidade_atual: i.quantidade_atual,
          quantidade_minima: i.quantidade_minima
        })),
        valor_total_estoque: itensEstoque.reduce((acc, i) => acc + (i.quantidade_atual * i.preco_custo), 0)
      },
      movimentacoes: {
        total: movimentacoes.length,
        entradas: movimentacoes.filter(m => m.tipo === 'entrada').length,
        saidas: movimentacoes.filter(m => m.tipo === 'saida').length
      }
    }

    const recomendacoes = await gerarRecomendacoesIA(dadosHistorico)

    const { data: salvo, error: errSalvar } = await supabase
      .from('recomendacao_ia')
      .insert({
        id_usuario: req.user.id,
        dados_analisados: dadosHistorico,
        recomendacoes,
        criado_em: new Date().toISOString()
      })
      .select()
      .single()

    if (errSalvar) {
      console.error('[IA] Erro ao salvar recomendação:', errSalvar.message)
    }

    return res.status(200).json({
      erro: false,
      dados: {
        ...recomendacoes,
        id_analise: salvo?.id || null,
        gerado_em: new Date().toISOString()
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function listarRecomendacoes(req, res, next) {
  try {
    const { page = 1, limit = 10 } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const { data, error, count } = await supabase
      .from('recomendacao_ia')
      .select('id, recomendacoes, criado_em, id_usuario', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1)

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
