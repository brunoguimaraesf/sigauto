import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Plus, Search, UserX, Edit2, CarFront, X } from 'lucide-react'
import { normalizarPlaca, formatarPlaca, placaValida } from '../utils/placa'
import css from './Veiculos.module.css'

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
      alert('Associe um proprietário ao veículo.')
      return
    }
    const clienteSelecionado = clientes.find(cliente => cliente.id === clienteId)
    if (!clienteSelecionado || clienteSelecionado.ativo === false) {
      alert('Selecione um proprietário ativo para o veículo.')
      return
    }

    const placaNormalizada = normalizarPlaca(placa)
    if (!placaValida(placa)) {
      alert('Placa inválida. Use o formato Mercosul (ABC1D23) ou antigo (ABC-1234).')
      return
    }

    const duplicado = veiculos.find(v =>
      v.id !== editingId &&
      normalizarPlaca(v.placa || '') === placaNormalizada
    )
    if (duplicado) {
      const clienteDuplicado = clientes.find(c => c.id === (duplicado.cliente_id || duplicado.id_cliente))
      alert(`Esta placa já está cadastrada para ${clienteDuplicado?.nome || 'outro cliente'}.`)
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
    else addVeiculo(payload).catch(err => alert(`Erro ao salvar veículo: ${err?.message || 'tente novamente.'}`))

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
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Veículos</h2>
          <p>Gerenciamento completo dos veículos cadastrados no sistema.</p>
        </div>
        <button className={`btn-primary ${css.btnNovo}`} onClick={handleOpenAdd}>
          <Plus size={16} /> Novo Veículo
        </button>
      </section>

      <GlassPanel className="panel stagger-2">
        <div className={`panel-header ${css.panelHeader}`}>
          <div className={css.busca}>
            <input
              type="text"
              className={`form-control ${css.buscaInput}`}
              placeholder="Buscar veículo por modelo, marca, placa, proprietário ou observação..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
            <Search size={18} color="var(--text-secondary)" className={css.buscaIcone} />
          </div>
        </div>

        <div className="tech-table-container">
          {loading ? (
            <div className={css.aviso}>Buscando veículos...</div>
          ) : filteredVeiculos.length === 0 ? (
            <div className={css.aviso}>Nenhum veículo encontrado.</div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Modelo / Marca</th>
                  <th>Placa / Ano / Cor</th>
                  <th>Proprietário</th>
                  <th>Serviço Atual</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredVeiculos.map((v) => {
                  const client = clientes.find(c => c.id === (v.cliente_id || v.id_cliente)) || { nome: 'Desconhecido' }
                  return (
                    <tr key={v.id}>
                      <td data-label="Veículo">
                        <div className={css.celulaNome}>
                          <div className={css.icone}>
                            <CarFront size={18} />
                          </div>
                          <div>
                            <strong className={css.nome}>{v.marca} {v.modelo}</strong>
                            {v.observacoes && (
                              <span className={css.observacao}>
                                {v.observacoes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td data-label="Placa">
                        <span className={css.placa}>{v.placa}</span>
                        <span className={css.anoCor}>{v.ano} - {v.cor}</span>
                      </td>
                      <td data-label="Proprietário">{client.nome}</td>
                      <td data-label="Serviço atual">{v.servico_atual || <span className={css.semServico}>Nenhum ativo</span>}</td>
                      <td data-label="Status">
                        <span className={`status-badge ${v.status === 'Concluido' || v.status === 'Concluído' ? 'status-done' : v.status === 'Em Andamento' ? 'status-progress' : 'status-pending'}`}>
                          {v.status || 'Pendente'}
                        </span>
                      </td>
                      <td>
                        <div className={css.acoes}>
                          <button className={`btn-secondary ${css.btnAcao}`} onClick={() => handleOpenEdit(v)}>
                            <Edit2 size={12} /> Editar
                          </button>
                          <button
                            type="button"
                            className={`btn-danger ${css.btnIcone}`}
                            aria-label={`Inativar veículo ${v.marca} ${v.modelo} (${v.placa})`}
                            title="Inativar veículo"
                            onClick={() => confirm(`Inativar ${v.marca} ${v.modelo} (${v.placa})?`) && deleteVeiculo(v.id).catch(err => alert(`Não foi possível inativar o veículo: ${err?.message || 'erro desconhecido'}`))}
                          >
                            <UserX size={14} />
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
              <h3>{editingId ? 'Editar Veículo' : 'Cadastrar Novo Veículo'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className={css.btnFechar} aria-label="Fechar formulário de veículo" title="Fechar formulário"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <p className={css.legendaObrigatorios}>* Campos obrigatórios</p>
                <div className="form-group">
                  <label htmlFor="veiculo-proprietario">Proprietário *</label>
                  <select id="veiculo-proprietario" className="form-control" value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
                    <option value="">Selecione o cliente...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.telefone})</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="veiculo-placa">Placa do veículo *</label>
                  <input
                    id="veiculo-placa"
                    type="text"
                    className={`form-control ${css.campoPlaca}`}
                    placeholder="Ex: ABC1D23 ou ABC-1234"
                    value={placa}
                    onChange={(e) => setPlaca(formatarPlaca(e.target.value))}
                    maxLength={8}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group"><label htmlFor="veiculo-marca">Marca *</label><input id="veiculo-marca" className="form-control" value={marca} onChange={(e) => setMarca(e.target.value)} required /></div>
                  <div className="form-group"><label htmlFor="veiculo-modelo">Modelo *</label><input id="veiculo-modelo" className="form-control" value={modelo} onChange={(e) => setModelo(e.target.value)} required /></div>
                </div>

                <div className="form-row">
                  <div className="form-group"><label htmlFor="veiculo-ano">Ano *</label><input id="veiculo-ano" className="form-control" value={ano} onChange={(e) => setAno(e.target.value)} required /></div>
                  <div className="form-group"><label htmlFor="veiculo-cor">Cor *</label><input id="veiculo-cor" className="form-control" value={cor} onChange={(e) => setCor(e.target.value)} required /></div>
                </div>

                {editingId && (
                  <div className="form-row">
                    <div className="form-group"><label>Serviço atual</label><input className="form-control" value={servicoAtual} onChange={(e) => setServicoAtual(e.target.value)} /></div>
                    <div className="form-group">
                      <label>Status operacional</label>
                      <select className="form-control" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="Pendente">Pendente</option>
                        <option value="Em Andamento">Em Andamento</option>
                        <option value="Concluido">Concluído</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Observação</label>
                  <textarea
                    className="form-control"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Detalhes relevantes sobre o veículo, histórico ou preferências do proprietário"
                    rows={3}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editingId ? 'Salvar Alterações' : 'Cadastrar Veículo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
