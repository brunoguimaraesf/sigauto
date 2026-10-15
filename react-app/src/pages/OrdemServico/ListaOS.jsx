import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '../../components/GlassPanel'
import { Plus, Search, Filter, Eye, CheckCircle } from 'lucide-react'
import { useDatabase } from '../../hooks/useDatabase'
import { calcOSTotals, formatCurrency, resolveEquipe } from '../../utils/osFinance'
import css from './ListaOS.module.css'

const STATUS_COLORS = {
  aberta: { color: 'var(--status-pending)', border: 'var(--color-warning-border)', bg: 'var(--color-warning-border)', label: 'Aberta' },
  em_andamento: { color: 'var(--status-progress)', border: 'var(--color-primary-border)', bg: 'var(--color-primary-border)', label: 'Em Andamento' },
  aguardando_peca: { color: 'var(--color-primary)', border: 'var(--color-primary-border)', bg: 'var(--color-primary-border)', label: 'Aguard. Peça' },
  concluida: { color: 'var(--status-done)', border: 'var(--color-success-border)', bg: 'var(--color-success-border)', label: 'Concluída' },
  cancelada: { color: 'var(--text-muted)', border: 'var(--border-color)', bg: 'var(--text-secondary)', label: 'Cancelada' },
  // Compat com dados legado
  'Pendente': { color: 'var(--status-pending)', border: 'var(--color-warning-border)', bg: 'var(--color-warning-border)', label: 'Aberta' },
  'Em Andamento': { color: 'var(--status-progress)', border: 'var(--color-primary-border)', bg: 'var(--color-primary-border)', label: 'Em Andamento' },
  'Concluído': { color: 'var(--status-done)', border: 'var(--color-success-border)', bg: 'var(--color-success-border)', label: 'Concluída' },
}

const PRIORIDADE_COLORS = {
  urgente: { color: 'var(--color-danger)', bg: 'var(--color-danger-tint)', label: 'Urgente' },
  alta: { color: 'var(--color-warning)', bg: 'var(--color-warning-tint)', label: 'Alta' },
  normal: { color: 'var(--color-primary)', bg: 'var(--color-primary-tint)', label: 'Normal' },
  baixa: { color: 'var(--text-muted)', bg: 'var(--bg-subtle)', label: 'Baixa' },
}

export function ListaOS() {
  const navigate = useNavigate()
  const { clientes, veiculos, funcionarios, ordensServico, loading } = useDatabase()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos')

  const getEnrichedOS = () => {
    return ordensServico.map(os => {
      const veiculo = veiculos.find(v => v.id === os.veiculo_id || v.id === os.id_veiculo) || {}
      const cliente = clientes.find(c => c.id === os.cliente_id || c.id === veiculo.id_cliente || c.id === veiculo.cliente_id) || {}
      const { mecanico, atendente } = resolveEquipe(os, funcionarios)
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
      <span className={css.badgeStatus} style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
        {cfg.label}
      </span>
    )
  }

  const PrioridadeBadge = ({ prioridade }) => {
    const cfg = PRIORIDADE_COLORS[prioridade] || PRIORIDADE_COLORS['normal']
    return (
      <span className={css.badgePrioridade} style={{ color: cfg.color, background: cfg.bg }}>
        {cfg.label}
      </span>
    )
  }

  return (
    <div className="dashboard-grid">
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Ordens de Serviço</h2>
          <p>Gerencie todas as ordens de serviço da oficina.</p>
        </div>
        <button
          className={`btn-primary ${css.btnNovo}`}
          onClick={() => navigate('/ordens-servico/nova')}
        >
          <Plus size={16} /> Nova O.S.
        </button>
      </section>

      <GlassPanel className="panel stagger-2">
        <div className={css.filtros}>
          <div className={css.busca}>
            <Search size={16} color="var(--text-secondary)" className={css.buscaIcone} />
            <input
              type="text"
              className={`form-control ${css.buscaInput}`}
              placeholder="Buscar por OS, cliente, placa..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <div className={css.filtroStatus}>
            <Filter size={14} color="var(--text-secondary)" />
            <select
              className={`form-control ${css.selectStatus}`}
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
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
            <div className={css.vazio}>
              Carregando ordens de serviço...
            </div>
          ) : filtradas.length === 0 ? (
            <div className={css.vazio}>
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
                      <strong className={css.numero}>
                        #{os.numero_os}
                      </strong>
                    </td>
                    <td>
                      <span className={css.cliente}>{os.clienteNome}</span>
                      <span className={css.veiculo}>{os.veiculoInfo}</span>
                      {os.descricao && (
                        <span className={css.descricao} title={os.descricao}>
                          {os.descricao}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={css.placa}>{os.placa}</span>
                    </td>
                    <td><PrioridadeBadge prioridade={os.prioridade} /></td>
                    <td className={css.celulaTextoMenor}>
                      <span className={css.linha}>Mec.: {os.mecanicoNome}</span>
                      <span className={css.linha}>At.: {os.atendenteNome}</span>
                    </td>
                    <td><StatusBadge status={os.status} /></td>
                    <td className={css.celulaTextoMenor}>
                      <span className={css.linha}>Serv.: {formatCurrency(os.valorServicos)}</span>
                      <span className={css.linha}>Pecas: {formatCurrency(os.valorPecas)}</span>
                      <strong className={css.total}>{formatCurrency(os.valorTotal)}</strong>
                    </td>
                    <td className={css.celulaTextoMenor}>
                      {(() => { const d = new Date(os.data_abertura || os.criado_em); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) })()}
                    </td>
                    <td>
                      <div className={css.acoes}>
                        <button
                          className={`btn-secondary ${css.btnAcao}`}
                          onClick={() => navigate(`/ordens-servico/${os.id}`)}
                        >
                          <Eye size={12} /> Ver
                        </button>
                        {(os.status !== 'concluida' && os.status !== 'cancelada' && os.status !== 'Concluído') && (
                          <button
                            className={`btn-secondary ${css.btnEncerrar}`}
                            onClick={() => navigate(`/ordens-servico/${os.id}/encerrar`)}
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
