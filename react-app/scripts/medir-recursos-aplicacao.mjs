import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'

const FRONTEND_URL = process.env.PERF_FRONTEND_URL || 'http://127.0.0.1:5274'
const API_URL = process.env.PERF_BACKEND_URL || 'http://127.0.0.1:3103/api/v1'
const EMAIL = process.env.PERF_GESTOR_EMAIL || ''
const PASSWORD = process.env.PERF_GESTOR_PASSWORD || ''
const BACKEND_PID = Number(process.env.PERF_BACKEND_PID)
const DURACAO_MS = inteiro('PERF_RECURSOS_DURACAO_MS', 15000, 5000, 120000)
const CONCORRENCIA_IA = inteiro('PERF_IA_CONCURRENCY', 3, 1, 10)
const INTERVALO_AMOSTRA_MS = inteiro('PERF_RESOURCE_INTERVAL_MS', 500, 200, 5000)
const ARQUIVO_SAIDA = process.env.PERF_OUTPUT || ''

validarLocal(FRONTEND_URL, 'PERF_FRONTEND_URL')
validarLocal(API_URL, 'PERF_BACKEND_URL')
if (!EMAIL || !PASSWORD) throw new Error('Defina PERF_GESTOR_EMAIL e PERF_GESTOR_PASSWORD sintéticos.')
if (!Number.isSafeInteger(BACKEND_PID) || BACKEND_PID <= 0) throw new Error('Defina PERF_BACKEND_PID com o processo local do backend.')

function inteiro(nome, padrao, minimo, maximo) {
  const texto = process.env[nome]
  if (texto === undefined || texto === '') return padrao
  if (!/^\d+$/.test(texto)) throw new Error(`${nome} deve ser inteiro.`)
  const valor = Number(texto)
  if (!Number.isSafeInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${nome} deve estar entre ${minimo} e ${maximo}.`)
  }
  return valor
}

function validarLocal(valor, nome) {
  const url = new URL(valor)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`${nome} precisa apontar para HTTP local.`)
  }
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100
}

function percentil(valores, fracao) {
  const ordenados = [...valores].sort((a, b) => a - b)
  return ordenados[Math.max(0, Math.ceil(fracao * ordenados.length) - 1)] ?? 0
}

function resumir(valores) {
  return {
    amostras: valores.length,
    p50: arredondar(percentil(valores, 0.5)),
    p95: arredondar(percentil(valores, 0.95)),
    p99: arredondar(percentil(valores, 0.99)),
    maximo: arredondar(Math.max(...valores, 0)),
  }
}

function processoWindows(pid) {
  const script = `$p=Get-Process -Id ${pid} -ErrorAction Stop; $c=[System.Globalization.CultureInfo]::InvariantCulture; [Console]::Write($p.CPU.ToString($c)+'|'+$p.WorkingSet64.ToString($c))`
  const [cpu, rss] = execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8', timeout: 3000, windowsHide: true,
  }).trim().split('|').map(Number)
  return { cpu_segundos: cpu, memoria_mb: rss / 1024 / 1024 }
}

async function processoLinux(pid) {
  const [stat, status] = await Promise.all([
    readFile(`/proc/${pid}/stat`, 'utf8'),
    readFile(`/proc/${pid}/status`, 'utf8'),
  ])
  const campos = stat.trim().split(' ')
  const ticks = Number(campos[13]) + Number(campos[14])
  const rssKb = Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1] || 0)
  return { cpu_segundos: ticks / 100, memoria_mb: rssKb / 1024 }
}

async function amostrarProcesso(pid) {
  if (process.platform === 'win32') return processoWindows(pid)
  if (process.platform === 'linux') return processoLinux(pid)
  throw new Error(`Medição do backend não implementada para ${process.platform}.`)
}

async function autenticar() {
  const resposta = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, senha: PASSWORD }),
  })
  const corpo = await resposta.json()
  if (!resposta.ok || !corpo?.dados?.token) throw new Error(`Login de ensaio falhou com HTTP ${resposta.status}.`)
  return corpo.dados.token
}

async function executarCargaIA(token, fim, metricas) {
  while (performance.now() < fim) {
    const inicio = performance.now()
    try {
      const resposta = await fetch(`${API_URL}/ia/analisar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      await resposta.arrayBuffer()
      metricas.push({ status: resposta.status, ms: performance.now() - inicio })
    } catch (error) {
      metricas.push({ status: 0, ms: performance.now() - inicio, erro: error.name })
    }
  }
}

