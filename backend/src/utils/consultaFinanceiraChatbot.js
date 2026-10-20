// RF11 / RN39 / RN43: o modelo interpreta; período e valores são conferidos pela API.
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const METRICAS = ['faturamento', 'ticket_medio', 'ordens_concluidas', 'comparacao_faturamento', 'lucro_indisponivel']
const FUSO = 'America/Sao_Paulo'
const normalizar = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const esclarecer = (texto = 'Qual indicador e qual período deseja consultar? Informe mês e ano, ou as duas datas completas do intervalo.') => ({ esclarecimento: texto })
const anoIsolado = texto => /^(19\d{2}|20\d{2}|2100)$/.test(texto.trim().replace(/^em\s+/, '').replace(/[.!?]$/, ''))

function objetoEstrito(valor, campos, obrigatorios = campos) {
  if (!valor || ![Object.prototype, null].includes(Object.getPrototypeOf(valor))) return false
  const chaves = Reflect.ownKeys(valor)
  return chaves.every(chave => campos.includes(chave) && Object.getOwnPropertyDescriptor(valor, chave)?.get === undefined && Object.getOwnPropertyDescriptor(valor, chave)?.set === undefined) && obrigatorios.every(chave => chaves.includes(chave))
}

function dataCalendario(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const data = new Date(`${valor}T00:00:00.000Z`)
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor && +valor.slice(0, 4) >= 1900 && +valor.slice(0, 4) <= 2100
}

function periodoValido(periodo) {
  if (!objetoEstrito(periodo, ['tipo', 'mes', 'ano', 'inicio', 'fim'], ['tipo'])) return false
  if (periodo.tipo === 'mes') return objetoEstrito(periodo, ['tipo', 'mes', 'ano']) && Number.isInteger(periodo.mes) && periodo.mes >= 1 && periodo.mes <= 12 && Number.isInteger(periodo.ano) && periodo.ano >= 1900 && periodo.ano <= 2100
  if (periodo.tipo === 'intervalo') return objetoEstrito(periodo, ['tipo', 'inicio', 'fim']) && dataCalendario(periodo.inicio) && dataCalendario(periodo.fim) && periodo.inicio <= periodo.fim
  return ['historico', 'ultimos_90_dias'].includes(periodo.tipo) && objetoEstrito(periodo, ['tipo'])
}

function periodosValidos(periodos) {
  return Array.isArray(periodos) && Object.getPrototypeOf(periodos) === Array.prototype && periodos.length <= 2 && Reflect.ownKeys(periodos).length === periodos.length + 1 && Reflect.ownKeys(periodos).every(chave => chave === 'length' || (typeof chave === 'string' && /^[01]$/.test(chave) && Object.getOwnPropertyDescriptor(periodos, chave)?.get === undefined)) && periodos.every(periodoValido)
}

function partesLocais(data) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(data).filter(parte => parte.type !== 'literal').map(parte => [parte.type, +parte.value]))
}

function meiaNoiteLocal(dia) {
  const alvo = Date.parse(`${dia}T00:00:00Z`)
  let instante = alvo
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const p = partesLocais(new Date(instante))
    const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    if (local === alvo) return new Date(instante).toISOString()
    instante += alvo - local
  }
  // Algumas datas históricas iniciaram em 01h pelo horário de verão: não deslocar silenciosamente.
  throw new Error('Não foi possível resolver o início do dia no fuso da oficina.')
}

function proximoDia(dia) {
  const data = new Date(`${dia}T00:00:00Z`)
  data.setUTCDate(data.getUTCDate() + 1)
  return data.toISOString().slice(0, 10)
}

function diaAnterior(dia) {
  const data = new Date(`${dia}T00:00:00Z`)
  data.setUTCDate(data.getUTCDate() - 1)
  return data.toISOString().slice(0, 10)
}

function converterPeriodo(periodo, agora) {
  if (periodo.tipo === 'historico') return { inicio: null, fim: null, rotulo: 'todo o histórico' }
  if (periodo.tipo === 'ultimos_90_dias') return { inicio: new Date(agora.getTime() - 90 * 86400000).toISOString(), fim: agora.toISOString(), rotulo: `últimos 90 dias, até ${agora.toLocaleString('pt-BR', { timeZone: FUSO })}` }
  if (periodo.tipo === 'intervalo') return { inicio: meiaNoiteLocal(periodo.inicio), fim: meiaNoiteLocal(proximoDia(periodo.fim)), rotulo: `${periodo.inicio.split('-').reverse().join('/')} a ${periodo.fim.split('-').reverse().join('/')} (dias inclusivos)` }
  const inicio = `${periodo.ano}-${String(periodo.mes).padStart(2, '0')}-01`
  const fim = new Date(Date.UTC(periodo.ano, periodo.mes, 1)).toISOString().slice(0, 10)
  return { inicio: meiaNoiteLocal(inicio), fim: meiaNoiteLocal(fim), rotulo: `${MESES[periodo.mes - 1]} de ${periodo.ano}` }
}

