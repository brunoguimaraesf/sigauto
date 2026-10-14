import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Brain, AlertTriangle, CloudOff, TrendingUp, Package, Users, Zap, RefreshCw } from 'lucide-react'

const TIPO_ICONS = {
  estoque_critico: Package,
  manutencao_preventiva: Zap,
  cliente_recorrente: Users,
  anomalia_valor: TrendingUp,
}

const PRIORIDADE_COLORS = {
  alta: { color: '#ff4d4d', bg: 'rgba(255, 0, 0, 0.06)', border: 'rgba(255, 0, 0, 0.2)' },
  media: { color: 'var(--status-pending)', bg: 'rgba(255, 179, 0, 0.06)', border: 'rgba(255, 179, 0, 0.2)' },
  baixa: { color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.02)', border: 'var(--border-color)' },
}

// Mensagem única de indisponibilidade. Não existe análise local de substituição:
// número calculado por regra fixa e número vindo do modelo não têm a mesma
// origem, e exibir um no lugar do outro é pior que não exibir painel.
export const MSG_IA_INDISPONIVEL =
  'A IA está indisponível no momento. Nenhuma análise foi gerada — nenhum número desta tela foi estimado localmente. Tente novamente em alguns instantes.'

export function PainelIA() {
  const { clientes, veiculos, ordensServico } = useDatabase()
  const [analisando, setAnalisando] = useState(false)
  const [resultado, setResultado] = useState(null)
  // `erro` deixou de ser estado morto: agora é o único caminho de falha da tela,
  // e é ele que mostra a indisponibilidade da IA.
  const [erro, setErro] = useState('')

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
              <span style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
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
            borderLeft: '3px solid var(--neon-orange)',
            background: 'rgba(232, 89, 12, 0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <CloudOff size={18} color="var(--neon-orange)" style={{ marginTop: '2px', flexShrink: 0 }} />
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
          <Brain size={48} color="rgba(232, 89, 12, 0.4)" style={{ marginBottom: '20px' }} />
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
                width: '10px', height: '10px', borderRadius: '50%', background: 'var(--neon-orange)',
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
            <GlassPanel className="panel stagger-2" style={{ borderColor: 'rgba(0, 229, 255, 0.2)' }}>
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
                // Rótulos explicitam a janela de 90 dias: o faturamento aqui conta
                // só OS concluídas no período, então não bate com o total do Dashboard.
                { label: 'Ordens de Serviço (90d)', valor: resultado.metricas_destaque.total_os ?? '—' },
                { label: 'Faturamento Concluído (90d)', valor: resultado.metricas_destaque.faturamento_estimado != null ? `R$ ${Number(resultado.metricas_destaque.faturamento_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—' },
                { label: 'Itens Críticos', valor: resultado.metricas_destaque.itens_criticos_estoque ?? '—' },
                { label: 'Crescimento (vs. 90d ant.)', valor: resultado.metricas_destaque.taxa_crescimento ?? '—' },
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
                <h3><AlertTriangle size={18} color="var(--neon-orange)" style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Alertas</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {resultado.alertas.map((a, i) => {
                  const cor = a.urgencia === 'critica' ? '#ff4d4d' : a.urgencia === 'alta' ? 'var(--neon-orange)' : a.urgencia === 'media' ? 'var(--status-pending)' : 'var(--text-secondary)'
                  return (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
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

          {resultado.recomendacoes?.length === 0 ? (
            <GlassPanel className="panel stagger-3" style={{ textAlign: 'center', padding: '48px' }}>
              <p style={{ color: 'var(--text-secondary)' }}>Dados insuficientes para gerar recomendações. Registre mais ordens de serviço e retorne.</p>
            </GlassPanel>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="stagger-3">
              {resultado.recomendacoes?.map((rec, idx) => {
                const prCfg = PRIORIDADE_COLORS[rec.prioridade] || PRIORIDADE_COLORS['baixa']
                const Icon = TIPO_ICONS[rec.tipo] || Brain
                return (
                  <GlassPanel key={idx} className="panel" style={{ borderColor: prCfg.border }}>
                    {/* Badge consultivo */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '4px 10px', borderRadius: '100px', fontSize: '10px', fontWeight: '700',
                      background: 'rgba(255, 179, 0, 0.08)', border: '1px solid rgba(255, 179, 0, 0.2)',
                      color: 'var(--status-pending)', textTransform: 'uppercase', letterSpacing: '0.5px',
                      marginBottom: '12px'
                    }}>
                      <AlertTriangle size={10} /> Caráter Consultivo — Requer Aprovação do Gestor
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: 'var(--radius-sm)',
                        background: prCfg.bg, border: `1px solid ${prCfg.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        <Icon size={20} color={prCfg.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--text-primary)' }}>{rec.titulo}</h4>
                          <span style={{ padding: '3px 10px', borderRadius: '100px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', background: prCfg.bg, color: prCfg.color, border: `1px solid ${prCfg.border}` }}>
                            {rec.prioridade?.toUpperCase()}
                          </span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '8px' }}>{rec.descricao}</p>
                        {/* A barra de "confiança" saiu junto com a análise local: os
                            percentuais (97%, 88%, 82%, 75%) eram literais escritos no
                            código, e precisão decimal lê como medição. O modelo não
                            devolve `confianca` — devolve `categoria`. */}
                        {rec.categoria && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>Categoria: {rec.categoria}</span>
                        )}
                      </div>
                    </div>
                  </GlassPanel>
                )
              })}
            </div>
          )}

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
