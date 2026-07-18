import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Plus, Search, Trash2, Edit2, CarFront, X } from 'lucide-react'

const normalizarPlaca = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')

const formatarPlaca = (value) => {
  const raw = normalizarPlaca(value)
  if (/^[A-Z]{3}[0-9]{4}$/.test(raw)) return `${raw.slice(0, 3)}-${raw.slice(3)}`
  return raw
}

export function Veiculos() {
  const { clientes, veiculos, loading, addVeiculo, updateVeiculo, deleteVeiculo } = useDatabase()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [placa, setPlaca] = useState('')
  const [ano, setAno] = useState('')
  const [cor, setCor] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [status, setStatus] = useState('Pendente')
  const [servicoAtual, setServicoAtual] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [searchFilter, setSearchFilter] = useState('')

  const resetForm = () => {
    setMarca('')
    setModelo('')
    setPlaca('')
    setAno('')
    setCor('')
    setClienteId('')
    setStatus('Pendente')
    setServicoAtual('')
    setObservacoes('')
  }

  const handleOpenAdd = () => {
    setEditingId(null)
    resetForm()
    setModalOpen(true)
  }

  const handleOpenEdit = (v) => {
    setEditingId(v.id)
    setMarca(v.marca || '')
    setModelo(v.modelo || '')
    setPlaca(v.placa || '')
    setAno(v.ano || '')
    setCor(v.cor || '')
    setClienteId(v.cliente_id || v.id_cliente || '')
    setStatus(v.status || 'Pendente')
    setServicoAtual(v.servico_atual || '')
    setObservacoes(v.observacoes || '')
    setModalOpen(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!clienteId) {
      alert('Associe um proprietario ao veiculo.')
      return
    }

    const placaNormalizada = normalizarPlaca(placa)
    if (placaNormalizada.length !== 7) {
      alert('Informe uma placa valida com 7 caracteres.')
      return
    }

    const duplicado = veiculos.find(v =>
      v.id !== editingId &&
      normalizarPlaca(v.placa || '') === placaNormalizada
    )
    if (duplicado) {
      const clienteDuplicado = clientes.find(c => c.id === (duplicado.cliente_id || duplicado.id_cliente))
      alert(`Esta placa ja esta cadastrada para ${clienteDuplicado?.nome || 'outro cliente'}.`)
      return
    }

    const payload = {
      marca,
      modelo,
      placa: formatarPlaca(placa),
      ano,
      cor,
      cliente_id: clienteId,
      id_cliente: clienteId,
      status,
      servico_atual: servicoAtual,
      observacoes,
      ativo: true,
    }

    if (editingId) updateVeiculo(editingId, payload)
    else addVeiculo(payload)

    setModalOpen(false)
  }

  const filteredVeiculos = veiculos.filter(v => {
    const term = searchFilter.toLowerCase()
    const client = clientes.find(c => c.id === (v.cliente_id || v.id_cliente)) || { nome: '' }
    return (
      v.marca?.toLowerCase().includes(term) ||
      v.modelo?.toLowerCase().includes(term) ||
      v.placa?.toLowerCase().includes(term) ||
      v.observacoes?.toLowerCase().includes(term) ||
      client.nome.toLowerCase().includes(term)
    )
  })

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Garagem & Frota</h2>
          <p>Gerenciamento completo dos veiculos cadastrados no sistema.</p>
        </div>
        <button className="btn-primary" onClick={handleOpenAdd} style={{ borderRadius: 'var(--radius-sm)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Adicionar Veiculo
        </button>
      </section>

      <GlassPanel className="panel stagger-2">
        <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '16px', marginBottom: '24px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Buscar veiculo por modelo, marca, placa, proprietario ou observacao..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
            <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: 16, top: 13 }} />
          </div>
        </div>

        <div className="tech-table-container">
          {loading ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>Buscando veiculos...</div>
          ) : filteredVeiculos.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>Nenhum veiculo encontrado.</div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Modelo / Marca</th>
                  <th>Placa / Ano / Cor</th>
                  <th>Proprietario</th>
                  <th>Servico Atual</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredVeiculos.map((v) => {
                  const client = clientes.find(c => c.id === (v.cliente_id || v.id_cliente)) || { nome: 'Desconhecido' }
                  return (
                    <tr key={v.id}>
                      <td style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'rgba(255, 77, 0, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--neon-orange)' }}>
                          <CarFront size={18} />
                        </div>
                        <div>
                          <strong style={{ fontSize: '15px' }}>{v.marca} {v.modelo}</strong>
                          {v.observacoes && (
                            <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                              {v.observacoes}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ color: 'var(--neon-orange)', fontWeight: '600', fontSize: '13px', display: 'block' }}>{v.placa}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{v.ano} - {v.cor}</span>
                      </td>
                      <td>{client.nome}</td>
                      <td>{v.servico_atual || <span style={{ color: 'var(--text-muted)' }}>Nenhum ativo</span>}</td>
                      <td>
                        <span className={`status-badge ${v.status === 'Concluido' || v.status === 'ConcluÃ­do' ? 'status-done' : v.status === 'Em Andamento' ? 'status-progress' : 'status-pending'}`}>
                          {v.status || 'Pendente'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn-secondary" onClick={() => handleOpenEdit(v)} style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Edit2 size={12} /> Editar
                          </button>
                          <button className="btn-danger" onClick={() => confirm(`Excluir ${v.marca} ${v.modelo} (${v.placa})?`) && deleteVeiculo(v.id)} style={{ padding: '6px' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </GlassPanel>

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingId ? 'Editar Veiculo' : 'Cadastrar Novo Veiculo'}</h3>
              <button onClick={() => setModalOpen(false)} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Proprietario</label>
                  <select className="form-control" value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
                    <option value="">Selecione o cliente...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.telefone})</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Placa do veiculo</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex: ABC1D23 ou ABC-1234"
                    value={placa}
                    onChange={(e) => setPlaca(formatarPlaca(e.target.value))}
                    maxLength={8}
                    style={{ letterSpacing: '2px', fontWeight: 'bold', fontSize: '16px', textTransform: 'uppercase' }}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group"><label>Marca</label><input className="form-control" value={marca} onChange={(e) => setMarca(e.target.value)} required /></div>
                  <div className="form-group"><label>Modelo</label><input className="form-control" value={modelo} onChange={(e) => setModelo(e.target.value)} required /></div>
                </div>

                <div className="form-row">
                  <div className="form-group"><label>Ano</label><input className="form-control" value={ano} onChange={(e) => setAno(e.target.value)} required /></div>
                  <div className="form-group"><label>Cor</label><input className="form-control" value={cor} onChange={(e) => setCor(e.target.value)} required /></div>
                </div>

                {editingId && (
                  <div className="form-row">
                    <div className="form-group"><label>Servico atual</label><input className="form-control" value={servicoAtual} onChange={(e) => setServicoAtual(e.target.value)} /></div>
                    <div className="form-group">
                      <label>Status operacional</label>
                      <select className="form-control" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="Pendente">Pendente</option>
                        <option value="Em Andamento">Em Andamento</option>
                        <option value="Concluido">Concluido</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Observacao</label>
                  <textarea
                    className="form-control"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Detalhes relevantes sobre o veiculo, historico ou preferencias do proprietario"
                    rows={3}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editingId ? 'Salvar Alteracoes' : 'Adicionar Veiculo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
