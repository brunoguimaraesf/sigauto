#!/usr/bin/env node
// =============================================================================
// watcher-handoff.mjs — vigia o consumo do Claude Code e passa o trabalho ao
// Codex antes de o limite estourar.
//
// POR QUE E UM PROCESSO SEPARADO: o agente nao consegue detectar o proprio
// limite. Quando a cota acaba, o turno e cortado no meio — nao sobra turno para
// escrever o handoff. Qualquer automacao que dependa do agente perceber o
// limite esta quebrada por construcao. Este processo vive fora da sessao, le os
// transcritos no disco e dispara sozinho.
//
// O QUE ELE OBSERVA (tres gatilhos independentes):
//   1) ORCAMENTO — soma ponderada dos tokens das respostas do assistente numa
//      janela deslizante (padrao 5 h, a mesma janela do plano). Passou do
//      limiar, transfere. Os pesos existem porque token de saida custa muito
//      mais que leitura de cache; o valor de `orcamentoPonderado` e uma
//      ESTIMATIVA e precisa de calibracao (ver `--relatorio`).
//   2) CONTEXTO — ocupacao da janela de contexto da sessao ativa, medida pelo
//      `input + cache_creation + cache_read` do ultimo registro dela. Mede
//      coisa DIFERENTE do orcamento: o orcamento so cresce na janela de 5 h, a
//      ocupacao cai quando a sessao compacta. Em 14/10/2026 a barra do Claude
//      Code passou de 90% com o orcamento em 31% — nenhum gatilho disparava.
//   3) PARADA — turno em aberto (ultimo registro e prompt do usuario, ou
//      resposta do assistente com tool_use) sem nenhum registro novo por
//      `minutosParado`. Cobre o caso em que a sessao morre no meio do turno.
//      So dispara com uso acima de `usoMinimoParaParado`, senao ele acionaria o
//      Codex toda vez que o usuario saisse para almocar.
//
// O QUE ELE NAO FAZ, DE PROPOSITO:
//   - Nao commita, nao faz stash, nao mexe no git. Arvore suja e registrada no
//     CONTEXTO.md e repassada ao Codex como aviso. Escrita no historico do
//     repositorio e decisao de quem programa, nao de um vigia.
//   - Nao mata o processo do Codex. A devolucao espera ele terminar.
//   - Nao edita codigo. O unico arquivo que ele escreve e o CONTEXTO.md (bloco
//     de estado e historico) e o proprio log.
//
// USO:
//   node scripts/watcher-handoff.mjs                 # vigia continuamente
//   node scripts/watcher-handoff.mjs --once          # uma avaliacao e sai
//   node scripts/watcher-handoff.mjs --dry-run       # mostra o que faria
//   node scripts/watcher-handoff.mjs --relatorio     # so o consumo da janela
//   node scripts/watcher-handoff.mjs --config <path>
// =============================================================================

import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const temFlag = (f) => args.includes(f)
const valorFlag = (f, padrao) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao
}

const DRY = temFlag('--dry-run')
const UMA_VEZ = temFlag('--once')
const SO_RELATORIO = temFlag('--relatorio')

const config = JSON.parse(
  fs.readFileSync(valorFlag('--config', path.join(AQUI, 'watcher-handoff.config.json')), 'utf8'),
)

const ARQ_ESTADO = path.join(AQUI, '.watcher-estado.json')
const ARQ_LOG = path.join(AQUI, 'logs', 'watcher-handoff.log')
const CONTEXTO = path.join(config.repo, config.contexto)

// -----------------------------------------------------------------------------
// Log: uma linha por evento, em arquivo e no stdout.
// -----------------------------------------------------------------------------
function log(nivel, msg) {
  const linha = `${new Date().toISOString()} [${nivel}] ${msg}`
  console.log(linha)
  try {
    fs.mkdirSync(path.dirname(ARQ_LOG), { recursive: true })
    fs.appendFileSync(ARQ_LOG, linha + '\n')
  } catch (e) {
    console.error('falha ao gravar log:', e.message)
  }
}

const lerEstado = () => {
  try {
    return JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8'))
  } catch {
    return { fase: 'vigiando', handoffEm: null, codexPid: null, codexSaida: null }
  }
}
const gravarEstado = (e) => fs.writeFileSync(ARQ_ESTADO, JSON.stringify(e, null, 2))

