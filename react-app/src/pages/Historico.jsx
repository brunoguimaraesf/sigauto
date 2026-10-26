import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { Search, X, FileText } from 'lucide-react'
import { useDatabase } from '../hooks/useDatabase'
import { dentroDoPeriodo } from '../utils/periodo'
import css from './Historico.module.css'

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
    aguardando_peca: 'var(--color-warning)'
  }

  const todos = getEnriched()
  const filtrados = todos.filter(os => {
    const termo = busca.toLowerCase()
    const matchBusca = !busca || os.clienteNome.toLowerCase().includes(termo) || os.placa.toLowerCase().includes(termo) || String(os.numero_os || '').includes(termo)
    const matchStatus = filtroStatus === 'Todos' || os.status === filtroStatus
    // RN24: limites inclusivos no dia civil local (ver utils/periodo).
    const matchPeriodo = dentroDoPeriodo(os.data_abertura || os.criado_em, dataInicio, dataFim)
    return matchBusca && matchStatus && matchPeriodo
  }).sort((a, b) => new Date(b.data_abertura || b.criado_em) - new Date(a.data_abertura || a.criado_em))

  return (
    <div className="dashboard-grid">
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Histórico de Serviços</h2>
          <p>Consulte o histórico completo de ordens de serviço da oficina.</p>
        </div>
      </section>

      <GlassPanel className="panel stagger-2">
        <div className={css.filtros}>
          <div className={css.busca}>
            <Search size={16} color="var(--text-secondary)" className={css.buscaIcone} />
            <input type="text" className={`form-control ${css.buscaInput}`} placeholder="Buscar cliente, placa, nº OS..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <select className={`form-control ${css.campoFiltro}`} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="Todos">Todos</option>
            <option value="concluida">Concluída</option>
            <option value="Concluído">Concluída (leg.)</option>
            <option value="cancelada">Cancelada</option>
            <option value="aberta">Aberta</option>
            <option value="em_andamento">Em Andamento</option>
          </select>
          <input type="date" className={`form-control ${css.campoFiltro}`} value={dataInicio} onChange={e => setDataInicio(e.target.value)} title="Data início" />
          <input type="date" className={`form-control ${css.campoFiltro}`} value={dataFim} onChange={e => setDataFim(e.target.value)} title="Data fim" />
        </div>

        <div className="tech-table-container">
          {loading ? (
            <div className={css.vazio}>Carregando histórico...</div>
          ) : filtrados.length === 0 ? (
            <div className={css.vazio}>Nenhuma O.S. encontrada com os filtros aplicados.</div>
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
                    <td data-label="Nº O.S.">
                      <strong className={css.numero}>
                        #{os.numero_os || os.id?.slice(-4)?.toUpperCase()}
                      </strong>
                    </td>
                    <td data-label="Cliente / veículo">
                      <span className={css.cliente}>{os.clienteNome}</span>
                      <span className={css.veiculo}>{os.veiculoInfo}</span>
                    </td>
                    <td data-label="Placa"><span className={css.placa}>{os.placa}</span></td>
                    <td data-label="Status">
                      <span className={css.badgeStatus} style={{ color: STATUS_COLORS[os.status] || 'var(--text-secondary)' }}>
                        {STATUS_MAP[os.status] || os.status}
                      </span>
                    </td>
                    <td data-label="Abertura" className={css.celulaTextoMenor}>
                      {(() => { const d = new Date(os.data_abertura || os.criado_em); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') })()}
                    </td>
                    <td data-label="Encerramento" className={css.celulaTextoMenor}>
                      {os.data_encerramento ? new Date(os.data_encerramento).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td data-label="Valor" className={css.valor}>
                      {os.valor_total || os.preco_final ? `R$ ${Number(os.valor_total || os.preco_final).toLocaleString('pt-BR')}` : '—'}
                    </td>
                    <td>
                      <button
                        className={`btn-secondary ${css.btnDetalhes}`}
                        onClick={() => setDetalheModal(os)}
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
          <div className={`modal-content ${css.modal}`}>
            <div className="modal-header">
              <h3>O.S. #{detalheModal.numero_os || detalheModal.id?.slice(-4)?.toUpperCase()} — Detalhes</h3>
              <button onClick={() => setDetalheModal(null)} className={css.btnFechar}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className={css.grade}>
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
                  <div key={k} className={css.dado}>
                    <div className={css.rotulo}>{k}</div>
                    <div className={css.dadoValor}>{v}</div>
                  </div>
                ))}
              </div>
              {detalheModal.descricao && (
                <div className={css.bloco}>
                  <div className={css.blocoRotulo}>Queixa do Cliente</div>
                  <div className={css.blocoTexto}>{detalheModal.descricao}</div>
                </div>
              )}
              {detalheModal.diagnostico && (
                <div className={css.bloco}>
                  <div className={css.blocoRotuloTecnico}>Diagnóstico Técnico</div>
                  <div className={css.blocoTexto}>{detalheModal.diagnostico}</div>
                </div>
              )}
              {(detalheModal.valor_total || detalheModal.preco_final) > 0 && (
                <div className={css.totalBox}>
                  <div className={css.rotulo}>Valor Total</div>
                  <div className={css.totalValor}>
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