function mesesNoTexto(texto) {
  const nomes = MESES.map(normalizar)
  const padrao = /\b(janeiro|jan|fevereiro|fev|marco|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez)\b/g
  return [...texto.matchAll(padrao)].map(match => ({ mes: nomes.findIndex(nome => nome === match[0] || nome.slice(0, 3) === match[0]) + 1, posicao: match.index }))
}

function mensagensUsuario(historico) {
  return Array.isArray(historico) ? historico.slice(-10).filter(m => m?.remetente === 'usuario' || m?.role === 'user').map(m => typeof (m.conteudo ?? m.content) === 'string' ? normalizar(m.conteudo ?? m.content) : '').filter(Boolean) : []
}

function interpretarPeriodos(texto, anteriores, agora) {
  // Uma explicação após a pergunta pode mencionar a abertura em outro mês.
  // Quando a pergunta já fixa o mês, essas datas não trocam o critério de
  // encerramento nem criam períodos adicionais para a mesma consulta.
  const perguntaPrincipal = texto.split('?')[0]
  const complemento = texto.slice(perguntaPrincipal.length + 1)
  if (mesesNoTexto(perguntaPrincipal).length > 0 && /^\s*(?:inclua|considere)\b[^?]*\babert(?:as|os|ura)\b[^?]*\bencerrad(?:as|os)\b/.test(complemento)) texto = perguntaPrincipal
  const mesesNomeados = mesesNoTexto(texto)
  const relativo = /\b(este mes|deste mes|neste mes|nesse mes|desse mes|mes atual|mes passado|mes anterior)\b/.test(texto)
  const noventaDias = /\bultimos 90 dias\b/.test(texto)
  const padraoDatas = /\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/g
  const datasTexto = [...texto.matchAll(padraoDatas)]
  const datas = datasTexto.map(match => match[0].includes('/') ? match[0].split('/').reverse().join('-') : match[0])
  if (datas.length) {
    const horarios = [...texto.matchAll(/\b\d{2}:\d{2}[\d:.]*\b/g)].map(match => match[0])
    const resto = texto.replace(padraoDatas, '')
    if (mesesNomeados.length || relativo || noventaDias || datas.length !== 2 || !datas.every(dataCalendario) || /\b\d{4}\b/.test(resto) || (horarios.length && (horarios.length !== 2 || !horarios.every(hora => ['00:00', '00:00:00', '00:00:00.000'].includes(hora))))) return null
    const antesDe = texto.lastIndexOf('antes de')
    if (antesDe >= 0 && antesDe > datasTexto[0].index && antesDe < datasTexto[1].index) datas[1] = diaAnterior(datas[1])
    else if (antesDe >= 0) return null
    return datas[0] <= datas[1] ? [{ tipo: 'intervalo', inicio: datas[0], fim: datas[1] }] : null
  }
  if ((relativo || noventaDias) && (mesesNomeados.length || /\d{4}/.test(texto) || (relativo && noventaDias))) return null
  if (relativo) {
    if (/\b(?:ate|desde|hoje|ontem|semana|dia)\b/.test(texto)) return null
    if ([...texto.matchAll(/\b(este mes|deste mes|neste mes|nesse mes|desse mes|mes atual|mes passado|mes anterior)\b/g)].length !== 1) return null
    const p = partesLocais(agora)
    const data = new Date(Date.UTC(p.year, p.month - 1 - (/mes passado|mes anterior/.test(texto) ? 1 : 0), 1))
    return [{ tipo: 'mes', mes: data.getUTCMonth() + 1, ano: data.getUTCFullYear() }]
  }
  if (noventaDias) return [{ tipo: 'ultimos_90_dias' }]
  const numericos = [...texto.matchAll(/\b(?:(0?[1-9]|1[0-2])\/(\d{4})|(\d{4})-(0[1-9]|1[0-2]))\b/g)]
  if (numericos.length) {
    const resto = numericos.reduce((restante, match) => restante.replace(match[0], ''), texto)
    return mesesNomeados.length || /\b\d{4}\b/.test(resto) ? null : numericos.map(m => ({ tipo: 'mes', mes: +(m[1] || m[4]), ano: +(m[2] || m[3]) }))
  }
  let meses = mesesNomeados
  const anos = [...texto.matchAll(/\b(19\d{2}|20\d{2}|2100)\b/g)]
  if (!meses.length && anoIsolado(texto)) meses = mesesNoTexto(anteriores.at(-1) || '')
  if (meses.length) {
    const ultimoAno = anteriores.flatMap(m => [...m.matchAll(/\b(19\d{2}|20\d{2}|2100)\b/g)].map(match => +match[0])).at(-1)
    const continuacao = /\bmesmo ano\b/.test(texto) || /^\s*e\b/.test(texto)
    if (!anos.length && !(continuacao && ultimoAno)) return null
    if (anos.length > 1 && anos.length !== meses.length) return null
    return meses.map((m, i) => ({ tipo: 'mes', mes: m.mes, ano: anos.length > 1 ? +anos.at(i)[0] : anos.length ? +anos[0][0] : ultimoAno }))
  }
  if (anos.length || /\b(semana|trimestre|semestre|anual|ano|dias|mes|meses|periodo|entre|desde|ate|hoje|ontem|amanha|anteontem|proximo|ultimo)\b/.test(texto)) return null
  return [{ tipo: 'historico' }]
}

