const PRIORIDADES = new Set(['alta', 'media', 'baixa'])
const CATEGORIAS = new Set(['estoque', 'atendimento', 'financeiro', 'operacional'])
const URGENCIAS = new Set(['critica', 'alta', 'media', 'baixa'])

const TAMANHOS_MAXIMOS = {
  resumo: 2000,
  titulo: 200,
  descricao: 2000,
  acao: 1000,
  impacto: 1000,
  tipoAlerta: 100,
  mensagemAlerta: 1000,
  periodo: 64,
}

// Textos livres não carregam a ligação entre cada afirmação e uma evidência.
// Para que um valor do modelo não seja apresentado como dado da oficina, eles
// só podem ser qualitativos. Números ficam restritos às evidências validadas e
// às métricas calculadas pelo backend. A expressão cobre algarismos Unicode,
// percentual e os formatos monetários mais comuns.
const PADRAO_TERMO_QUANTITATIVO = /(?<![\p{L}\p{N}_])(?:dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzent[oa]s|trezent[oa]s|quatrocent[oa]s|quinhent[oa]s|seiscent[oa]s|setecent[oa]s|oitocent[oa]s|novecent[oa]s|mil|milh[ãa]o|milh[õo]es|bilh[ãa]o|bilh[õo]es|dobro|triplo|metade|dezenas|centenas|milhares|reais|d[oó]lar(?:es)?|euros?|por\s+cento|BRL|USD|EUR|GBP|JPY)(?![\p{L}\p{N}_])/iu
const PADRAO_MOEDA_SINGULAR = /(?<![\p{L}\p{N}_])(?:um|uma)\s+real(?![\p{L}\p{N}_])/iu
const PADRAO_ALEGACAO_QUANTITATIVA = /[\p{N}%‰‱]|(?:R|US)\$|[$€£¥₩₹₽₿¢]/u

function ehObjetoRegistro(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
}

function lerPropriedadePropria(objeto, chave) {
  if (!ehObjetoRegistro(objeto)) return undefined

  try {
    if (!Object.prototype.hasOwnProperty.call(objeto, chave)) return undefined
    const descritor = Object.getOwnPropertyDescriptor(objeto, chave)
    return descritor && !descritor.get && !descritor.set ? descritor.value : undefined
  } catch {
    return undefined
  }
}

function sanitizarTexto(valor, tamanhoMaximo) {
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  return texto ? texto.slice(0, tamanhoMaximo) : null
}

function sanitizarTextoQualitativo(valor, tamanhoMaximo) {
  const texto = sanitizarTexto(valor, tamanhoMaximo)
  return texto
    && !PADRAO_ALEGACAO_QUANTITATIVA.test(texto)
    && !PADRAO_TERMO_QUANTITATIVO.test(texto)
    && !PADRAO_MOEDA_SINGULAR.test(texto)
    ? texto
    : null
}

function sanitizarPeriodo(valor) {
  const inicio = lerPropriedadePropria(valor, 'inicio')
  const fim = lerPropriedadePropria(valor, 'fim')
  if (
    typeof inicio !== 'string'
    || typeof fim !== 'string'
    || !inicio
    || !fim
    || inicio.length > TAMANHOS_MAXIMOS.periodo
    || fim.length > TAMANHOS_MAXIMOS.periodo
  ) return null

  return { inicio, fim }
}

function obterEntradaCatalogo(catalogoEvidencias, chave) {
  if (!ehObjetoRegistro(catalogoEvidencias) || typeof chave !== 'string' || !chave) return null

  try {
    if (!Object.prototype.hasOwnProperty.call(catalogoEvidencias, chave)) return null
    const descritor = Object.getOwnPropertyDescriptor(catalogoEvidencias, chave)
    return descritor && !descritor.get && !descritor.set && ehObjetoRegistro(descritor.value)
      ? descritor.value
      : null
  } catch {
    return null
  }
}

