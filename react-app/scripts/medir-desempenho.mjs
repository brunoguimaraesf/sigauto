import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const EMAIL = process.env.PERF_GESTOR_EMAIL || ''
const PASSWORD = process.env.PERF_GESTOR_PASSWORD || ''
const alvo = validarAlvo(SUPABASE_URL)

if (!ANON_KEY || !SERVICE_KEY || !EMAIL || !PASSWORD) {
  throw new Error('Defina VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PERF_GESTOR_EMAIL e PERF_GESTOR_PASSWORD no ambiente.')
}

const configuracao = {
  clientesCarga: inteiroAmbiente('PERF_CLIENTES', 200, 50, 2000),
  veiculosCarga: inteiroAmbiente('PERF_VEICULOS', 200, 50, 2000),
  repeticoes: inteiroAmbiente('PERF_REPETICOES', 30, 1, 100),
  duracaoNivelMs: inteiroAmbiente('PERF_DURACAO_NIVEL_MS', 0, 100, 300000),
  niveis: niveisAmbiente(),
  rampaMs: inteiroAmbiente('PERF_RAMPA_MS', 2000, 0, 30000),
  recuperacaoMs: inteiroAmbiente('PERF_RECUPERACAO_MS', 1000, 0, 30000),
  maxRequisicoes: inteiroAmbiente('PERF_MAX_REQUESTS', 12000, 100, 50000),
  maxP95Ms: numeroAmbiente('PERF_STOP_P95_MS', 3000, 100, 60000),
  maxTaxaErros: numeroAmbiente('PERF_STOP_ERROR_RATE', 0.05, 0, 1),
  maxCpuBanco: numeroAmbiente('PERF_STOP_DB_CPU_PERCENT', 85, 1, 100),
  maxMemoriaBancoMb: numeroAmbiente('PERF_STOP_DB_MEMORY_MB', 2048, 64, 65536),
  amostrarRecursosCada: inteiroAmbiente('PERF_RESOURCE_SAMPLE_EVERY', 5, 1, 100),
  containerBanco: process.env.PERF_DB_CONTAINER || 'supabase_db_sigauto-e2e',
}

const maiorConcorrencia = Math.max(...configuracao.niveis)
if (configuracao.clientesCarga < Math.max(maiorConcorrencia, configuracao.veiculosCarga)) {
  throw new Error(`PERF_CLIENTES precisa ser pelo menos ${Math.max(maiorConcorrencia, configuracao.veiculosCarga)} para cobrir veículos e isolar as gravações simultâneas.`)
}
const requisicoesPlanejadas = configuracao.niveis.reduce(
  (total, concorrencia) => total + concorrencia + (concorrencia * configuracao.repeticoes * 4) + 1,
  0,
)
if (requisicoesPlanejadas > configuracao.maxRequisicoes) {
  throw new Error(`Ensaio recusado: ${requisicoesPlanejadas} requisições planejadas excedem PERF_MAX_REQUESTS=${configuracao.maxRequisicoes}.`)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const fixtureId = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
const agora = new Date().toISOString()
const ids = { clientes: [], veiculos: [] }

function inteiroAmbiente(nome, padrao, minimo, maximo) {
  const valor = process.env[nome]
  if (valor === undefined || valor === '') return padrao
  if (!/^\d+$/.test(valor)) throw new Error(`${nome} deve ser um inteiro.`)
  const numero = Number(valor)
  if (!Number.isSafeInteger(numero) || numero < minimo || numero > maximo) {
    throw new Error(`${nome} deve estar entre ${minimo} e ${maximo}.`)
  }
  return numero
}

function numeroAmbiente(nome, padrao, minimo, maximo) {
  const valor = process.env[nome]
  if (valor === undefined || valor === '') return padrao
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero < minimo || numero > maximo) {
    throw new Error(`${nome} deve estar entre ${minimo} e ${maximo}.`)
  }
  return numero
}

