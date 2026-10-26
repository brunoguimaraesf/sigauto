import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import css from './Servicos.module.css'
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

    // RN45: `required` do HTML aceita nome so com espacos; o banco tambem recusa.
    const nomeLimpo = nome.trim()
    const precoNumero = Number(String(preco).replace(',', '.'))
    if (!nomeLimpo) {
      alert('Informe o nome do serviço.')
      return
    }
    if (String(preco).trim() === '' || !Number.isFinite(precoNumero) || precoNumero < 0) {
      alert('Informe um preço base válido, igual ou maior que zero.')
      return
    }

    const payload = {
      nome: nomeLimpo,
      descricao,
      preco: precoNumero
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
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Catálogo de Serviços</h2>
          <p>Gerencie a tabela de preços e os pacotes de serviços da sua oficina.</p>
        </div>
        <button className={`btn-primary ${css.btnNovo}`} onClick={handleOpenAdd}>
          <Plus size={16} /> Novo Serviço
        </button>
      </section>

      <GlassPanel className="panel stagger-2">
        <div className={`panel-header ${css.panelHeader}`}>
          <div className={css.busca}>
            <input 
              type="text" 
              className={`form-control ${css.buscaInput}`}
              placeholder="Buscar serviço por nome ou descrição técnica..." 
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
            <Search size={18} color="var(--text-secondary)" className={css.buscaIcone} />
          </div>
        </div>

        <div className="tech-table-container">
          {loading ? (
            <div className={css.aviso}>
              Carregando catálogo de serviços...
            </div>
          ) : filteredServicos.length === 0 ? (
            <div className={css.aviso}>
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
                    <td data-label="Serviço">
                      <div className={css.celulaNome}>
                        <div className={css.icone}>
                          <Wrench size={18} />
                        </div>
                        <div>
                          <strong className={css.nome}>{s.nome}</strong>
                        </div>
                      </div>
                    </td>
                    <td data-label="Descrição" className={css.descricao}>
                      {s.descricao}
                    </td>
                    <td data-label="Preço base" className={css.preco}>
                      R$ {s.preco.toLocaleString('pt-BR')}
                    </td>
                    <td>
                      <div className={css.acoes}>
                        <button 
                          className={`btn-secondary ${css.btnAcao}`}
                          onClick={() => handleOpenEdit(s)}
                        >
                          <Edit2 size={12} /> Editar
                        </button>
                        <button 
                          className={`btn-danger ${css.btnIcone}`}
                          onClick={() => {
                            if (confirm(`Tem certeza que deseja remover o serviço ${s.nome} do catálogo?`)) {
                              deleteServico(s.id)
                            }
                          }}
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
              <button onClick={() => setModalOpen(false)} className={css.btnFechar}><X size={20} /></button>
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
                  <div className={`form-group ${css.campoCurto}`}>
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
