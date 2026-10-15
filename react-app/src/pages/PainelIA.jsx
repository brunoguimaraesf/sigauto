import { useState } from 'react'
import css from './PainelIA.module.css'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Brain, AlertTriangle, CloudOff, History, RefreshCw } from 'lucide-react'
import { ComparacaoPeriodo } from '../components/ia/ComparacaoPeriodo'
import { EstoqueInteligente } from '../components/ia/EstoqueInteligente'
import { ProdutividadeOS } from '../components/ia/ProdutividadeOS'
import { RecomendacaoExplicavel } from '../components/ia/RecomendacaoExplicavel'

// Mensagem única de indisponibilidade. Não existe análise local de substituição:
// número calculado por regra fixa e número vindo do modelo não têm a mesma
// origem, e exibir um no lugar do outro é pior que não exibir painel.
export const MSG_IA_INDISPONIVEL =
  'A IA está indisponível no momento. Nenhuma análise foi gerada — nenhum número desta tela foi estimado localmente. Tente novamente em alguns instantes.'

function formatarMoeda(valor) {
  return valor !== null && valor !== '' && Number.isFinite(Number(valor))
    ? Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'
}

function formatarNumero(valor, sufixo = '') {
  return valor !== null && valor !== '' && Number.isFinite(Number(valor))
    ? `${Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${sufixo}`
    : '—'
}

