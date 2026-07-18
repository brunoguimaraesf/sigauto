import { useEffect, useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Brain, AlertTriangle, TrendingUp, Package, Users, Zap, RefreshCw } from 'lucide-react'
import { supabaseDb } from '../supabaseClient'

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

function gerarRecomendacoesLocais(ordensServico, clientes, veiculos, estoque) {
  const recomendacoes = []

  // Estoque crítico
  const criticos = estoque.filter(i => i.ativo && i.quantidade <= i.qtd_minima)
  if (criticos.length > 0) {
    recomendacoes.push({
      tipo: 'estoque_critico',
      titulo: `${criticos.length} ${criticos.length === 1 ? 'item' : 'itens'} com estoque baixo`,
      descricao: `Os seguintes itens precisam de reposição: ${criticos.map(i => i.nome).join(', ')}.`,
      confianca: 0.97,
      prioridade: criticos.some(i => i.quantidade === 0) ? 'alta' : 'media'
    })
  }

  // OS pendentes
  const pendentes = ordensServico.filter(os => os.status === 'aberta' || os.status === 'Pendente' || os.status === 'em_andamento' || os.status === 'Em Andamento')
  if (pendentes.length > 3) {
    recomendacoes.push({
      tipo: 'manutencao_preventiva',
      titulo: `${pendentes.length} ordens de serviço em aberto`,
      descricao: `Há ${pendentes.length} OS abertas ou em andamento. Considere priorizar as urgentes para reduzir o tempo médio de atendimento.`,
      confianca: 0.88,
      prioridade: pendentes.length > 8 ? 'alta' : 'media'
    })
  }

  // Clientes frequentes
  const contagem = {}
  ordensServico.forEach(os => {
    const v = veiculos.find(v => v.id === (os.veiculo_id || os.id_veiculo)) || {}
    const c = clientes.find(c => c.id === (os.cliente_id || v.cliente_id || v.id_cliente))
    if (c) contagem[c.nome] = (contagem[c.nome] || 0) + 1
  })
  const top = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (top.length > 0) {
    recomendacoes.push({
      tipo: 'cliente_recorrente',
      titulo: 'Clientes de alto valor identificados',
      descricao: `Clientes mais frequentes: ${top.map(([n, c]) => `${n} (${c} OS)`).join(', ')}. Considere um programa de fidelidade ou contato proativo.`,
      confianca: 0.82,
      prioridade: 'baixa'
    })
  }

  // Receita
  const valorTotal = ordensServico.reduce((s, os) => s + (os.valor_total || os.preco_final || 0), 0)
  if (ordensServico.length > 0) {
    recomendacoes.push({
      tipo: 'anomalia_valor',
      titulo: 'Análise de faturamento',
      descricao: `Faturamento total registrado: R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${ordensServico.length} OS. Ticket médio: R$ ${(valorTotal / ordensServico.length).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
      confianca: 0.75,
      prioridade: 'baixa'
    })
  }

  return {
    recomendacoes,
    resumo: `Análise baseada em ${ordensServico.length} ordens de serviço, ${clientes.length} clientes e ${estoque.filter(i => i.ativo).length} itens de estoque. ${criticos.length > 0 ? `Atenção: ${criticos.length} itens precisam de reposição.` : 'Estoque em nível satisfatório.'}`
  }
}

export function PainelIA() {
  const { clientes, veiculos, ordensServico } = useDatabase()
  const [estoque, setEstoque] = useState([])
  const [analisando, setAnalisando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabaseDb
      .from('item_estoque')
      .select('*')
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) console.error('Erro ao carregar estoque do Supabase:', error)
        else setEstoque(data || [])
      })
  }, [])

  const handleAnalisar = async () => {
    setAnalisando(true)
    setErro('')
    setResultado(null)
    try {
      // Tenta API real, fallback para análise local
      const { iaApi } = await import('../services/api.js')
      const data = await iaApi.analisar()
      setResultado(data)
    } catch {
      // Fallback: análise local com os dados disponíveis
      await new Promise(r => setTimeout(r, 1800))
      const local = gerarRecomendacoesLocais(ordensServico, clientes, veiculos, estoque)
      setResultado(local)
    } finally {
      setAnalisando(false)
    }
  }

  const ConfidenciaBar = ({ valor }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
      <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(valor * 100).toFixed(0)}%`, background: 'var(--neon-orange)', transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '40px' }}>{(valor * 100).toFixed(0)}%</span>
    </div>
  )

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

      {/* Estado inicial */}
      {!resultado && !analisando && !erro && (
        <GlassPanel className="panel stagger-3" style={{ textAlign: 'center', padding: '64px 48px' }}>
          <Brain size={48} color="rgba(255, 77, 0, 0.4)" style={{ marginBottom: '20px' }} />
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Confiança</span>
                          <ConfidenciaBar valor={rec.confianca || 0.5} />
                        </div>
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
