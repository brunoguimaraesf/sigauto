const DIAS_PERIODO_PADRAO = 90
const LIMITE_RANKING = 20

function dataValida(valor) {
  if (!valor) return null
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? null : data
}

function dentroDoPeriodo(valor, inicio, fim) {
  const data = dataValida(valor)
  return data !== null && data >= inicio && data <= fim
}

function chaveNormalizada(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
}

function ordenarRanking(itens, obterQuantidade) {
  return itens
    .sort((a, b) => obterQuantidade(b) - obterQuantidade(a) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, LIMITE_RANKING)
}

function rankingModelos(ordens, veiculoPorId, inicio = null, fim = null) {
  const agregado = new Map()
  for (const os of ordens) {
    if (os.status === 'cancelada') continue
    if (inicio && !dentroDoPeriodo(os.data_abertura, inicio, fim)) continue
    const veiculo = veiculoPorId.get(os.id_veiculo)
    if (!veiculo) continue
    const nome = [veiculo.marca, veiculo.modelo]
      .map(v => String(v || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .join(' ')
    const chave = chaveNormalizada(nome)
    if (!chave) continue
    const atual = agregado.get(chave) || { nome, quantidade_entradas: 0 }
    atual.quantidade_entradas += 1
    agregado.set(chave, atual)
  }
  return ordenarRanking([...agregado.values()], item => item.quantidade_entradas)
}

function rankingPecas(movimentacoes, itemPorId, inicio = null, fim = null) {
  const agregado = new Map()
  for (const movimento of movimentacoes) {
    if (movimento.tipo !== 'saida') continue
    if (inicio && !dentroDoPeriodo(movimento.data_hora, inicio, fim)) continue
    const item = itemPorId.get(movimento.id_item)
    if (!item) continue
    const atual = agregado.get(movimento.id_item) || {
      codigo: item.codigo,
      nome: item.nome,
      quantidade_saida: 0,
    }
    atual.quantidade_saida += Number(movimento.quantidade) || 0
    agregado.set(movimento.id_item, atual)
  }
  return ordenarRanking([...agregado.values()], item => item.quantidade_saida)
}

function resumirFaturamento(ordens, inicio = null, fim = null) {
  const concluidas = ordens.filter(os => (
    os.status === 'concluida' &&
    dataValida(os.data_encerramento) !== null &&
    (!inicio || dentroDoPeriodo(os.data_encerramento, inicio, fim))
  ))
  const faturamento = concluidas.reduce((total, os) => total + (Number(os.valor_total) || 0), 0)
  return {
    faturamento: +faturamento.toFixed(2),
    ordens_concluidas: concluidas.length,
    ticket_medio: concluidas.length ? +(faturamento / concluidas.length).toFixed(2) : 0,
  }
}

// RF11 / RN39 / RN43: os calculos sao deterministas e usam somente registros
// existentes. O modelo recebe agregados limitados, nunca linhas cruas ou SQL.
export function calcularContextoAnalitico(
  { veiculos = [], ordens = [], itensEstoque = [], movimentacoes = [] },
  agora = new Date()
) {
  const fim = new Date(agora)
  const inicio = new Date(fim)
  inicio.setUTCDate(inicio.getUTCDate() - DIAS_PERIODO_PADRAO)
  const veiculoPorId = new Map(veiculos.map(v => [v.id, v]))
  const itemPorId = new Map(itensEstoque.map(i => [i.id, i]))

  return {
    analises_financeiras: {
      criterio: 'Somente OS concluídas; valor_total pela data_encerramento.',
      ultimos_3_meses: {
        periodo_inicio: inicio.toISOString(),
        periodo_fim: fim.toISOString(),
        criterio_periodo: '90 dias corridos, limites inclusivos',
        ...resumirFaturamento(ordens, inicio, fim),
      },
      todo_historico: resumirFaturamento(ordens),
    },
    analises_operacionais: {
      criterios: {
        entrada_veiculo: 'Uma OS não cancelada conta como uma entrada, pela data_abertura.',
        saida_peca: 'Soma de quantidade em movimentacao_estoque com tipo saida, pela data_hora.',
        periodo_padrao_sem_periodo_informado: 'todo_historico',
      },
      ultimos_3_meses: {
        periodo_inicio: inicio.toISOString(),
        periodo_fim: fim.toISOString(),
        modelos_com_mais_entradas: rankingModelos(ordens, veiculoPorId, inicio, fim),
        pecas_com_maior_saida: rankingPecas(movimentacoes, itemPorId, inicio, fim),
      },
      todo_historico: {
        modelos_com_mais_entradas: rankingModelos(ordens, veiculoPorId),
        pecas_com_maior_saida: rankingPecas(movimentacoes, itemPorId),
      },
    },
  }
}
