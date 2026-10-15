import { useEffect, useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { Plus, Edit2, UserX, X, Shield, User, Wrench, Search, RefreshCw } from 'lucide-react'
import { supabase, supabaseDb } from '../supabaseClient'
import css from './Usuarios.module.css'

const PERFIL_ICONS = { gestor: Shield, atendente: User, mecanico: Wrench }
const PERFIL_COLORS = {
  gestor: { color: 'var(--color-primary)', bg: 'var(--color-primary-tint)', border: 'var(--color-primary-border)' },
  atendente: { color: 'var(--color-warning)', bg: 'var(--color-warning-tint)', border: 'var(--color-warning-border)' },
  mecanico: { color: 'var(--color-success)', bg: 'var(--color-success-tint)', border: 'var(--color-success-border)' },
}

export function Usuarios() {
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
      console.error('Erro ao carregar usuarios do Supabase:', error)
      setErroForm('Nao foi possivel carregar os usuarios do banco.')
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
      if (editandoId) {
        const { error } = await supabaseDb.from('usuario').update(montarPayloadUsuario()).eq('id', editandoId)
        if (error) throw error
      } else {
        if (!fSenha || fSenha.length < 8) {
          throw new Error('A senha deve ter pelo menos 8 caracteres.')
        }

        // Salvar sessão do admin antes de criar o novo usuário
        const { data: { session: sessaoAdmin } } = await supabase.auth.getSession()

        const { data, error } = await supabase.auth.signUp({
          email: fEmail,
          password: fSenha,
          options: {
            data: { nome: fNome, perfil: fPerfil },
          },
        })
        if (error) throw error

        // Se o Supabase auto-confirmou e criou uma sessão nova, restaurar a sessão do admin
        if (data.session && sessaoAdmin) {
          await supabase.auth.setSession({
            access_token: sessaoAdmin.access_token,
            refresh_token: sessaoAdmin.refresh_token,
          })
        }

        const id = data?.user?.id
        if (id) {
          const basePayload = { id, email: fEmail, nome: fNome, perfil: fPerfil, telefone: fTelefone || null, ativo: true }
          const { error: usuarioError } = await supabaseDb.from('usuario').upsert(basePayload)
          if (usuarioError) throw usuarioError
        }
      }

      await carregarUsuarios()
      setModalAberto(false)
    } catch (error) {
      console.error('Erro ao salvar usuario:', error)
      setErroForm(error.message || 'Nao foi possivel salvar o usuario.')
    } finally {
      setSalvando(false)
    }
  }

  const handleInativar = async (id) => {
    if (!confirm('Deseja inativar este usuario? Ele nao podera mais acessar o sistema.')) return
    const { error } = await supabaseDb.from('usuario').update({ ativo: false }).eq('id', id)
    if (error) {
      alert('Nao foi possivel inativar o usuario.')
      console.error('Erro ao inativar usuario:', error)
      return
    }
    await carregarUsuarios()
  }

  const filtrados = usuarios.filter(u => {
    const t = busca.toLowerCase()
    return !busca || u.nome?.toLowerCase().includes(t) || u.email?.toLowerCase().includes(t) || u.perfil?.includes(t)
  })

  return (
    <div className="dashboard-grid">
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Gestao de Usuarios</h2>
          <p>Controle de acesso e perfis do sistema SIGAuto.</p>
        </div>
        <div className={css.acoesTopo}>
          <button className={`btn-secondary ${css.btnAtualizar}`} onClick={carregarUsuarios}>
            <RefreshCw size={16} /> Atualizar
          </button>
          <button className={`btn-primary ${css.btnNovo}`} onClick={abrirNovo}>
            <Plus size={16} /> Novo Usuario
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
            <div className={css.vazio}>Carregando usuarios...</div>
          ) : filtrados.length === 0 ? (
            <div className={css.vazio}>Nenhum usuario encontrado.</div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(u => {
                  const PerfilIcon = PERFIL_ICONS[u.perfil] || User
                  const pc = PERFIL_COLORS[u.perfil] || PERFIL_COLORS.atendente
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className={css.celulaNome}>
                          <div className={css.avatar}>
                            {u.nome?.charAt(0)?.toUpperCase()}
                          </div>
                          <strong className={css.nome}>{u.nome}</strong>
                        </div>
                      </td>
                      <td className={css.celulaTexto}>{u.email}</td>
                      <td className={css.celulaTexto}>{u.telefone || '-'}</td>
                      <td>
                        <span className={css.perfil} style={{ color: pc.color, background: pc.bg, border: `1px solid ${pc.border}` }}>
                          <PerfilIcon size={11} /> {u.perfil}
                        </span>
                      </td>
                      <td>
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
              <h3>{editandoId ? 'Editar Usuario' : 'Novo Usuario'}</h3>
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
                      <option value="mecanico">Mecanico (Tecnico)</option>
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
                  A <strong>comissão</strong> agora é configurada em <strong>Funcionários</strong>, vinculada ao colaborador.
                </div>
                {erroForm && (
                  <div className={css.erroForm}>
                    {erroForm}
                  </div>
                )}
                <div className={`alert-box ${css.alertaRodape}`}>
                  <strong>Perfis de acesso:</strong> <strong>Gestor</strong> tem acesso completo. <strong>Atendente</strong> gerencia OS, clientes e veiculos. <strong>Mecanico</strong> acessa diagnosticos e consultas tecnicas.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalAberto(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : editandoId ? 'Salvar Alteracoes' : 'Criar Usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
