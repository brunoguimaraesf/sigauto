// Filtro de periodo por dia civil local (RN24, RF07).
//
// `new Date('AAAA-MM-DD')` e meia-noite UTC: em Brasilia vira 21h da vespera e
// puxava para o periodo as O.S. das ultimas tres horas do dia anterior. E
// `T23:59:59` como fim inclusivo perdia a fracao do ultimo segundo, que o
// timestamptz do banco grava. Os dois limites usam meia-noite local; o fim e o
// inicio do dia seguinte, exclusivo.

export function inicioDoDia(dataISO, deslocamentoDias = 0) {
  const data = new Date(`${dataISO}T00:00:00`)
  data.setDate(data.getDate() + deslocamentoDias)
  return data
}

// Datas vazias deixam o lado correspondente aberto. Sem nenhum limite, tudo
// passa, inclusive registro sem data; com limite, data invalida fica de fora.
export function dentroDoPeriodo(valor, dataInicio, dataFim) {
  if (!dataInicio && !dataFim) return true
  const dt = new Date(valor)
  if (isNaN(dt)) return false
  if (dataInicio && dt < inicioDoDia(dataInicio)) return false
  if (dataFim && dt >= inicioDoDia(dataFim, 1)) return false
  return true
}
