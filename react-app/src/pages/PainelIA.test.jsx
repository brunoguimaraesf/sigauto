// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { PainelIA, MSG_IA_INDISPONIVEL } from './PainelIA'
import { useDatabase } from '../hooks/useDatabase'
import cssComparacao from '../components/ia/ComparacaoPeriodo.module.css'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const api = { analisar: vi.fn(), recomendacoes: vi.fn() }
vi.mock('../services/api.js', () => ({
  iaApi: {
    analisar: (...args) => api.analisar(...args),
    recomendacoes: (...args) => api.recomendacoes(...args),
  }
}))

const ANALISE_COMPLETA = {
  resumo: 'Acompanhe a disponibilidade de peças e o fluxo das ordens de serviço.',
  periodo_atual: { inicio: '2026-07-16T12:00:00.000Z', fim: '2026-10-14T12:00:00.000Z' },
  periodo_anterior: { inicio: '2026-04-17T12:00:00.000Z', fim: '2026-07-16T12:00:00.000Z' },
  metricas_destaque: { faturamento: 4500, ordens_abertas: 3, ordens_concluidas: 5, itens_criticos: 2 },
  comparacoes: {
    faturamento: { atual: 4500, anterior: 0, diferenca: 4500, variacao_percentual: null },
    ordens_abertas: { atual: 3, anterior: 2, diferenca: 1, variacao_percentual: 50 },
    ordens_concluidas: { atual: 5, anterior: 4, diferenca: 1, variacao_percentual: 25 },
    ticket_medio: { atual: 900, anterior: 800, diferenca: 100, variacao_percentual: 12.5 },
    duracao_media_horas: { atual: 12, anterior: 10, diferenca: 2, variacao_percentual: 20 },
    quantidade_saidas: { atual: 8, anterior: 5, diferenca: 3, variacao_percentual: 60 },
    itens_criticos: { atual: 2, anterior: null, diferenca: null, variacao_percentual: null },
    modelos_veiculo: [
      { rotulo: 'Fiat Uno', atual: 3, anterior: 0, diferenca: 3, variacao_percentual: null },
    ],
    servicos_mais_frequentes: [
      { rotulo: 'Alinhamento', atual: 2, anterior: 1, diferenca: 1, variacao_percentual: 100 },
    ],
  },
  estoque_inteligente: {
    mais_consumidos: [{ id: 'i1', nome: 'Filtro de óleo', unidade: 'un', quantidade_saida: 8, consumo_diario: 0.09, cobertura_dias: null }],
    itens_criticos: [{ id: 'i2', nome: 'Pastilha de freio', unidade: 'jogo', quantidade: 1, qtd_minima: 3, cobertura_dias: null, sugestao_reposicao: 5 }],
    itens_parados: [],
  },
  produtividade: {
    total_por_status: { aberta: 1, em_andamento: 1, aguardando_peca: 1, concluida: 5, cancelada: 1 },
    taxa_conclusao: 62.5,
    tempo_medio_horas: 12,
    tempo_mediano_horas: 10,
    os_abertas_mais_antigas: [{ id: 'os-1', numero_os: 101, status: 'aberta', data_abertura: '2026-01-01T12:00:00.000Z' }],
    conclusoes_por_mecanico: [{ id_mecanico: 'm-1', nome: 'João Mecânico', quantidade_concluida: 5, valor_medio: 900 }],
  },
  alertas: [],
  recomendacoes: [{
    titulo: 'Revisar estoque crítico',
    prioridade: 'alta',
    categoria: 'estoque',
    descricao: 'Há peças que merecem acompanhamento.',
    acao_sugerida: 'Revisar a reposição com o responsável pelo estoque.',
    impacto_esperado: 'Melhor previsibilidade do atendimento.',
    periodo: { inicio: '2026-07-16T12:00:00.000Z', fim: '2026-10-14T12:00:00.000Z' },
    evidencias: [
      { chave: 'estoque.itens_criticos', valor: 2, unidade: 'itens' },
      { chave: 'faturamento.valor', valor: 4500, unidade: 'BRL' },
    ],
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  api.analisar.mockReset()
  api.recomendacoes.mockReset()
  useDatabase.mockReturnValue({ clientes: [{ id: 'c1' }], veiculos: [{ id: 'v1' }], ordensServico: [{ id: 'o1' }] })
})

const HISTORICO = {
  id: 'analise-anterior-1',
  criado_em: '2026-10-13T14:30:00.000Z',
  recomendacoes: {
    ...ANALISE_COMPLETA,
    resumo: 'Resumo da análise anterior.',
    metricas_do_modelo: { faturamento: 999999 },
  },
}

const PAGINACAO = { total: 12, pagina: 1, limite: 10, totalPaginas: 2 }

async function analisarCom(dados) {
  api.analisar.mockResolvedValue({ dados })
  render(<PainelIA />)
  fireEvent.click(screen.getByRole('button', { name: /Analisar Dados/i }))
  await screen.findByText(dados.resumo)
}

describe('Painel de IA', () => {
  it('renderiza título, aviso consultivo e o estado inicial', () => {
    render(<PainelIA />)
    expect(screen.getByRole('heading', { name: /Painel de Inteligência Artificial/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Analisar Dados/i })).toBeInTheDocument()
    expect(screen.getByText(/caráter exclusivamente consultivo/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Pronto para Analisar/i })).toBeInTheDocument()
  })

  it('mostra carregamento enquanto a análise está pendente', () => {
    api.analisar.mockReturnValue(new Promise(() => {}))
    render(<PainelIA />)
    fireEvent.click(screen.getByRole('button', { name: /Analisar Dados/i }))
    expect(screen.getByRole('heading', { name: /Processando Análise/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Analisando/i })).toBeDisabled()
  })

  it('renderiza os quatro blocos com resposta completa', async () => {
    await analisarCom(ANALISE_COMPLETA)

    expect(screen.getByRole('heading', { name: /Comparação de períodos/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Estoque inteligente/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Produtividade das OS/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Recomendações explicáveis/i })).toBeInTheDocument()
    expect(screen.getByText('Filtro de óleo')).toBeInTheDocument()
    expect(screen.getByText('João Mecânico')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Modelos de veículo mais frequentes/i })).toBeInTheDocument()
    expect(screen.getByText('Fiat Uno')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Serviços mais frequentes/i })).toBeInTheDocument()
    expect(screen.getByText('Alinhamento')).toBeInTheDocument()
  })

  it('mantém as colunas das comparações alinhadas em uma grade fixa', async () => {
    await analisarCom(ANALISE_COMPLETA)

    const indicadores = screen.getByRole('table', { name: /Comparação de indicadores/i })
    const modelos = screen.getByRole('table', { name: /Modelos de veículo mais frequentes/i })
    const servicos = screen.getByRole('table', { name: /Serviços mais frequentes/i })

    // `table-layout: fixed` e `width: 100%` moraram no estilo inline e hoje
    // moram em ComparacaoPeriodo.module.css. O jsdom nao aplica a folha, entao
    // o que da para verificar aqui e que as tres tabelas usam a mesma classe;
    // os valores em si ficam no CSS.
    expect(indicadores).toHaveClass(cssComparacao.tabela)
    expect(modelos).toHaveClass(cssComparacao.tabela)
    expect(servicos).toHaveClass(cssComparacao.tabela)
    expect(indicadores.querySelectorAll('col')).toHaveLength(5)
    expect(modelos.querySelectorAll('col')).toHaveLength(5)
    expect(within(indicadores).getByRole('columnheader', { name: 'Atual' })).toHaveClass(cssComparacao.num)
    expect(within(modelos).getByRole('columnheader', { name: 'Variação' })).toHaveClass(cssComparacao.num)
  })

  it('exibe sem base anterior e sem consumo para valores nulos', async () => {
    await analisarCom(ANALISE_COMPLETA)

    expect(screen.getAllByText('Sem base anterior').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sem consumo no período').length).toBeGreaterThan(0)
  })

  it('trata listas vazias sem quebrar a tela', async () => {
    const semListas = structuredClone(ANALISE_COMPLETA)
    semListas.estoque_inteligente = { mais_consumidos: [], itens_criticos: [], itens_parados: [] }
    semListas.produtividade.os_abertas_mais_antigas = []
    semListas.produtividade.conclusoes_por_mecanico = []
    semListas.recomendacoes = []
    await analisarCom(semListas)

    expect(screen.getByText(/Nenhum item crítico no momento/i)).toBeInTheDocument()
    expect(screen.getByText(/Não há OS abertas para listar/i)).toBeInTheDocument()
    expect(screen.getByText(/Dados insuficientes para gerar recomendações/i)).toBeInTheDocument()
  })

  it('exibe ação, impacto, período e evidências da recomendação', async () => {
    await analisarCom(ANALISE_COMPLETA)

    expect(screen.getByText(/Revisar a reposição com o responsável/i)).toBeInTheDocument()
    expect(screen.getByText(/Melhor previsibilidade do atendimento/i)).toBeInTheDocument()
    expect(screen.getByText(/Período analisado/i)).toBeInTheDocument()
    expect(screen.getByText(/estoque\.itens_criticos: 2 itens/i)).toBeInTheDocument()
    expect(screen.getByText(/faturamento\.valor: R\$/i)).toBeInTheDocument()
    expect(screen.getByText(/Caráter consultivo/i)).toBeInTheDocument()
  })

  it('mantém contraste legível no selo de prioridade alta', async () => {
    await analisarCom(ANALISE_COMPLETA)

    expect(screen.getByText('alta')).toHaveStyle({
      color: 'var(--color-danger)',
      background: 'var(--color-danger-tint)',
    })
  })
})

