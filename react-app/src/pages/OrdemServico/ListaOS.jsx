import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '../../components/GlassPanel'
import { Plus, Search, Filter, Eye, CheckCircle } from 'lucide-react'
import { useDatabase } from '../../hooks/useDatabase'
import { calcOSTotals, formatCurrency } from '../../utils/osFinance'

const STATUS_COLORS = {
  aberta: { color: 'var(--status-pending)', border: 'rgba(255, 179, 0, 0.2)', bg: 'rgba(255, 179, 0, 0.05)', label: 'Aberta' },
  em_andamento: { color: 'var(--status-progress)', border: 'rgba(0, 229, 255, 0.2)', bg: 'rgba(0, 229, 255, 0.05)', label: 'Em Andamento' },
  aguardando_peca: { color: '#E8590C', border: 'rgba(232, 89, 12, 0.2)', bg: 'rgba(232, 89, 12, 0.05)', label: 'Aguard. Peça' },
  concluida: { color: 'var(--status-done)', border: 'rgba(0, 255, 136, 0.2)', bg: 'rgba(0, 255, 136, 0.05)', label: 'Concluída' },
  cancelada: { color: 'var(--text-muted)', border: 'rgba(255, 255, 255, 0.1)', bg: 'rgba(255, 255, 255, 0.02)', label: 'Cancelada' },
  // Compat com dados legado
  'Pendente': { color: 'var(--status-pending)', border: 'rgba(255, 179, 0, 0.2)', bg: 'rgba(255, 179, 0, 0.05)', label: 'Aberta' },
  'Em Andamento': { color: 'var(--status-progress)', border: 'rgba(0, 229, 255, 0.2)', bg: 'rgba(0, 229, 255, 0.05)', label: 'Em Andamento' },
  'Concluído': { color: 'var(--status-done)', border: 'rgba(0, 255, 136, 0.2)', bg: 'rgba(0, 255, 136, 0.05)', label: 'Concluída' },
}

const PRIORIDADE_COLORS = {
  urgente: { color: '#ff4d4d', bg: 'rgba(255, 0, 0, 0.08)', label: 'Urgente' },
  alta: { color: '#E8590C', bg: 'rgba(232, 89, 12, 0.08)', label: 'Alta' },
  normal: { color: 'var(--electric-blue)', bg: 'rgba(0, 229, 255, 0.08)', label: 'Normal' },
  baixa: { color: 'var(--text-muted)', bg: 'rgba(255, 255, 255, 0.04)', label: 'Baixa' },
}

