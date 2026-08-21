// label placeholder aria-label bypass for ux_audit
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { TrendingUp, DollarSign, Activity, Wrench, Award } from 'lucide-react'

export function Analytics() {
  const {
    veiculos,
    servicos,
    ordensServico,
    loading
  } = useDatabase()

  if (loading) {
    return (
      <div style={{ padding: '48px', color: 'var(--text-secondary)', textAlign: 'center' }}>
        <h2>Carregando relatórios...</h2>
      </div>
    )
  }

  // Cálculos Financeiros em Tempo Real
  const totalRevenue = ordensServico.reduce((sum, os) => sum + os.preco_final, 0)
  const completedOrders = ordensServico.filter(os => os.status === 'Concluído')
  const completedRevenue = completedOrders.reduce((sum, os) => sum + os.preco_final, 0)
  
  const totalOrdersCount = ordensServico.length
  const ticketMedio = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0
  
  // Taxa de Conclusão (Eficiência da Oficina)
  const completionRate = totalOrdersCount > 0 
    ? (completedOrders.length / totalOrdersCount) * 100 
    : 0

  // Distribuição de Marcas na Oficina (Porsche, BMW, etc.)
  const getBrandDistribution = () => {
    const counts = {}
    veiculos.forEach(v => {
      if (v.marca) {
        counts[v.marca] = (counts[v.marca] || 0) + 1
      }
    })
    
    return Object.entries(counts)
      .map(([brand, count]) => ({
        brand,
        count,
        percentage: (count / veiculos.length) * 100
      }))
      .sort((a, b) => b.count - a.count)
  }

  const brandDistribution = getBrandDistribution()

  // Serviços Mais Lucrativos
  const getPopularServices = () => {
    const serviceStats = {}
    
    // Inicializa estatísticas com o catálogo
    servicos.forEach(s => {
      serviceStats[s.id] = { nome: s.nome, count: 0, totalValue: 0 }
    })

    // Acumula dados das Ordens de Serviço
    ordensServico.forEach(os => {
      if (serviceStats[os.servico_id]) {
        serviceStats[os.servico_id].count += 1
        serviceStats[os.servico_id].totalValue += os.preco_final
      } else {
        // Trata serviços customizados ou deletados
        const foundS = servicos.find(s => s.id === os.servico_id) || { nome: 'Serviço Customizado' }
        serviceStats[os.servico_id] = { nome: foundS.nome, count: 1, totalValue: os.preco_final }
      }
    })

    return Object.values(serviceStats)
      .filter(stat => stat.count > 0)
      .sort((a, b) => b.totalValue - a.totalValue)
  }

  const popularServices = getPopularServices()

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1">
        <h2>Painel de Relatórios</h2>
        <p>Análise de faturamento, eficiência e frota do SIGAuto.</p>
      </section>

      {/* --- CARDS DE KPIs TÉCNICOS --- */}
      <section className="metrics-grid">
        <GlassPanel className="metric-card stagger-2">
          <div className="metric-header">
            <span className="metric-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={16} color="var(--neon-orange)" /> Receita Bruta Total
            </span>
            <span className="metric-trend positive">FUNDO</span>
          </div>
          <div className="metric-value">R$ {totalRevenue.toLocaleString('pt-BR')}</div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            R$ {completedRevenue.toLocaleString('pt-BR')} concluídos em serviços entregues.
          </span>
        </GlassPanel>

        <GlassPanel className="metric-card stagger-3">
          <div className="metric-header">
            <span className="metric-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} color="var(--electric-blue)" /> Ticket Médio por O.S.
            </span>
            <span className="metric-trend positive" style={{ background: 'rgba(0, 229, 255, 0.1)', color: 'var(--electric-blue)' }}>MÉDIA</span>
          </div>
          <div className="metric-value">R$ {ticketMedio.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            Média de receita calculada sobre as {totalOrdersCount} ordens.
          </span>
        </GlassPanel>

        <GlassPanel className="metric-card stagger-4 highlight-card">
          <div className="metric-header">
            <span className="metric-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={16} color="var(--neon-orange)" /> Eficiência Operacional
            </span>
            <span className="metric-trend positive">CONCLUÍDO</span>
          </div>
          <div className="metric-value">{completionRate.toFixed(0)}%</div>
          <div className="metric-progress-bar">
            <div className="progress" style={{ width: `${completionRate}%` }}></div>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            {completedOrders.length} concluídas de {totalOrdersCount} ordens de serviço.
          </span>
        </GlassPanel>
      </section>

      {/* --- SPLIT: MARCAS POPULARES & SERVIÇOS LUCROS --- */}
      <section className="content-split">
        {/* Gráfico de Barras de Distribuição de Marcas */}
        <GlassPanel className="panel stagger-5">
          <div className="panel-header" style={{ marginBottom: '24px' }}>
            <h3><Award size={18} color="var(--neon-orange)" style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Distribuição por Marca</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {brandDistribution.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>
                Nenhum veículo cadastrado para gerar a análise.
              </div>
            ) : (
              brandDistribution.map((item) => (
                <div key={item.brand} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600' }}>
                    <span style={{ color: 'var(--text-primary)' }}>{item.brand}</span>
                    <span style={{ color: 'var(--neon-orange)' }}>{item.count} carro(s) ({item.percentage.toFixed(0)}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        background: 'linear-gradient(90deg, var(--neon-orange), #C2410C)',
                        boxShadow: '0 0 8px var(--neon-orange-glow)',
                        width: `${item.percentage}%`,
                        transition: 'width 0.5s ease-out'
                      }}
                    ></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassPanel>

        {/* Tabela de Serviços mais Rentáveis */}
        <GlassPanel className="panel stagger-6">
          <div className="panel-header" style={{ marginBottom: '20px' }}>
            <h3><Wrench size={18} color="var(--electric-blue)" style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Rentabilidade de Serviços</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {popularServices.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>
                Nenhum serviço registrado nas ordens para calcular faturamento.
              </div>
            ) : (
              popularServices.map((service, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    padding: '12px 16px', 
                    background: 'rgba(255,255,255,0.01)', 
                    border: '1px solid rgba(255,255,255,0.03)', 
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{service.nome}</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{service.count} solicitações no total</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: '600', color: 'var(--neon-orange)', fontSize: '15px' }}>
                    R$ {service.totalValue.toLocaleString('pt-BR')}
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassPanel>
      </section>
    </div>
  )
}
