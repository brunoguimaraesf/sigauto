import { supabase } from '../supabaseClient'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'

async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { 'Content-Type': 'application/json' }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  return headers
}

// Teto de tempo do lado do cliente. Sem ele, uma função serverless pendurada
// deixa a tela "Analisando..." para sempre: o `fetch` não tem timeout próprio.
// 35 s dá folga sobre o `maxDuration: 30` do backend, então o erro que chega é o
// da API quando ela responde, e o abort só atua quando ela não responde nada.
const TIMEOUT_REQUISICAO_MS = 35000

async function request(method, path, body) {
  const headers = await getHeaders()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_REQUISICAO_MS)

  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  // Um 504 da plataforma responde HTML, não JSON: sem este tratamento o
  // `res.json()` lançava um SyntaxError que não dizia nada sobre a causa.
  let data
  try {
    data = await res.json()
  } catch {
    throw Object.assign(new Error('Resposta inválida do servidor'), { status: res.status })
  }

  if (!res.ok) throw Object.assign(new Error(data.mensagem || 'Erro na requisição'), { status: res.status, data })
  return data
}

// Só GET e POST: são os únicos verbos que as rotas sobreviventes (auth, chatbot
// e ia) usam. `put`, `patch` e `delete` existiam para o CRUD que saiu do backend.
export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
}

// Helpers por módulo. Só existem para as rotas que o backend realmente serve:
// chatbot e IA. Os helpers de clientes, veículos, OS, estoque, movimentações,
// relatórios e usuários foram removidos — apontavam para rotas de CRUD que não
// existem mais (o frontend fala direto com o Supabase sob RLS), nenhum deles era
// importado em lugar nenhum, e manter o helper sugere que a rota existe.
export const chatbotApi = {
  // historico = mensagens da sessao visivel [{ remetente, conteudo }] para o
  // contexto casar com o que o usuario ve (evita vazamento de conversas antigas).
  enviarMensagem: (pergunta, historico = []) => api.post('/chatbot/mensagem', { pergunta, historico }),
  historico: () => api.get('/chatbot/historico'),
}

function normalizarInteiroPositivo(valor, padrao, maximo) {
  const numero = typeof valor === 'number'
    ? valor
    : /^\d+$/.test(String(valor).trim())
      ? Number(valor)
      : NaN

  if (!Number.isSafeInteger(numero) || numero < 1) return padrao
  return Math.min(numero, maximo)
}

export const iaApi = {
  analisar: () => api.post('/ia/analisar'),
  recomendacoes: (pagina = 1, limite = 10) => {
    const paginaSegura = normalizarInteiroPositivo(pagina, 1, 100000)
    const limiteSeguro = normalizarInteiroPositivo(limite, 10, 50)
    return api.get(`/ia/recomendacoes?page=${paginaSegura}&limit=${limiteSeguro}`)
  },
}

export const usuariosApi = {
  criar: (dados) => api.post('/auth/usuarios', dados),
  atualizar: (id, dados) => api.patch(`/auth/usuarios/${id}`, dados),
}