const token = await autenticar()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')
await page.goto(`${FRONTEND_URL}/login`)
await page.getByPlaceholder('seu@email.com').fill(EMAIL)
await page.getByPlaceholder('••••••••').fill(PASSWORD)
await page.getByRole('button', { name: /^Entrar no Sistema$/ }).click()
await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 15000 })

const amostrasNavegador = []
const amostrasBackend = []
const requisicoesIA = []
const inicio = performance.now()
const fim = inicio + DURACAO_MS
let processoAnterior = await amostrarProcesso(BACKEND_PID)
let instanteAnterior = performance.now()
const metricasIniciais = await cdp.send('Performance.getMetrics')
let tarefaAnterior = Object.fromEntries(metricasIniciais.metrics.map(({ name, value }) => [name, value])).TaskDuration
const rotas = ['/', '/clientes', '/veiculos', '/ordens-servico', '/painel-ia']

const cargaIA = Promise.all(Array.from({ length: CONCORRENCIA_IA }, () => executarCargaIA(token, fim, requisicoesIA)))
let indiceRota = 0
while (performance.now() < fim) {
  await page.goto(`${FRONTEND_URL}${rotas[indiceRota % rotas.length]}`, { waitUntil: 'domcontentloaded' })
  indiceRota += 1
  const metricas = await cdp.send('Performance.getMetrics')
  const mapa = Object.fromEntries(metricas.metrics.map(({ name, value }) => [name, value]))
  const processoAtual = await amostrarProcesso(BACKEND_PID)
  const agora = performance.now()
  const decorridoSegundos = Math.max((agora - instanteAnterior) / 1000, 0.001)
  const tarefaDecorrida = mapa.TaskDuration >= tarefaAnterior
    ? mapa.TaskDuration - tarefaAnterior
    : mapa.TaskDuration
  amostrasNavegador.push({
    instante_ms: arredondar(agora - inicio),
    cpu_main_thread_percentual: arredondar(Math.min(100, (tarefaDecorrida / decorridoSegundos) * 100)),
    heap_js_mb: arredondar(mapa.JSHeapUsedSize / 1024 / 1024),
    nos_dom: mapa.Nodes,
  })
  amostrasBackend.push({
    instante_ms: arredondar(agora - inicio),
    cpu_percentual_host: arredondar(((processoAtual.cpu_segundos - processoAnterior.cpu_segundos) / decorridoSegundos / os.cpus().length) * 100),
    memoria_mb: arredondar(processoAtual.memoria_mb),
  })
  processoAnterior = processoAtual
  instanteAnterior = agora
  tarefaAnterior = mapa.TaskDuration
  await page.waitForTimeout(INTERVALO_AMOSTRA_MS)
}

await cargaIA
const inicioRecuperacao = performance.now()
const recuperacao = await fetch(`${API_URL.replace(/\/api\/v1$/, '')}/health`)
const recuperacaoMs = performance.now() - inicioRecuperacao
await browser.close()

const relatorio = {
  executado_em: new Date().toISOString(),
  ambiente: { frontend: FRONTEND_URL, backend: API_URL, backend_pid: BACKEND_PID },
  configuracao: { duracao_ms: DURACAO_MS, concorrencia_ia: CONCORRENCIA_IA, intervalo_amostra_ms: INTERVALO_AMOSTRA_MS },
  navegador: {
    cpu_main_thread_percentual: resumir(amostrasNavegador.map(item => item.cpu_main_thread_percentual)),
    heap_js_mb: resumir(amostrasNavegador.map(item => item.heap_js_mb)),
    nos_dom: resumir(amostrasNavegador.map(item => item.nos_dom)),
  },
  backend: {
    cpu_percentual_host: resumir(amostrasBackend.map(item => item.cpu_percentual_host)),
    memoria_mb: resumir(amostrasBackend.map(item => item.memoria_mb)),
  },
  ia_http_simulada: {
    total: requisicoesIA.length,
    sucessos: requisicoesIA.filter(item => item.status === 200).length,
    respostas_429: requisicoesIA.filter(item => item.status === 429).length,
    erros: requisicoesIA.filter(item => item.status === 0 || item.status >= 500).length,
    latencia_ms: resumir(requisicoesIA.map(item => item.ms)),
  },
  recuperacao: { status: recuperacao.status, latencia_ms: arredondar(recuperacaoMs) },
  amostras: { navegador: amostrasNavegador, backend: amostrasBackend },
}

if (ARQUIVO_SAIDA) await writeFile(ARQUIVO_SAIDA, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(relatorio, null, 2))
if (!recuperacao.ok || relatorio.ia_http_simulada.erros > 0 || relatorio.ia_http_simulada.sucessos === 0) process.exitCode = 1
