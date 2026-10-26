import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || ''
const EMAIL_GESTOR = process.env.AUDIT_GESTOR_EMAIL || ''
const SENHA_GESTOR = process.env.AUDIT_GESTOR_PASSWORD || ''
const EMAIL_MECANICO = process.env.AUDIT_MECANICO_EMAIL || ''
const SENHA_MECANICO = process.env.AUDIT_MECANICO_PASSWORD || ''
const ARQUIVO_SAIDA = process.env.AUDIT_OUTPUT || ''

validarAlvoLocal(SUPABASE_URL)
if (!ANON_KEY || !EMAIL_GESTOR || !SENHA_GESTOR || !EMAIL_MECANICO || !SENHA_MECANICO) {
  throw new Error('Defina a chave anon e as credenciais sintéticas de gestor e mecânico.')
}

const payloads = {
  aspas: `'"\\`,
  booleana: `' OR '1'='1' --`,
  comentario: `teste'/**/OR/**/TRUE--`,
  filtro: `x,ativo.eq.true`,
  atraso: `x'; SELECT pg_sleep(2); --`,
  identificador: `00000000-0000-0000-0000-000000000000' OR TRUE --`,
  ordenacao: `nome.desc; SELECT pg_sleep(2); --`,
  longa: `A'.repeat(0)--${'X'.repeat(1024)}`,
}

const resultados = []
const inicioAuditoria = performance.now()
let servicoCriado = null
let erroLimpeza = null

function validarAlvoLocal(urlInformada) {
  let url
  try {
    url = new URL(urlInformada)
  } catch {
    throw new Error('VITE_SUPABASE_URL inválida.')
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('Auditoria recusada: use somente Supabase local/efêmero.')
  }
}

function cliente() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function autenticar(email, password) {
  const db = cliente()
  const { data, error } = await db.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`Falha ao autenticar conta sintética: ${error?.message || 'sessão ausente'}`)
  return { db, token: data.session.access_token }
}

function contemDetalheInterno(valor) {
  const texto = JSON.stringify(valor)
  return /postgres(?:ql)?:\/\/|service_role|PL\/pgSQL function|invalid input syntax for type|"code":"(?:22|23|42)[0-9A-Z]{3}"|node_modules|at\s+\S+\s+\([^)]*:\d+:\d+\)/i.test(texto)
}

async function requisitar(caminho, token = null, opcoes = {}) {
  const inicio = performance.now()
  const resposta = await fetch(`${SUPABASE_URL}${caminho}`, {
    ...opcoes,
    headers: {
      apikey: ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opcoes.headers || {}),
    },
    signal: AbortSignal.timeout(5000),
  })
  const texto = await resposta.text()
  let corpo
  try { corpo = JSON.parse(texto) } catch { corpo = texto }
  return { status: resposta.status, corpo, duracao_ms: Math.round((performance.now() - inicio) * 100) / 100 }
}

async function caso(nome, payload, executar, aprovar) {
  const inicio = performance.now()
  try {
    const observado = await executar()
    const aprovado = aprovar(observado) && !contemDetalheInterno(observado)
    resultados.push({ nome, payload, duracao_ms: Math.round((performance.now() - inicio) * 100) / 100, aprovado, observado })
  } catch (error) {
    resultados.push({
      nome,
      payload,
      duracao_ms: Math.round((performance.now() - inicio) * 100) / 100,
      aprovado: false,
      observado: { erro_controlado: error.name, mensagem: error.message },
    })
  }
}

const gestor = await autenticar(EMAIL_GESTOR, SENHA_GESTOR)
const mecanico = await autenticar(EMAIL_MECANICO, SENHA_MECANICO)

