import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Wrench, Users, CarFront, FileText, ClipboardList, Trash2, CheckCircle, Clock, XCircle, Hourglass } from 'lucide-react'
import { statusOSLabel, statusOSClasse } from '../utils/os'
import css from './Dashboard.module.css'

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
      <div className={css.carregando}>
        <h2>Carregando painel...</h2>
      </div>
    )
  }

  return (
    <div className="dashboard-grid">
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Visão Geral</h2>
          <p>Resumo da operação da oficina.</p>
        </div>
        <div className={css.abas}>
          <button
            className={`btn-secondary ${css.btnAba} ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <ClipboardList size={16} /> Visão Geral
          </button>
          <button
            className={`btn-secondary ${css.btnAba} ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <FileText size={16} /> Ordens de Serviço
          </button>
        </div>
      </section>

      {/* --- ABA 1: VISÃO GERAL --- */}
      {activeTab === 'overview' && (
        <>
          <section className="metrics-grid">
            <GlassPanel className="metric-card metric-card--accent stagger-2">
              <div className="metric-header">
                <span className={`metric-title ${css.metricTitulo}`}>
                  <CarFront size={16} className="metric-icon" /> Veículos Cadastrados
                </span>
                <span className={`metric-trend positive ${css.metricTrend}`}>ATIVOS</span>
              </div>
              <div className="metric-value">{activeVehiclesCount}</div>
            </GlassPanel>
            
            <GlassPanel className="metric-card metric-card--info stagger-3">
              <div className="metric-header">
                <span className={`metric-title ${css.metricTitulo}`}>
                  <Wrench size={16} className="metric-icon" /> Em Manutenção
                </span>
                <span className={`metric-trend metric-context ${css.metricTrend}`}>EM BOX</span>
              </div>
              <div className="metric-value">{maintenanceCount}</div>
            </GlassPanel>

            <GlassPanel className="metric-card metric-card--success stagger-4 highlight-card">
              <div className="metric-header">
                <span className={`metric-title ${css.metricTitulo}`}>
                  <Users size={16} className="metric-icon" /> Faturamento
                </span>
                <span className={`metric-trend positive ${css.metricTrend}`}>RECEITA</span>
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
                  <div className={css.listaVazia}>
                    <FileText size={28} color="var(--text-muted)" />
                    <span className={css.listaVaziaTexto}>Nenhuma O.S. aberta esta semana.</span>
                    <button className={`btn-primary ${css.btnListaVazia}`} onClick={() => setActiveTab('orders')}>Abrir nova O.S.</button>
                  </div>
                ) : (
                  recentOrders.map((os) => (
                    <div key={os.id} className="list-item">
                      <div className={`car-indicator ${css.inicialVeiculo}`}>
                        {os.veiculoInfo?.charAt(0) || 'V'}
                      </div>
                      <div className="item-details">
                        <h4>{os.veiculoInfo}</h4>
                        <span className={css.itemPlaca}>{os.veiculoPlaca} • {os.clienteNome}</span>
                        <span className={css.itemServico}>{os.servicoNome}</span>
                      </div>
                      
                      <div className={css.itemLateral}>
                        <span className={css.itemValor}>
                          {os.valorExibido > 0 ? `R$ ${os.valorExibido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                        </span>
                        <div className={`status-badge ${statusOSClasse(os.status)}`}>
                          {statusOSLabel(os.status)}
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
                <span className={css.totalOS}>
                  {osStats.total} OS total
                </span>
              </div>

              {/* Mini-cards: veículos e clientes */}
              <div className={css.resumoGrade}>
                <div className={`resumo-oficina--accent ${css.resumoCard}`}>
                  <div className={css.resumoRotulo}>
                    <CarFront size={10} /> Veículos
                  </div>
                  <div className={css.resumoValorAccent}>{veiculos.length}</div>
                </div>
                <div className={`resumo-oficina--info ${css.resumoCard}`}>
                  <div className={css.resumoRotulo}>
                    <Users size={10} /> Clientes
                  </div>
                  <div className={css.resumoValorInfo}>{clientes.length}</div>
                </div>
              </div>

              {/* Barras de status por OS */}
              <div className={css.statusLista}>
                {[
                  { label: 'Abertas',       count: osStats.abertas,     color: 'var(--status-pending)', Icon: Clock },
                  { label: 'Em Andamento',  count: osStats.emAndamento,  color: 'var(--status-progress)', Icon: Wrench },
                  { label: 'Aguard. Peça',  count: osStats.aguardando,   color: 'var(--color-warning)', Icon: Hourglass },
                  { label: 'Concluídas',    count: osStats.concluidas,   color: 'var(--status-done)', Icon: CheckCircle },
                  { label: 'Canceladas',    count: osStats.canceladas,   color: 'var(--text-muted)', Icon: XCircle },
                ].map(({ label, count, color, Icon }) => {
                  const pct = osStats.total > 0 ? Math.round((count / osStats.total) * 100) : 0
                  return (
                    <div key={label}>
                      <div className={css.statusLinha}>
                        <span className={css.statusRotulo}>
                          <Icon size={12} color={color} /> {label}
                        </span>
                        <span className={css.statusContagem} style={{ color }}>
                          {count} <span className={css.statusPercentual}>({pct}%)</span>
                        </span>
                      </div>
                      <div className={css.statusBarra}>
                        <div className={css.statusBarraPreenchida} style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Taxa de conclusão */}
              {osStats.total > 0 && (
                <div className={css.taxaConclusao}>
                <span className={css.taxaRotulo}>Taxa de conclusão</span>
                  <span className={css.taxaValor}>
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
          <div className={`panel-header ${css.panelHeader}`}>
            <div className={css.headerLinha}>
              <h3>Todas as Ordens de Serviço</h3>
              <button className="btn-primary" onClick={() => setActiveTab('new-order')}>+ Nova O.S.</button>
            </div>
            
            <div className={css.filtros}>
              <div className={css.filtroBusca}>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Filtrar por placa, cliente ou veículo..." 
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>
              <div className={css.filtroStatus}>
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
              <div className={css.vazio}>
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
                        <strong className={css.placa}>{os.veiculoPlaca}</strong>
                        <span className={css.veiculo}>{os.veiculoInfo}</span>
                      </td>
                      <td>{os.clienteNome}</td>
                      <td>{os.servicoNome}</td>
                      <td className={css.valor}>
                        {os.valorExibido > 0 ? `R$ ${os.valorExibido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td>
                        <div className={`status-badge ${statusOSClasse(os.status)}`}>
                          {statusOSLabel(os.status)}
                        </div>
                      </td>
                      <td className={css.celulaTextoMenor}>
                        {(() => { const d = new Date(os.data_abertura || os.criado_em); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) })()}
                      </td>
                      <td>
                        <button 
                          className={`btn-danger ${css.btnIcone}`}
                          onClick={() => {
                            if(confirm('Tem certeza que deseja excluir esta Ordem de Serviço?')) {
                              deleteOrdemServico(os.id)
                            }
                          }}
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
            <button className={`btn-secondary ${css.btnCancelar}`} onClick={() => setActiveTab('overview')}>Cancelar</button>
          </div>

          <form onSubmit={handleSubmitOS} className={css.formulario}>
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
                  <span className={css.dicaCampo}>Escolha um cliente primeiro.</span>
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

            <div className={`alert-box ${css.alerta}`}>
              Ao abrir a Ordem de Serviço, o status do veículo correspondente será automaticamente atualizado para **"{orderStatus}"** e o serviço atual dele será atualizado reativamente na frota.
            </div>

            <div className={css.acoesForm}>
              <button type="button" className="btn-secondary" onClick={() => setActiveTab('overview')}>Cancelar</button>
              <button type="submit" className={`btn-primary ${css.btnSalvar}`}>Confirmar O.S.</button>
            </div>
          </form>
        </GlassPanel>
      )}
    </div>
  )
}
