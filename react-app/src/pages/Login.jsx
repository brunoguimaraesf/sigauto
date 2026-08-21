import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Wrench, Mail, Lock, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [tentativas, setTentativas] = useState(0)
  const [bloqueadoAte, setBloqueadoAte] = useState(null)

  const [modalEsqueci, setModalEsqueci] = useState(false)
  const [emailReset, setEmailReset] = useState('')
  const [resetEnviado, setResetEnviado] = useState(false)
  const [loadingReset, setLoadingReset] = useState(false)

  const estaBloqueado = Boolean(bloqueadoAte)

  useEffect(() => {
    if (!bloqueadoAte) return undefined
    const timeout = setTimeout(() => setBloqueadoAte(null), bloqueadoAte.getTime() - new Date().getTime())
    return () => clearTimeout(timeout)
  }, [bloqueadoAte])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (estaBloqueado) {
      const restante = Math.max(1, Math.ceil((bloqueadoAte.getTime() - new Date().getTime()) / 60000))
      setErro(`Acesso bloqueado. Tente novamente em ${restante} minuto(s).`)
      return
    }

    setLoading(true)
    setErro('')

    try {
      await login(email, senha)
      navigate('/')
    } catch (err) {
      const novasTentativas = tentativas + 1
      setTentativas(novasTentativas)
      setErro(err?.message || 'E-mail ou senha incorretos.')
      if (novasTentativas >= 5) {
        const lockUntil = new Date()
        lockUntil.setMinutes(lockUntil.getMinutes() + 15)
        setBloqueadoAte(lockUntil)
        setErro('Muitas tentativas incorretas. Acesso bloqueado por 15 minutos.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResetSenha = async (e) => {
    e.preventDefault()
    setLoadingReset(true)
    try {
      await supabase.auth.resetPasswordForEmail(emailReset, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      setResetEnviado(true)
    } catch {
      // Silencia erros para não revelar se e-mail existe
      setResetEnviado(true)
    } finally {
      setLoadingReset(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'var(--font-body)'
    }}>
      {/* Gradientes de fundo */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(232, 89, 12, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', left: '10%',
        width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(232, 89, 12, 0.06) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div className="glass stagger-1" style={{
        width: '100%', maxWidth: '440px',
        margin: '24px',
        padding: '48px 40px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Linha decorativa no topo */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '2px',
          background: 'linear-gradient(90deg, var(--neon-orange), var(--electric-blue))'
        }} />

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '56px', height: '56px',
            background: 'rgba(232, 89, 12, 0.1)',
            border: '1px solid rgba(232, 89, 12, 0.3)',
            borderRadius: '12px',
            marginBottom: '20px',
            filter: 'drop-shadow(0 0 12px rgba(232, 89, 12, 0.3))'
          }}>
            <Wrench size={28} color="var(--neon-orange)" />
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '28px',
            fontWeight: '700',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
            marginBottom: '8px'
          }}>SIGAUTO</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Sistema Inteligente de Gestão de Oficinas
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              E-mail
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: 14, pointerEvents: 'none' }} />
              <input
                type="email"
                className="form-control"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '42px' }}
                required
                disabled={loading || estaBloqueado}
              />
            </div>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: 14, pointerEvents: 'none' }} />
              <input
                type={mostrarSenha ? 'text' : 'password'}
                className="form-control"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                style={{ paddingLeft: '42px', paddingRight: '42px' }}
                required
                disabled={loading || estaBloqueado}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: 10,
                  color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer'
                }}
              >
                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {erro && (
            <div style={{
              padding: '12px 16px',
              background: 'rgba(232, 89, 12, 0.08)',
              border: '1px solid rgba(232, 89, 12, 0.25)',
              borderRadius: 'var(--radius-sm)',
              color: '#E8590C',
              fontSize: '13px',
              marginBottom: '20px',
              lineHeight: '1.4'
            }}>
              {erro}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '15px', borderRadius: 'var(--radius-sm)', marginTop: '8px' }}
            disabled={loading || estaBloqueado}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{
                  width: '16px', height: '16px', borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  display: 'inline-block',
                  animation: 'spin 0.8s linear infinite'
                }} />
                Autenticando...
              </span>
            ) : 'Entrar no Sistema'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            className="btn-link"
            onClick={() => { setModalEsqueci(true); setResetEnviado(false); setEmailReset('') }}
            style={{ fontSize: '13px' }}
          >
            Esqueci minha senha
          </button>
        </div>

        {/* Contas de demonstração */}
        <div style={{
          marginTop: '28px', padding: '14px 16px',
          background: 'rgba(232, 89, 12, 0.03)',
          border: '1px solid rgba(232, 89, 12, 0.12)',
          borderRadius: 'var(--radius-sm)'
        }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', fontWeight: '600' }}>
            Contas de demonstração
          </p>
          {[
            { email: 'gestor@sigauto.com',    senha: 'Gestor123', perfil: 'Gestor',    cor: 'var(--neon-orange)' },
            { email: 'atendente@sigauto.com', senha: 'Atend123',  perfil: 'Atendente', cor: 'var(--electric-blue)' },
            { email: 'mecanico@sigauto.com',  senha: 'Mec123456', perfil: 'Mecânico',  cor: 'var(--status-done)' },
          ].map(u => (
            <button
              key={u.email}
              type="button"
              onClick={() => { setEmail(u.email); setSenha(u.senha); setErro('') }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '7px 10px', marginBottom: '4px',
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
            >
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{u.email}</span>
              <span style={{ fontSize: '10px', fontWeight: '700', color: u.cor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{u.perfil}</span>
            </button>
          ))}
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Clique para preencher automaticamente
          </p>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', marginTop: '20px' }}>
          TFC UniRV 2026 · Bruno Gabriel Guimarães Fernandes
        </p>
      </div>

      {/* Modal Esqueci a Senha */}
      {modalEsqueci && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Recuperar Senha</h3>
              <button onClick={() => setModalEsqueci(false)} style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>
            {resetEnviado ? (
              <div className="modal-body">
                <div style={{
                  padding: '16px',
                  background: 'rgba(0, 255, 136, 0.05)',
                  border: '1px solid rgba(0, 255, 136, 0.2)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--status-done)',
                  fontSize: '14px',
                  textAlign: 'center'
                }}>
                  Se este e-mail estiver cadastrado, você receberá as instruções em breve.
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetSenha}>
                <div className="modal-body">
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
                    Informe seu e-mail para receber o link de redefinição de senha.
                  </p>
                  <div className="form-group">
                    <label>E-mail cadastrado</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="seu@email.com"
                      value={emailReset}
                      onChange={(e) => setEmailReset(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setModalEsqueci(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary" disabled={loadingReset}>
                    {loadingReset ? 'Enviando...' : 'Enviar Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