try {
  await caso('anon não lê clientes', null,
    () => requisitar('/rest/v1/cliente?select=id&limit=2'),
    ({ status, corpo }) => [200, 401, 403].includes(status) && (!Array.isArray(corpo) || corpo.length === 0))

  await caso('login trata condição booleana como email literal', payloads.booleana, async () => {
    const db = cliente()
    const { data, error } = await db.auth.signInWithPassword({ email: payloads.booleana, password: 'Senha1234' })
    return { sessao_criada: Boolean(data.session), rejeicao_controlada: Boolean(error) }
  }, ({ sessao_criada, rejeicao_controlada }) => !sessao_criada && rejeicao_controlada)

  for (const [nome, payload] of Object.entries(payloads).filter(([chave]) => !['identificador', 'ordenacao'].includes(chave))) {
    const filtro = new URLSearchParams({ select: 'id', nome: `eq.${payload}`, limit: '2' })
    await caso(`filtro de texto: ${nome}`, payload,
      () => requisitar(`/rest/v1/cliente?${filtro}`, gestor.token),
      ({ status, corpo, duracao_ms }) => [200, 400].includes(status)
        && (!Array.isArray(corpo) || corpo.length === 0)
        && (nome !== 'atraso' || duracao_ms < 1500))
  }

  const filtroId = new URLSearchParams({ select: 'id', id: `eq.${payloads.identificador}` })
  await caso('identificador UUID inválido', payloads.identificador,
    () => requisitar(`/rest/v1/ordem_servico?${filtroId}`, gestor.token),
    ({ status, duracao_ms }) => status === 400 && duracao_ms < 1500)

  const ordenacao = new URLSearchParams({ select: 'id,nome', order: payloads.ordenacao, limit: '2' })
  await caso('ordenação adversarial', payloads.ordenacao,
    () => requisitar(`/rest/v1/cliente?${ordenacao}`, gestor.token),
    ({ status, duracao_ms }) => status === 400 && duracao_ms < 1500)

  await caso('mecânico não lê recomendações gerenciais', payloads.booleana, async () => {
    const consulta = await mecanico.db.from('recomendacao_ia').select('id').limit(2)
    return { erro: consulta.error?.code || null, linhas: consulta.data?.length ?? 0 }
  }, ({ linhas }) => linhas === 0)

  const marcador = `AUDIT-${randomUUID().slice(0, 8)} ${payloads.comentario}`
  await caso('texto adversarial é persistido como dado', marcador, async () => {
    const insercao = await gestor.db.from('servico_catalogo')
      .insert({ nome: marcador, descricao: payloads.atraso, preco: 1, ativo: true })
      .select('id, nome, descricao')
      .single()
    if (insercao.error) return { erro: insercao.error.code, inserido: false }
    servicoCriado = insercao.data.id
    return {
      inserido: true,
      nome_literal: insercao.data.nome === marcador,
      descricao_literal: insercao.data.descricao === payloads.atraso,
    }
  }, ({ inserido, nome_literal, descricao_literal }) => inserido && nome_literal && descricao_literal)

  await caso('aplicação continua funcional após os payloads', null, async () => {
    const consulta = await gestor.db.from('cliente').select('id').limit(1)
    return { erro: consulta.error?.code || null, respondeu: Array.isArray(consulta.data) }
  }, ({ erro, respondeu }) => !erro && respondeu)
} finally {
  if (servicoCriado) {
    const { error } = await gestor.db.from('servico_catalogo').delete().eq('id', servicoCriado)
    if (error) erroLimpeza = new Error(`Falha ao remover fixture própria: ${error.message}`)
  }
}
if (erroLimpeza) throw erroLimpeza

const relatorio = {
  executado_em: new Date().toISOString(),
  alvo: new URL(SUPABASE_URL).origin,
  duracao_total_ms: Math.round((performance.now() - inicioAuditoria) * 100) / 100,
  total: resultados.length,
  aprovados: resultados.filter(({ aprovado }) => aprovado).length,
  reprovados: resultados.filter(({ aprovado }) => !aprovado).length,
  resultados,
}

if (ARQUIVO_SAIDA) await writeFile(ARQUIVO_SAIDA, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(relatorio, null, 2))
if (relatorio.reprovados > 0) process.exitCode = 1
