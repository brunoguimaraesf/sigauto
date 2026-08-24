import { useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { Plus, Edit2, UserX, X, Shield, User, Wrench, Search, Percent } from 'lucide-react'
import { useDatabase } from '../hooks/useDatabase'

const CARGO_ICONS = { gestor: Shield, atendente: User, mecanico: Wrench }
const CARGO_COLORS = {
  gestor: { color: 'var(--neon-orange)', bg: 'rgba(232, 89, 12, 0.08)', border: 'rgba(232, 89, 12, 0.2)' },
  atendente: { color: 'var(--electric-blue)', bg: 'rgba(0, 229, 255, 0.08)', border: 'rgba(0, 229, 255, 0.2)' },
  mecanico: { color: 'var(--status-done)', bg: 'rgba(0, 255, 136, 0.08)', border: 'rgba(0, 255, 136, 0.2)' },
}

const emptyForm = {
  nome: '', cargo: 'mecanico', comissao_percentual: '0',
  comissao_sobre_servicos: false, comissao_sobre_pecas: false, id_usuario: '',
}

export function Funcionarios() {
  const { funcionarios, usuarios, addFuncionario, updateFuncionario, deleteFuncionario } = useDatabase()
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [erroForm, setErroForm] = useState('')

  const setF = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  const abrirNovo = () => {
    setEditandoId(null)
    setForm(emptyForm)
    setErroForm('')
    setModalAberto(true)
  }

  const abrirEditar = (f) => {
    setEditandoId(f.id)
    setForm({
      nome: f.nome || '',
      cargo: f.cargo || 'mecanico',
      comissao_percentual: String(f.comissao_percentual ?? 0),
      comissao_sobre_servicos: Boolean(f.comissao_sobre_servicos),
      comissao_sobre_pecas: Boolean(f.comissao_sobre_pecas),
      id_usuario: f.id_usuario || '',
    })
    setErroForm('')
    setModalAberto(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.nome.trim()) {
      setErroForm('Informe o nome do funcionário.')
      return
    }
    const payload = {
      nome: form.nome.trim(),
      cargo: form.cargo,
      comissao_percentual: Math.min(100, Math.max(0, Number(form.comissao_percentual) || 0)),
      comissao_sobre_servicos: form.comissao_sobre_servicos,
      comissao_sobre_pecas: form.comissao_sobre_pecas,
      id_usuario: form.id_usuario || null,
    }
    if (editandoId) updateFuncionario(editandoId, payload)
    else addFuncionario(payload)
    setModalAberto(false)
  }

  const handleInativar = (id) => {
    if (!confirm('Deseja inativar este funcionário?')) return
    deleteFuncionario(id)
  }

  // Usuarios ainda nao vinculados a nenhum funcionario (para o select do modal)
  const usuariosDisponiveis = usuarios.filter(u =>
    !funcionarios.some(f => f.id_usuario === u.id && f.id !== editandoId)
  )

  const filtrados = funcionarios.filter(f => {
    const t = busca.toLowerCase()
    return !busca || f.nome?.toLowerCase().includes(t) || f.cargo?.includes(t)
  })

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Funcionarios</h2>
          <p>Colaboradores da oficina e suas regras de comissao.</p>
        </div>
        <button className="btn-primary" onClick={abrirNovo} style={{ borderRadius: 'var(--radius-sm)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Novo Funcionario
        </button>
      </section>

      <GlassPanel className="panel stagger-2">
        <div style={{ position: 'relative', marginBottom: '24px' }}>
          <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: 14, top: 13 }} />
          <input type="text" className="form-control" placeholder="Buscar por nome ou cargo..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: '40px' }} />
        </div>

        <div className="tech-table-container">
          {filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Nenhum funcionario cadastrado.</div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Funcionario</th>
                  <th>Cargo</th>
                  <th>Comissao</th>
                  <th>Login vinculado</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(f => {
                  const CargoIcon = CARGO_ICONS[f.cargo] || User
                  const cc = CARGO_COLORS[f.cargo] || CARGO_COLORS.atendente
                  const login = usuarios.find(u => u.id === f.id_usuario)
                  const bases = [
                    f.comissao_sobre_servicos ? 'servicos' : null,
                    f.comissao_sobre_pecas ? 'pecas/produtos' : null,
                  ].filter(Boolean).join(' + ')
                  return (
                    <tr key={f.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--neon-orange), var(--electric-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>
                            {f.nome?.charAt(0)?.toUpperCase()}
                          </div>
                          <strong style={{ fontSize: '14px' }}>{f.nome}</strong>
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: cc.color, background: cc.bg, border: `1px solid ${cc.border}` }}>
                          <CargoIcon size={11} /> {f.cargo}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {Number(f.comissao_percentual || 0) > 0 ? (
                          <>
                            <strong style={{ color: 'var(--text-primary)' }}>{Number(f.comissao_percentual || 0).toLocaleString('pt-BR')}%</strong>
                            <span style={{ display: 'block', marginTop: '2px' }}>{bases || 'sem base'}</span>
                          </>
                        ) : '-'}
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{login?.email || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn-secondary" onClick={() => abrirEditar(f)} style={{ padding: '5px 10px', fontSize: '12px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Edit2 size={11} /> Editar
                          </button>
                          <button className="btn-danger" onClick={() => handleInativar(f.id)} style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            <UserX size={11} /> Inativar
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

      {modalAberto && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editandoId ? 'Editar Funcionario' : 'Novo Funcionario'}</h3>
              <button onClick={() => setModalAberto(false)} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nome Completo *</label>
                  <input type="text" className="form-control" value={form.nome} onChange={e => setF('nome', e.target.value)} required placeholder="Ex: Joao da Silva" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Cargo *</label>
                    <select className="form-control" value={form.cargo} onChange={e => setF('cargo', e.target.value)}>
                      <option value="mecanico">Mecanico</option>
                      <option value="atendente">Atendente</option>
                      <option value="gestor">Gestor</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Login vinculado (opcional)</label>
                    <select className="form-control" value={form.id_usuario} onChange={e => setF('id_usuario', e.target.value)}>
                      <option value="">Sem login</option>
                      {usuariosDisponiveis.map(u => <option key={u.id} value={u.id}>{u.nome} — {u.email}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '14px', marginBottom: '14px', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <Percent size={15} /> Comissao
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Percentual (%)</label>
                      <input type="number" className="form-control" value={form.comissao_percentual} onChange={e => setF('comissao_percentual', e.target.value)} min="0" max="100" step="0.01" placeholder="Ex: 5" />
                    </div>
                    <div className="form-group">
                      <label>Base de calculo</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
                        <input type="checkbox" checked={form.comissao_sobre_servicos} onChange={e => setF('comissao_sobre_servicos', e.target.checked)} />
                        Servicos
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
                        <input type="checkbox" checked={form.comissao_sobre_pecas} onChange={e => setF('comissao_sobre_pecas', e.target.checked)} />
                        Pecas e produtos
                      </label>
                    </div>
                  </div>
                </div>

                {erroForm && (
                  <div style={{ padding: '10px', background: 'rgba(232, 89, 12, 0.08)', border: '1px solid rgba(232, 89, 12, 0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--neon-orange)', fontSize: '13px' }}>
                    {erroForm}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalAberto(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editandoId ? 'Salvar Alteracoes' : 'Criar Funcionario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
