import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Credenciais de usuário não podem alterar os headers/sessão do cliente
// privilegiado compartilhado pelo backend. Cada operação pública de Auth usa
// um cliente descartável, sem persistência nem auto-refresh local.
export function criarClienteAutenticacao() {
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!process.env.SUPABASE_URL || !anonKey) {
    throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias para autenticação.')
  }
  return createClient(process.env.SUPABASE_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  })
}