describe('Painel de IA — indisponibilidade da IA', () => {
  const falhar = async () => {
    api.analisar.mockRejectedValue(Object.assign(new Error('500'), { status: 500 }))
    render(<PainelIA />)
    fireEvent.click(screen.getByRole('button', { name: /Analisar Dados/i }))
    return screen.findByText(MSG_IA_INDISPONIVEL, {}, { timeout: 5000 })
  }

  it('avisa em região viva e não mostra números de análise após a falha', async () => {
    expect(await falhar()).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/IA indisponível/i)
    expect(screen.queryByText(/Comparação de períodos/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Faturamento concluído \(90d\)/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument()
  })

  it('trata resposta sem análise como indisponibilidade', async () => {
    api.analisar.mockResolvedValue({ erro: false })
    render(<PainelIA />)
    fireEvent.click(screen.getByRole('button', { name: /Analisar Dados/i }))
    expect(await screen.findByText(MSG_IA_INDISPONIVEL, {}, { timeout: 5000 })).toBeInTheDocument()
  })
})

describe('Painel de IA — histórico de análises', () => {
  it('não carrega o histórico na montagem', () => {
    render(<PainelIA />)

    expect(api.recomendacoes).not.toHaveBeenCalled()
  })

  it('carrega a lista somente após ação explícita', async () => {
    api.recomendacoes.mockResolvedValue({ dados: [HISTORICO], paginacao: PAGINACAO })
    render(<PainelIA />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar análises anteriores/i }))

    expect(await screen.findByText('Resumo da análise anterior.')).toBeInTheDocument()
    expect(api.recomendacoes).toHaveBeenCalledWith(1, 10)
  })

  it('informa quando não há análises anteriores', async () => {
    api.recomendacoes.mockResolvedValue({ dados: [], paginacao: { total: 0, pagina: 1, limite: 10, totalPaginas: 0 } })
    render(<PainelIA />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar análises anteriores/i }))

    expect(await screen.findByText(/Não há análises anteriores/i)).toBeInTheDocument()
  })

  it('mantém a análise atual quando o carregamento do histórico falha', async () => {
    await analisarCom(ANALISE_COMPLETA)
    api.recomendacoes.mockRejectedValue(new Error('Falha no histórico'))

    fireEvent.click(screen.getByRole('button', { name: /Consultar análises anteriores/i }))

    expect(await screen.findByRole('status', { name: /Não foi possível carregar/i })).toBeInTheDocument()
    expect(screen.getByText(ANALISE_COMPLETA.resumo)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Comparação de períodos/i })).toBeInTheDocument()
  })

  it('abre e fecha detalhe somente leitura sem gerar nova análise ou expor métricas do modelo', async () => {
    api.recomendacoes.mockResolvedValue({ dados: [HISTORICO], paginacao: PAGINACAO })
    render(<PainelIA />)
    fireEvent.click(screen.getByRole('button', { name: /Consultar análises anteriores/i }))
    await screen.findByText('Resumo da análise anterior.')

    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da análise de/i }))

    expect(screen.getByRole('region', { name: /Detalhe da análise anterior/i })).toBeInTheDocument()
    expect(screen.getAllByText('Resumo da análise anterior.').length).toBeGreaterThan(0)
    expect(screen.queryByText('999999')).not.toBeInTheDocument()
    expect(screen.queryByText(/metricas_do_modelo/i)).not.toBeInTheDocument()
    expect(api.analisar).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Fechar detalhe/i }))
    expect(screen.queryByRole('region', { name: /Detalhe da análise anterior/i })).not.toBeInTheDocument()
  })

  it('pagina o histórico sem disparar uma nova análise', async () => {
    api.recomendacoes
      .mockResolvedValueOnce({ dados: [HISTORICO], paginacao: PAGINACAO })
      .mockResolvedValueOnce({ dados: [], paginacao: { total: 12, pagina: 2, limite: 10, totalPaginas: 2 } })
    render(<PainelIA />)
    fireEvent.click(screen.getByRole('button', { name: /Consultar análises anteriores/i }))
    await screen.findByText('Resumo da análise anterior.')

    fireEvent.click(screen.getByRole('button', { name: /Próxima página/i }))

    await waitFor(() => expect(api.recomendacoes).toHaveBeenLastCalledWith(2, 10))
    expect(api.analisar).not.toHaveBeenCalled()
  })
})
