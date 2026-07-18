import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const isSecretKey = supabaseAnonKey.startsWith('sb_secret_')

const isUrlValid = (url) => {
  try {
    return url &&
      (url.startsWith('http://') || url.startsWith('https://')) &&
      !url.includes('placeholder')
  } catch {
    return false
  }
}

const supabaseOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
}

const fallbackClient = {
  supabaseUrl: supabaseUrl || 'placeholder',
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    signInWithPassword: async () => ({
      data: null,
      error: new Error(isSecretKey
        ? 'A chave sb_secret nao pode ser usada no navegador. Use a publishable/anon key no VITE_SUPABASE_ANON_KEY.'
        : 'Supabase nao configurado')
    }),
    signOut: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ data: null, error: null }),
  },
  from: () => ({
    select: () => ({
      limit: () => Promise.resolve({ data: [], error: new Error(isSecretKey ? 'Chave sb_secret bloqueada no navegador.' : 'Supabase nao configurado') }),
      order: () => Promise.resolve({ data: [], error: new Error(isSecretKey ? 'Chave sb_secret bloqueada no navegador.' : 'Supabase nao configurado') }),
    }),
    insert: () => Promise.resolve({ data: null, error: new Error(isSecretKey ? 'Chave sb_secret bloqueada no navegador.' : 'Supabase nao configurado') }),
    update: () => ({ eq: () => Promise.resolve({ data: null, error: new Error(isSecretKey ? 'Chave sb_secret bloqueada no navegador.' : 'Supabase nao configurado') }) }),
    delete: () => ({ eq: () => Promise.resolve({ data: null, error: new Error(isSecretKey ? 'Chave sb_secret bloqueada no navegador.' : 'Supabase nao configurado') }) }),
  }),
}

const hasSupabaseConfig = isUrlValid(supabaseUrl) && supabaseAnonKey && !isSecretKey

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, supabaseOptions)
  : fallbackClient

export const supabaseDb = supabase
