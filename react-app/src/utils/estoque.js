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
