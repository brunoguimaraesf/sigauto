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

async function request(method, path, body) {
  const headers = await getHeaders()
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.mensagem || 'Erro na requisição'), { status: res.status, data })
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
}

// Helpers específicos por módulo
export const clientesApi = {
  listar: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/clientes${qs ? '?' + qs : ''}`)
  },
  detalhe: (id) => api.get(`/clientes/${id}`),
  criar: (data) => api.post('/clientes', data),
  atualizar: (id, data) => api.put(`/clientes/${id}`, data),
  inativar: (id) => api.patch(`/clientes/${id}/inativar`),
}

export const veiculosApi = {
  listar: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/veiculos${qs ? '?' + qs : ''}`)
  },
  detalhe: (id) => api.get(`/veiculos/${id}`),
  criar: (data) => api.post('/veiculos', data),
  atualizar: (id, data) => api.put(`/veiculos/${id}`, data),
  inativar: (id) => api.patch(`/veiculos/${id}/inativar`),
}

export const osApi = {
  listar: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/ordens-servico${qs ? '?' + qs : ''}`)
  },
  detalhe: (id) => api.get(`/ordens-servico/${id}`),
  abrir: (data) => api.post('/ordens-servico', data),
  atualizar: (id, data) => api.put(`/ordens-servico/${id}`, data),
  encerrar: (id, data) => api.patch(`/ordens-servico/${id}/encerrar`, data),
  cancelar: (id) => api.patch(`/ordens-servico/${id}/cancelar`),
}

export const estoqueApi = {
  listar: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/estoque${qs ? '?' + qs : ''}`)
  },
  detalhe: (id) => api.get(`/estoque/${id}`),
  criar: (data) => api.post('/estoque', data),
  atualizar: (id, data) => api.put(`/estoque/${id}`, data),
  inativar: (id) => api.patch(`/estoque/${id}/inativar`),
  entrada: (id, data) => api.post(`/estoque/${id}/entrada`, data),
  saida: (id, data) => api.post(`/estoque/${id}/saida`, data),
}

export const movimentacoesApi = {
  listar: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/movimentacoes${qs ? '?' + qs : ''}`)
  },
}

export const relatoriosApi = {
  atendimentos: (params) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/relatorios/atendimentos?${qs}`)
  },
  faturamento: (params) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/relatorios/faturamento?${qs}`)
  },
  estoque: () => api.get('/relatorios/estoque'),
  servicosFrequentes: () => api.get('/relatorios/servicos-frequentes'),
  clientesFrequentes: () => api.get('/relatorios/clientes-frequentes'),
}

export const chatbotApi = {
  enviarMensagem: (pergunta) => api.post('/chatbot/mensagem', { pergunta }),
  historico: () => api.get('/chatbot/historico'),
}

export const iaApi = {
  analisar: () => api.post('/ia/analisar'),
  recomendacoes: () => api.get('/ia/recomendacoes'),
}

export const usuariosApi = {
  listar: () => api.get('/usuarios'),
  criar: (data) => api.post('/usuarios', data),
  atualizar: (id, data) => api.put(`/usuarios/${id}`, data),
  inativar: (id) => api.patch(`/usuarios/${id}/inativar`),
}
