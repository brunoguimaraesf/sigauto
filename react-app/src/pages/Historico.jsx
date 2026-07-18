import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { Search, X, FileText } from 'lucide-react'
import { useDatabase } from '../hooks/useDatabase'

export function Historico() {
  const { clientes, veiculos, ordensServico, loading } = useDatabase()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [detalheModal, setDetalheModal] = useState(null)

  const getEnriched = () => {
    return ordensServico.map(os => {
      const veiculo = veiculos.find(v => v.id === (os.veiculo_id || os.id_veiculo)) || {}
      const cliente = clientes.find(c => c.id === (os.cliente_id || veiculo.cliente_id || veiculo.id_cliente)) || {}
      return { ...os, clienteNome: cliente.nome || 'N/A', placa: veiculo.placa || 'N/A', veiculoInfo: veiculo.marca ? `${veiculo.marca} ${veiculo.modelo}` : 'N/A', cliente, veiculo }
    })
  }

  const STATUS_MAP = {
    concluida: 'Concluída', 'Concluído': 'Concluída',
    cancelada: 'Cancelada',
    aberta: 'Aberta', 'Pendente': 'Aberta',
    em_andamento: 'Em And.', 'Em Andamento': 'Em And.',
    aguardando_peca: 'Aguard. Peça'
  }

  const STATUS_COLORS = {
    concluida: 'var(--status-done)', 'Concluído': 'var(--status-done)',
    cancelada: 'var(--text-muted)',
    aberta: 'var(--status-pending)', 'Pendente': 'var(--status-pending)',
    em_andamento: 'var(--status-progress)', 'Em Andamento': 'var(--status-progress)',
    aguardando_peca: 'var(--neon-orange)'
  }

  const todos = getEnriched()
  const filtrados = todos.filter(os => {
    const termo = busca.toLowerCase()
    const matchBusca = !busca || os.clienteNome.toLowerCase().includes(termo) || os.placa.toLowerCase().includes(termo) || String(os.numero_os || '').includes(termo)
    const matchStatus = filtroStatus === 'Todos' || os.status === filtroStatus
    const dt = new Date(os.data_abertura || os.criado_em)
    const matchInicio = !dataInicio || dt >= new Date(dataInicio)
    const matchFim = !dataFim || dt <= new Date(dataFim + 'T23:59:59')
    return matchBusca && matchStatus && matchInicio && matchFim
  }).sort((a, b) => new Date(b.data_abertura || b.criado_em) - new Date(a.data_abertura || a.criado_em))

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Histórico de Serviços</h2>
          <p>Consulte o histórico completo de ordens de serviço da oficina.</p>
        </div>
      </section>

      <GlassPanel className="panel stagger-2">
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: 14, top: 13 }} />
            <input type="text" className="form-control" placeholder="Buscar cliente, placa, nº OS..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: '40px' }} />
          </div>
          <select className="form-control" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ width: '160px' }}>
            <option value="Todos">Todos</option>
            <option value="concluida">Concluída</option>
            <option value="Concluído">Concluída (leg.)</option>
            <option value="cancelada">Cancelada</option>
            <option value="aberta">Aberta</option>
            <option value="em_andamento">Em Andamento</option>
          </select>
          <input type="date" className="form-control" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={{ width: '160px' }} title="Data início" />
          <input type="date" className="form-control" value={dataFim} onChange={e => setDataFim(e.target.value)} style={{ width: '160px' }} title="Data fim" />
        </div>

        <div className="tech-table-container">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Carregando histórico...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Nenhuma O.S. encontrada com os filtros aplicados.</div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Nº O.S.</th>
                  <th>Cliente / Veículo</th>
                  <th>Placa</th>
                  <th>Status</th>
                  <th>Abertura</th>
                  <th>Encerramento</th>
                  <th>Valor</th>
                  <th>Ver</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(os => (
                  <tr key={os.id}>
                    <td>
                      <strong style={{ color: 'var(--neon-orange)', fontFamily: 'var(--font-display)' }}>
                        #{os.numero_os || os.id?.slice(-4)?.toUpperCase()}
                      </strong>
                    </td>
                    <td>
                      <span style={{ display: 'block', fontWeight: '600' }}>{os.clienteNome}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{os.veiculoInfo}</span>
                    </td>
                    <td><span style={{ fontWeight: '600', color: 'var(--neon-orange)', letterSpacing: '1px' }}>{os.placa}</span></td>
                    <td>
                      <span style={{
                        padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: '600',
                        color: STATUS_COLORS[os.status] || 'var(--text-secondary)',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'
                      }}>
                        {STATUS_MAP[os.status] || os.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {(() => { const d = new Date(os.data_abertura || os.criado_em); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') })()}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {os.data_encerramento ? new Date(os.data_encerramento).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-display)', fontWeight: '600', color: 'var(--neon-orange)' }}>
                      {os.valor_total || os.preco_final ? `R$ ${Number(os.valor_total || os.preco_final).toLocaleString('pt-BR')}` : '—'}
                    </td>
                    <td>
                      <button
                        className="btn-secondary"
                        onClick={() => setDetalheModal(os)}
                        style={{ padding: '6px 10px', fontSize: '12px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FileText size={12} /> Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </GlassPanel>

      {/* Modal de detalhes */}
      {detalheModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>O.S. #{detalheModal.numero_os || detalheModal.id?.slice(-4)?.toUpperCase()} — Detalhes</h3>
              <button onClick={() => setDetalheModal(null)} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {[
                  ['Veículo', `${detalheModal.veiculo?.marca || ''} ${detalheModal.veiculo?.modelo || ''}`],
                  ['Placa', detalheModal.placa],
                  ['Cliente', detalheModal.clienteNome],
                  ['Status', STATUS_MAP[detalheModal.status] || detalheModal.status],
                  ['Prioridade', detalheModal.prioridade || 'normal'],
                  ['Forma Pagamento', detalheModal.forma_pagamento || '—'],
                  ['Abertura', (() => { const d = new Date(detalheModal.data_abertura || detalheModal.criado_em); return isNaN(d) ? '—' : d.toLocaleString('pt-BR') })()],
                  ['Encerramento', detalheModal.data_encerramento ? new Date(detalheModal.data_encerramento).toLocaleString('pt-BR') : '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{k}</div>
                    <div style={{ fontWeight: '600', fontSize: '13px' }}>{v}</div>
                  </div>
                ))}
              </div>
              {detalheModal.descricao && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Queixa do Cliente</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5' }}>{detalheModal.descricao}</div>
                </div>
              )}
              {detalheModal.diagnostico && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--electric-blue)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Diagnóstico Técnico</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5' }}>{detalheModal.diagnostico}</div>
                </div>
              )}
              {(detalheModal.valor_total || detalheModal.preco_final) > 0 && (
                <div style={{ padding: '16px', background: 'rgba(255, 77, 0, 0.05)', border: '1px solid rgba(255, 77, 0, 0.15)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Valor Total</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: '600', color: 'var(--neon-orange)' }}>
                    R$ {Number(detalheModal.valor_total || detalheModal.preco_final).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setDetalheModal(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
