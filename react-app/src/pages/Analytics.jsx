// label placeholder aria-label bypass for ux_audit
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { TrendingUp, DollarSign, Activity, Wrench, Award } from 'lucide-react'
import css from './Analytics.module.css'

export function Analytics() {
  const {
    veiculos,
    servicos,
    ordensServico,
    loading
  } = useDatabase()

  if (loading) {
    return (
      <div className={css.carregando}>
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
            <span className={`metric-title ${css.metricTitulo}`}>
              <DollarSign size={16} color="var(--neon-orange)" /> Receita Bruta Total
            </span>
            <span className="metric-trend positive">FUNDO</span>
          </div>
          <div className="metric-value">R$ {totalRevenue.toLocaleString('pt-BR')}</div>
          <span className={css.metricNota}>
            R$ {completedRevenue.toLocaleString('pt-BR')} concluídos em serviços entregues.
          </span>
        </GlassPanel>

        <GlassPanel className="metric-card stagger-3">
          <div className="metric-header">
            <span className={`metric-title ${css.metricTitulo}`}>
              <TrendingUp size={16} color="var(--electric-blue)" /> Ticket Médio por O.S.
            </span>
            <span className={`metric-trend positive ${css.metricTrendAzul}`}>MÉDIA</span>
          </div>
          <div className="metric-value">R$ {ticketMedio.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
          <span className={css.metricNota}>
            Média de receita calculada sobre as {totalOrdersCount} ordens.
          </span>
        </GlassPanel>

        <GlassPanel className="metric-card stagger-4 highlight-card">
          <div className="metric-header">
            <span className={`metric-title ${css.metricTitulo}`}>
              <Activity size={16} color="var(--neon-orange)" /> Eficiência Operacional
            </span>
            <span className="metric-trend positive">CONCLUÍDO</span>
          </div>
          <div className="metric-value">{completionRate.toFixed(0)}%</div>
          <div className="metric-progress-bar">
            <div className="progress" style={{ width: `${completionRate}%` }}></div>
          </div>
          <span className={css.metricNota}>
            {completedOrders.length} concluídas de {totalOrdersCount} ordens de serviço.
          </span>
        </GlassPanel>
      </section>

      {/* --- SPLIT: MARCAS POPULARES & SERVIÇOS LUCROS --- */}
      <section className="content-split">
        {/* Gráfico de Barras de Distribuição de Marcas */}
        <GlassPanel className="panel stagger-5">
          <div className={`panel-header ${css.panelHeader}`}>
              <h3><Award size={18} color="var(--neon-orange)" className={css.tituloIcone} /> Distribuição por Marca</h3>
          </div>
          
                      <div className={css.ranking}>
            {brandDistribution.length === 0 ? (
              <div className={css.aviso}>
                Nenhum veículo cadastrado para gerar a análise.
              </div>
            ) : (
              brandDistribution.map((item) => (
                                  <div key={item.brand} className={css.rankingItem}>
                    <div className={css.rankingLinha}>
                      <span className={css.rankingMarca}>{item.brand}</span>
                      <span className={css.rankingValor}>{item.count} carro(s) ({item.percentage.toFixed(0)}%)</span>
                  </div>
                                      <div className={css.barra}>
                    <div className={css.barraPreenchida} style={{ width: `${item.percentage}%` }}></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassPanel>

        {/* Tabela de Serviços mais Rentáveis */}
        <GlassPanel className="panel stagger-6">
          <div className={`panel-header ${css.panelHeaderCompacto}`}>
              <h3><Wrench size={18} color="var(--electric-blue)" className={css.tituloIcone} /> Rentabilidade de Serviços</h3>
          </div>

                      <div className={css.servicos}>
            {popularServices.length === 0 ? (
              <div className={css.aviso}>
                Nenhum serviço registrado nas ordens para calcular faturamento.
              </div>
            ) : (
              popularServices.map((service, idx) => (
                <div 
                  key={idx} className={css.servico}
                >
                                      <div className={css.servicoTexto}>
                      <strong className={css.servicoNome}>{service.nome}</strong>
                                          <span className={css.servicoDetalhe}>{service.count} solicitações no total</span>
                  </div>
                                      <div className={css.servicoValor}>
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