// -----------------------------------------------------------------------------
// Leitura dos transcritos. Formato: um JSON por linha; as respostas do
// assistente trazem `message.usage` e `timestamp`. Linha corrompida (o arquivo e
// escrito enquanto lemos) e ignorada — nunca derruba o vigia.
// -----------------------------------------------------------------------------
// A cota e da CONTA, nao do projeto: por padrao soma todos os diretorios de
// `transcritosRaiz`. `filtroProjetos` (lista de trechos de nome) restringe,
// quando se quer medir so um projeto — mas ai a medida subestima o consumo
// real, porque sessoes de outros projetos gastam da mesma cota.
function diretoriosDeTranscrito() {
  const raiz = config.transcritosRaiz
  if (!fs.existsSync(raiz)) {
    log('ERRO', `raiz de transcritos nao existe: ${raiz}`)
    return []
  }
  const filtros = config.filtroProjetos || []
  return fs
    .readdirSync(raiz, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((nome) => filtros.length === 0 || filtros.some((f) => nome.toLowerCase().includes(f.toLowerCase())))
    .map((nome) => path.join(raiz, nome))
}

function lerRegistros(desdeMs) {
  const arquivos = diretoriosDeTranscrito().flatMap((dir) => {
    let nomes = []
    try {
      nomes = fs.readdirSync(dir)
    } catch {
      return []
    }
    return nomes
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(dir, f))
      .filter((f) => {
        try {
          return fs.statSync(f).mtimeMs >= desdeMs
        } catch {
          return false
        }
      })
  })

  const registros = []
  for (const arq of arquivos) {
    let bruto
    try {
      bruto = fs.readFileSync(arq, 'utf8')
    } catch {
      continue
    }
    for (const linha of bruto.split('\n')) {
      if (!linha.trim()) continue
      let o
      try {
        o = JSON.parse(linha)
      } catch {
        continue
      }
      const ts = Date.parse(o.timestamp || '')
      if (!Number.isFinite(ts) || ts < desdeMs) continue
      registros.push({
        ts,
        tipo: o.type,
        uso: o.message?.usage,
        conteudo: o.message?.content,
        // Para o gatilho de contexto: de qual sessao e de qual projeto veio a
        // linha. A ocupacao da janela e por sessao, nao por conta.
        sessao: path.basename(arq, '.jsonl'),
        projeto: path.basename(path.dirname(arq)),
        // Linha de subagent: tem janela de contexto propria, nao conta para a
        // ocupacao da sessao principal.
        sidechain: o.isSidechain === true,
      })
    }
  }
  return registros.sort((a, b) => a.ts - b.ts)
}

// -----------------------------------------------------------------------------
// Ocupacao da janela de contexto, por sessao.
//
// POR QUE E UMA MEDIDA SEPARADA DO ORCAMENTO: o orcamento soma o que foi gasto
// na janela de 5 h e so cresce; a ocupacao de contexto e um retrato do turno
// atual e CAI quando a sessao compacta. Uma sessao pode estourar o contexto com
// o orcamento em 30% — foi o que aconteceu em 14/10/2026, com a barra do Claude
// Code acima de 90% e o vigia registrando uso de 31%.
//
// COMO SE MEDE: numa requisicao, `input_tokens + cache_creation + cache_read` e
// o prompt inteiro que foi enviado — ou seja, a janela ocupada naquele momento.
// Vale o ULTIMO registro da sessao, nao a soma: somar contaria o mesmo contexto
// uma vez por turno.
//
// `output_tokens` fica FORA: a resposta entra no contexto do turno seguinte, e
// aparece no `input_tokens` dele. Soma-lo aqui contaria duas vezes.
//
// So conta sessao do projeto vigiado (`config.repo` virado em nome de diretorio
// pelo Claude Code) e ativa nos ultimos `minutosSessaoAtiva` — sessao fechada
// tem contexto congelado, e transferir por causa dela seria falso positivo.
// -----------------------------------------------------------------------------
function nomeProjetoDoRepo() {
  // C:/Users/elson/.../SIGAUTO -> C--Users-elson----SIGAUTO
  return config.repo.replace(/[:\\/]/g, '-')
}

