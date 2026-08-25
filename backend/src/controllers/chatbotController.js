import { supabase } from '../services/supabaseClient.js'
import { responderChatbot } from '../services/claudeService.js'
import { filtrarContextoPorPerfil } from '../utils/contextoPorPerfil.js'

// Coleta e pré-agrega os dados da oficina para o chatbot responder perguntas
// analíticas (ranking de clientes, ticket médio, faturamento, estoque em alerta).
// Roda com service role (ignora RLS), portanto monta a visão completa da oficina:
// o recorte por perfil é aplicado depois, em filtrarContextoPorPerfil.
async function montarContextoOficina() {
  try {
    const [clientesRes, veiculosRes, osRes, estoqueRes, servicosRes] = await Promise.all([
      supabase.from('cliente').select('id, nome').eq('ativo', true),
      supabase.from('veiculo').select('id, id_cliente').eq('ativo', true),
      supabase.from('ordem_servico').select('id_veiculo, valor_total, status, data_abertura'),
      supabase.from('item_estoque').select('nome, quantidade, qtd_minima').eq('ativo', true),
      supabase.from('servico_catalogo').select('nome, preco').eq('ativo', true),
    ])

    const clientes = clientesRes.data || []
    const veiculos = veiculosRes.data || []
    const ordens = osRes.data || []
    const estoque = estoqueRes.data || []
    const servicos = servicosRes.data || []

    const veiculoParaCliente = Object.fromEntries(veiculos.map(v => [v.id, v.id_cliente]))
    const nomePorCliente = Object.fromEntries(clientes.map(c => [c.id, c.nome]))

    // Agrega OS por cliente (via veículo)
    const agg = {}
    for (const os of ordens) {
      const cid = veiculoParaCliente[os.id_veiculo]
      if (!cid) continue
      if (!agg[cid]) agg[cid] = { nome: nomePorCliente[cid] || 'Desconhecido', qtd_os: 0, total_gasto: 0 }
      agg[cid].qtd_os += 1
      agg[cid].total_gasto += Number(os.valor_total || 0)
    }

    const rankingClientes = Object.values(agg)
      .map(c => ({
        nome: c.nome,
        qtd_os: c.qtd_os,
        total_gasto: +c.total_gasto.toFixed(2),
        ticket_medio: c.qtd_os ? +(c.total_gasto / c.qtd_os).toFixed(2) : 0,
      }))
      .sort((a, b) => b.qtd_os - a.qtd_os || b.total_gasto - a.total_gasto)
      .slice(0, 50)

    const faturamentoTotal = ordens.reduce((s, o) => s + Number(o.valor_total || 0), 0)

    return {
      totais: {
        clientes: clientes.length,
        veiculos: veiculos.length,
        ordens_servico: ordens.length,
        faturamento_total: +faturamentoTotal.toFixed(2),
        ticket_medio_geral: ordens.length ? +(faturamentoTotal / ordens.length).toFixed(2) : 0,
      },
      ranking_clientes: rankingClientes,
      estoque_em_alerta: estoque
        .filter(i => i.quantidade <= i.qtd_minima)
        .map(i => ({ nome: i.nome, quantidade: i.quantidade, qtd_minima: i.qtd_minima })),
      servicos_catalogo: servicos.slice(0, 50),
    }
  } catch (err) {
    console.error('[Chatbot] Falha ao montar contexto da oficina:', err.message)
    return null
  }
}

export async function mensagem(req, res, next) {
  try {
    const { pergunta, historico: historicoSessao } = req.body

    if (!pergunta || !pergunta.trim()) {
      return res.status(400).json({
        erro: true,
        codigo: 'MENSAGEM_OBRIGATORIA',
        mensagem: 'A mensagem não pode estar vazia.'
      })
    }

    // Preferimos o histórico da SESSÃO visível enviado pelo frontend — assim o
    // contexto do assistente casa com o que o usuário vê e não vaza conversas
    // antigas. Só caímos no histórico persistido se o frontend não enviar nada.
    let historicoOrdenado
    if (Array.isArray(historicoSessao)) {
      historicoOrdenado = historicoSessao
        .filter(m => m && m.conteudo && (m.remetente === 'usuario' || m.remetente === 'chatbot'))
        .slice(-10)
        .map(m => ({ remetente: m.remetente, conteudo: String(m.conteudo).slice(0, 4000) }))
    } else {
      const { data: historico } = await supabase
        .from('mensagem_chatbot')
        .select('remetente, conteudo')
        .eq('id_usuario', req.user.id)
        .order('criado_em', { ascending: false })
        .limit(10)
      historicoOrdenado = (historico || []).reverse()
    }

    // O contexto completo nunca chega ao modelo: o que sai daqui é o recorte
    // permitido ao perfil de quem perguntou.
    const contexto = filtrarContextoPorPerfil(
      await montarContextoOficina(),
      req.user.perfil
    )

    const resposta = await responderChatbot(
      pergunta.trim(),
      req.user.perfil,
      historicoOrdenado,
      contexto
    )

    await supabase.from('mensagem_chatbot').insert([
      {
        id_usuario: req.user.id,
        remetente: 'usuario',
        conteudo: pergunta.trim()
      },
      {
        id_usuario: req.user.id,
        remetente: 'chatbot',
        conteudo: resposta
      }
    ])

    return res.status(200).json({
      erro: false,
      dados: { resposta }
    })
  } catch (err) {
    next(err)
  }
}

export async function historico(req, res, next) {
  try {
    const { page = 1, limit = 50 } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const { data, error, count } = await supabase
      .from('mensagem_chatbot')
      .select('*', { count: 'exact' })
      .eq('id_usuario', req.user.id)
      .order('criado_em', { ascending: true })
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
