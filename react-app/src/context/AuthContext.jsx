/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

// Contas demo para uso sem Supabase configurado
const DEMO_USERS = {
  'gestor@sigauto.com':    { senha: 'Gestor123', perfil: 'gestor',    nome: 'Bruno Gestor' },
  'atendente@sigauto.com': { senha: 'Atend123',  perfil: 'atendente', nome: 'Ana Atendente' },
  'mecanico@sigauto.com':  { senha: 'Mec123456', perfil: 'mecanico',  nome: 'Carlos Mecânico' },
}

const isSupabaseReal = () => {
  const url = import.meta.env.VITE_SUPABASE_URL || ''
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  return Boolean(url && anonKey && !anonKey.startsWith('sb_secret_') && url.startsWith('https://') && !url.includes('placeholder'))
}

const buildDemoUser = (email, demo) => ({
  id: `demo-${demo.perfil}`,
  email,
  perfil: demo.perfil,
  user_metadata: { nome: demo.nome }
})

const loginDemo = (email, senha) => {
  const demo = DEMO_USERS[email.toLowerCase()]
  if (!demo || demo.senha !== senha) {
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
      // Sem perfil no banco — usa perfil padrão para demo
      setPerfil('gestor')
      return 'gestor'
    }
    setPerfil('gestor')
    return 'gestor'
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

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) {
      // Supabase configurado mas login falhou — lança o erro real
      // (não cai em demo, que criaria sessão falsa sem JWT e deixaria o banco vazio)
      throw new Error(
        error.message === 'Email not confirmed'
          ? 'E-mail não confirmado. Verifique a caixa de entrada ou peça ao gestor para confirmar o cadastro no Supabase.'
          : error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message
      )
    }
    if (data.user) {
      setUser(data.user)
      await carregarPerfil(data.user.id)
    }
    return data
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
    <AuthContext.Provider value={{ user, perfil, isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