function niveisAmbiente() {
  const valores = (process.env.PERF_CONCURRENCY_LEVELS || '1,5,10,20,50')
    .split(',')
    .map(valor => Number(valor.trim()))
  if (!valores.length || valores.some(valor => !Number.isSafeInteger(valor) || valor < 1 || valor > 50)) {
    throw new Error('PERF_CONCURRENCY_LEVELS deve conter inteiros de 1 a 50 separados por vírgula.')
  }
  return [...new Set(valores)].sort((a, b) => a - b)
}

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
  const clientes = Array.from({ length: configuracao.clientesCarga }, (_, indice) => ({
    id: randomUUID(),
    nome: `PERF-${fixtureId}-CLIENTE-${String(indice).padStart(3, '0')}`,
    tipo_pessoa: 'fisica',
    cpf_cnpj: `P${fixtureId}${String(indice).padStart(9, '0')}`.slice(0, 18),
    telefone: `649${String(indice).padStart(8, '0')}`.slice(0, 20),
    email: null,
    ativo: true,
  }))
  ids.clientes.push(...clientes.map(({ id }) => id))
  await inserirEmLotes('cliente', clientes)
  const veiculos = clientes.slice(0, configuracao.veiculosCarga).map((cliente, indice) => ({
    id: randomUUID(),
    id_cliente: cliente.id,
    placa: `P${fixtureId.slice(0, 4)}${String(indice).padStart(2, '0')}`.slice(0, 10),
    modelo: `Modelo carga ${indice}`,
    marca: 'SIGAuto',
    ano: new Date().getFullYear(),
    cor: 'Cinza',
    ativo: true,
  }))
  ids.veiculos.push(...veiculos.map(({ id }) => id))
  await inserirEmLotes('veiculo', veiculos)
}

async function inserirEmLotes(tabela, linhas) {
  for (let indice = 0; indice < linhas.length; indice += 50) {
    await exigirSucesso(admin.from(tabela).insert(linhas.slice(indice, indice + 50)), `Criar fixtures de ${tabela}`)
  }
}

async function removerFixtures() {
  const falhas = []
  for (const [tabela, lista] of [['veiculo', ids.veiculos], ['cliente', ids.clientes]]) {
    for (let indice = 0; indice < lista.length; indice += 100) {
      const { error } = await admin.from(tabela).delete().in('id', lista.slice(indice, indice + 100))
      if (error) falhas.push(`${tabela}: ${error.message}`)
    }
  }
  if (falhas.length) throw new Error(`Falha ao limpar fixtures próprias: ${falhas.join('; ')}`)
}

const formatos = {
  clientes: { executar: db => db.from('cliente').select('*, endereco_estruturado:endereco(*)').eq('ativo', true).order('nome'), minimo: configuracao.clientesCarga },
  veiculos: { executar: db => db.from('veiculo').select('*').eq('ativo', true).order('placa'), minimo: configuracao.veiculosCarga },
  ordens: { executar: db => db.from('ordem_servico').select('*, os_servico(*), os_peca(*), os_comissao(*)').order('data_abertura', { ascending: false }) },
}

async function medir(fn, minimo = 0) {
  const inicio = performance.now()
  try {
    const { data, error, status } = await fn()
    const mensagem = error?.message || (Array.isArray(data) && data.length < minimo ? `Esperadas ${minimo} linhas visíveis; recebidas ${data.length}.` : null)
    return { ms: performance.now() - inicio, erro: mensagem, status: status || error?.status || null }
  } catch (error) {
    return { ms: performance.now() - inicio, erro: error.message, status: error.status || null }
  }
}

function percentil(valores, percentual) {
  const ordenados = [...valores].sort((a, b) => a - b)
  return ordenados[Math.max(0, Math.ceil(percentual * ordenados.length) - 1)] ?? 0
}