function formatarDataHora(valor) {
  const data = new Date(valor)
  return Number.isNaN(data.getTime())
    ? 'Data indisponível'
    : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatarPeriodo(periodo) {
  const inicio = new Date(periodo?.inicio)
  const fim = new Date(periodo?.fim)
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return 'Período indisponível'
  return `${inicio.toLocaleDateString('pt-BR', { timeZone: 'UTC' })} a ${fim.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
}

function obterAnaliseHistorica(registro) {
  const analise = registro?.recomendacoes
  return analise && typeof analise === 'object' && !Array.isArray(analise) ? analise : {}
}

const LIMITE_HISTORICO = 10

export function PainelIA() {
  const { clientes, veiculos, ordensServico } = useDatabase()
  const [analisando, setAnalisando] = useState(false)
  const [resultado, setResultado] = useState(null)
  // `erro` deixou de ser estado morto: agora é o único caminho de falha da tela,
  // e é ele que mostra a indisponibilidade da IA.
  const [erro, setErro] = useState('')
  const [historicoVisivel, setHistoricoVisivel] = useState(false)
  const [historico, setHistorico] = useState([])
  const [paginacaoHistorico, setPaginacaoHistorico] = useState(null)
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)
  const [erroHistorico, setErroHistorico] = useState('')
  const [detalheHistorico, setDetalheHistorico] = useState(null)

  const handleAnalisar = async () => {
    setAnalisando(true)
    setErro('')
    setResultado(null)
    try {
      const { iaApi } = await import('../services/api.js')
      const data = await iaApi.analisar()
      // O backend responde { erro: false, dados: {...} }. Um 200 sem `dados`
      // tornava `resultado` truthy com um objeto vazio: todos os blocos internos
      // são condicionais, então a tela ficava em branco, sem resultado e sem
      // aviso. Exigir a forma mínima joga esse caso para o `catch`.
      const analise = data?.dados ?? data
      if (!analise || typeof analise !== 'object'
        || (!analise.resumo && !analise.recomendacoes && !analise.metricas_destaque)) {
        throw new Error('análise vazia da IA')
      }
      setResultado(analise)
    } catch (e) {
      console.error('[PainelIA] IA indisponível. Causa:', e?.status, e?.data?.codigo || e?.message, e)
      setErro(MSG_IA_INDISPONIVEL)
    } finally {
      setAnalisando(false)
    }
  }

  const carregarHistorico = async (pagina = 1) => {
    setCarregandoHistorico(true)
    setErroHistorico('')
    try {
      const { iaApi } = await import('../services/api.js')
      const resposta = await iaApi.recomendacoes(pagina, LIMITE_HISTORICO)
      const registros = Array.isArray(resposta?.dados) ? resposta.dados : []
      const paginacao = resposta?.paginacao && typeof resposta.paginacao === 'object'
        ? resposta.paginacao
        : { total: registros.length, pagina, limite: LIMITE_HISTORICO, totalPaginas: registros.length > 0 ? 1 : 0 }

      setHistorico(registros)
      setPaginacaoHistorico(paginacao)
    } catch (e) {
      console.error('[PainelIA] Histórico indisponível:', e?.status, e?.message)
      setErroHistorico('Não foi possível carregar as análises anteriores. Tente novamente em alguns instantes.')
    } finally {
      setCarregandoHistorico(false)
    }
  }

  const handleAbrirHistorico = () => {
    setHistoricoVisivel(true)
    setDetalheHistorico(null)
    carregarHistorico(1)
  }

  return (
    <div className="dashboard-grid">
      <section className={`welcome-section stagger-1 ${css.topo}`} >
        <div>
          <h2>Painel de Inteligência Artificial</h2>
          <p>Análise automatizada dos dados da oficina com recomendações gerenciais.</p>
        </div>
        <button
          className={`btn-primary ${css.btnAnalisar}`}
          onClick={handleAnalisar}
          disabled={analisando}

        >
          {analisando ? (
            <>
              <span className={css.spinner}  />
              Analisando...
            </>
          ) : (
            <>
              <Brain size={16} /> Analisar Dados
            </>
          )}
        </button>
      </section>

      {/* Aviso consultivo */}
      <div className="alert-box stagger-2">
        <strong>⚠️ Aviso Importante:</strong> As recomendações geradas pela IA têm <strong>caráter exclusivamente consultivo</strong>.
        Nenhuma ação será executada automaticamente. O gestor é responsável por avaliar e decidir sobre cada recomendação apresentada.
      </div>

      <section className="stagger-2" aria-labelledby="historico-ia-titulo">
        {!historicoVisivel ? (
          <button
            className={`btn-secondary ${css.btnHistorico}`}
            onClick={handleAbrirHistorico}

          >
            <History size={15} aria-hidden="true" /> Consultar análises anteriores
          </button>
        ) : (
          <GlassPanel className="panel">
            <div className={`panel-header ${css.historicoHeader}`} >
              <div>
                <h3 id="historico-ia-titulo">Análises anteriores</h3>
                <p className={css.legendaHistorico} >Consulta somente leitura das análises já geradas.</p>
              </div>
              <button className="btn-secondary" onClick={() => carregarHistorico(paginacaoHistorico?.pagina ?? 1)} disabled={carregandoHistorico}>
                {carregandoHistorico ? 'Carregando...' : 'Recarregar histórico'}
              </button>
            </div>

            {erroHistorico && (
              <div role="status" aria-label="Não foi possível carregar o histórico" className={css.erroHistorico} >
                {erroHistorico}
              </div>
            )}

            {carregandoHistorico ? (
              <p role="status" className={css.avisoHistorico} >Carregando análises anteriores...</p>
            ) : historico.length === 0 && !erroHistorico ? (
              <p className={css.avisoHistorico} >Não há análises anteriores para exibir.</p>
            ) : (
              <div className={css.listaHistorico} >
                {historico.map((registro, indice) => {
                  const analise = obterAnaliseHistorica(registro)
                  return (
                    <div key={registro?.id ?? `${registro?.criado_em}-${indice}`} className={css.registroHistorico} >
                      <div>
                        <strong className={css.dataHistorico} >{formatarDataHora(registro?.criado_em)}</strong>
                        <p className={css.legendaHistorico} >Período: {formatarPeriodo(analise.periodo_atual)}</p>
                        <p className={css.resumoHistorico} >{analise.resumo || 'Resumo indisponível.'}</p>
                      </div>
                      <button className="btn-secondary" onClick={() => setDetalheHistorico(registro)}>Ver detalhes da análise de {formatarDataHora(registro?.criado_em)}</button>
                    </div>
                  )
                })}
              </div>
            )}

            {paginacaoHistorico && paginacaoHistorico.totalPaginas > 1 && (
              <div className={css.paginacao} >
                <button className="btn-secondary" onClick={() => carregarHistorico(paginacaoHistorico.pagina - 1)} disabled={carregandoHistorico || paginacaoHistorico.pagina <= 1}>Página anterior</button>
                <span className={css.paginaAtual} >Página {paginacaoHistorico.pagina} de {paginacaoHistorico.totalPaginas}</span>
                <button className="btn-secondary" onClick={() => carregarHistorico(paginacaoHistorico.pagina + 1)} disabled={carregandoHistorico || paginacaoHistorico.pagina >= paginacaoHistorico.totalPaginas}>Próxima página</button>
              </div>
            )}
          </GlassPanel>
        )}
      </section>

      {detalheHistorico && (() => {
        const analise = obterAnaliseHistorica(detalheHistorico)
        const recomendacoes = Array.isArray(analise.recomendacoes) ? analise.recomendacoes : []
        return (
          <GlassPanel role="region" aria-labelledby="detalhe-analise-anterior-titulo" className="panel">
            <div className={`panel-header ${css.detalheHeader}`} >
              <div>
                <h3 id="detalhe-analise-anterior-titulo">Detalhe da análise anterior</h3>
                <p className={css.legendaHistorico} >Gerada em {formatarDataHora(detalheHistorico.criado_em)} · Período: {formatarPeriodo(analise.periodo_atual)}</p>
              </div>
              <button className="btn-secondary" onClick={() => setDetalheHistorico(null)}>Fechar detalhe</button>
            </div>

            <p className={css.resumoDetalhe} >{analise.resumo || 'Resumo indisponível.'}</p>

            {analise.metricas_destaque && (
              <section className={`metrics-grid ${css.metricasHistorico}`}  aria-label="Métricas da análise anterior">
                {[
                  { label: 'OS abertas (90d)', valor: formatarNumero(analise.metricas_destaque.ordens_abertas) },
                  { label: 'OS concluídas (90d)', valor: formatarNumero(analise.metricas_destaque.ordens_concluidas) },
                  { label: 'Faturamento concluído (90d)', valor: formatarMoeda(analise.metricas_destaque.faturamento) },
                  { label: 'Itens críticos', valor: formatarNumero(analise.metricas_destaque.itens_criticos) },
                ].map((metrica) => <div key={metrica.label} className="metric-card"><span className="metric-title">{metrica.label}</span><div className={`metric-value ${css.valorHistorico}`} >{metrica.valor}</div></div>)}
              </section>
            )}

            <div className={css.blocosHistorico} >
              <ComparacaoPeriodo periodoAtual={analise.periodo_atual} periodoAnterior={analise.periodo_anterior} comparacoes={analise.comparacoes} />
              <EstoqueInteligente estoque={analise.estoque_inteligente} />
              <ProdutividadeOS produtividade={analise.produtividade} />
              <section aria-labelledby="recomendacoes-historico-titulo">
                <h4 id="recomendacoes-historico-titulo" className={css.recomendacoesTitulo} >Recomendações explicáveis</h4>
                {recomendacoes.length === 0 ? <p className={css.textoVazio} >Não há recomendações disponíveis nesta análise.</p> : <div className={css.listaRecomendacoes} >{recomendacoes.map((recomendacao, indice) => <RecomendacaoExplicavel key={`${recomendacao?.titulo}-${indice}`} recomendacao={recomendacao} />)}</div>}
              </section>
            </div>
          </GlassPanel>
        )
      })()}

      {/* IA indisponível.
          `role="status"` (que já implica aria-live="polite") faz o aviso ser
          anunciado por leitor de tela: ele aparece depois de um await, e sem
          região viva o usuário clica, espera e não recebe nada.
          A barra de acento à esquerda e o padding compacto distinguem este aviso
          TRANSITÓRIO da `.alert-box` permanente logo acima — duas tarjas laranja
          idênticas empilhadas ensinam o usuário a ignorar as duas. */}
      {erro && !analisando && (
        <GlassPanel
          role="status"
          className={`stagger-2 ${css.indisponibilidade}`}

        >
          <div className={css.conteudoComIcone} >
            <CloudOff size={18} color="var(--color-warning)" className={css.icone}  />
            <div>
              <h3 className={css.tituloIndisponibilidade} >
                IA indisponível
              </h3>
              <p className={css.textoIndisponibilidade} >
                {erro}
              </p>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Estado inicial */}
      {!resultado && !analisando && !erro && (
        <GlassPanel className={`panel stagger-3 ${css.estadoCentral}`} >
          <Brain size={48} color="var(--color-primary)" className={css.iconeInicial}  />
          <h3 className={css.tituloInicial} >Pronto para Analisar</h3>
          <p className={css.descricaoInicial} >
            Clique em <strong>"Analisar Dados"</strong> para gerar recomendações baseadas nas ordens de serviço,
            movimentações de estoque e padrões de atendimento da oficina.
          </p>
          <p className={css.dadosDisponiveis} >
            Dados disponíveis: {ordensServico.length} OS · {clientes.length} clientes · {veiculos.length} veículos
          </p>
        </GlassPanel>
      )}

      {/* Loading */}
      {analisando && (
        <GlassPanel className={`panel stagger-2 ${css.estadoCentral}`} >
          <div className={css.pontosCarregando} >
            {[0, 1, 2].map(i => (
              <div key={i} className={css.pontoCarregando} style={{ animation: `pulse-glow 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
          <h3 className={css.tituloCarregando} >Processando Análise</h3>
          <p className={css.textoSecundario} >Consultando padrões históricos e gerando recomendações...</p>
        </GlassPanel>
      )}

      {/* Resultado */}
      {resultado && (
        <>
          {resultado.resumo && (
            <GlassPanel className={`panel stagger-2 ${css.resumoPainel}`} >
              <div className={css.conteudoComIcone} >
                <Brain size={20} color="var(--electric-blue)" className={css.icone}  />
                <div>
                  <div className={css.rotuloResumo} >Resumo Executivo</div>
                  <p className={css.textoResumo} >{resultado.resumo}</p>
                </div>
              </div>
            </GlassPanel>
          )}

          {resultado.metricas_destaque && (
            <section className="metrics-grid stagger-2">
              {[
                { label: 'OS abertas (90d)', valor: formatarNumero(resultado.metricas_destaque.ordens_abertas) },
                { label: 'OS concluídas (90d)', valor: formatarNumero(resultado.metricas_destaque.ordens_concluidas) },
                { label: 'Faturamento concluído (90d)', valor: formatarMoeda(resultado.metricas_destaque.faturamento) },
                { label: 'Itens críticos', valor: formatarNumero(resultado.metricas_destaque.itens_criticos) },
              ].map((m, i) => (
                <GlassPanel key={i} className="metric-card">
                  <div className="metric-header">
                    <span className="metric-title">{m.label}</span>
                  </div>
                  <div className={`metric-value ${css.valorMetrica}`} >{m.valor}</div>
                </GlassPanel>
              ))}
            </section>
          )}

          {resultado.alertas?.length > 0 && (
            <GlassPanel className="panel stagger-2">
              <div className="panel-header">
                <h3><AlertTriangle size={18} color="var(--color-warning)" className={css.iconeAlertas}  /> Alertas</h3>
              </div>
              <div className={css.listaAlertas} >
                {resultado.alertas.map((a, i) => {
                  const cor = a.urgencia === 'critica' ? 'var(--color-danger)' : a.urgencia === 'alta' ? 'var(--color-warning)' : a.urgencia === 'media' ? 'var(--status-pending)' : 'var(--text-secondary)'
                  return (
                    <div key={i} className={css.alerta} >
                      <AlertTriangle size={16} color={cor} className={css.icone}  />
                      <div>
                        {a.tipo && <div className={css.tipoAlerta} style={{ color: cor }}>{a.tipo}</div>}
                        <div className={css.mensagemAlerta} >{a.mensagem}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </GlassPanel>
          )}

          <ComparacaoPeriodo
            periodoAtual={resultado.periodo_atual}
            periodoAnterior={resultado.periodo_anterior}
            comparacoes={resultado.comparacoes}
          />

          <EstoqueInteligente estoque={resultado.estoque_inteligente} />

          <ProdutividadeOS produtividade={resultado.produtividade} />

          <section className="stagger-3" aria-labelledby="recomendacoes-ia-titulo">
            <h3 id="recomendacoes-ia-titulo" className={css.tituloRecomendacoes} >Recomendações explicáveis</h3>
            {resultado.recomendacoes?.length === 0 ? (
              <GlassPanel className={`panel ${css.recomendacoesVazias}`} >
                <p className={css.textoSecundario} >Dados insuficientes para gerar recomendações. Registre mais ordens de serviço e retorne.</p>
              </GlassPanel>
            ) : (
              <div className={css.listaRecomendacoes} >
                {resultado.recomendacoes?.map((rec, indice) => (
                  <RecomendacaoExplicavel key={`${rec.titulo}-${indice}`} recomendacao={rec} />
                ))}
              </div>
            )}
          </section>

          <div className={css.acaoAtualizar} >
            <button className={`btn-secondary ${css.btnHistorico}`} onClick={handleAnalisar} >
              <RefreshCw size={14} /> Atualizar Análise
            </button>
          </div>
        </>
      )}
    </div>
  )
}
