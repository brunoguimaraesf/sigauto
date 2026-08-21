import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Wrench, Users, CarFront, FileText, ClipboardList, Trash2, CheckCircle, Clock, XCircle, Hourglass } from 'lucide-react'

export function Dashboard() {
  const {
    clientes,
    veiculos,
    servicos,
    ordensServico,
    loading,
    addOrdemServico,
    deleteOrdemServico
  } = useDatabase()

  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'orders', 'new-order'
  
  // Estados para nova O.S.
  const [selectedCliente, setSelectedCliente] = useState('')
  const [selectedVeiculo, setSelectedVeiculo] = useState('')
  const [selectedServico, setSelectedServico] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [orderStatus, setOrderStatus] = useState('Pendente')
  
  // Filtro para listagem de O.S.
  const [searchFilter, setSearchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')

  // Tratamento de mudança de serviço para auto-popular preço
  const handleServicoChange = (e) => {
    const servicoId = e.target.value
    setSelectedServico(servicoId)
    const found = servicos.find(s => s.id === servicoId)
    if (found) {
      setCustomPrice(found.preco)
    }
  }

  // Filtragem de veículos associados ao cliente selecionado
  const filteredVeiculos = selectedCliente 
    ? veiculos.filter(v => v.cliente_id === selectedCliente)
    : veiculos

  // Submissão da nova O.S.
  const handleSubmitOS = (e) => {
    e.preventDefault()
    if (!selectedCliente || !selectedVeiculo || !selectedServico) {
      alert('Por favor, selecione cliente, veículo e serviço catalogado.')
      return
    }

    addOrdemServico({
      cliente_id: selectedCliente,
      veiculo_id: selectedVeiculo,
      servico_id: selectedServico,
      preco_final: Number(customPrice),
      observacoes: observacoes,
      status: orderStatus
    })

    // Limpa campos e volta para visão geral
    setSelectedCliente('')
    setSelectedVeiculo('')
    setSelectedServico('')
    setCustomPrice('')
    setObservacoes('')
    setOrderStatus('Pendente')
    setActiveTab('overview')
  }

  // Estatísticas reativas do painel
  const activeVehiclesCount = veiculos.length
  const totalRevenue = ordensServico.reduce((sum, os) => sum + (os.valor_total || os.preco_final || 0), 0)

  const osStats = {
    total: ordensServico.length,
    abertas: ordensServico.filter(os => os.status === 'aberta' || os.status === 'Pendente').length,
    emAndamento: ordensServico.filter(os => os.status === 'em_andamento' || os.status === 'Em Andamento').length,
    aguardando: ordensServico.filter(os => os.status === 'aguardando_peca').length,
    concluidas: ordensServico.filter(os => os.status === 'concluida' || os.status === 'Concluído').length,
    canceladas: ordensServico.filter(os => os.status === 'cancelada').length,
  }
  const maintenanceCount = osStats.emAndamento + osStats.abertas
  
  const STATUS_LABEL = {
    aberta: 'Aberta', Pendente: 'Aberta',
    em_andamento: 'Em Andamento', 'Em Andamento': 'Em Andamento',
    aguardando_peca: 'Aguard. Peça',
    concluida: 'Concluída', 'Concluído': 'Concluída',
    cancelada: 'Cancelada',
  }
  const STATUS_CLASS = {
    aberta: 'status-pending', Pendente: 'status-pending',
    em_andamento: 'status-progress', 'Em Andamento': 'status-progress',
    aguardando_peca: 'status-pending',
    concluida: 'status-done', 'Concluído': 'status-done',
    cancelada: 'status-pending',
  }

  // Cruzamento de dados de O.S. para exibição na tabela/lista
  const getEnrichedOrders = () => {
    return ordensServico.map(os => {
      // cliente via veículo (a OS não tem FK direto para cliente)
      const veiculo = veiculos.find(v => v.id === (os.veiculo_id || os.id_veiculo)) || {}
      const cliente = clientes.find(c => c.id === (os.cliente_id || veiculo.id_cliente || veiculo.cliente_id)) || {}
      // serviço: prefere itens da OS, fallback para catálogo, depois descrição
      const itens = os.servicos_itens || []
      const servicoNome = itens.length > 0
        ? itens.map(s => s.descricao || s.nome).filter(Boolean).join(', ')
        : (servicos.find(s => s.id === os.servico_id)?.nome || os.descricao || '—')
      return {
        ...os,
        clienteNome: cliente.nome || '—',
        veiculoInfo: veiculo.marca ? `${veiculo.marca} ${veiculo.modelo}` : '—',
        veiculoPlaca: veiculo.placa || '—',
        servicoNome,
        valorExibido: os.valor_total || os.preco_final || 0,
      }
    })
  }

  const enrichedOrders = getEnrichedOrders()

  // Filtros aplicados à listagem completa
  const filteredOrders = enrichedOrders.filter(os => {
    const matchesSearch = os.veiculoPlaca.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          os.clienteNome.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          os.veiculoInfo.toLowerCase().includes(searchFilter.toLowerCase())
    const matchesStatus = statusFilter === 'Todos' || os.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Entradas desta semana (seg–dom), no máximo 6
  const startOfWeek = (() => {
    const d = new Date()
    const day = d.getDay()
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
    d.setHours(0, 0, 0, 0)
    return d
  })()
  const recentOrders = enrichedOrders
    .filter(os => {
      const d = new Date(os.data_abertura || os.criado_em)
      return !isNaN(d) && d >= startOfWeek
    })
    .slice(0, 6)

  if (loading) {
    return (
      <div style={{ padding: '48px', color: 'var(--text-secondary)', textAlign: 'center' }}>
        <h2>Carregando painel...</h2>
      </div>
    )
  }

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Visão Geral</h2>
          <p>Resumo da operação da oficina.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className={`btn-secondary ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            style={{ borderRadius: 'var(--radius-sm)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <ClipboardList size={16} /> Visão Geral
          </button>
          <button
            className={`btn-secondary ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
            style={{ borderRadius: 'var(--radius-sm)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <FileText size={16} /> Ordens de Serviço
          </button>
        </div>
      </section>

      {/* --- ABA 1: VISÃO GERAL --- */}
      {activeTab === 'overview' && (
        <>
          <section className="metrics-grid">
            <GlassPanel className="metric-card stagger-2">
              <div className="metric-header">
                <span className="metric-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CarFront size={16} color="var(--neon-orange)" /> Veículos Cadastrados
                </span>
                <span className="metric-trend positive" style={{ fontSize: '10px' }}>ATIVOS</span>
              </div>
              <div className="metric-value">{activeVehiclesCount}</div>
            </GlassPanel>
            
            <GlassPanel className="metric-card stagger-3">
              <div className="metric-header">
                <span className="metric-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wrench size={16} color="var(--electric-blue)" /> Em Manutenção
                </span>
                <span className="metric-trend negative" style={{ fontSize: '10px', background: 'rgba(0, 229, 255, 0.1)', color: 'var(--electric-blue)' }}>EM BOX</span>
              </div>
              <div className="metric-value">{maintenanceCount}</div>
            </GlassPanel>

            <GlassPanel className="metric-card stagger-4 highlight-card">
              <div className="metric-header">
                <span className="metric-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={16} color="var(--neon-orange)" /> Faturamento
                </span>
                <span className="metric-trend positive" style={{ fontSize: '10px' }}>RECEITA</span>
              </div>
              <div className="metric-value">R$ {(totalRevenue / 1000).toFixed(1)}k</div>
              <div className="metric-progress-bar">
                <div className="progress" style={{ width: `${Math.min(100, (totalRevenue / 100000) * 100)}%` }}></div>
              </div>
            </GlassPanel>
          </section>

          <section className="content-split">
            <GlassPanel className="panel stagger-5">
              <div className="panel-header">
                <h3>Entradas desta Semana</h3>
                <button className="btn-link" onClick={() => setActiveTab('orders')}>Ver Todas as O.S.</button>
              </div>

              <div className="list-container">
                {recentOrders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <FileText size={28} color="var(--text-muted)" />
                    <span style={{ color: 'var(--text-secondary)' }}>Nenhuma O.S. aberta esta semana.</span>
                    <button className="btn-primary" onClick={() => setActiveTab('orders')} style={{ marginTop: '4px' }}>Abrir nova O.S.</button>
                  </div>
                ) : (
                  recentOrders.map((os) => (
                    <div key={os.id} className="list-item">
                      <div className="car-indicator" style={{ backgroundColor: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--neon-orange)' }}>
                        {os.veiculoInfo?.charAt(0) || 'V'}
                      </div>
                      <div className="item-details">
                        <h4>{os.veiculoInfo}</h4>
                        <span style={{ display: 'block', marginBottom: '2px' }}>{os.veiculoPlaca} • {os.clienteNome}</span>
                        <span style={{ color: 'var(--neon-orange)', fontSize: '12px', fontWeight: '600' }}>{os.servicoNome}</span>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: '600', fontSize: '14px' }}>
                          {os.valorExibido > 0 ? `R$ ${os.valorExibido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                        </span>
                        <div className={`status-badge ${STATUS_CLASS[os.status] || 'status-pending'}`}>
                          {STATUS_LABEL[os.status] || os.status}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </GlassPanel>

            <GlassPanel className="panel stagger-6">
              <div className="panel-header">
                <h3>Situação da Oficina</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                  {osStats.total} OS total
                </span>
              </div>

              {/* Mini-cards: veículos e clientes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                <div style={{ padding: '10px 12px', background: 'rgba(232,89,12,0.06)', border: '1px solid rgba(232,89,12,0.15)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CarFront size={10} /> Veículos
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', color: 'var(--neon-orange)' }}>{veiculos.length}</div>
                </div>
                <div style={{ padding: '10px 12px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Users size={10} /> Clientes
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', color: 'var(--status-progress)' }}>{clientes.length}</div>
                </div>
              </div>

              {/* Barras de status por OS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Abertas',       count: osStats.abertas,     color: 'var(--status-pending)', Icon: Clock },
                  { label: 'Em Andamento',  count: osStats.emAndamento,  color: 'var(--status-progress)', Icon: Wrench },
                  { label: 'Aguard. Peça',  count: osStats.aguardando,   color: 'var(--neon-orange)', Icon: Hourglass },
                  { label: 'Concluídas',    count: osStats.concluidas,   color: 'var(--status-done)', Icon: CheckCircle },
                  { label: 'Canceladas',    count: osStats.canceladas,   color: 'var(--text-muted)', Icon: XCircle },
                ].map(({ label, count, color, Icon }) => {
                  const pct = osStats.total > 0 ? Math.round((count / osStats.total) * 100) : 0
                  return (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Icon size={12} color={color} /> {label}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color, fontVariantNumeric: 'tabular-nums' }}>
                          {count} <span style={{ fontSize: '10px', fontWeight: '400', color: 'var(--text-muted)' }}>({pct}%)</span>
                        </span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Taxa de conclusão */}
              {osStats.total > 0 && (
                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Taxa de conclusão</span>
                  <span style={{ fontSize: '16px', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: 'var(--status-done)' }}>
                    {Math.round((osStats.concluidas / osStats.total) * 100)}%
                  </span>
                </div>
              )}
            </GlassPanel>
          </section>
        </>
      )}

      {/* --- ABA 2: LISTAGEM DE ORDENS DE SERVIÇO --- */}
      {activeTab === 'orders' && (
        <GlassPanel className="panel stagger-2">
          <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Todas as Ordens de Serviço</h3>
              <button className="btn-primary" onClick={() => setActiveTab('new-order')}>+ Nova O.S.</button>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Filtrar por placa, cliente ou veículo..." 
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>
              <div style={{ width: '180px' }}>
                <select
                  className="form-control"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="Todos">Status: Todos</option>
                  <option value="aberta">Aberta</option>
                  <option value="Pendente">Aberta (leg.)</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="aguardando_peca">Aguard. Peça</option>
                  <option value="concluida">Concluída</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
            </div>
          </div>

          <div className="tech-table-container">
            {filteredOrders.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '48px' }}>
                Nenhuma O.S. encontrada com os filtros aplicados.
              </div>
            ) : (
              <table className="tech-table">
                <thead>
                  <tr>
                    <th>Placa / Veículo</th>
                    <th>Cliente</th>
                    <th>Serviço Executado</th>
                    <th>Preço</th>
                    <th>Status O.S.</th>
                    <th>Data Abertura</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((os) => (
                    <tr key={os.id}>
                      <td>
                        <strong style={{ color: 'var(--neon-orange)', display: 'block', fontSize: '13px' }}>{os.veiculoPlaca}</strong>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{os.veiculoInfo}</span>
                      </td>
                      <td>{os.clienteNome}</td>
                      <td>{os.servicoNome}</td>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: '600' }}>
                        {os.valorExibido > 0 ? `R$ ${os.valorExibido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td>
                        <div className={`status-badge ${STATUS_CLASS[os.status] || 'status-pending'}`}>
                          {STATUS_LABEL[os.status] || os.status}
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {(() => { const d = new Date(os.data_abertura || os.criado_em); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) })()}
                      </td>
                      <td>
                        <button 
                          className="btn-danger" 
                          onClick={() => {
                            if(confirm('Tem certeza que deseja excluir esta Ordem de Serviço?')) {
                              deleteOrdemServico(os.id)
                            }
                          }}
                          style={{ padding: '6px' }}
                          title="Excluir O.S."
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </GlassPanel>
      )}

      {/* --- ABA 3: FORMULÁRIO DE ABERTURA DE O.S. --- */}
      {activeTab === 'new-order' && (
        <GlassPanel className="panel stagger-2">
          <div className="panel-header">
            <h3>Abertura de Nova Ordem de Serviço</h3>
            <button className="btn-secondary" onClick={() => setActiveTab('overview')} style={{ padding: '8px 16px' }}>Cancelar</button>
          </div>

          <form onSubmit={handleSubmitOS} style={{ marginTop: '16px' }}>
            <div className="form-row">
              <div className="form-group">
                <label>Cliente Proprietário</label>
                <select 
                  className="form-control"
                  value={selectedCliente}
                  onChange={(e) => {
                    setSelectedCliente(e.target.value)
                    setSelectedVeiculo('') // reseta veículo
                  }}
                  required
                >
                  <option value="">Selecione o Cliente...</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.telefone})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Veículo Associado</label>
                <select 
                  className="form-control"
                  value={selectedVeiculo}
                  onChange={(e) => setSelectedVeiculo(e.target.value)}
                  disabled={!selectedCliente}
                  required
                >
                  <option value="">Selecione o Veículo...</option>
                  {filteredVeiculos.map(v => (
                    <option key={v.id} value={v.id}>{v.marca} {v.modelo} - [{v.placa}]</option>
                  ))}
                </select>
                {!selectedCliente && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Escolha um cliente primeiro.</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Serviço do Catálogo</label>
                <select 
                  className="form-control"
                  value={selectedServico}
                  onChange={handleServicoChange}
                  required
                >
                  <option value="">Selecione o Serviço...</option>
                  {servicos.map(s => (
                    <option key={s.id} value={s.id}>{s.nome} - R$ {s.preco.toLocaleString('pt-BR')}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Preço Final Cobrado (R$)</label>
                <input 
                  type="number"
                  className="form-control"
                  placeholder="Preço personalizado"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Status Inicial</label>
                <select 
                  className="form-control"
                  value={orderStatus}
                  onChange={(e) => setOrderStatus(e.target.value)}
                >
                  <option value="Pendente">Pendente (Fila)</option>
                  <option value="Em Andamento">Em Andamento (Box)</option>
                  <option value="Concluído">Concluído (Entregue)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Observações Técnicas / Sintomas</label>
              <textarea 
                className="form-control"
                placeholder="Detalhes sobre o problema do carro, solicitações especiais do proprietário..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>

            <div className="alert-box" style={{ marginTop: '8px' }}>
              Ao abrir a Ordem de Serviço, o status do veículo correspondente será automaticamente atualizado para **"{orderStatus}"** e o serviço atual dele será atualizado reativamente na frota.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn-secondary" onClick={() => setActiveTab('overview')}>Cancelar</button>
              <button type="submit" className="btn-primary" style={{ padding: '12px 32px' }}>Confirmar O.S.</button>
            </div>
          </form>
        </GlassPanel>
      )}
    </div>
  )
}