function resumir(amostras, duracaoMs) {
  const duracoes = amostras.map(({ ms }) => ms)
  const erros = amostras.filter(({ erro }) => erro)
  return {
    amostras: amostras.length,
    p50_ms: arredondar(percentil(duracoes, 0.5)),
    p95_ms: arredondar(percentil(duracoes, 0.95)),
    p99_ms: arredondar(percentil(duracoes, 0.99)),
    maximo_ms: arredondar(Math.max(...duracoes)),
    requisicoes_por_segundo: arredondar(amostras.length / Math.max(duracaoMs / 1000, 0.001)),
    erros: erros.length,
    taxa_erros: arredondar(erros.length / Math.max(amostras.length, 1)),
    respostas_429: erros.filter(({ status, erro }) => status === 429 || /\b429\b/.test(erro)).length,
    timeouts: erros.filter(({ erro }) => /timeout|timed out|abort/i.test(erro)).length,
    mensagens_erro: [...new Set(erros.map(({ erro }) => erro))].slice(0, 3),
  }
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100
}

function memoriaEmMb(valor) {
  const correspondencia = String(valor).match(/^([\d.]+)([KMGT]i?B)/i)
  if (!correspondencia) return null
  const fatores = { KB: 1 / 1024, KIB: 1 / 1024, MB: 1, MIB: 1, GB: 1024, GIB: 1024, TB: 1048576, TIB: 1048576 }
  return Number(correspondencia[1]) * fatores[correspondencia[2].toUpperCase()]
}

function amostrarRecursos() {
  const processo = process.memoryUsage()
  const amostra = {
    instante: new Date().toISOString(),
    processo_node_memoria_mb: arredondar(processo.rss / 1024 / 1024),
    banco: { disponivel: false },
  }
  try {
    const saida = execFileSync('docker', [
      'stats', '--no-stream', '--format', '{{json .}}', configuracao.containerBanco,
    ], { encoding: 'utf8', timeout: 5000 }).trim()
    const dados = JSON.parse(saida)
    amostra.banco = {
      disponivel: true,
      cpu_percentual: Number.parseFloat(dados.CPUPerc),
      memoria_uso_mb: arredondar(memoriaEmMb(String(dados.MemUsage).split('/')[0].trim())),
      memoria_percentual: Number.parseFloat(dados.MemPerc),
    }
  } catch (error) {
    amostra.banco = { disponivel: false, motivo: error.code || error.name }
  }
  return amostra
}

function conferirRecursos(amostra) {
  if (!amostra.banco.disponivel) return
  if (amostra.banco.cpu_percentual > configuracao.maxCpuBanco) {
    throw new Error(`Critério de parada: CPU do banco em ${amostra.banco.cpu_percentual}%.`)
  }
  if (amostra.banco.memoria_uso_mb > configuracao.maxMemoriaBancoMb) {
    throw new Error(`Critério de parada: memória do banco em ${amostra.banco.memoria_uso_mb} MiB.`)
  }
}

async function esperar(ms) {
  if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms))
}

