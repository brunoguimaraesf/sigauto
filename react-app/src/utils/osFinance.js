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

// Resolve o mecanico e o atendente (funcionarios) de uma OS.
// Prioriza id_mecanico/id_atendente (FK -> funcionario); como fallback para OS
// antigas (sem esses campos), usa o funcionario vinculado ao id_usuario.
export const resolveEquipe = (os, funcionarios = []) => {
  const byId = (fid) => funcionarios.find(f => f.id === fid)
  const byUsuario = (uid) => funcionarios.find(f => f.id_usuario === uid)
  const responsavel = byUsuario(os?.id_usuario)
  let mecanico = byId(os?.id_mecanico) || (responsavel?.cargo === 'mecanico' ? responsavel : null)
  let atendente = byId(os?.id_atendente) || (responsavel && responsavel.cargo !== 'mecanico' ? responsavel : null)
  if (mecanico?.id && mecanico.id === atendente?.id) {
    if (mecanico.cargo === 'mecanico') atendente = null
    else mecanico = null
  }
  return { mecanico, atendente }
}
