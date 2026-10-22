/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { authApi } from '../services/api'
import { DEMO_LOGIN_HABILITADO } from '../demoLogin'

// Exportado para quem precisa do perfil sem exigir o provider (telas testadas
// isoladamente): `useAuth` continua lancando quando o provider falta.
export const AuthContext = createContext(null)

// Contas demo para uso sem Supabase configurado. So no servidor de dev:
// no build de producao isso embutia senha de conta real no artefato servido e,
// num deploy sem as variaveis do Supabase, concedia perfil 'gestor' validando a
// senha em JavaScript, sem servidor nenhum. Em producao o objeto fica vazio,
// `loginDemo` sempre recusa e a falta de configuracao falha fechada. A
// bandeira vem do vite.config.js e NAO depende de NODE_ENV (ver comentario la).
// 'CANARIO_DEMO_LOGIN' nao tem funcao em runtime: existe para o verificador de
// bundle (scripts/verifica-bundle.mjs) detectar se este bloco sobreviveu ao
// build, independentemente de quais sejam as senhas.
const DEMO_USERS = DEMO_LOGIN_HABILITADO ? {
  _canario: 'CANARIO_DEMO_LOGIN',
  'gestor@sigauto.com':    { senha: 'Gestor123', perfil: 'gestor',    nome: 'Bruno Gestor' },
  'atendente@sigauto.com': { senha: 'Atend123',  perfil: 'atendente', nome: 'Ana Atendente' },
  'mecanico@sigauto.com':  { senha: 'Mec123456', perfil: 'mecanico',  nome: 'Carlos Mecânico' },
} : {}

const isSupabaseReal = () => {
  const url = import.meta.env.VITE_SUPABASE_URL || ''
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  const urlPermitida = url.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/.test(url)
  return Boolean(url && anonKey && !anonKey.startsWith('sb_secret_') && urlPermitida && !url.includes('placeholder'))
}

const buildDemoUser = (email, demo) => ({
  id: `demo-${demo.perfil}`,
  email,
  perfil: demo.perfil,
  user_metadata: { nome: demo.nome }
})

const loginDemo = (email, senha) => {
  if (!DEMO_LOGIN_HABILITADO) {
    throw new Error('Configuracao do servidor ausente. Procure o administrador.')
  }
  // `DEMO_USERS[chave]` alcancava o prototipo: e-mail '__proto__' devolvia
  // Object.prototype (truthy) e, com senha undefined, a comparacao passava.
  // Nao era alcancavel pela tela (o input manda string), mas a classe fecha com
  // chave propria e comparacao de string.
  const chave = String(email || '').toLowerCase()
  const demo = Object.hasOwn(DEMO_USERS, chave) ? DEMO_USERS[chave] : null
  if (!demo || typeof demo.senha !== 'string' || typeof senha !== 'string' || demo.senha !== senha) {
    throw new Error('E-mail ou senha incorretos.')
  }
  return buildDemoUser(email, demo)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(isSupabaseReal())

  const carregarPerfil = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('usuario')
        .select('perfil, nome, ativo')
        .eq('id', userId)
        .single()
      if (error) throw error
      if (data && data.ativo) {
        setPerfil(data.perfil)
        return data.perfil
      }
    } catch {
      // Falha ao ler o perfil: sem perfil, nao "gestor". O padrao antigo era
      // fail-open — erro de rede, linha ausente em `usuario` ou conta inativa
      // davam privilegio de gestor na interface. O banco sempre recusou (o RLS
      // decide por `fn_perfil_usuario_atual()`, que exige `ativo = true`), mas
      // a tela abria as rotas de gestor e, na de estoque, mandava `custo` no
      // payload com o formulario vazio — apagando o custo real.
      setPerfil(null)
      return null
    }
    // Linha ausente ou `ativo = false` caem aqui: mesmo tratamento.
    setPerfil(null)
    return null
  }

  useEffect(() => {
    if (!isSupabaseReal()) {
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        carregarPerfil(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        carregarPerfil(session.user.id)
      } else {
        setUser(null)
        setPerfil(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email, senha) => {
    // Modo demo: valida contra DEMO_USERS quando Supabase não está configurado
    if (!isSupabaseReal()) {
      const fakeUser = loginDemo(email, senha)
      setUser(fakeUser)
      setPerfil(fakeUser.perfil)
      return { user: fakeUser }
    }

    const resposta = await authApi.login(email, senha)
    const { data, error } = await supabase.auth.setSession({
      access_token: resposta.dados.token,
      refresh_token: resposta.dados.refresh_token,
    })
    if (error || !data?.session?.user) throw error || new Error('Não foi possível iniciar a sessão.')
    setUser(data.session.user)
    await carregarPerfil(data.session.user.id)
    return data
  }

  const statusLogin = async (email) => {
    if (!isSupabaseReal()) return null
    const resposta = await authApi.statusLogin(email)
    return resposta.dados?.bloqueadoAte || null
  }

  const logout = async () => {
    if (isSupabaseReal()) {
      await supabase.auth.signOut()
    }
    setUser(null)
    setPerfil(null)
  }

  const isAuthenticated = !!user

  return (
    <AuthContext.Provider value={{ user, perfil, isAuthenticated, loading, login, statusLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
