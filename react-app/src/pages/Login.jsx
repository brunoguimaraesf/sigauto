import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { DEMO_LOGIN_HABILITADO } from '../demoLogin'
import { supabase } from '../supabaseClient'
import css from './Login.module.css'

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
    <div className={css.tela}>

      <div className={`glass stagger-1 ${css.cartao}`}>
        {/* Linha decorativa no topo */}
        <div className={css.filete} />

        {/* Brand */}
        <div className={css.marca}>
          <div className={css.logoCaixa}>
            <img
              src="/logo-sigauto.png"
              alt="Logo SIGAUTO"
              className={css.logo}
            />
          </div>
          <h1 className={css.titulo}>SIGAUTO</h1>
          <p className={css.subtitulo}>
            Sistema Inteligente de Gestão de Oficinas
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className={css.rotulo}>
              E-mail
            </label>
            <div className={css.campo}>
              <Mail size={16} color="var(--text-muted)" className={css.campoIcone} />
              <input
                type="email"
                className={`form-control ${css.campoEmail}`}
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading || estaBloqueado}
              />
            </div>
          </div>

          <div className="form-group">
            <label className={css.rotulo}>
              Senha
            </label>
            <div className={css.campo}>
              <Lock size={16} color="var(--text-muted)" className={css.campoIcone} />
              <input
                type={mostrarSenha ? 'text' : 'password'}
                className={`form-control ${css.campoSenha}`}
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                disabled={loading || estaBloqueado}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(v => !v)}
                className={css.btnOlho}
              >
                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {erro && (
            <div className={css.erro}>
              {erro}
            </div>
          )}

          <button
            type="submit"
            className={`btn-primary ${css.btnEntrar}`}
            disabled={loading || estaBloqueado}
          >
            {loading ? (
              <span className={css.carregando}>
                <span className={css.spinner} />
                Autenticando...
              </span>
            ) : 'Entrar no Sistema'}
          </button>
        </form>

        <div className={css.esqueci}>
          <button
            className={`btn-link ${css.btnEsqueci}`}
            onClick={() => { setModalEsqueci(true); setResetEnviado(false); setEmailReset('') }}
          >
            Esqueci minha senha
          </button>
        </div>

        {/* Contas de demonstração — so no servidor de desenvolvimento.
            Em producao isto publicava e-mail e senha de contas REAIS de gestor
            no HTML e no bundle: qualquer visitante entrava com acesso total. */}
        {DEMO_LOGIN_HABILITADO && (
        <div className={css.demo} data-canario="CANARIO_DEMO_LOGIN">
          <p className={css.demoTitulo}>
            Contas de demonstração
          </p>
          {[
            { email: 'gestor@sigauto.com',    senha: 'Gestor123', perfil: 'Gestor',    cor: 'var(--color-primary)' },
            { email: 'atendente@sigauto.com', senha: 'Atend123',  perfil: 'Atendente', cor: 'var(--color-warning)' },
            { email: 'mecanico@sigauto.com',  senha: 'Mec123456', perfil: 'Mecânico',  cor: 'var(--color-success)' },
          ].map(u => (
            <button
              key={u.email}
              type="button"
              onClick={() => { setEmail(u.email); setSenha(u.senha); setErro('') }}
              className={css.demoAccount}
            >
              <span className={css.demoEmail}>{u.email}</span>
              <span className={css.demoPerfil} style={{ color: u.cor }}>{u.perfil}</span>
            </button>
          ))}
          <p className={css.demoDica}>
            Clique para preencher automaticamente
          </p>
        </div>
        )}

        <p className={css.rodape}>
          TFC UniRV 2026 · Bruno Gabriel Guimarães Fernandes
        </p>
      </div>

      {/* Modal Esqueci a Senha */}
      {modalEsqueci && (
        <div className="modal-overlay">
          <div className={`modal-content ${css.modal}`}>
            <div className="modal-header">
              <h3>Recuperar Senha</h3>
              <button onClick={() => setModalEsqueci(false)} className={css.btnFechar}>
                <X size={20} />
              </button>
            </div>
            {resetEnviado ? (
              <div className="modal-body">
                <div className={css.resetEnviado}>
                  Se este e-mail estiver cadastrado, você receberá as instruções em breve.
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetSenha}>
                <div className="modal-body">
                  <p className={css.resetTexto}>
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

    </div>
  )
}
