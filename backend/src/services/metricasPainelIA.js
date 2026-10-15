const DIAS_PERIODO = 90
const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000
const HORAS_POR_MILISSEGUNDO = 1 / (60 * 60 * 1000)
const LIMITE_RANKING = 20
const STATUS_OS = ['aberta', 'em_andamento', 'aguardando_peca', 'concluida', 'cancelada']

function validarColecao(valor, nome) {
  if (!Array.isArray(valor)) {
    throw new TypeError(`${nome} deve ser uma lista`)
  }
  return valor
}

function temFusoExplicito(valor) {
  const indiceT = valor.indexOf('T')
  if (indiceT <= 0) return false
  if (valor.endsWith('Z')) return true

  const indiceOffset = Math.max(valor.lastIndexOf('+'), valor.lastIndexOf('-'))
  if (indiceOffset <= indiceT) return false
  const offset = valor.slice(indiceOffset)
  const digitos = offset.slice(1).replace(':', '')
  const formatoValido = offset.length === 5 || (offset.length === 6 && offset.at(3) === ':')
  return formatoValido && digitos.length === 4 && [...digitos].every((digito) => digito >= '0' && digito <= '9')
}

function converterData(valor) {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : new Date(valor.getTime())
  }

  if (typeof valor !== 'string' || !temFusoExplicito(valor)) return null
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? null : data
}

function validarReferencia(referencia) {
  const data = converterData(referencia)
  if (!data) {
    throw new TypeError('A referência deve ser uma data ISO válida ou Date válido')
  }
  return data
}

function numeroSeguro(valor) {
  const numero = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : 0
}

function numeroOuNulo(valor) {
  const numero = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function criarJanela(inicio, fim) {
  return {
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    dias: DIAS_PERIODO,
  }
}

function estaNaJanela(valor, janela) {
  const data = converterData(valor)
  if (!data) return false
  const instante = data.getTime()
  return instante >= Date.parse(janela.inicio) && instante < Date.parse(janela.fim)
}

function compararNome(a, b) {
  return String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR')
    || String(a.id ?? '').localeCompare(String(b.id ?? ''), 'pt-BR')
}

function limitarRanking(itens, comparar) {
  return [...itens].sort(comparar).slice(0, LIMITE_RANKING)
}

function mediana(valores) {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 0
    ? (ordenados.at(meio - 1) + ordenados.at(meio)) / 2
    : ordenados.at(meio)
}

function criarComparacao(atual, anterior) {
  const atualValido = numeroOuNulo(atual)
  const anteriorValido = numeroOuNulo(anterior)
  const diferenca = atualValido === null || anteriorValido === null
    ? null
    : atualValido - anteriorValido

  return {
    atual: atualValido,
    anterior: anteriorValido,
    diferenca,
    variacao_percentual: anteriorValido === null || anteriorValido === 0 || diferenca === null
      ? null
      : (diferenca / anteriorValido) * 100,
  }
}

function textoSeguro(valor, padrao) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : padrao
}

function rotuloModeloVeiculo(ordem, veiculosPorId) {
  const veiculo = veiculosPorId.get(ordem.id_veiculo)
  if (!veiculo) return 'Veiculo nao identificado'

  const partes = [veiculo.marca, veiculo.modelo]
    .filter((parte) => typeof parte === 'string' && parte.trim())
    .map((parte) => parte.trim())

  return partes.length > 0 ? partes.join(' ') : 'Veiculo nao identificado'
}

function criarRankingComparativo(valoresAtuais, valoresAnteriores, obterRotulo, obterPeso = () => 1) {
  const acumulados = new Map()

  const acumular = (valores, periodo) => {
    for (const valor of valores) {
      const rotulo = obterRotulo(valor)
      const peso = Math.max(0, numeroSeguro(obterPeso(valor)))
      if (!peso) continue
      const grupo = acumulados.get(rotulo) ?? { atual: 0, anterior: 0 }
      if (periodo === 'atual') grupo.atual += peso
      else grupo.anterior += peso
      acumulados.set(rotulo, grupo)
    }
  }

  acumular(valoresAtuais, 'atual')
  acumular(valoresAnteriores, 'anterior')

  return limitarRanking(
    [...acumulados.entries()].map(([rotulo, valores]) => ({
      rotulo,
      ...criarComparacao(valores.atual, valores.anterior),
    })),
    (a, b) => b.atual - a.atual
      || b.anterior - a.anterior
      || a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
  )
}

