export const formatCurrency = (value) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

export const toMoney = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

// Quantidade da linha. O `|| 1` antigo ficava nas DUAS pontas com regras
// diferentes: a tela fazia `item.quantidade || 1` (a string "0" e truthy, virava
// 0 e o total aparecia R$ 0,00) e a gravacao fazia `Number(x) || 1` (0 e falsy,
// gravava 1 e cobrava o item). Tela e banco discordavam em silencio. Agora a
// regra e uma so: ausente, nao numerico, zero ou negativo vale 1, mantendo o
// valor calculado na tela igual ao que sera persistido.
export const normalizarQuantidade = (valor) => {
  if (valor === null || valor === undefined || String(valor).trim() === '') return 1
  const parsed = Number(String(valor).replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

// Dinheiro como o banco calcula (RN21/RN22, QA-10): quantidade e valor unitario
// sao NUMERIC(10,2), a soma de cada categoria e exata e so ela e arredondada
// para centavos, meio para longe do zero (`round(sum(q * v), 2)` em
// finalizar_ordem_servico). Somar em float mostrava R$ 12,67 para 1,5 x 8,45 e
// o banco gravava R$ 12,68.

// Inteiro em centesimos, lendo o texto decimal exato (nao o float) e
// arredondando a terceira casa como o NUMERIC(10,2).
export const centesimos = (valor) => {
  let texto = typeof valor === 'number'
    ? (Number.isFinite(valor) ? String(valor) : '0')
    : String(valor ?? '').trim().replace(',', '.')
  if (/e/i.test(texto)) texto = Number(texto).toFixed(12)
  const partes = /^(-?)(\d*)(?:\.(\d*))?$/.exec(texto)
  if (!partes || (partes[2] === '' && !partes[3])) return 0
  const [, sinal, inteiro, fracao = ''] = partes
  const casas = (fracao + '000').slice(0, 3)
  let valorAbs = Number(inteiro || '0') * 100 + Number(casas.slice(0, 2))
  if (Number(casas[2]) >= 5) valorAbs += 1
  return sinal === '-' ? -valorAbs : valorAbs
}

// Divide por potencia de dez arredondando meio para longe do zero.
const dividirArredondando = (numerador, divisor) =>
  Math.sign(numerador) * Math.floor((Math.abs(numerador) + divisor / 2) / divisor)

// Produto quantidade x valor em decimos de milesimo (exato, 4 casas).
const produtoLinha = (item) => centesimos(normalizarQuantidade(item.quantidade)) * centesimos(toMoney(item.valor_unitario))

const somaCategoria = (itens) =>
  dividirArredondando(itens.reduce((total, item) => total + produtoLinha(item), 0), 100) / 100

export const getLineTotal = (item) => dividirArredondando(produtoLinha(item), 100) / 100

// `round(subtotal * percentual / 100, 2)` do encerramento.
export const calcDescontoPercentual = (subtotal, percentual) =>
  dividirArredondando(centesimos(subtotal) * centesimos(percentual), 10000) / 100

export const calcOSTotals = (os) => {
  const valorServicos = somaCategoria(os?.servicos_itens || [])
  const valorPecas = somaCategoria(os?.pecas_itens || [])
  const valorTotal = (centesimos(valorServicos) + centesimos(valorPecas)) / 100

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

  // Igual a fn_snapshot_comissoes_os: round(base * percentual / 100, 2).
  return {
    percentual,
    base,
    valor: calcDescontoPercentual(base, percentual),
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
    total: (centesimos(mecanicoComissao.valor) + centesimos(atendenteComissao.valor)) / 100,
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