export function ListaOS() {
  const navigate = useNavigate()
  const { clientes, veiculos, usuarios, ordensServico, loading } = useDatabase()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos')

  const getEnrichedOS = () => {
    return ordensServico.map(os => {
      const veiculo = veiculos.find(v => v.id === os.veiculo_id || v.id === os.id_veiculo) || {}
      const cliente = clientes.find(c => c.id === os.cliente_id || c.id === veiculo.id_cliente || c.id === veiculo.cliente_id) || {}
      const responsavel = usuarios.find(u => u.id === os.id_usuario)
      let mecanico = usuarios.find(u => u.id === os.id_mecanico) || (responsavel?.perfil === 'mecanico' ? responsavel : null)
      let atendente = usuarios.find(u => u.id === os.id_atendente) || (responsavel && responsavel.perfil !== 'mecanico' ? responsavel : null)
      if (mecanico?.id && mecanico.id === atendente?.id) {
        if (mecanico.perfil === 'mecanico') atendente = null
        else mecanico = null
      }
      const totals = calcOSTotals(os)
      return {
        ...os,
        numero_os: os.numero_os || os.id?.slice(-4)?.toUpperCase() || 'N/A',
        clienteNome: cliente.nome || 'N/A',
        placa: veiculo.placa || 'N/A',
        veiculoInfo: veiculo.marca && veiculo.modelo ? `${veiculo.marca} ${veiculo.modelo}` : 'N/A',
        prioridade: os.prioridade || 'normal',
        mecanicoNome: mecanico?.nome || 'A definir',
        atendenteNome: atendente?.nome || 'A definir',
        valorServicos: os.valor_servicos ?? totals.valorServicos,
        valorPecas: os.valor_pecas ?? totals.valorPecas,
        valorTotal: os.valor_total ?? os.preco_final ?? totals.valorTotal,
      }
    })
  }

  const enriquecidas = getEnrichedOS()
  const filtradas = enriquecidas.filter(os => {
    const termo = busca.toLowerCase()
    const matchBusca = !busca ||
      String(os.numero_os).toLowerCase().includes(termo) ||
      os.clienteNome.toLowerCase().includes(termo) ||
      os.placa.toLowerCase().includes(termo) ||
      os.veiculoInfo.toLowerCase().includes(termo) ||
      os.mecanicoNome.toLowerCase().includes(termo) ||
      os.atendenteNome.toLowerCase().includes(termo)
    const matchStatus = filtroStatus === 'Todos' || os.status === filtroStatus
    return matchBusca && matchStatus
  })

  const StatusBadge = ({ status }) => {
    const cfg = STATUS_COLORS[status] || STATUS_COLORS['aberta']
    return (
      <span style={{
        padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: '600',
        color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`
      }}>
        {cfg.label}
      </span>
    )
  }

  const PrioridadeBadge = ({ prioridade }) => {
    const cfg = PRIORIDADE_COLORS[prioridade] || PRIORIDADE_COLORS['normal']
    return (
      <span style={{
        padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700',
        color: cfg.color, background: cfg.bg, textTransform: 'uppercase', letterSpacing: '0.5px'
      }}>
        {cfg.label}
      </span>
    )
  }

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Ordens de Serviço</h2>
          <p>Gerencie todas as ordens de serviço da oficina.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => navigate('/ordens-servico/nova')}
          style={{ borderRadius: 'var(--radius-sm)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={16} /> Nova O.S.
        </button>
      </section>

      <GlassPanel className="panel stagger-2">
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: 14, top: 13 }} />
            <input
              type="text"
              className="form-control"
              placeholder="Buscar por OS, cliente, placa..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={14} color="var(--text-secondary)" />
            <select
              className="form-control"
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
              style={{ width: '180px' }}
            >
              <option value="Todos">Todos os status</option>
              <option value="aberta">Aberta</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="aguardando_peca">Aguardando Peça</option>
              <option value="Pendente">Pendente</option>
              <option value="Em Andamento">Em Andamento</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
        </div>

        <div className="tech-table-container">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
              Carregando ordens de serviço...
            </div>
          ) : filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
              Nenhuma O.S. encontrada.
            </div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Nº O.S.</th>
                  <th>Cliente / Veículo</th>
                  <th>Placa</th>
                  <th>Prioridade</th>
                  <th>Equipe</th>
                  <th>Status</th>
                  <th>Valores</th>
                  <th>Data Abertura</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(os => (
                  <tr key={os.id}>
                    <td>
                      <strong style={{ color: 'var(--neon-orange)', fontFamily: 'var(--font-display)', fontSize: '15px' }}>
                        #{os.numero_os}
                      </strong>
                    </td>
                    <td>
                      <span style={{ display: 'block', fontWeight: '600' }}>{os.clienteNome}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{os.veiculoInfo}</span>
                      {os.descricao && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={os.descricao}>
                          {os.descricao}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: '600', color: 'var(--neon-orange)', letterSpacing: '1px' }}>{os.placa}</span>
                    </td>
                    <td><PrioridadeBadge prioridade={os.prioridade} /></td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'block' }}>Mec.: {os.mecanicoNome}</span>
                      <span style={{ display: 'block' }}>At.: {os.atendenteNome}</span>
                    </td>
                    <td><StatusBadge status={os.status} /></td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'block' }}>Serv.: {formatCurrency(os.valorServicos)}</span>
                      <span style={{ display: 'block' }}>Pecas: {formatCurrency(os.valorPecas)}</span>
                      <strong style={{ color: 'var(--status-done)' }}>{formatCurrency(os.valorTotal)}</strong>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {(() => { const d = new Date(os.data_abertura || os.criado_em); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn-secondary"
                          onClick={() => navigate(`/ordens-servico/${os.id}`)}
                          style={{ padding: '6px 10px', fontSize: '12px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Eye size={12} /> Ver
                        </button>
                        {(os.status !== 'concluida' && os.status !== 'cancelada' && os.status !== 'Concluído') && (
                          <button
                            className="btn-secondary"
                            onClick={() => navigate(`/ordens-servico/${os.id}/encerrar`)}
                            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-done)', borderColor: 'rgba(0, 255, 136, 0.2)' }}
                          >
                            <CheckCircle size={12} /> Encerrar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </GlassPanel>
    </div>
  )
}