function somarValores(ordens) {
  return ordens.reduce((total, ordem) => total + numeroSeguro(ordem.valor_total), 0)
}

function calcularDuracoes(ordens) {
  return ordens.flatMap((ordem) => {
    const abertura = converterData(ordem.data_abertura)
    const encerramento = converterData(ordem.data_encerramento)
    if (!abertura || !encerramento || encerramento < abertura) return []
    return [(encerramento.getTime() - abertura.getTime()) * HORAS_POR_MILISSEGUNDO]
  })
}

function dadosItem(item, quantidadeSaida, houveMovimentacao) {
  const quantidade = Math.max(0, numeroSeguro(item.quantidade))
  const qtdMinima = Math.max(0, numeroSeguro(item.qtd_minima))
  const consumoDiario = quantidadeSaida / DIAS_PERIODO
  const coberturaDias = consumoDiario > 0 ? quantidade / consumoDiario : null

  return {
    id: item.id ?? null,
    codigo: item.codigo ?? null,
    nome: item.nome ?? 'Item sem nome',
    quantidade,
    qtd_minima: qtdMinima,
    unidade: item.unidade ?? null,
    quantidade_saida: quantidadeSaida,
    consumo_diario: consumoDiario,
    cobertura_dias: coberturaDias,
    sugestao_reposicao: Math.max(0, Math.ceil(qtdMinima + consumoDiario * 30 - quantidade)),
    parado: !houveMovimentacao,
  }
}

function criarCatalogoEvidencias(metricas, periodo) {
  const evidencia = (valor, unidade) => ({
    valor,
    periodo_inicio: periodo.inicio,
    periodo_fim: periodo.fim,
    unidade,
  })

  return {
    'faturamento.valor': evidencia(metricas.faturamento, 'BRL'),
    'ordens.abertas': evidencia(metricas.ordens_abertas, 'ordens'),
    'ordens.concluidas': evidencia(metricas.ordens_concluidas, 'ordens'),
    'ordens.taxa_conclusao': evidencia(metricas.taxa_conclusao, 'percentual'),
    'ordens.ticket_medio': evidencia(metricas.ticket_medio, 'BRL'),
    'produtividade.tempo_medio_horas': evidencia(metricas.duracao_media_horas, 'horas'),
    'produtividade.tempo_mediano_horas': evidencia(metricas.duracao_mediana_horas, 'horas'),
    'estoque.itens_criticos': evidencia(metricas.itens_criticos, 'itens'),
    'estoque.quantidade_saidas': evidencia(metricas.quantidade_saidas, 'unidades'),
  }
}

/**
 * Calcula os agregados determinísticos do Painel IA sem efeitos externos.
 * Datas nas janelas usam UTC e representam intervalos [início, fim).
 */
