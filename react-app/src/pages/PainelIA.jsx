import { useState } from 'react'
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
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Painel de Inteligência Artificial</h2>
          <p>Análise automatizada dos dados da oficina com recomendações gerenciais.</p>
        </div>
        <button
          className="btn-primary"
          onClick={handleAnalisar}
          disabled={analisando}
          style={{ borderRadius: 'var(--radius-sm)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {analisando ? (
            <>
              <span style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid var(--border-color)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
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
            className="btn-secondary"
            onClick={handleAbrirHistorico}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <History size={15} aria-hidden="true" /> Consultar análises anteriores
          </button>
        ) : (
          <GlassPanel className="panel">
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <h3 id="historico-ia-titulo">Análises anteriores</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>Consulta somente leitura das análises já geradas.</p>
              </div>
              <button className="btn-secondary" onClick={() => carregarHistorico(paginacaoHistorico?.pagina ?? 1)} disabled={carregandoHistorico}>
                {carregandoHistorico ? 'Carregando...' : 'Recarregar histórico'}
              </button>
            </div>

            {erroHistorico && (
              <div role="status" aria-label="Não foi possível carregar o histórico" style={{ marginTop: '12px', padding: '12px', borderLeft: '3px solid var(--color-warning)', background: 'var(--color-primary-tint)', color: 'var(--text-secondary)', fontSize: '13px' }}>
                {erroHistorico}
              </div>
            )}

            {carregandoHistorico ? (
              <p role="status" style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '16px' }}>Carregando análises anteriores...</p>
            ) : historico.length === 0 && !erroHistorico ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '16px' }}>Não há análises anteriores para exibir.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                {historico.map((registro, indice) => {
                  const analise = obterAnaliseHistorica(registro)
                  return (
                    <div key={registro?.id ?? `${registro?.criado_em}-${indice}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', flexWrap: 'wrap' }}>
                      <div>
                        <strong style={{ fontSize: '13px' }}>{formatarDataHora(registro?.criado_em)}</strong>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>Período: {formatarPeriodo(analise.periodo_atual)}</p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>{analise.resumo || 'Resumo indisponível.'}</p>
                      </div>
                      <button className="btn-secondary" onClick={() => setDetalheHistorico(registro)}>Ver detalhes da análise de {formatarDataHora(registro?.criado_em)}</button>
                    </div>
                  )
                })}
              </div>
            )}

            {paginacaoHistorico && paginacaoHistorico.totalPaginas > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button className="btn-secondary" onClick={() => carregarHistorico(paginacaoHistorico.pagina - 1)} disabled={carregandoHistorico || paginacaoHistorico.pagina <= 1}>Página anterior</button>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Página {paginacaoHistorico.pagina} de {paginacaoHistorico.totalPaginas}</span>
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
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div>
                <h3 id="detalhe-analise-anterior-titulo">Detalhe da análise anterior</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>Gerada em {formatarDataHora(detalheHistorico.criado_em)} · Período: {formatarPeriodo(analise.periodo_atual)}</p>
              </div>
              <button className="btn-secondary" onClick={() => setDetalheHistorico(null)}>Fechar detalhe</button>
            </div>

            <p style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6', marginTop: '16px' }}>{analise.resumo || 'Resumo indisponível.'}</p>

            {analise.metricas_destaque && (
              <section className="metrics-grid" style={{ marginTop: '16px' }} aria-label="Métricas da análise anterior">
                {[
                  { label: 'OS abertas (90d)', valor: formatarNumero(analise.metricas_destaque.ordens_abertas) },
                  { label: 'OS concluídas (90d)', valor: formatarNumero(analise.metricas_destaque.ordens_concluidas) },
                  { label: 'Faturamento concluído (90d)', valor: formatarMoeda(analise.metricas_destaque.faturamento) },
                  { label: 'Itens críticos', valor: formatarNumero(analise.metricas_destaque.itens_criticos) },
                ].map((metrica) => <div key={metrica.label} className="metric-card"><span className="metric-title">{metrica.label}</span><div className="metric-value" style={{ fontSize: '22px' }}>{metrica.valor}</div></div>)}
              </section>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <ComparacaoPeriodo periodoAtual={analise.periodo_atual} periodoAnterior={analise.periodo_anterior} comparacoes={analise.comparacoes} />
              <EstoqueInteligente estoque={analise.estoque_inteligente} />
              <ProdutividadeOS produtividade={analise.produtividade} />
              <section aria-labelledby="recomendacoes-historico-titulo">
                <h4 id="recomendacoes-historico-titulo" style={{ marginBottom: '12px' }}>Recomendações explicáveis</h4>
                {recomendacoes.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Não há recomendações disponíveis nesta análise.</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>{recomendacoes.map((recomendacao, indice) => <RecomendacaoExplicavel key={`${recomendacao?.titulo}-${indice}`} recomendacao={recomendacao} />)}</div>}
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
          className="stagger-2"
          style={{
            padding: '16px',
            borderLeft: '3px solid var(--color-warning)',
            background: 'var(--color-primary-tint)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <CloudOff size={18} color="var(--color-warning)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                IA indisponível
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6', maxWidth: '68ch' }}>
                {erro}
              </p>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Estado inicial */}
      {!resultado && !analisando && !erro && (
        <GlassPanel className="panel stagger-3" style={{ textAlign: 'center', padding: '64px 48px' }}>
          <Brain size={48} color="var(--color-primary)" style={{ marginBottom: '20px' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '12px' }}>Pronto para Analisar</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 24px' }}>
            Clique em <strong>"Analisar Dados"</strong> para gerar recomendações baseadas nas ordens de serviço,
            movimentações de estoque e padrões de atendimento da oficina.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Dados disponíveis: {ordensServico.length} OS · {clientes.length} clientes · {veiculos.length} veículos
          </p>
        </GlassPanel>
      )}

      {/* Loading */}
      {analisando && (
        <GlassPanel className="panel stagger-2" style={{ textAlign: 'center', padding: '64px 48px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-warning)',
                animation: `pulse-glow 1.2s ease-in-out ${i * 0.2}s infinite`
              }} />
            ))}
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '8px' }}>Processando Análise</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Consultando padrões históricos e gerando recomendações...</p>
        </GlassPanel>
      )}

      {/* Resultado */}
      {resultado && (
        <>
          {resultado.resumo && (
            <GlassPanel className="panel stagger-2" style={{ borderColor: 'var(--color-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <Brain size={20} color="var(--electric-blue)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--electric-blue)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Resumo Executivo</div>
                  <p style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6' }}>{resultado.resumo}</p>
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
                  <div className="metric-value" style={{ fontSize: '26px' }}>{m.valor}</div>
                </GlassPanel>
              ))}
            </section>
          )}

          {resultado.alertas?.length > 0 && (
            <GlassPanel className="panel stagger-2">
              <div className="panel-header">
                <h3><AlertTriangle size={18} color="var(--color-warning)" style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Alertas</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {resultado.alertas.map((a, i) => {
                  const cor = a.urgencia === 'critica' ? 'var(--color-danger)' : a.urgencia === 'alta' ? 'var(--color-warning)' : a.urgencia === 'media' ? 'var(--status-pending)' : 'var(--text-secondary)'
                  return (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <AlertTriangle size={16} color={cor} style={{ marginTop: '2px', flexShrink: 0 }} />
                      <div>
                        {a.tipo && <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: cor, fontWeight: 700, marginBottom: '2px' }}>{a.tipo}</div>}
                        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{a.mensagem}</div>
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
            <h3 id="recomendacoes-ia-titulo" style={{ margin: '8px 0 12px' }}>Recomendações explicáveis</h3>
            {resultado.recomendacoes?.length === 0 ? (
              <GlassPanel className="panel" style={{ textAlign: 'center', padding: '48px' }}>
                <p style={{ color: 'var(--text-secondary)' }}>Dados insuficientes para gerar recomendações. Registre mais ordens de serviço e retorne.</p>
              </GlassPanel>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {resultado.recomendacoes?.map((rec, indice) => (
                  <RecomendacaoExplicavel key={`${rec.titulo}-${indice}`} recomendacao={rec} />
                ))}
              </div>
            )}
          </section>

          <div style={{ textAlign: 'center', marginTop: '8px' }}>
            <button className="btn-secondary" onClick={handleAnalisar} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw size={14} /> Atualizar Análise
            </button>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