function sanitizarEvidencias(valor, catalogoEvidencias, periodo) {
  if (!Array.isArray(valor)) return []

  return valor.flatMap((evidencia) => {
    const chave = lerPropriedadePropria(evidencia, 'chave')
    const entrada = obterEntradaCatalogo(catalogoEvidencias, chave)
    if (!entrada) return []

    const valorModelo = lerPropriedadePropria(evidencia, 'valor')
    const unidadeModelo = lerPropriedadePropria(evidencia, 'unidade')
    const valorCalculado = lerPropriedadePropria(entrada, 'valor')
    const unidadeCalculada = lerPropriedadePropria(entrada, 'unidade')
    const inicioCalculado = lerPropriedadePropria(entrada, 'periodo_inicio')
    const fimCalculado = lerPropriedadePropria(entrada, 'periodo_fim')
    const valorValido = Number.isFinite(valorModelo) || valorModelo === null
    const calculadoValido = Number.isFinite(valorCalculado) || valorCalculado === null

    if (
      !valorValido
      || !calculadoValido
      || !Object.is(valorModelo, valorCalculado)
      || typeof unidadeCalculada !== 'string'
      || unidadeModelo !== unidadeCalculada
      || periodo.inicio !== inicioCalculado
      || periodo.fim !== fimCalculado
    ) return []

    return [{ chave, valor: valorModelo, unidade: unidadeModelo }]
  })
}

function sanitizarRecomendacao(valor, catalogoEvidencias) {
  const titulo = sanitizarTextoQualitativo(
    lerPropriedadePropria(valor, 'titulo'),
    TAMANHOS_MAXIMOS.titulo,
  )
  const descricao = sanitizarTextoQualitativo(
    lerPropriedadePropria(valor, 'descricao'),
    TAMANHOS_MAXIMOS.descricao,
  )
  const acaoSugerida = sanitizarTextoQualitativo(
    lerPropriedadePropria(valor, 'acao_sugerida'),
    TAMANHOS_MAXIMOS.acao,
  )
  const impactoEsperado = sanitizarTextoQualitativo(
    lerPropriedadePropria(valor, 'impacto_esperado'),
    TAMANHOS_MAXIMOS.impacto,
  )
  const prioridade = lerPropriedadePropria(valor, 'prioridade')
  const categoria = lerPropriedadePropria(valor, 'categoria')
  const periodo = sanitizarPeriodo(lerPropriedadePropria(valor, 'periodo'))

  if (
    !titulo
    || !descricao
    || !acaoSugerida
    || !impactoEsperado
    || !PRIORIDADES.has(prioridade)
    || !CATEGORIAS.has(categoria)
    || !periodo
  ) return null

  const evidencias = sanitizarEvidencias(
    lerPropriedadePropria(valor, 'evidencias'),
    catalogoEvidencias,
    periodo,
  )
  if (evidencias.length === 0) return null

  return {
    titulo,
    descricao,
    prioridade,
    categoria,
    acao_sugerida: acaoSugerida,
    impacto_esperado: impactoEsperado,
    periodo,
    evidencias,
  }
}

function sanitizarAlertas(valor) {
  if (!Array.isArray(valor)) return []

  return valor.flatMap((alerta) => {
    const tipo = sanitizarTextoQualitativo(
      lerPropriedadePropria(alerta, 'tipo'),
      TAMANHOS_MAXIMOS.tipoAlerta,
    )
    const mensagem = sanitizarTextoQualitativo(
      lerPropriedadePropria(alerta, 'mensagem'),
      TAMANHOS_MAXIMOS.mensagemAlerta,
    )
    const urgencia = lerPropriedadePropria(alerta, 'urgencia')
    if (!tipo || !mensagem || !URGENCIAS.has(urgencia)) return []
    return [{ tipo, mensagem, urgencia }]
  })
}

/**
 * Mantém somente a parte explicativa da resposta do modelo que pode ser
 * comprovada pelo catálogo calculado pelo backend (RF12, RN40 e RN43).
 */
export function validarRecomendacoes(respostaModelo, catalogoEvidencias) {
  const resumo = sanitizarTextoQualitativo(
    lerPropriedadePropria(respostaModelo, 'resumo'),
    TAMANHOS_MAXIMOS.resumo,
  ) ?? ''
  const recomendacoesBrutas = lerPropriedadePropria(respostaModelo, 'recomendacoes')
  const recomendacoes = Array.isArray(recomendacoesBrutas)
    ? recomendacoesBrutas.flatMap((recomendacao) => {
      const recomendacaoSaneada = sanitizarRecomendacao(recomendacao, catalogoEvidencias)
      return recomendacaoSaneada ? [recomendacaoSaneada] : []
    })
    : []

  const metricasDoModelo = lerPropriedadePropria(respostaModelo, 'metricas_destaque') ?? null

  return {
    resumo,
    recomendacoes,
    alertas: sanitizarAlertas(lerPropriedadePropria(respostaModelo, 'alertas')),
    metricas_do_modelo: metricasDoModelo,
  }
}