function metricaSolicitada(texto) {
  if (/\blucro\b|\bdespesas\b/.test(texto)) return 'lucro_indisponivel'
  if (/\bcompar|\bcresci|\bvariacao|\bdiferenca/.test(texto)) return 'comparacao_faturamento'
  if (/\bticket\b/.test(texto)) return 'ticket_medio'
  if (/\b(quantas|quantidade|numero de)\b.*\b(os|ordens)\b/.test(texto)) return 'ordens_concluidas'
  if (/\bfatur|\breceita\b|\bquanto entrou\b/.test(texto)) return 'faturamento'
  return null
}

export function prepararConsultaFinanceira(argumentos, pergunta, historico = [], agora = new Date()) {
  if (!objetoEstrito(argumentos, ['metrica', 'periodos']) || !METRICAS.includes(argumentos.metrica) || !periodosValidos(argumentos.periodos) || typeof pergunta !== 'string' || !(agora instanceof Date) || !Number.isFinite(agora.getTime())) return esclarecer()
  const texto = normalizar(pergunta)
  const anteriores = mensagensUsuario(historico)
  // O contrato oferece totais da oficina por período, não recortes por entidade
  // ou pagamento. Omitir um desses filtros produziria um total plausível e errado.
  if (/\b(?:cliente|mecanico|funcionario|atendente|placa|veiculo|pix|cartao)\b|forma de pagamento/.test(texto)) {
    return esclarecer('A consulta financeira disponível considera o total da oficina por período. Não aplico filtros por cliente, equipe, veículo ou pagamento. Deseja consultar esse total? Informe o período.')
  }
  const comparacao = /\bcompar|\bcresci|\bvariacao|\bdiferenca/.test(texto)
  const indicadorComparado = /\bticket\b|\b(?:quantas|quantidade|numero de)\b/.test(texto)
    || (!/\bfatur|\breceita\b/.test(texto) && /\bticket\b|\b(?:quantas|quantidade|numero de)\b/.test(anteriores.at(-1) || ''))
  if (comparacao && indicadorComparado) {
    return esclarecer('A comparação disponível é de faturamento. Para ticket médio ou quantidade de OS concluídas, consulte um período de cada vez. Qual indicador e período deseja consultar?')
  }
  const continuacao = texto.trim().replace(/^e\s+/, '').replace(/^em\s+/, '')
  const continuaPeriodo = anoIsolado(texto) || (/^e\s+/.test(texto.trim()) && mesesNoTexto(continuacao).at(0)?.posicao === 0)
  const metrica = metricaSolicitada(texto) || (continuaPeriodo ? [...anteriores].reverse().map(metricaSolicitada).find(Boolean) : null)
  if (!metrica || metrica !== argumentos.metrica) return esclarecer()
  if (metrica === 'lucro_indisponivel') return { metrica, periodos: [] }
  const periodos = interpretarPeriodos(texto, anteriores, agora)
  if (!periodos) return esclarecer('Informe o mês e o ano desejados, ou um intervalo com as duas datas completas. Qual ano e período devo consultar?')
  const quantidade = metrica === 'comparacao_faturamento' ? 2 : 1
  if (periodos.length !== quantidade || argumentos.periodos.length !== quantidade || !periodos.every((periodo, indice) => {
    const informado = argumentos.periodos.at(indice)
    return periodoValido(periodo) && periodo.tipo === informado.tipo && periodo.mes === informado.mes && periodo.ano === informado.ano && periodo.inicio === informado.inicio && periodo.fim === informado.fim
  })) return esclarecer()
  try {
    return { metrica, periodos: periodos.map(periodo => converterPeriodo(periodo, agora)) }
  } catch {
    return esclarecer('Não consegui resolver as datas no fuso da oficina. Informe outro intervalo para a consulta.')
  }
}