async function criarSessoes(concorrencia) {
  const dbs = []
  const intervalo = concorrencia > 1 ? configuracao.rampaMs / (concorrencia - 1) : 0
  for (let indice = 0; indice < concorrencia; indice++) {
    const db = criarClienteAutenticado()
    const { error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    if (error) throw new Error(`Autenticação da sessão virtual ${indice + 1} falhou: ${error.message}`)
    dbs.push(db)
    if (indice < concorrencia - 1) await esperar(intervalo)
  }
  return dbs
}

async function ensaiar(concorrencia) {
  const dbs = await criarSessoes(concorrencia)
  const porOperacao = { clientes: [], veiculos: [], ordens: [], gravacao_cliente: [] }
  const recursos = [amostrarRecursos()]
  const inicio = performance.now()

  for (let repeticao = 0; repeticao < configuracao.repeticoes; repeticao++) {
    if (repeticao > 0 && configuracao.duracaoNivelMs > 0 && performance.now() - inicio >= configuracao.duracaoNivelMs) break
    const resultados = await Promise.all(dbs.map(async (db, indice) => {
      const consultas = await Promise.all(Object.entries(formatos).map(async ([nome, definicao]) => ({
        nome,
        ...(await medir(() => definicao.executar(db), definicao.minimo)),
      })))
      const telefone = `649${String(indice * configuracao.repeticoes + repeticao).padStart(8, '0')}`
      const gravacao = await medir(() => db.from('cliente').update({ telefone }).eq('id', ids.clientes[indice]).select('id'), 1)
      return { consultas, gravacao }
    }))
    for (const resultado of resultados) {
      for (const item of resultado.consultas) porOperacao[item.nome].push(item)
      porOperacao.gravacao_cliente.push(resultado.gravacao)
    }
    if ((repeticao + 1) % configuracao.amostrarRecursosCada === 0 || repeticao === configuracao.repeticoes - 1) {
      const amostra = amostrarRecursos()
      recursos.push(amostra)
      conferirRecursos(amostra)
    }
  }

  const duracaoMs = performance.now() - inicio
  const metricas = Object.fromEntries(Object.entries(porOperacao).map(([nome, amostras]) => [nome, resumir(amostras, duracaoMs)]))
  const todas = Object.values(porOperacao).flat()
  const taxaErros = todas.filter(({ erro }) => erro).length / Math.max(todas.length, 1)
  const piorP95 = Math.max(...Object.values(metricas).map(({ p95_ms }) => p95_ms))
  if (taxaErros > configuracao.maxTaxaErros) throw new Error(`Critério de parada: taxa de erros em ${arredondar(taxaErros * 100)}%.`)
  if (piorP95 > configuracao.maxP95Ms) throw new Error(`Critério de parada: p95 em ${piorP95} ms.`)

  await esperar(configuracao.recuperacaoMs)
  const recuperacao = await medir(() => dbs[0].from('cliente').select('id').limit(1), 1)
  if (recuperacao.erro) throw new Error(`Recuperação após carga falhou: ${recuperacao.erro}`)

  return {
    concorrencia,
    duracao_ms: arredondar(duracaoMs),
    total_requisicoes_medidas: todas.length,
    requisicoes_por_segundo_total: arredondar(todas.length / Math.max(duracaoMs / 1000, 0.001)),
    metricas,
    recursos,
    recuperacao: { aprovado: true, latencia_ms: arredondar(recuperacao.ms) },
  }
}

console.log(`Alvo ${alvo.tipo}: ${alvo.origem}. Níveis: ${configuracao.niveis.join(', ')}; ${requisicoesPlanejadas} requisições planejadas; nenhuma chamada Gemini.`)
let erroExecucao
const resultados = {}
try {
  await prepararFixtures()
  for (const concorrencia of configuracao.niveis) {
    resultados[`concorrencia_${concorrencia}`] = await ensaiar(concorrencia)
  }
} catch (error) {
  erroExecucao = error
} finally {
  try {
    await removerFixtures()
  } catch (error) {
    erroExecucao = new AggregateError([erroExecucao, error].filter(Boolean), error.message)
  }
}
const relatorio = {
  alvo,
  fixtureId,
  criado_em: agora,
  status: erroExecucao ? 'interrompido' : 'concluido',
  erro: erroExecucao?.message || null,
  configuracao,
  recursos_nao_medidos: ['navegador', 'backend Express'],
  ia_simulada: process.env.PERF_IA_SIMULADA_URL ? 'não implementada nesta ferramenta' : 'não configurada',
  resultados,
}
if (process.env.PERF_OUTPUT) await writeFile(process.env.PERF_OUTPUT, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(relatorio, null, 2))
if (erroExecucao) {
  console.error(`Ensaio interrompido: ${erroExecucao.message}`)
  process.exitCode = 1
}