export function calcularMetricasPainelIA(dados, referencia) {
  if (!dados || typeof dados !== 'object') {
    throw new TypeError('Os dados para cálculo das métricas são obrigatórios')
  }

  const referenciaData = validarReferencia(referencia)
  const ordens = validarColecao(dados.ordens ?? [], 'ordens')
  const itens = validarColecao(dados.itens ?? [], 'itens')
  const movimentacoes = validarColecao(dados.movimentacoes ?? [], 'movimentacoes')
  const funcionarios = validarColecao(dados.funcionarios ?? [], 'funcionarios')
  const veiculos = validarColecao(dados.veiculos ?? [], 'veiculos')
  const servicos = validarColecao(dados.servicos ?? [], 'servicos')

  const inicioAtual = new Date(referenciaData.getTime() - DIAS_PERIODO * MILISSEGUNDOS_POR_DIA)
  const inicioAnterior = new Date(inicioAtual.getTime() - DIAS_PERIODO * MILISSEGUNDOS_POR_DIA)
  const periodoAtual = criarJanela(inicioAtual, referenciaData)
  const periodoAnterior = criarJanela(inicioAnterior, inicioAtual)

  const aberturasAtuais = ordens.filter((ordem) => estaNaJanela(ordem.data_abertura, periodoAtual))
  const aberturasAnteriores = ordens.filter((ordem) => estaNaJanela(ordem.data_abertura, periodoAnterior))
  const veiculosPorId = new Map(veiculos.map((veiculo) => [veiculo.id, veiculo]))
  const ordensAtuaisPorId = new Set(aberturasAtuais.map((ordem) => ordem.id))
  const ordensAnterioresPorId = new Set(aberturasAnteriores.map((ordem) => ordem.id))
  const servicosAtuais = servicos.filter((servico) => ordensAtuaisPorId.has(servico.id_os))
  const servicosAnteriores = servicos.filter((servico) => ordensAnterioresPorId.has(servico.id_os))
  const concluidasAtuais = ordens.filter((ordem) => ordem.status === 'concluida' && estaNaJanela(ordem.data_encerramento, periodoAtual))
  const concluidasAnteriores = ordens.filter((ordem) => ordem.status === 'concluida' && estaNaJanela(ordem.data_encerramento, periodoAnterior))
  const faturamentoAtual = somarValores(concluidasAtuais)
  const faturamentoAnterior = somarValores(concluidasAnteriores)
  const ticketAtual = concluidasAtuais.length > 0 ? faturamentoAtual / concluidasAtuais.length : null
  const ticketAnterior = concluidasAnteriores.length > 0 ? faturamentoAnterior / concluidasAnteriores.length : null
  const duracoesAtuais = calcularDuracoes(concluidasAtuais)
  const duracoesAnteriores = calcularDuracoes(concluidasAnteriores)
  const duracaoMediaAtual = duracoesAtuais.length > 0
    ? duracoesAtuais.reduce((total, duracao) => total + duracao, 0) / duracoesAtuais.length
    : null
  const duracaoMediaAnterior = duracoesAnteriores.length > 0
    ? duracoesAnteriores.reduce((total, duracao) => total + duracao, 0) / duracoesAnteriores.length
    : null

  const movimentacoesAtuais = movimentacoes.filter((movimentacao) => estaNaJanela(movimentacao.data_hora, periodoAtual))
  const movimentacoesAnteriores = movimentacoes.filter((movimentacao) => estaNaJanela(movimentacao.data_hora, periodoAnterior))
  const saidasAtuais = movimentacoesAtuais.filter((movimentacao) => movimentacao.tipo === 'saida')
  const saidasAnteriores = movimentacoesAnteriores.filter((movimentacao) => movimentacao.tipo === 'saida')
  const quantidadeSaidasAtual = saidasAtuais.reduce((total, movimentacao) => total + Math.max(0, numeroSeguro(movimentacao.quantidade)), 0)
  const quantidadeSaidasAnterior = saidasAnteriores.reduce((total, movimentacao) => total + Math.max(0, numeroSeguro(movimentacao.quantidade)), 0)
  const saidasPorItem = new Map()
  const movimentacoesPorItem = new Set()

  for (const movimentacao of movimentacoesAtuais) {
    if (movimentacao.id_item === null || movimentacao.id_item === undefined) continue
    movimentacoesPorItem.add(movimentacao.id_item)
    if (movimentacao.tipo === 'saida') {
      const quantidade = Math.max(0, numeroSeguro(movimentacao.quantidade))
      saidasPorItem.set(movimentacao.id_item, (saidasPorItem.get(movimentacao.id_item) ?? 0) + quantidade)
    }
  }

  const itensCalculados = itens.map((item) => dadosItem(
    item,
    saidasPorItem.get(item.id) ?? 0,
    movimentacoesPorItem.has(item.id),
  ))
  const itensCriticos = itensCalculados.filter((item) => item.quantidade <= item.qtd_minima)
  const itensParados = itensCalculados.filter((item) => item.parado)
  const maisConsumidos = limitarRanking(itensCalculados, (a, b) => b.quantidade_saida - a.quantidade_saida || compararNome(a, b))
  const rankingCriticos = limitarRanking(itensCriticos, (a, b) => a.quantidade - b.quantidade || compararNome(a, b))

  const totalPorStatus = Object.fromEntries(STATUS_OS.map((status) => [status, 0]))
  for (const ordem of aberturasAtuais) {
    totalPorStatus[ordem.status] = (totalPorStatus[ordem.status] ?? 0) + 1
  }

  const taxaConclusao = aberturasAtuais.length > 0
    ? (concluidasAtuais.length / aberturasAtuais.length) * 100
    : null
  const funcionariosPorId = new Map(funcionarios.map((funcionario) => [funcionario.id, funcionario.nome]))
  const conclusoesAgrupadas = new Map()
  for (const ordem of concluidasAtuais) {
    const chave = ordem.id_mecanico ?? '__sem_mecanico__'
    const grupo = conclusoesAgrupadas.get(chave) ?? {
      id_mecanico: ordem.id_mecanico ?? null,
      nome: funcionariosPorId.get(ordem.id_mecanico) || 'Mecânico não identificado',
      quantidade_concluida: 0,
      total_valores: 0,
    }
    grupo.quantidade_concluida += 1
    grupo.total_valores += numeroSeguro(ordem.valor_total)
    conclusoesAgrupadas.set(chave, grupo)
  }
  const conclusoesPorMecanico = limitarRanking(
    [...conclusoesAgrupadas.values()].map(({ total_valores: totalValores, ...grupo }) => ({
      ...grupo,
      valor_medio: grupo.quantidade_concluida > 0 ? totalValores / grupo.quantidade_concluida : null,
    })),
    (a, b) => b.quantidade_concluida - a.quantidade_concluida || compararNome(a, b),
  )
  const osAbertasMaisAntigas = limitarRanking(
    ordens
      .filter((ordem) => !['concluida', 'cancelada'].includes(ordem.status))
      .map((ordem) => ({ ...ordem, _data_abertura: converterData(ordem.data_abertura) }))
      .filter((ordem) => ordem._data_abertura && ordem._data_abertura < referenciaData)
      .map((ordem) => ({
        id: ordem.id ?? null,
        numero_os: ordem.numero_os ?? null,
        status: ordem.status,
        data_abertura: ordem._data_abertura.toISOString(),
      })),
    (a, b) => Date.parse(a.data_abertura) - Date.parse(b.data_abertura) || compararNome(a, b),
  )

  const metricasDestaque = {
    faturamento: faturamentoAtual,
    ordens_abertas: aberturasAtuais.length,
    ordens_concluidas: concluidasAtuais.length,
    taxa_conclusao: taxaConclusao,
    ticket_medio: ticketAtual,
    duracao_media_horas: duracaoMediaAtual,
    duracao_mediana_horas: mediana(duracoesAtuais),
    quantidade_saidas: quantidadeSaidasAtual,
    itens_criticos: itensCriticos.length,
  }

  return {
    periodo_atual: periodoAtual,
    periodo_anterior: periodoAnterior,
    metricas_destaque: metricasDestaque,
    estoque_inteligente: {
      mais_consumidos: maisConsumidos,
      itens_criticos: rankingCriticos,
      itens_parados: limitarRanking(itensParados, compararNome),
    },
    produtividade: {
      total_por_status: totalPorStatus,
      total_aberturas: aberturasAtuais.length,
      taxa_conclusao: taxaConclusao,
      tempo_medio_horas: duracaoMediaAtual,
      tempo_mediano_horas: mediana(duracoesAtuais),
      os_abertas_mais_antigas: osAbertasMaisAntigas,
      conclusoes_por_mecanico: conclusoesPorMecanico,
    },
    comparacoes: {
      faturamento: criarComparacao(faturamentoAtual, faturamentoAnterior),
      ordens_abertas: criarComparacao(aberturasAtuais.length, aberturasAnteriores.length),
      ordens_concluidas: criarComparacao(concluidasAtuais.length, concluidasAnteriores.length),
      ticket_medio: criarComparacao(ticketAtual, ticketAnterior),
      duracao_media_horas: criarComparacao(duracaoMediaAtual, duracaoMediaAnterior),
      quantidade_saidas: criarComparacao(quantidadeSaidasAtual, quantidadeSaidasAnterior),
      // O schema não mantém saldo histórico: não é seguro fabricar crítico anterior.
      itens_criticos: criarComparacao(itensCriticos.length, null),
      modelos_veiculo: criarRankingComparativo(
        aberturasAtuais,
        aberturasAnteriores,
        (ordem) => rotuloModeloVeiculo(ordem, veiculosPorId),
      ),
      servicos_mais_frequentes: criarRankingComparativo(
        servicosAtuais,
        servicosAnteriores,
        (servico) => textoSeguro(servico.descricao, 'Servico nao identificado'),
        (servico) => servico.quantidade,
      ),
    },
    catalogo_evidencias: criarCatalogoEvidencias(metricasDestaque, periodoAtual),
  }
}
