// Filtra o contexto que vai para o chatbot conforme o perfil de quem pergunta.
//
// O contexto e montado com service role, que ignora RLS — sem este filtro o
// assistente enxerga tudo e um mecanico consegue perguntar o faturamento da
// oficina e receber, mesmo sem ter a tela de Relatorios no menu.
//
// A regra espelha as permissoes de rota do frontend (react-app/src/App.jsx):
// o chatbot nao entrega aquilo que o usuario nao veria navegando.
export const PERMISSOES_CONTEXTO = {
  // Relatorios, Analytics e Painel IA sao exclusivos do gestor: numeros
  // agregados de dinheiro e ranking de gasto por cliente ficam so com ele.
  financeiro: ['gestor'],
  // Clientes, Veiculos, Servicos e Estoque: gestor e atendente.
  cadastros: ['gestor', 'atendente'],
}

export function filtrarContextoPorPerfil(contexto, perfil) {
  if (!contexto) return null

  const podeFinanceiro = PERMISSOES_CONTEXTO.financeiro.includes(perfil)
  const podeCadastros = PERMISSOES_CONTEXTO.cadastros.includes(perfil)

  const totaisOriginais = contexto.totais || {}
  const restritos = []

  // O mecanico ve somente as OS atribuidas a ele (RN03). Como este contexto foi
  // agregado globalmente com service_role, nem a contagem global pode chegar a
  // esse perfil. Gestor e atendente operam a lista geral.
  const totais = {}

  if (podeCadastros) {
    totais.ordens_servico = totaisOriginais.ordens_servico ?? 0
    totais.clientes = totaisOriginais.clientes ?? 0
    totais.veiculos = totaisOriginais.veiculos ?? 0
  } else {
    restritos.push('totais globais de ordens de servico, clientes e veiculos cadastrados')
  }

  if (podeFinanceiro) {
    totais.faturamento_total = totaisOriginais.faturamento_total ?? 0
    totais.ticket_medio_geral = totaisOriginais.ticket_medio_geral ?? 0
  } else {
    restritos.push('faturamento e ticket medio da oficina')
  }

  const filtrado = { totais }

  if (podeFinanceiro) {
    filtrado.ranking_clientes = contexto.ranking_clientes || []
    filtrado.analises_financeiras = contexto.analises_financeiras || {}
    filtrado.analises_operacionais = contexto.analises_operacionais || {}
  } else if (podeCadastros) {
    // O atendente atende esses clientes: pode saber quem tem mais OS, mas nao
    // quanto cada um gastou — isso e leitura de relatorio.
    filtrado.ranking_clientes = (contexto.ranking_clientes || []).map(c => ({
      nome: c.nome,
      qtd_os: c.qtd_os,
    }))
    restritos.push('valores gastos e ticket medio por cliente')
    restritos.push('analises gerenciais de faturamento, entradas de veiculos e saidas de pecas')
  } else {
    restritos.push('ranking e dados de clientes')
    restritos.push('analises gerenciais de faturamento, entradas de veiculos e saidas de pecas')
  }

  if (podeCadastros) {
    filtrado.estoque_em_alerta = contexto.estoque_em_alerta || []
    filtrado.servicos_catalogo = contexto.servicos_catalogo || []
  } else {
    restritos.push('estoque e tabela de precos dos servicos')
  }

  // Declarado no proprio JSON para o modelo saber que o dado foi omitido por
  // permissao, e nao por inexistir — a resposta certa e "acesso restrito",
  // nao "ainda nao ha registros".
  if (restritos.length) filtrado.dados_restritos_para_este_perfil = restritos

  return filtrado
}