function centavos(valor) {
  if (!['number', 'string'].includes(typeof valor)) throw new Error('Valor financeiro inválido na consulta.')
  const partes = String(valor).split('.')
  const [inteiro, fracao = ''] = partes
  if (partes.length > 2 || !/^\d+$/.test(inteiro) || (partes.length === 2 && !/^\d{1,2}$/.test(fracao))) throw new Error('Valor financeiro inválido na consulta.')
  const total = Number(inteiro) * 100 + Number(fracao.padEnd(2, '0'))
  if (!Number.isSafeInteger(total)) throw new Error('Valor financeiro fora do limite seguro.')
  return total
}

function resumir(ordens, periodo) {
  if (!Array.isArray(ordens)) throw new Error('Resultado financeiro indisponível.')
  let total = 0
  let quantidade = 0
  for (const os of ordens) {
    if (os.status !== 'concluida') continue
    if (typeof os.data_encerramento !== 'string' || !dataCalendario(os.data_encerramento.slice(0, 10)) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(os.data_encerramento) || !Number.isFinite(Date.parse(os.data_encerramento))) throw new Error('Data de encerramento inválida na consulta.')
    const data = Date.parse(os.data_encerramento)
    if ((periodo.inicio && data < Date.parse(periodo.inicio)) || (periodo.fim && data >= Date.parse(periodo.fim))) continue
    total += centavos(os.valor_total)
    if (!Number.isSafeInteger(total)) throw new Error('Total financeiro fora do limite seguro.')
    quantidade++
  }
  return { total, quantidade }
}

const moeda = valor => (valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatarRespostaFinanceira(plano, ordensPorPeriodo) {
  if (plano.metrica === 'lucro_indisponivel') return 'Não é possível calcular o lucro líquido: o sistema não registra todas as despesas e não possui módulo financeiro. Faturamento não equivale a lucro nem a recebimentos em caixa.'
  if (!Array.isArray(ordensPorPeriodo) || ordensPorPeriodo.length !== plano.periodos.length) throw new Error('Resultado financeiro incompleto.')
  const resultados = plano.periodos.map((periodo, indice) => resumir(ordensPorPeriodo.at(indice), periodo))
  const criterio = 'Critério: somente OS atualmente concluídas, pela data de encerramento no fuso America/Sao_Paulo; valor_total final após desconto. Faturamento não representa recebimentos em caixa.'
  if (plano.metrica === 'comparacao_faturamento') {
    const [atual, anterior] = resultados
    const diferenca = atual.total - anterior.total
    const variacao = anterior.total ? `${((diferenca / anterior.total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : 'sem base percentual de comparação (faturamento de referência igual a zero)'
    return `Comparação de faturamento — ${plano.periodos[0].rotulo}: ${moeda(atual.total)}; ${plano.periodos[1].rotulo}: ${moeda(anterior.total)}. Diferença do primeiro período em relação ao segundo: ${diferenca >= 0 ? '+' : '-'}${moeda(Math.abs(diferenca))}; variação: ${variacao}. ${criterio}`
  }
  const { total, quantidade } = resultados[0]
  const valor = plano.metrica === 'ticket_medio' ? moeda(quantidade ? Math.round(total / quantidade) : 0) : plano.metrica === 'ordens_concluidas' ? String(quantidade) : moeda(total)
  const nome = { faturamento: 'Faturamento', ticket_medio: 'Ticket médio', ordens_concluidas: 'Ordens concluídas' }[plano.metrica]
  return `${nome} — ${plano.periodos[0].rotulo}: ${valor}, considerando ${quantidade} OS concluída(s). ${criterio}`
}
