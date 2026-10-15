import { supabase } from '../services/supabaseClient.js'
import { gerarRecomendacoesIA } from '../services/iaService.js'
import { calcularMetricasPainelIA } from '../services/metricasPainelIA.js'
import { validarRecomendacoes } from '../services/recomendacoesExplicaveis.js'

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000
const LIMITE_MAXIMO_HISTORICO = 50

function normalizarInteiroPositivo(valor, padrao, maximo) {
  const texto = String(valor ?? '').trim()
  if (!/^\d+$/.test(texto)) return padrao

  const numero = Number(texto)
  if (!Number.isSafeInteger(numero) || numero < 1) return padrao
  return Math.min(numero, maximo)
}

function criarDadosHistoricoSaneados(metricas) {
  const produtividade = { ...metricas.produtividade }
  delete produtividade.os_abertas_mais_antigas
  delete produtividade.conclusoes_por_mecanico

  return {
    ...metricas,
    produtividade,
  }
}

function projetarHistoricoParaInterface(registros) {
  if (!Array.isArray(registros)) return registros

  return registros.map((registro) => {
    if (!registro || typeof registro !== 'object' || Array.isArray(registro)) return registro

    const registroPublico = { ...registro }
    delete registroPublico.id_usuario
    const recomendacoes = registroPublico.recomendacoes
    if (!recomendacoes || typeof recomendacoes !== 'object' || Array.isArray(recomendacoes)) {
      return registroPublico
    }

    const recomendacoesPublicas = { ...recomendacoes }
    delete recomendacoesPublicas.metricas_do_modelo

    return {
      ...registroPublico,
      recomendacoes: recomendacoesPublicas,
    }
  })
}

export async function analisar(req, res, next) {
  try {
    const referencia = new Date()
    const limiteMovimentacoes = new Date(referencia.getTime() - 180 * MILISSEGUNDOS_POR_DIA)

    // As OS não recebem filtro de abertura: o motor também precisa enxergar
    // OS antigas que continuam abertas para sinalizá-las ao gestor.
    const respostas = await Promise.all([
      supabase
        .from('ordem_servico')
        .select('id, numero_os, id_veiculo, id_mecanico, status, valor_total, data_abertura, data_encerramento'),
      supabase
        .from('item_estoque')
        .select('id, codigo, nome, unidade, quantidade, qtd_minima')
        .eq('ativo', true),
      supabase
        .from('movimentacao_estoque')
        .select('id_item, tipo, quantidade, data_hora')
        .gte('data_hora', limiteMovimentacoes.toISOString()),
      supabase
        .from('funcionario')
        .select('id, nome'),
      supabase
        .from('veiculo')
        .select('id, marca, modelo'),
      supabase
        .from('os_servico')
        .select('id_os, descricao, quantidade'),
    ])

    const erroConsulta = respostas.find(({ error }) => error)?.error
    if (erroConsulta) throw erroConsulta

    const [resOS, resEstoque, resMovimentacoes, resFuncionarios, resVeiculos, resServicos] = respostas
    const metricas = calcularMetricasPainelIA({
      ordens: resOS.data ?? [],
      itens: resEstoque.data ?? [],
      movimentacoes: resMovimentacoes.data ?? [],
      funcionarios: resFuncionarios.data ?? [],
      veiculos: resVeiculos.data ?? [],
      servicos: resServicos.data ?? [],
    }, referencia)
    const dadosHistorico = criarDadosHistoricoSaneados(metricas)

    const recomendacoesIA = await gerarRecomendacoesIA(dadosHistorico)
    const respostaValidada = validarRecomendacoes(
      recomendacoesIA,
      metricas.catalogo_evidencias,
    )
    const { metricas_do_modelo: metricasDoModelo, ...respostaExplicativa } = respostaValidada

    // Números vêm apenas do motor determinístico. Texto, alertas e recomendações
    // chegam aqui somente após terem sido comprovados pelo catálogo calculado.
    const recomendacoes = {
      ...respostaExplicativa,
      ...dadosHistorico,
      // A resposta bruta do modelo fica somente no histórico de auditoria e
      // nunca é exposta como métrica para a interface.
      metricas_do_modelo: metricasDoModelo,
    }
    const resposta = {
      ...respostaExplicativa,
      ...metricas,
    }

    const { data: salvo, error: errSalvar } = await supabase
      .from('recomendacao_ia')
      .insert({
        id_usuario: req.user.id,
        dados_analisados: dadosHistorico,
        recomendacoes,
        criado_em: referencia.toISOString(),
      })
      .select()
      .single()

    if (errSalvar) {
      console.error('[IA] Erro ao salvar recomendação:', errSalvar.message)
    }

    return res.status(200).json({
      erro: false,
      dados: {
        ...resposta,
        id_analise: salvo?.id || null,
        gerado_em: referencia.toISOString(),
      }
    })
  } catch (err) {
    next(err)
  }
}

export async function listarRecomendacoes(req, res, next) {
  try {
    const { page = 1, limit = 10 } = req.query
    const pagina = normalizarInteiroPositivo(page, 1, 100000)
    const limite = normalizarInteiroPositivo(limit, 10, LIMITE_MAXIMO_HISTORICO)
    const offset = (pagina - 1) * limite

    const { data, error, count } = await supabase
      .from('recomendacao_ia')
      .select('id, recomendacoes, criado_em', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(offset, offset + limite - 1)

    if (error) throw error

    return res.status(200).json({
      erro: false,
      // O JSON bruto do modelo fica retido no banco exclusivamente para
      // auditoria; o histórico da interface recebe apenas a projeção segura.
      dados: projetarHistoricoParaInterface(data),
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