function medirContexto(registros, agora) {
  const teto = config.contextoTokens || 0
  const vazio = { tokens: 0, fracao: 0, sessao: null, minutos: Infinity, sessoes: 0 }
  if (teto <= 0) return vazio

  const projeto = nomeProjetoDoRepo().toLowerCase()
  const ultimoPorSessao = new Map()
  for (const r of registros) {
    if (r.sidechain || !r.uso || r.tipo !== 'assistant') continue
    if (r.projeto.toLowerCase() !== projeto) continue
    const anterior = ultimoPorSessao.get(r.sessao)
    if (!anterior || r.ts > anterior.ts) ultimoPorSessao.set(r.sessao, r)
  }

  const limiteAtiva = (config.minutosSessaoAtiva ?? 10) * 60_000
  let pior = vazio
  let ativas = 0
  for (const r of ultimoPorSessao.values()) {
    const minutos = (agora - r.ts) / 60_000
    if (agora - r.ts > limiteAtiva) continue
    ativas += 1
    const u = r.uso
    const tokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)
    if (tokens > pior.tokens) pior = { tokens, fracao: tokens / teto, sessao: r.sessao, minutos }
  }
  return { ...pior, sessoes: ativas }
}

function medirJanela() {
  const agora = Date.now()
  const desde = agora - config.janelaHoras * 3600_000
  const registros = lerRegistros(desde)
  const p = config.pesos
  let ponderado = 0
  let bruto = 0

  for (const r of registros) {
    const u = r.uso
    if (!u) continue
    const inp = u.input_tokens || 0
    const cc = u.cache_creation_input_tokens || 0
    const cr = u.cache_read_input_tokens || 0
    const out = u.output_tokens || 0
    ponderado += inp * p.input + cc * p.cacheCreation + cr * p.cacheRead + out * p.output
    bruto += inp + cc + cr + out
  }

  const ultimo = registros[registros.length - 1]
  // Turno em aberto: ou o ultimo registro e um prompt, ou e uma resposta do
  // assistente que terminou pedindo ferramenta (ou seja, espera continuacao).
  const turnoAberto =
    !!ultimo &&
    (ultimo.tipo === 'user' ||
      (ultimo.tipo === 'assistant' &&
        Array.isArray(ultimo.conteudo) &&
        ultimo.conteudo.some((c) => c?.type === 'tool_use')))

  return {
    ponderado,
    bruto,
    contexto: medirContexto(registros, agora),
    fracao: ponderado / config.orcamentoPonderado,
    ultimoEm: ultimo ? ultimo.ts : null,
    minutosParado: ultimo ? (agora - ultimo.ts) / 60000 : Infinity,
    turnoAberto,
    respostas: registros.filter((r) => r.uso).length,
  }
}

// -----------------------------------------------------------------------------
// CONTEXTO.md: o bloco de estado fica entre cercas ``` logo apos o titulo.
// O vigia so troca os campos desse bloco e acrescenta uma linha ao historico.
// -----------------------------------------------------------------------------
function lerDono() {
  try {
    const txt = fs.readFileSync(CONTEXTO, 'utf8')
    const m = txt.match(/^OWNER:\s*(\w+)\s*$/m)
    return m ? m[1].toLowerCase() : null
  } catch {
    return null
  }
}

function atualizarContexto({ dono, motivo, sujos }) {
  let txt = fs.readFileSync(CONTEXTO, 'utf8')
  const agora = new Date().toISOString()
  txt = txt.replace(/^OWNER:.*$/m, `OWNER: ${dono}`)
  txt = txt.replace(/^HANDOFF_AT:.*$/m, `HANDOFF_AT: ${agora}`)
  txt = txt.replace(/^ATUALIZADO_EM:.*$/m, `ATUALIZADO_EM: ${agora.slice(0, 10)}`)

  const entrada =
    `\n- **${agora}** — passou para \`${dono}\`. Motivo: ${motivo}.` +
    (sujos != null ? ` Árvore de trabalho com ${sujos} arquivo(s) alterado(s), não commitados.` : '')

  if (txt.includes('## Histórico de transferências')) {
    txt = txt.replace(
      /## Histórico de transferências\s*\n(Nenhuma até agora\.)?/,
      `## Histórico de transferências\n${entrada.trimStart()}\n`,
    )
  } else {
    txt += `\n## Histórico de transferências\n${entrada}\n`
  }
  fs.writeFileSync(CONTEXTO, txt)
}

