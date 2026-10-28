import { useEffect, useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { Plus, Edit2, UserX, X, Shield, User, Wrench, Search, RefreshCw } from 'lucide-react'
import { supabaseDb } from '../supabaseClient'
import { usuariosApi } from '../services/api'
import { useDatabase } from '../hooks/useDatabase'
import css from './Usuarios.module.css'

const PERFIL_ICONS = { gestor: Shield, atendente: User, mecanico: Wrench }
const PERFIL_COLORS = {
  gestor: { color: 'var(--color-primary)', bg: 'var(--color-primary-tint)', border: 'var(--color-primary-border)' },
  atendente: { color: 'var(--color-warning)', bg: 'var(--color-warning-tint)', border: 'var(--color-warning-border)' },
  mecanico: { color: 'var(--color-success)', bg: 'var(--color-success-tint)', border: 'var(--color-success-border)' },
}
const PERFIS_VALIDOS = new Set(['gestor', 'atendente', 'mecanico'])

export function Usuarios() {
  const { reloadDatabase } = useDatabase()
  const [usuarios, setUsuarios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [busca, setBusca] = useState('')

  const [fNome, setFNome] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fPerfil, setFPerfil] = useState('atendente')
  const [fTelefone, setFTelefone] = useState('')
  const [fSenha, setFSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  const carregarUsuarios = async () => {
    setCarregando(true)
    const { data, error } = await supabaseDb
      .from('usuario')
      .select('*')
      .order('nome')

    if (error) {
      console.error('Erro ao carregar usuários do Supabase:', error)
      setErroForm('Não foi possível carregar os usuários do banco.')
      setUsuarios([])
    } else {
      setUsuarios(data || [])
    }
    setCarregando(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarUsuarios()
  }, [])

  const abrirNovo = () => {
    setEditandoId(null)
    setFNome('')
    setFEmail('')
    setFPerfil('atendente')
    setFTelefone('')
    setFSenha('')
    setErroForm('')
    setModalAberto(true)
  }

  const abrirEditar = (u) => {
    setEditandoId(u.id)
    setFNome(u.nome || '')
    setFEmail(u.email || '')
    setFPerfil(u.perfil || 'atendente')
    setFTelefone(u.telefone || '')
    setFSenha('')
    setErroForm('')
    setModalAberto(true)
  }

  const montarPayloadUsuario = () => ({
    nome: fNome,
    perfil: fPerfil,
    telefone: fTelefone || null,
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErroForm('')
    setSalvando(true)

    try {
      if (!PERFIS_VALIDOS.has(fPerfil)) {
        throw new Error('Selecione um perfil de acesso válido.')
      }
      const emailNormalizado = fEmail.trim().toLowerCase()
      const emailDuplicado = usuarios.some(usuario =>
        usuario.id !== editandoId && String(usuario.email || '').trim().toLowerCase() === emailNormalizado
      )
      if (emailDuplicado) {
        throw new Error('Este e-mail já está cadastrado.')
      }

      if (editandoId) {
        await usuariosApi.atualizar(editandoId, montarPayloadUsuario())
      } else {
        if (!fSenha || fSenha.length < 8) {
          throw new Error('A senha deve ter pelo menos 8 caracteres.')
        }

        await usuariosApi.criar({
          email: emailNormalizado,
          senha: fSenha,
          nome: fNome,
          perfil: fPerfil,
          telefone: fTelefone || null,
        })
      }

      await carregarUsuarios()
      await reloadDatabase()
      setModalAberto(false)
    } catch (error) {
      console.error('Erro ao salvar usuário:', error)
      setErroForm(error.message || 'Não foi possível salvar o usuário.')
    } finally {
      setSalvando(false)
    }
  }

  const handleInativar = async (id) => {
    if (!confirm('Deseja inativar este usuário? Ele não poderá mais acessar o sistema.')) return
    const atual = usuarios.find(usuario => usuario.id === id)
    try {
      await usuariosApi.atualizar(id, {
        nome: atual?.nome,
        perfil: atual?.perfil,
        telefone: atual?.telefone || null,
        ativo: false,
      })
    } catch (error) {
      alert('Não foi possível inativar o usuário.')
      console.error('Erro ao inativar usuário:', error)
      return
    }
    await carregarUsuarios()
    await reloadDatabase()
  }

  const filtrados = usuarios.filter(u => {
    const t = busca.toLowerCase()
    return !busca || u.nome?.toLowerCase().includes(t) || u.email?.toLowerCase().includes(t) || u.perfil?.includes(t)
  })

  return (
    <div className="dashboard-grid">
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Gestão de Usuários</h2>
          <p>Controle de acesso e perfis do sistema SIGAuto.</p>
        </div>
        <div className={css.acoesTopo}>
          <button className={`btn-secondary ${css.btnAtualizar}`} onClick={carregarUsuarios}>
            <RefreshCw size={16} /> Atualizar
          </button>
          <button className={`btn-primary ${css.btnNovo}`} onClick={abrirNovo}>
            <Plus size={16} /> Novo Usuário
          </button>
        </div>
      </section>

      <GlassPanel className="panel stagger-2">
        <div className={css.busca}>
          <Search size={16} color="var(--text-secondary)" className={css.buscaIcone} />
          <input type="text" className={`form-control ${css.buscaInput}`} placeholder="Buscar por nome, e-mail ou perfil..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>

        <div className="tech-table-container">
          {carregando ? (
            <div className={css.vazio}>Carregando usuários...</div>
          ) : filtrados.length === 0 ? (
            <div className={css.vazio}>Nenhum usuário encontrado.</div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(u => {
                  const PerfilIcon = PERFIL_ICONS[u.perfil] || User
                  const pc = PERFIL_COLORS[u.perfil] || PERFIL_COLORS.atendente
                  return (
                    <tr key={u.id}>
                      <td data-label="Usuário">
                        <div className={css.celulaNome}>
                          <div className={css.avatar}>
                            {u.nome?.charAt(0)?.toUpperCase()}
                          </div>
                          <strong className={css.nome}>{u.nome}</strong>
                        </div>
                      </td>
                      <td data-label="E-mail" className={css.celulaTexto}>{u.email}</td>
                      <td data-label="Telefone" className={css.celulaTexto}>{u.telefone || '-'}</td>
                      <td data-label="Perfil">
                        <span className={css.perfil} style={{ color: pc.color, background: pc.bg, border: `1px solid ${pc.border}` }}>
                          <PerfilIcon size={11} /> {u.perfil}
                        </span>
                      </td>
                      <td data-label="Status">
                        <span className={css.status} style={{ color: u.ativo ? 'var(--status-done)' : 'var(--text-muted)', background: u.ativo ? 'var(--color-success-tint)' : 'var(--text-secondary)', border: `1px solid ${u.ativo ? 'var(--color-success-border)' : 'var(--border-color)'}` }}>
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <div className={css.acoes}>
                          <button className={`btn-secondary ${css.btnEditar}`} onClick={() => abrirEditar(u)}>
                            <Edit2 size={11} /> Editar
                          </button>
                          {u.ativo && (
                            <button className={`btn-danger ${css.btnInativar}`} onClick={() => handleInativar(u.id)}>
                              <UserX size={11} /> Inativar
                            </button>
                          )}
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
              <h3>{editandoId ? 'Editar Usuário' : 'Novo Usuário'}</h3>
              <button onClick={() => setModalAberto(false)} className={css.btnFechar}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nome Completo *</label>
                  <input type="text" className="form-control" value={fNome} onChange={e => setFNome(e.target.value)} required placeholder="Ex: Joao da Silva" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>E-mail *</label>
                    <input type="email" className="form-control" value={fEmail} onChange={e => setFEmail(e.target.value)} required placeholder="usuario@oficina.com" disabled={!!editandoId} />
                  </div>
                  <div className="form-group">
                    <label>Telefone</label>
                    <input type="text" className="form-control" value={fTelefone} onChange={e => setFTelefone(e.target.value)} placeholder="(00) 00000-0000" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Perfil de Acesso *</label>
                    <select className="form-control" value={fPerfil} onChange={e => setFPerfil(e.target.value)}>
                      <option value="gestor">Gestor (Acesso Total)</option>
                      <option value="atendente">Atendente (Operacional)</option>
                      <option value="mecanico">Mecânico (Técnico)</option>
                    </select>
                  </div>
                  {!editandoId && (
                    <div className="form-group">
                      <label>Senha Inicial *</label>
                      <input type="password" className="form-control" value={fSenha} onChange={e => setFSenha(e.target.value)} placeholder="Min. 8 caracteres" minLength={8} />
                    </div>
                  )}
                </div>
                <div className={`alert-box ${css.alertaCompacto}`}>
                  A conta será confirmada automaticamente e o funcionário correspondente será vinculado. A <strong>comissão</strong> é configurada em <strong>Funcionários</strong>.
                </div>
                {erroForm && (
                  <div className={css.erroForm}>
                    {erroForm}
                  </div>
                )}
                <div className={`alert-box ${css.alertaRodape}`}>
                  <strong>Perfis de acesso:</strong> <strong>Gestor</strong> tem acesso completo. <strong>Atendente</strong> gerencia OS, clientes e veículos. <strong>Mecânico</strong> acessa diagnósticos e consultas técnicas.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalAberto(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : editandoId ? 'Salvar Alterações' : 'Criar Usuário'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
