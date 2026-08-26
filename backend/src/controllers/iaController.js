import { supabase } from '../services/supabaseClient.js'
import { gerarRecomendacoesIA } from '../services/claudeService.js'

export async function analisar(req, res, next) {
  try {
    const dataLimite = new Date()
    dataLimite.setDate(dataLimite.getDate() - 90)
    const dataLimiteStr = dataLimite.toISOString()

    // Buscamos 180 dias de OS para poder comparar os últimos 90 com os 90
    // anteriores — sem isso não há base temporal para calcular crescimento.
    const dataLimiteAnterior = new Date()
    dataLimiteAnterior.setDate(dataLimiteAnterior.getDate() - 180)

    // Coletar dados dos últimos 90 dias
    const [resOS, resEstoque, resMovimentacoes] = await Promise.all([
      supabase
        .from('ordem_servico')
        .select('status, valor_total, valor_servicos, valor_pecas, data_abertura, data_encerramento, descricao')
        .gte('data_abertura', dataLimiteAnterior.toISOString()),
      supabase
        .from('item_estoque')
        .select('codigo, nome, descricao, quantidade, qtd_minima, preco_unit')
        .eq('ativo', true),
      supabase
        .from('movimentacao_estoque')
        .select('tipo, quantidade, motivo, data_hora')
        .gte('data_hora', dataLimiteStr)
    ])

    const todasOrdens = resOS.data || []
    const itensEstoque = resEstoque.data || []
    const movimentacoes = resMovimentacoes.data || []

    // Janela atual (últimos 90 dias) x janela anterior (dos 180 aos 90 dias)
    const ordens = todasOrdens.filter(o => new Date(o.data_abertura) >= dataLimite)
    const ordensAnteriores = todasOrdens.filter(o => new Date(o.data_abertura) < dataLimite)

    const totalOS = ordens.length
    const osEncerradas = ordens.filter(o => o.status === 'concluida')
    const faturamentoTotal = osEncerradas.reduce((acc, o) => acc + (o.valor_total || 0), 0)
    const itensAlerta = itensEstoque.filter(i => i.quantidade <= i.qtd_minima)

    const faturamentoAnterior = ordensAnteriores
      .filter(o => o.status === 'concluida')
      .reduce((acc, o) => acc + (o.valor_total || 0), 0)

    const variacao = faturamentoAnterior > 0
      ? ((faturamentoTotal - faturamentoAnterior) / faturamentoAnterior) * 100
      : null

    const taxaCrescimento = variacao !== null
      ? `${variacao >= 0 ? '+' : ''}${variacao.toFixed(1).replace('.', ',')}%`
      : faturamentoTotal > 0
        ? 'Sem período anterior para comparar'
        : 'Sem dados'

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
          nome: i.nome,
          quantidade: i.quantidade,
          qtd_minima: i.qtd_minima
        })),
        valor_total_estoque: itensEstoque.reduce((acc, i) => acc + (i.quantidade * (i.preco_unit || 0)), 0)
      },
      movimentacoes: {
        total: movimentacoes.length,
        entradas: movimentacoes.filter(m => m.tipo === 'entrada').length,
        saidas: movimentacoes.filter(m => m.tipo === 'saida').length
      },
      periodo_anterior: {
        total_os: ordensAnteriores.length,
        faturamento_total: faturamentoAnterior
      },
      taxa_crescimento_faturamento: taxaCrescimento
    }

    const recomendacoesIA = await gerarRecomendacoesIA(dadosHistorico)

    // Os KPIs exibidos são os que calculamos acima, não os que o modelo
    // transcreveu de volta no JSON: número é cálculo, não inferência. O LLM
    // continua responsável pelo que sabe fazer bem — resumo, priorização e
    // redação das recomendações.
    const metricasCalculadas = {
      total_os: totalOS,
      faturamento_estimado: +faturamentoTotal.toFixed(2),
      itens_criticos_estoque: itensAlerta.length,
      taxa_crescimento: taxaCrescimento
    }

    // Guardamos também o que o modelo respondeu, sob outra chave, para permitir
    // auditar a divergência entre o valor calculado e o transcrito pela IA.
    const recomendacoes = {
      ...recomendacoesIA,
      metricas_destaque: metricasCalculadas,
      metricas_do_modelo: recomendacoesIA.metricas_destaque ?? null
    }

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
