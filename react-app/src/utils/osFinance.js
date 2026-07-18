export const formatCurrency = (value) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

export const toMoney = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export const getLineTotal = (item) => toMoney(item.quantidade || 1) * toMoney(item.valor_unitario)

export const calcOSTotals = (os) => {
  const servicos = os?.servicos_itens || []
  const pecas = os?.pecas_itens || []
  const valorServicos = servicos.reduce((total, item) => total + getLineTotal(item), 0)
  const valorPecas = pecas.reduce((total, item) => total + getLineTotal(item), 0)
  const valorTotal = valorServicos + valorPecas

  return {
    valorServicos,
    valorPecas,
    valorTotal,
  }
}

export const calcUserCommission = (usuario, totals) => {
  if (!usuario) return { percentual: 0, base: 0, valor: 0, sobreServicos: false, sobrePecas: false }

  const percentual = toMoney(usuario.comissao_percentual)
  const sobreServicos = Boolean(usuario.comissao_sobre_servicos)
  const sobrePecas = Boolean(usuario.comissao_sobre_pecas)
  const base =
    (sobreServicos ? toMoney(totals?.valorServicos) : 0) +
    (sobrePecas ? toMoney(totals?.valorPecas) : 0)

  return {
    percentual,
    base,
    valor: base * (percentual / 100),
    sobreServicos,
    sobrePecas,
  }
}

export const calcOSCommissions = (os, mecanico, atendente) => {
  const totals = calcOSTotals(os)
  const mecanicoComissao = calcUserCommission(mecanico, totals)
  const atendenteComissao = calcUserCommission(atendente, totals)

  return {
    mecanico: mecanicoComissao,
    atendente: atendenteComissao,
    total: mecanicoComissao.valor + atendenteComissao.valor,
  }
}

export const getEstoqueCatalog = () => []