function arquivosSujos() {
  try {
    const saida = execFileSync('git', ['status', '--porcelain'], {
      cwd: config.repo,
      encoding: 'utf8',
    })
    return saida.split('\n').filter((l) => l.trim()).length
  } catch {
    return null
  }
}

// -----------------------------------------------------------------------------
// Transferencia para o Codex.
// -----------------------------------------------------------------------------
const PROMPT_CODEX = (motivo, sujos) =>
  [
    'Você assume o desenvolvimento do SIGAuto porque o Claude Code atingiu o limite de uso.',
    `Motivo da transferência: ${motivo}.`,
    '',
    'Leia PRIMEIRO o arquivo CONTEXTO.md na raiz do repositório, depois confira o estado real',
    'com `git status` e `git diff`. Quando os dois discordarem, o repositório vence.',
    '',
    'Regras obrigatórias:',
    '- NÃO sobrescreva alterações existentes. Continue a partir delas.',
    '- Respeite a lista "Arquivos em edição" do CONTEXTO.md: ela descreve trabalho já feito,',
    '  não trabalho a refazer.',
    '- Siga CLAUDE.md / AGENTS.md: português, migração nova numerada (nunca reescrever script',
    '  já aplicado), docs/DER.md atualizado no mesmo commit de mudança de schema.',
    '- Rode as suítes antes de considerar qualquer coisa concluída:',
    '  `cd react-app && npx vitest run` e `cd backend && npx vitest run`.',
    '- Mantenha o CONTEXTO.md atualizado a cada parada: tarefa, alterações, decisões, testes,',
    '  próximos passos.',
    '- Não commite nem faça push sem pedido explícito do usuário.',
    sujos != null
      ? `- A árvore tem ${sujos} arquivo(s) alterado(s) e não commitados. Trate como trabalho em andamento.`
      : '',
    '',
    'Quando terminar o item em andamento e as suítes estiverem verdes, escreva uma seção',
    'HANDBACK no fim do CONTEXTO.md com o que fez e o que ficou pendente, e pare.',
  ]
    .filter(Boolean)
    .join('\n')

function comandoCodex() {
  // No Windows o executavel instalado pelo npm e `codex.cmd`. Nomear o .cmd
  // direto evita `shell: true`, que CONCATENA os argumentos sem escapar — o
  // prompt tem varias linhas e aspas, e a linha de comando saia quebrada.
  const c = config.codex.comando
  if (process.platform === 'win32' && !/\.(cmd|bat|exe)$/i.test(c)) return `${c}.cmd`
  return c
}

function acionarCodex(motivo, sujos) {
  const prompt = PROMPT_CODEX(motivo, sujos)
  // `-` faz o codex exec ler as instrucoes do stdin: nada do prompt passa pela
  // linha de comando.
  const argumentos = [...config.codex.argumentos, '-C', config.repo, '-']

  if (DRY) {
    log('DRY', `acionaria: ${comandoCodex()} ${argumentos.join(' ')} <prompt pelo stdin>`)
    return null
  }

  fs.mkdirSync(path.join(AQUI, 'logs'), { recursive: true })
  const carimbo = Date.now()
  const arqSaida = path.join(AQUI, 'logs', `codex-${carimbo}.log`)
  // O prompt tambem vai para disco: sem isso nao da para auditar depois com o
  // que o Codex foi acionado.
  fs.writeFileSync(path.join(AQUI, 'logs', `codex-${carimbo}.prompt.txt`), prompt)
  const fd = fs.openSync(arqSaida, 'a')
  const filho = spawn(comandoCodex(), argumentos, {
    cwd: config.repo,
    stdio: ['pipe', fd, fd],
    detached: true,
    windowsHide: true,
  })
  filho.stdin.end(prompt)
  filho.unref()
  log('INFO', `Codex acionado (pid ${filho.pid}); saida em ${arqSaida}`)
  return filho.pid
}

