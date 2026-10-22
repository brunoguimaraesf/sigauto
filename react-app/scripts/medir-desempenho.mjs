import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const EMAIL = process.env.PERF_GESTOR_EMAIL || ''
const PASSWORD = process.env.PERF_GESTOR_PASSWORD || ''
const alvo = validarAlvo(SUPABASE_URL)

if (!ANON_KEY || !SERVICE_KEY || !EMAIL || !PASSWORD) {
  throw new Error('Defina VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PERF_GESTOR_EMAIL e PERF_GESTOR_PASSWORD no ambiente.')
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const fixtureId = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
const agora = new Date().toISOString()
const ids = { clientes: [], veiculos: [] }
const clientesCarga = 200
const veiculosCarga = 200
const sessoes = 20
const repeticoes = 30

function validarAlvo(urlInformada) {
  let url
  try {
    url = new URL(urlInformada)
  } catch {
    throw new Error('VITE_SUPABASE_URL inválida; o ensaio foi interrompido antes de acessar o banco.')
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  const homologacao = process.env.PERF_ALLOWED_SUPABASE_URL
  if (!local && (!homologacao || url.origin !== new URL(homologacao).origin || url.toString().replace(/\/$/, '') !== homologacao.replace(/\/$/, ''))) {
    throw new Error('Destino recusado. Use localhost/127.0.0.1 ou configure PERF_ALLOWED_SUPABASE_URL com a URL exata de homologação autorizada.')
  }
  if (!local && url.protocol !== 'https:') throw new Error('Homologação precisa usar HTTPS.')
  return { origem: url.origin, tipo: local ? 'local' : 'homologação autorizada' }
}

function criarClienteAutenticado() {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function exigirSucesso(promise, acao) {
  const resultado = await promise
  if (resultado.error) throw new Error(`${acao}: ${resultado.error.message}`)
  return resultado.data
}

async function prepararFixtures() {
  const { error: loginError } = await criarClienteAutenticado().auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (loginError) throw new Error(`Autenticação da conta de ensaio falhou: ${loginError.message}`)
  const clientes = Array.from({ length: clientesCarga }, (_, i) => ({
    id: randomUUID(),
    nome: `PERF-${fixtureId}-CLIENTE-${String(i).padStart(3, '0')}`,
    tipo_pessoa: 'fisica', cpf_cnpj: `P${fixtureId}${String(i).padStart(9, '0')}`.slice(0, 18),
    telefone: `649${String(i).padStart(8, '0')}`.slice(0, 20), email: null, ativo: true,
  }))
  ids.clientes.push(...clientes.map(({ id }) => id))
  await inserirEmLotes('cliente', clientes)
  const veiculos = clientes.map((cliente, i) => ({
    id: randomUUID(),
    id_cliente: cliente.id, placa: `P${fixtureId.slice(0, 4)}${String(i).padStart(2, '0')}`.slice(0, 10),
    modelo: `Modelo carga ${i}`, marca: 'SIGAuto', ano: new Date().getFullYear(), cor: 'Cinza', ativo: true,
  }))
  ids.veiculos.push(...veiculos.map(({ id }) => id))
  await inserirEmLotes('veiculo', veiculos)
}

async function inserirEmLotes(tabela, linhas) {
  for (let i = 0; i < linhas.length; i += 50) {
    await exigirSucesso(admin.from(tabela).insert(linhas.slice(i, i + 50)), `Criar fixtures de ${tabela}`)
  }
}

async function removerFixtures() {
  const falhas = []
  for (const [tabela, lista] of [['veiculo', ids.veiculos], ['cliente', ids.clientes]]) {
    for (let i = 0; i < lista.length; i += 100) {
      const { error } = await admin.from(tabela).delete().in('id', lista.slice(i, i + 100))
      if (error) falhas.push(`${tabela}: ${error.message}`)
    }
  }
  if (falhas.length) throw new Error(`Falha ao limpar fixtures próprias (${ids.clientes.length} clientes, ${ids.veiculos.length} veículos): ${falhas.join('; ')}`)
}

const formatos = {
  clientes: { executar: (db) => db.from('cliente').select('*, endereco_estruturado:endereco(*)').eq('ativo', true).order('nome'), minimo: clientesCarga },
  veiculos: { executar: (db) => db.from('veiculo').select('*').eq('ativo', true).order('placa'), minimo: veiculosCarga },
  ordens: { executar: (db) => db.from('ordem_servico').select('*, os_servico(*), os_peca(*), os_comissao(*)').order('data_abertura', { ascending: false }) },
}

async function medir(fn, minimo = 0) {
  const inicio = performance.now()
  try {
    const { data, error } = await fn()
    const erro = error?.message || (Array.isArray(data) && data.length < minimo ? `Esperadas ${minimo} linhas visíveis; recebidas ${data.length}.` : null)
    return { ms: performance.now() - inicio, erro }
  } catch (error) {
    return { ms: performance.now() - inicio, erro: error.message }
  }
}

function percentil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b)
  return ordenados[Math.max(0, Math.ceil(p * ordenados.length) - 1)] ?? 0
}

function resumir(amostras) {
  const ms = amostras.map(({ ms: duracao }) => duracao)
  return {
    amostras: amostras.length,
    p50_ms: arredondar(percentil(ms, 0.5)), p95_ms: arredondar(percentil(ms, 0.95)),
    maximo_ms: arredondar(Math.max(...ms)), erros: amostras.filter(({ erro }) => erro).length,
    mensagens_erro: [...new Set(amostras.map(({ erro }) => erro).filter(Boolean))].slice(0, 3),
  }
}

function arredondar(valor) { return Math.round(valor * 100) / 100 }

async function ensaiar(concorrencia) {
  const dbs = Array.from({ length: concorrencia }, criarClienteAutenticado)
  await Promise.all(dbs.map(async (db) => {
    const { error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    if (error) throw new Error(`Autenticação de sessão virtual falhou: ${error.message}`)
  }))
  const porOperacao = { clientes: [], veiculos: [], ordens: [], gravacao_cliente: [] }
  for (let repeticao = 0; repeticao < repeticoes; repeticao++) {
    const resultados = await Promise.all(dbs.map(async (db, indice) => {
      const consultas = await Promise.all(Object.entries(formatos).map(async ([nome, definicao]) => ({ nome, ...(await medir(() => definicao.executar(db), definicao.minimo)) })))
      const telefone = `649${String(indice * repeticoes + repeticao).padStart(8, '0')}`
      const gravacao = await medir(() => db.from('cliente').update({ telefone }).eq('id', ids.clientes[indice]).select('id'), 1)
      return { consultas, gravacao }
    }))
    for (const resultado of resultados) {
      for (const item of resultado.consultas) porOperacao[item.nome].push(item)
      porOperacao.gravacao_cliente.push(resultado.gravacao)
    }
  }
  return Object.fromEntries(Object.entries(porOperacao).map(([nome, amostras]) => [nome, resumir(amostras)]))
}

console.log(`Alvo ${alvo.tipo}: ${alvo.origem}. Fixtures sintéticas: ${clientesCarga} clientes e ${veiculosCarga} veículos; OS existentes não são alteradas. Nenhuma chamada Gemini.`)
let erroExecucao
try {
  await prepararFixtures()
  const resultados = {}
  for (const concorrencia of [1, sessoes]) {
    resultados[`concorrencia_${concorrencia}`] = await ensaiar(concorrencia)
  }
  console.log(JSON.stringify({ alvo, fixtureId, criado_em: agora, repeticoes_por_sessao: repeticoes, resultados }, null, 2))
} catch (error) {
  erroExecucao = error
} finally {
  try { await removerFixtures() } catch (error) { erroExecucao = new AggregateError([erroExecucao, error].filter(Boolean), error.message) }
}
if (erroExecucao) {
  console.error(`Ensaio interrompido: ${erroExecucao.message}`)
  process.exitCode = 1
}
