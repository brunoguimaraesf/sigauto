import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Plus, Search, Trash2, Edit2, Wrench, X } from 'lucide-react'

export function Servicos() {
  const {
    servicos,
    loading,
    addServico,
    updateServico,
    deleteServico
  } = useDatabase()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)

  // Estados dos inputs do formulário
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [preco, setPreco] = useState('')

  // Filtro de busca
  const [searchFilter, setSearchFilter] = useState('')

  // Modal para criar
  const handleOpenAdd = () => {
    setEditingId(null)
    setNome('')
    setDescricao('')
    setPreco('')
    setModalOpen(true)
  }

  // Modal para editar
  const handleOpenEdit = (s) => {
    setEditingId(s.id)
    setNome(s.nome || '')
    setDescricao(s.descricao || '')
    setPreco(s.preco || '')
    setModalOpen(true)
  }

  // Submissão do formulário (Criar/Editar)
  const handleSubmit = (e) => {
    e.preventDefault()

    const payload = {
      nome,
      descricao,
      preco: Number(preco)
    }

    if (editingId) {
      updateServico(editingId, payload)
    } else {
      addServico(payload)
    }

    setModalOpen(false)
  }

  // Filtro reativo por nome ou descrição
  const filteredServicos = servicos.filter(s => {
    const term = searchFilter.toLowerCase()
    return s.nome.toLowerCase().includes(term) || 
           s.descricao.toLowerCase().includes(term)
  })

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Catálogo de Serviços</h2>
          <p>Gerencie a tabela de preços e os pacotes de serviços da sua oficina.</p>
        </div>
        <button className="btn-primary" onClick={handleOpenAdd} style={{ borderRadius: 'var(--radius-sm)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Novo Serviço
        </button>
      </section>

      <GlassPanel className="panel stagger-2">
        <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '16px', marginBottom: '24px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Buscar serviço por nome ou descrição técnica..." 
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
            <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: 16, top: 13 }} />
          </div>
        </div>

        <div className="tech-table-container">
          {loading ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>
              Carregando catálogo de serviços...
            </div>
          ) : filteredServicos.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>
              Nenhum serviço catalogado ou correspondente encontrado.
            </div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Serviço / Pacote</th>
                  <th>Descrição Técnica</th>
                  <th>Preço Base (R$)</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredServicos.map((s) => (
                  <tr key={s.id}>
                    <td style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'rgba(255, 77, 0, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--neon-orange)' }}>
                        <Wrench size={18} />
                      </div>
                      <div>
                        <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{s.nome}</strong>
                      </div>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: '1.4' }}>
                      {s.descricao}
                    </td>
                    <td style={{ fontFamily: 'var(--font-display)', fontWeight: '600', fontSize: '16px', color: 'var(--neon-orange)' }}>
                      R$ {s.preco.toLocaleString('pt-BR')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn-secondary" 
                          onClick={() => handleOpenEdit(s)}
                          style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Edit2 size={12} /> Editar
                        </button>
                        <button 
                          className="btn-danger" 
                          onClick={() => {
                            if (confirm(`Tem certeza que deseja remover o serviço ${s.nome} do catálogo?`)) {
                              deleteServico(s.id)
                            }
                          }}
                          style={{ padding: '6px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </GlassPanel>

      {/* --- MODAL DE CRIAÇÃO/EDIÇÃO --- */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingId ? 'Editar Detalhes do Serviço' : 'Cadastrar Novo Serviço no Catálogo'}</h3>
              <button onClick={() => setModalOpen(false)} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Nome do Serviço / Pacote</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Ex: Alinhamento 3D Laser" 
                      value={nome} 
                      onChange={(e) => setNome(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group" style={{ maxWidth: '200px' }}>
                    <label>Preço Base (R$)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      placeholder="Ex: 450" 
                      value={preco} 
                      onChange={(e) => setPreco(e.target.value)} 
                      required 
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Descrição Detalhada do Serviço</label>
                  <textarea 
                    className="form-control" 
                    placeholder="Descrição sobre o que está incluído no pacote, tempo estimado ou indicações..." 
                    value={descricao} 
                    onChange={(e) => setDescricao(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editingId ? 'Salvar Alterações' : 'Adicionar ao Catálogo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
