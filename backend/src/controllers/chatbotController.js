import { supabase } from '../services/supabaseClient.js'
import { responderChatbot } from '../services/iaService.js'
import { filtrarContextoPorPerfil } from '../utils/contextoPorPerfil.js'
import { calcularContextoAnalitico } from '../utils/contextoAnalitico.js'
import { consultarTodasPaginas } from '../utils/consultaCompleta.js'

function erroConsulta(causa) {
  return Object.assign(new Error('Não foi possível consultar os dados do chatbot.', { cause: causa }), {
    status: 503,
    codigo: 'DADOS_CHATBOT_INDISPONIVEIS',
    mensagem: 'Não foi possível consultar os dados da oficina. Tente novamente; nenhum valor foi calculado.',
  })
}

// Coleta e pré-agrega os dados da oficina para o chatbot responder perguntas
// analíticas (ranking de clientes, ticket médio, faturamento, estoque em alerta).
// Roda com service role (ignora RLS), portanto monta a visão completa da oficina:
// o recorte por perfil é aplicado depois, em filtrarContextoPorPerfil.
async function montarContextoOficina() {
  try {
    const sinal = AbortSignal.timeout(5000)
    const [clientes, veiculos, ordens, estoque, servicos, movimentacoes] = await Promise.all([
      consultarTodasPaginas(() => supabase.from('cliente').select('id, nome', { count: 'exact' }).eq('ativo', true).order('id').abortSignal(sinal)),
      consultarTodasPaginas(() => supabase.from('veiculo').select('id, id_cliente, marca, modelo', { count: 'exact' }).eq('ativo', true).order('id').abortSignal(sinal)),
      consultarTodasPaginas(() => supabase.from('ordem_servico').select('id, id_veiculo, valor_total, status, data_abertura, data_encerramento', { count: 'exact' }).order('id').abortSignal(sinal)),
      consultarTodasPaginas(() => supabase.from('item_estoque').select('id, codigo, nome, quantidade, qtd_minima', { count: 'exact' }).eq('ativo', true).order('id').abortSignal(sinal)),
      consultarTodasPaginas(() => supabase.from('servico_catalogo').select('id, nome, preco', { count: 'exact' }).eq('ativo', true).order('id').abortSignal(sinal)),
      consultarTodasPaginas(() => supabase.from('movimentacao_estoque').select('id, id_item, tipo, quantidade, data_hora', { count: 'exact' }).order('id').abortSignal(sinal)),
    ])

    // Map em vez de objeto literal: as chaves vêm do banco, e um Map não herda
    // do Object.prototype (sem risco de prototype pollution por chave dinâmica).
    const veiculoParaCliente = new Map(veiculos.map(v => [v.id, v.id_cliente]))
    const nomePorCliente = new Map(clientes.map(c => [c.id, c.nome]))

    // Agrega OS por cliente (via veículo)
    const agg = new Map()
    for (const os of ordens) {
      const cid = veiculoParaCliente.get(os.id_veiculo)
      if (!cid) continue
      if (!agg.has(cid)) agg.set(cid, { nome: nomePorCliente.get(cid) || 'Desconhecido', qtd_os: 0, total_gasto: 0 })
      const item = agg.get(cid)
      item.qtd_os += 1
      item.total_gasto += Number(os.valor_total || 0)
    }

    const rankingClientes = [...agg.values()]
      .map(c => ({
        nome: c.nome,
        qtd_os: c.qtd_os,
        total_gasto: +c.total_gasto.toFixed(2),
        ticket_medio: c.qtd_os ? +(c.total_gasto / c.qtd_os).toFixed(2) : 0,
      }))
      .sort((a, b) => b.qtd_os - a.qtd_os || b.total_gasto - a.total_gasto)
      .slice(0, 50)

    const contextoAnalitico = calcularContextoAnalitico({
      veiculos,
      ordens,
      itensEstoque: estoque,
      movimentacoes,
    })
    const financeiroHistorico = contextoAnalitico.analises_financeiras.todo_historico

    return {
      totais: {
        clientes: clientes.length,
        veiculos: veiculos.length,
        ordens_servico: ordens.length,
        faturamento_total: financeiroHistorico.faturamento,
        ticket_medio_geral: financeiroHistorico.ticket_medio,
      },
      ranking_clientes: rankingClientes,
      estoque_em_alerta: estoque
        .filter(i => i.quantidade <= i.qtd_minima)
        .map(i => ({ nome: i.nome, quantidade: i.quantidade, qtd_minima: i.qtd_minima })),
      servicos_catalogo: servicos.slice(0, 50),
      ...contextoAnalitico,
    }
  } catch (err) {
    console.error('[Chatbot] Falha ao montar contexto da oficina:', err.message)
    throw erroConsulta(err)
  }
}

