import { execFileSync } from 'node:child_process'

const API_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
const EMAIL = process.env.AUTH_HOOK_EMAIL || 'gestor@sigauto.com'
const PASSWORD = process.env.AUTH_HOOK_PASSWORD || 'Gestor123'
const CONTAINER = process.env.AUTH_HOOK_DB_CONTAINER || 'supabase_db_sigauto-e2e'

const alvo = new URL(API_URL)
if (alvo.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(alvo.hostname)) {
  throw new Error('Teste recusado: SUPABASE_URL deve ser local.')
}
if (!ANON_KEY) throw new Error('Defina VITE_SUPABASE_ANON_KEY ou SUPABASE_ANON_KEY local.')

function limpar() {
  const emailSql = EMAIL.replaceAll("'", "''")
  execFileSync('docker', [
    'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1',
  ], {
    input: `DELETE FROM public.login_tentativa_auth WHERE id_usuario = (SELECT id FROM auth.users WHERE lower(email) = lower('${emailSql}'));\n`,
    stdio: ['pipe', 'ignore', 'inherit'],
  })
}

async function grant(password) {
  const resposta = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password }),
    signal: AbortSignal.timeout(5000),
  })
  await resposta.arrayBuffer()
  return resposta.status
}

try {
  limpar()
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const codigo = await grant(`SenhaIncorreta-${tentativa}`)
    if (codigo !== 400) throw new Error(`Falha ${tentativa} retornou HTTP ${codigo}; esperado 400.`)
  }
  const quinta = await grant('SenhaIncorreta-5')
  if (quinta !== 429) throw new Error(`Quinta falha retornou HTTP ${quinta}; esperado 429.`)
  const bloqueada = await grant(PASSWORD)
  if (bloqueada !== 429) throw new Error(`Senha correta contornou o bloqueio: HTTP ${bloqueada}.`)
  limpar()
  const recuperada = await grant(PASSWORD)
  if (recuperada !== 200) throw new Error(`Login não recuperou após limpeza controlada: HTTP ${recuperada}.`)
  console.log('OK: grant direto bloqueado apos cinco falhas e recuperado apos expiracao simulada.')
} finally {
  limpar()
}