const vivo = (pid) => {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// -----------------------------------------------------------------------------
// Ciclo
// -----------------------------------------------------------------------------
function avaliar() {
  const m = medirJanela()
  const dono = lerDono()
  const estado = lerEstado()
  const pct = (m.fracao * 100).toFixed(1)
  const pctCtx = (m.contexto.fracao * 100).toFixed(1)

  if (SO_RELATORIO) {
    console.log(
      JSON.stringify(
        {
          janelaHoras: config.janelaHoras,
          respostas: m.respostas,
          tokensBrutos: m.bruto,
          tokensPonderados: Math.round(m.ponderado),
          orcamento: config.orcamentoPonderado,
          usoPct: Number(pct),
          contexto: {
            sessao: m.contexto.sessao,
            tokens: m.contexto.tokens,
            teto: config.contextoTokens,
            usoPct: Number(pctCtx),
            sessoesAtivas: m.contexto.sessoes,
            minutosDesdeUltimaResposta: Number.isFinite(m.contexto.minutos)
              ? Number(m.contexto.minutos.toFixed(1))
              : null,
          },
          minutosDesdeUltimoRegistro: Number(m.minutosParado.toFixed(1)),
          turnoAberto: m.turnoAberto,
          dono,
          fase: estado.fase,
        },
        null,
        2,
      ),
    )
    return
  }

  if (dono == null) {
    log('ERRO', `CONTEXTO.md sem campo OWNER (${CONTEXTO}). Vigia nao transfere as cegas.`)
    return
  }

  // --- devolucao ------------------------------------------------------------
  if (estado.fase === 'codex') {
    if (vivo(estado.codexPid)) {
      log('INFO', `Codex em execucao (pid ${estado.codexPid}); uso ${pct}%.`)
      return
    }
    if (m.fracao >= config.limiarRetorno) {
      log('INFO', `Codex terminou, mas o uso ainda esta em ${pct}% (retorno so abaixo de ${config.limiarRetorno * 100}%).`)
      return
    }
    log('INFO', `Devolvendo a preferencia ao Claude: uso ${pct}%, Codex encerrado.`)
    if (!DRY) atualizarContexto({ dono: 'claude', motivo: `retorno automatico, uso em ${pct}%`, sujos: arquivosSujos() })
    gravarEstado({ fase: 'vigiando', handoffEm: null, codexPid: null, codexSaida: Date.now() })
    return
  }

  if (dono !== 'claude') {
    log('INFO', `OWNER=${dono} no CONTEXTO.md; nada a fazer.`)
    return
  }

  // --- gatilhos -------------------------------------------------------------
  let motivo = null
  if (m.fracao >= config.limiarHandoff) {
    motivo = `orcamento da janela de ${config.janelaHoras} h em ${pct}% (limiar ${config.limiarHandoff * 100}%)`
  } else if (config.limiarContexto > 0 && m.contexto.fracao >= config.limiarContexto) {
    motivo =
      `janela de contexto da sessao ${m.contexto.sessao} em ${pctCtx}% ` +
      `(${m.contexto.tokens} de ${config.contextoTokens} tokens, limiar ${config.limiarContexto * 100}%)`
  } else if (
    m.turnoAberto &&
    m.minutosParado >= config.minutosParado &&
    m.fracao >= config.usoMinimoParaParado
  ) {
    motivo = `turno em aberto parado ha ${m.minutosParado.toFixed(0)} min com uso em ${pct}%`
  }

  if (!motivo) {
    log(
      'INFO',
      `uso ${pct}% | contexto ${pctCtx}% (${m.contexto.sessoes} sessao(oes) ativa(s)) | ` +
        `${m.respostas} respostas na janela | ultimo registro ha ${m.minutosParado.toFixed(1)} min`,
    )
    return
  }

  const sujos = arquivosSujos()
  log('ALERTA', `Transferindo para o Codex: ${motivo}.`)
  if (!DRY) atualizarContexto({ dono: 'codex', motivo, sujos })
  const pid = acionarCodex(motivo, sujos)
  if (!DRY) gravarEstado({ fase: 'codex', handoffEm: Date.now(), codexPid: pid, codexSaida: null })
}

function ciclo() {
  try {
    avaliar()
  } catch (e) {
    log('ERRO', `${e.message}`)
  }
}

ciclo()
if (!UMA_VEZ && !SO_RELATORIO) {
  log('INFO', `vigia ativo: janela ${config.janelaHoras} h, limiar ${config.limiarHandoff * 100}%, intervalo ${config.intervaloSegundos} s${DRY ? ' (dry-run)' : ''}`)
  setInterval(ciclo, config.intervaloSegundos * 1000)
}