// RF11/RN39/RN43: a tool interpreta; só este callback autorizado lê valores.
// Nada de tabela/coluna/SQL do modelo entra na consulta.
async function consultarFinanceiro(plano, perfil, prazo) {
  if (perfil !== 'gestor') throw Object.assign(new Error('Informação restrita ao gestor.'), { status: 403, codigo: 'SEM_PERMISSAO' })
  try {
    const restante = prazo - Date.now()
    if (restante <= 0) throw new Error('Prazo da operação esgotado.')
    const sinal = AbortSignal.timeout(Math.min(restante, 5000))
    return await Promise.all(plano.periodos.map(periodo => consultarTodasPaginas(() => {
      let consulta = supabase.from('ordem_servico')
        .select('id, valor_total, status, data_encerramento', { count: 'exact' })
        .eq('status', 'concluida')
        .order('id')
        .abortSignal(sinal)
      if (periodo.inicio) consulta = consulta.gte('data_encerramento', periodo.inicio)
      if (periodo.fim) consulta = consulta.lt('data_encerramento', periodo.fim)
      return consulta
    })))
  } catch (erro) {
    throw erroConsulta(erro)
  }
}

// Igual ao do iaController: query string nao confiavel virando inteiro seguro.
function normalizarInteiroPositivo(valor, padrao, maximo) {
  const texto = String(valor ?? '').trim()
  if (!/^\d+$/.test(texto)) return padrao

  const numero = Number(texto)
  if (!Number.isSafeInteger(numero) || numero < 1) return padrao
  return Math.min(numero, maximo)
}


export async function mensagem(req, res, next) {
  try {
    const prazo = Date.now() + 25000
    const { pergunta, historico: historicoSessao } = req.body || {}
    const perguntaNormalizada = typeof pergunta === 'string' ? pergunta.trim() : ''

    if (!perguntaNormalizada) {
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
    } else if (req.user.perfil === 'gestor') {
      const { data: historico } = await supabase
        .from('mensagem_chatbot')
        .select('remetente, conteudo')
        .eq('id_usuario', req.user.id)
        .order('criado_em', { ascending: false })
        .limit(10)
        .abortSignal(AbortSignal.timeout(Math.max(1, Math.min(5000, prazo - Date.now()))))
      historicoOrdenado = (historico || [])
        .reverse()
        .map(m => ({
          remetente: m.remetente,
          conteudo: String(m.conteudo).slice(0, 4000)
        }))
    } else {
      // Registros antigos não guardam o perfil original; uma conta rebaixada não
      // pode recuperar respostas financeiras que recebia enquanto era gestora.
      historicoOrdenado = []
    }

    // O contexto completo nunca chega ao modelo: o que sai daqui é o recorte
    // permitido ao perfil de quem perguntou.
    const contexto = filtrarContextoPorPerfil(
      await montarContextoOficina(),
      req.user.perfil
    )

    const resposta = await responderChatbot(
      perguntaNormalizada,
      req.user.perfil,
      historicoOrdenado,
      contexto,
      plano => consultarFinanceiro(plano, req.user.perfil, prazo),
      { prazo }
    )

    try {
      const restante = prazo - Date.now()
      if (restante <= 0) throw new Error('Prazo de persistência esgotado.')
      const { error } = await supabase.from('mensagem_chatbot').insert([
        {
          id_usuario: req.user.id,
          remetente: 'usuario',
          conteudo: perguntaNormalizada
        },
        {
          id_usuario: req.user.id,
          remetente: 'chatbot',
          conteudo: resposta
        }
      ]).abortSignal(AbortSignal.timeout(Math.min(restante, 2000)))

      if (error) {
        console.error('[Chatbot] Falha ao persistir conversa:', error.message || error)
      }
    } catch (error) {
      // A resposta do Gemini já foi gerada. Falhar apenas a persistência não
      // deve descartá-la nem transformar uma resposta válida em erro HTTP 500.
      console.error('[Chatbot] Falha ao persistir conversa:', error.message || error)
    }

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
    if (req.user.perfil !== 'gestor') {
      return res.status(403).json({
        erro: true, codigo: 'HISTORICO_RESTRITO',
        mensagem: 'O histórico persistido é restrito ao gestor, pois pode conter respostas financeiras de perfis anteriores. A conversa atual continua disponível.',
      })
    }
    // `parseInt('abc')` dava NaN e `range(NaN, NaN)` estourava 500; `page=0` ou
    // negativo dava offset negativo. Mesma normalizacao do iaController.
    const pagina = normalizarInteiroPositivo(req.query.page, 1, 10000)
    const limite = normalizarInteiroPositivo(req.query.limit, 50, 200)
    const offset = (pagina - 1) * limite

    const { data, error, count } = await supabase
      .from('mensagem_chatbot')
      .select('*', { count: 'exact' })
      .eq('id_usuario', req.user.id)
      .order('criado_em', { ascending: true })
      .range(offset, offset + limite - 1)

    if (error) throw error

    return res.status(200).json({
      erro: false,
      dados: data,
      paginacao: {
        total: count ?? 0,
        pagina,
        limite,
        totalPaginas: Math.ceil((count ?? 0) / limite)
      }
    })
  } catch (err) {
    next(err)
  }
}
