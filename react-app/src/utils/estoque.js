// Regras de estoque usadas nas telas de inventário e no dashboard.

// Item está em alerta de reposição quando a quantidade atinge ou fica
// abaixo da quantidade mínima definida.
export function itemEmAlerta(item) {
  if (!item) return false
  return Number(item.quantidade) <= Number(item.qtd_minima)
}

// Novo saldo após uma movimentação de entrada ou saída.
export function calcularSaldo(quantidadeAtual, tipo, quantidade) {
  const atual = Number(quantidadeAtual) || 0
  const qtd = Number(quantidade) || 0
  if (tipo === 'saida') return Math.max(0, atual - qtd)
  return atual + qtd
}

export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Resumo do inventário: total de itens, quantos em alerta e o valor total.
export function resumoEstoque(itens = []) {
  const emAlerta = itens.filter(itemEmAlerta).length
  const valorTotal = itens.reduce(
    (acc, i) => acc + (Number(i.quantidade) || 0) * (Number(i.preco_unit) || 0),
    0,
  )
  return { total: itens.length, emAlerta, valorTotal: Number(valorTotal.toFixed(2)) }
}
