import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { supabase } from '../supabaseClient'
import css from './Login.module.css'

const MIN_SENHA = 8

// O cliente Supabase roda com detectSessionInUrl: false, entao a sessao de
// recuperacao que o e-mail traz no fragmento da URL e lida aqui, uma unica vez.
function lerFragmento() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const valido = Boolean(accessToken && refreshToken && params.get('type') === 'recovery')
  return { accessToken, refreshToken, valido }
}

const MENSAGENS_ERRO = {
  same_password: 'A nova senha deve ser diferente da senha atual.',
  weak_password: 'Senha fraca demais. Use uma senha mais longa e menos previsível.',
  session_not_found: 'O link expirou. Solicite uma nova redefinição de senha.',
  bad_jwt: 'O link expirou. Solicite uma nova redefinição de senha.',
}

export function ResetPassword() {
  const navigate = useNavigate()
  const [fragmento] = useState(lerFragmento)

  // verificando | pronto | invalido | concluido
  const [estado, setEstado] = useState(fragmento.valido ? 'verificando' : 'invalido')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [sessoesAtivas, setSessoesAtivas] = useState(false)
  const estadoRef = useRef(estado)

  useEffect(() => { estadoRef.current = estado }, [estado])

  // A sessao de recuperacao e gravada no navegador assim que o link abre. Quem
  // sai sem trocar a senha nao pode ficar autenticado sem ter passado pelo login
  // do servidor. So vale em 'pronto': em 'verificando' a sessao ainda nem existe
  // (e o StrictMode desmonta o efeito uma vez no desenvolvimento).
  useEffect(() => {
    const abandonar = () => {
      if (estadoRef.current === 'pronto') supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    window.addEventListener('pagehide', abandonar)
    return () => {
      window.removeEventListener('pagehide', abandonar)
      abandonar()
    }
  }, [])

  useEffect(() => {
    let cancelado = false
    // Os tokens nao devem ficar no historico nem na barra de enderecos.
    window.history.replaceState(null, '', window.location.pathname)

    const { accessToken, refreshToken, valido } = fragmento
    if (!valido) return undefined

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (!cancelado) setEstado(error || !data?.session ? 'invalido' : 'pronto')
      })
      .catch(() => {
        if (!cancelado) setEstado('invalido')
      })

    return () => { cancelado = true }
  }, [fragmento])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErro('')

    if (senha.length < MIN_SENHA) {
      setErro(`A senha deve ter pelo menos ${MIN_SENHA} caracteres.`)
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error
      // Encerra a sessao de recuperacao (e as demais): o acesso volta a passar
      // pelo login do servidor, com bloqueio por tentativas e checagem de conta ativa.
      // signOut devolve `{ error }` em vez de lancar: sem conferir, uma falha de
      // rede deixaria as outras sessoes ativas com a tela dizendo "sucesso".
      const { error: erroSaida } = await supabase.auth.signOut({ scope: 'global' })
        .catch(erroRede => ({ error: erroRede }))
      if (erroSaida) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        setSessoesAtivas(true)
      }
      setEstado('concluido')
    } catch (err) {
      setErro(MENSAGENS_ERRO[err?.code] || 'Não foi possível redefinir a senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const irParaLogin = () => navigate('/login', { replace: true })

  return (
    <div className={css.tela}>
      <div className={`glass stagger-1 ${css.cartao}`}>
        <div className={css.filete} />

        <div className={css.marca}>
          <div className={css.logoCaixa}>
            <img src="/logo-sigauto.png" alt="Logo SIGAUTO" className={css.logo} />
          </div>
          <h1 className={css.titulo}>SIGAUTO</h1>
          <p className={css.subtitulo}>Redefinição de senha</p>
        </div>

        {estado === 'verificando' && (
          <div className={css.carregando} role="status">
            <span className={css.spinner} />
            Validando o link...
          </div>
        )}

        {estado === 'invalido' && (
          <>
            <div className={css.erro} role="alert">
              Link inválido ou expirado. Solicite uma nova redefinição de senha na tela de login.
            </div>
            <button type="button" className={`btn-primary ${css.btnEntrar}`} onClick={irParaLogin}>
              Voltar ao login
            </button>
          </>
        )}

        {estado === 'concluido' && (
          <>
            <div className={css.resetEnviado} role="status">
              Senha redefinida com sucesso. Entre com a nova senha.
            </div>
            {sessoesAtivas && (
              <div className={css.erro} role="alert">
                Não foi possível encerrar as outras sessões abertas. Se suspeitar de acesso indevido,
                entre e redefina a senha de novo quando a conexão estabilizar.
              </div>
            )}
            <button type="button" className={`btn-primary ${css.btnEntrar}`} onClick={irParaLogin}>
              Ir para o login
            </button>
          </>
        )}

        {estado === 'pronto' && (
          <form onSubmit={handleSubmit}>
            <p className={css.resetTexto}>
              Defina a nova senha de acesso. Use ao menos {MIN_SENHA} caracteres.
            </p>

            <div className="form-group">
              <label htmlFor="nova-senha" className={css.rotulo}>Nova senha</label>
              <div className={css.campo}>
                <Lock size={16} color="var(--text-muted)" className={css.campoIcone} />
                <input
                  id="nova-senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  className={`form-control ${css.campoSenha}`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(v => !v)}
                  className={css.btnOlho}
                  aria-label={mostrarSenha ? 'Ocultar senhas' : 'Mostrar senhas'}
                >
                  {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmar-senha" className={css.rotulo}>Confirmar nova senha</label>
              <div className={css.campo}>
                <Lock size={16} color="var(--text-muted)" className={css.campoIcone} />
                <input
                  id="confirmar-senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  className={`form-control ${css.campoSenha}`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {erro && <div className={css.erro} role="alert">{erro}</div>}

            <button type="submit" className={`btn-primary ${css.btnEntrar}`} disabled={loading}>
              {loading ? (
                <span className={css.carregando}>
                  <span className={css.spinner} />
                  Salvando...
                </span>
              ) : 'Redefinir senha'}
            </button>
          </form>
        )}

        <p className={css.rodape}>
          TFC UniRV 2026 · Bruno Gabriel Guimarães Fernandes
        </p>
      </div>
    </div>
  )
}
