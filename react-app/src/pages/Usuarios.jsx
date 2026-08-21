import { useEffect, useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { Plus, Edit2, UserX, X, Shield, User, Wrench, Search, RefreshCw, Percent } from 'lucide-react'
import { supabase, supabaseDb } from '../supabaseClient'

const PERFIL_ICONS = { gestor: Shield, atendente: User, mecanico: Wrench }
const PERFIL_COLORS = {
  gestor: { color: 'var(--neon-orange)', bg: 'rgba(232, 89, 12, 0.08)', border: 'rgba(232, 89, 12, 0.2)' },
  atendente: { color: 'var(--electric-blue)', bg: 'rgba(0, 229, 255, 0.08)', border: 'rgba(0, 229, 255, 0.2)' },
  mecanico: { color: 'var(--status-done)', bg: 'rgba(0, 255, 136, 0.08)', border: 'rgba(0, 255, 136, 0.2)' },
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
  const [fComissaoPercentual, setFComissaoPercentual] = useState('0')
  const [fComissaoServicos, setFComissaoServicos] = useState(false)
  const [fComissaoPecas, setFComissaoPecas] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')
  const perfilComComissao = fPerfil === 'mecanico' || fPerfil === 'atendente'

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
    setFComissaoPercentual('0')
    setFComissaoServicos(false)
    setFComissaoPecas(false)
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
    setFComissaoPercentual(String(u.comissao_percentual || 0))
    setFComissaoServicos(Boolean(u.comissao_sobre_servicos))
    setFComissaoPecas(Boolean(u.comissao_sobre_pecas))
    setErroForm('')
    setModalAberto(true)
  }

  const montarPayloadUsuario = () => {
    const percentual = Math.min(100, Math.max(0, Number(fComissaoPercentual) || 0))
    return {
      nome: fNome,
      perfil: fPerfil,
      telefone: fTelefone || null,
      comissao_percentual: perfilComComissao ? percentual : 0,
      comissao_sobre_servicos: perfilComComissao ? fComissaoServicos : false,
      comissao_sobre_pecas: perfilComComissao ? fComissaoPecas : false,
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErroForm('')
    setSalvando(true)

    try {
      if (editandoId) {
        const payload = montarPayloadUsuario()
        // Separar campos base dos campos de comissão para tolerar schema antigo
        const { comissao_percentual, comissao_sobre_servicos, comissao_sobre_pecas, ...basePayload } = payload
        const { error } = await supabaseDb.from('usuario').update(basePayload).eq('id', editandoId)
        if (error) throw error
        // Comissão separada — ignora silenciosamente se colunas não existirem
        const { error: comissaoError } = await supabaseDb
          .from('usuario')
          .update({ comissao_percentual, comissao_sobre_servicos, comissao_sobre_pecas })
          .eq('id', editandoId)
        if (comissaoError) console.warn('Colunas de comissão ausentes:', comissaoError)
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
          // Inserir primeiro sem comissão (colunas podem não existir ainda)
          const basePayload = { id, email: fEmail, nome: fNome, perfil: fPerfil, telefone: fTelefone || null, ativo: true }
          const { error: usuarioError } = await supabaseDb.from('usuario').upsert(basePayload)
          if (usuarioError) throw usuarioError

          // Tentar adicionar campos de comissão separadamente (ignora erro se colunas não existirem)
          const comissaoPayload = montarPayloadUsuario()
          const { error: comissaoError } = await supabaseDb
            .from('usuario')
            .update({ comissao_percentual: comissaoPayload.comissao_percentual, comissao_sobre_servicos: comissaoPayload.comissao_sobre_servicos, comissao_sobre_pecas: comissaoPayload.comissao_sobre_pecas })
            .eq('id', id)
          if (comissaoError) console.warn('Colunas de comissão não encontradas na tabela usuario. Execute o SQL de migração.', comissaoError)
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
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Gestao de Usuarios</h2>
          <p>Controle de acesso e perfis do sistema SIGAuto.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary" onClick={carregarUsuarios} style={{ borderRadius: 'var(--radius-sm)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={16} /> Atualizar
          </button>
          <button className="btn-primary" onClick={abrirNovo} style={{ borderRadius: 'var(--radius-sm)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Novo Usuario
          </button>
        </div>
      </section>

      <GlassPanel className="panel stagger-2">
        <div style={{ position: 'relative', marginBottom: '24px' }}>
          <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: 14, top: 13 }} />
          <input type="text" className="form-control" placeholder="Buscar por nome, e-mail ou perfil..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: '40px' }} />
        </div>

        <div className="tech-table-container">
          {carregando ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Carregando usuarios...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Nenhum usuario encontrado.</div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>Perfil</th>
                  <th>Comissao</th>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--neon-orange), var(--electric-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>
                            {u.nome?.charAt(0)?.toUpperCase()}
                          </div>
                          <strong style={{ fontSize: '14px' }}>{u.nome}</strong>
                        </div>
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{u.telefone || '-'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: pc.color, background: pc.bg, border: `1px solid ${pc.border}` }}>
                          <PerfilIcon size={11} /> {u.perfil}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {(u.perfil === 'atendente' || u.perfil === 'mecanico') && Number(u.comissao_percentual || 0) > 0 ? (
                          <>
                            <strong style={{ color: 'var(--text-primary)' }}>{Number(u.comissao_percentual || 0).toLocaleString('pt-BR')}%</strong>
                            <span style={{ display: 'block', marginTop: '2px' }}>
                              {[
                                u.comissao_sobre_servicos ? 'servicos' : null,
                                u.comissao_sobre_pecas ? 'pecas/produtos' : null,
                              ].filter(Boolean).join(' + ') || 'sem base'}
                            </span>
                          </>
                        ) : '-'}
                      </td>
                      <td>
                        <span style={{ padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: '600', color: u.ativo ? 'var(--status-done)' : 'var(--text-muted)', background: u.ativo ? 'rgba(0, 255, 136, 0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${u.ativo ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn-secondary" onClick={() => abrirEditar(u)} style={{ padding: '5px 10px', fontSize: '12px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Edit2 size={11} /> Editar
                          </button>
                          {u.ativo && (
                            <button className="btn-danger" onClick={() => handleInativar(u.id)} style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
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
              <button onClick={() => setModalAberto(false)} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
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
                {perfilComComissao && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '14px', marginBottom: '14px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      <Percent size={15} /> Comissao
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Percentual (%)</label>
                        <input
                          type="number"
                          className="form-control"
                          value={fComissaoPercentual}
                          onChange={e => setFComissaoPercentual(e.target.value)}
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="Ex: 5"
                        />
                      </div>
                      <div className="form-group">
                        <label>Base de calculo</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
                          <input type="checkbox" checked={fComissaoServicos} onChange={e => setFComissaoServicos(e.target.checked)} />
                          Servicos
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
                          <input type="checkbox" checked={fComissaoPecas} onChange={e => setFComissaoPecas(e.target.checked)} />
                          Pecas e produtos
                        </label>
                      </div>
                    </div>
                  </div>
                )}
                {erroForm && (
                  <div style={{ padding: '10px', background: 'rgba(232, 89, 12, 0.08)', border: '1px solid rgba(232, 89, 12, 0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--neon-orange)', fontSize: '13px' }}>
                    {erroForm}
                  </div>
                )}
                <div className="alert-box" style={{ marginTop: '12px' }}>
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
