// Verificacao pos-build: nenhuma credencial de demonstracao pode sair no
// artefato servido.
//
// Roda como PLUGIN do Vite (ver vite.config.js), sobre o `outDir` que o build
// acabou de escrever. Verificar um caminho fixo era furo: `vite build --outDir
// build` publicava `build/` e o script inspecionava a `dist/` antiga, que
// estava limpa, e aprovava. O plugin recebe o diretorio resolvido, entao
// acompanha qualquer `outDir` e qualquer Build Command.
//
// Tambem roda pela linha de comando (`npm run verifica:bundle`), como segunda
// barreira na CI.
//
// Falha fechada: diretorio ausente, vazio, arquivo ilegivel ou formato
// comprimido desconhecido abortam. Nunca imprime a linha encontrada, so o
// caminho — imprimir o trecho publicaria a senha no log do Actions e da Vercel.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'

// Segredos literais que ja estiveram no fonte, mais duas sentinelas. A lista de
// valores envelhece (senha nova nao estaria nela), por isso o canario:
// CANARIO_DEMO_LOGIN vive DENTRO do bloco condicional das contas de demo, entao
// sobreviver ao build significa que a eliminacao de codigo morto falhou —
// independentemente de qual seja a senha do dia.
export const PADROES_PROIBIDOS = [
  /Gestor123/,
  /Atend123/,
  /Mec123456/,
  /\bgestor@sigauto\.com\b/,
  /\batendente@sigauto\.com\b/,
  /\bmecanico@sigauto\.com\b/,
  /CANARIO_DEMO_LOGIN/,
  // Se a substituicao do `define` falhar, o identificador sobrevive cru.
  /__DEMO_LOGIN__/,
  // Segredos que so existem no backend (CLAUDE.md, "Segredos"). Uma variavel
  // VITE_ mal nomeada os poria no bundle; as senhas acima nao pegariam isso.
  // JWT com "role":"service_role": o payload e base64url, entao a palavra muda
  // conforme o alinhamento; cada fragmento cobre uma das tres fases.
  /c2VydmljZV9yb2xl|ZXJ2aWNlX3JvbGU|NlcnZpY2Vfcm9sZ/,
  // Chave secreta no formato novo do Supabase. O prefixo sozinho aparece no
  // proprio guard do supabaseClient, por isso exige o corpo da chave.
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  // Chave de API do Google (Gemini).
  /AIza[0-9A-Za-z_-]{35}/,
]

// Inspeciona TUDO, menos o que e binario por natureza. Lista de inclusao era
// furo: `.svg`, `.webmanifest` e arquivo sem extensao ficavam de fora.
const BINARIOS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp4', '.webm', '.mp3', '.wav', '.ogg', '.pdf', '.zip',
])

const COMPRIMIDOS = {
  '.gz': gunzipSync,
  '.br': brotliDecompressSync,
}

// `statSync` em vez de `entrada.isFile()`: symlink nao e arquivo nem
// diretorio, entao saia da varredura em silencio — um link em `public/` para
// arquivo com credencial passaria sem ser lido.
function listar(dir) {
  const encontrados = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    const info = statSync(caminho)
    if (info.isDirectory()) encontrados.push(...listar(caminho))
    else if (info.isFile()) encontrados.push(caminho)
    else throw new Error(`entrada de tipo nao suportado: ${caminho}`)
  }
  return encontrados
}

function conteudoTextual(caminho) {
  const ext = extname(caminho).toLowerCase()
  const descomprimir = COMPRIMIDOS[ext]
  if (descomprimir) {
    // Artefato pre-comprimido e o que o CDN entrega: ler o .gz como texto nunca
    // casaria a regex, e pular o arquivo seria aprovar sem olhar.
    // Teto de saida: um .gz de 1 MB expande para dezenas de GB e mataria o
    // build por OOM antes de verificar nada. Estourar o teto lanca, e o
    // chamador converte em falha fechada.
    return descomprimir(readFileSync(caminho), { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8')
  }
  if (BINARIOS.has(ext)) return null
  return readFileSync(caminho, 'utf8')
}

export function verificarDiretorio(diretorio) {
  const alvo = resolve(diretorio)

  let info
  try {
    info = statSync(alvo)
  } catch {
    return { ok: false, motivo: `diretorio de build ausente: ${alvo}` }
  }
  if (!info.isDirectory()) return { ok: false, motivo: `nao e diretorio: ${alvo}` }

  const arquivos = listar(alvo)
  if (arquivos.length === 0) return { ok: false, motivo: `nenhum arquivo em ${alvo}` }

  const suspeitos = []
  let inspecionados = 0
  for (const caminho of arquivos) {
    let conteudo
    try {
      conteudo = conteudoTextual(caminho)
    } catch (erro) {
      return { ok: false, motivo: `nao foi possivel inspecionar ${basename(caminho)}: ${erro.message}` }
    }
    if (conteudo === null) continue
    inspecionados += 1
    const achados = PADROES_PROIBIDOS.filter(padrao => padrao.test(conteudo)).length
    if (achados > 0) suspeitos.push({ caminho, achados })
  }

  if (suspeitos.length > 0) {
    return { ok: false, suspeitos, inspecionados, motivo: 'credencial de demonstracao ou sentinela no artefato' }
  }
  return { ok: true, inspecionados, total: arquivos.length }
}

// Falha com mensagem, sem nunca ecoar o trecho casado.
export function relatarEFalhar(resultado, diretorio) {
  if (resultado.ok) {
    console.log(`verifica-bundle: ${resultado.inspecionados} arquivos inspecionados em ${diretorio}, nenhum segredo de demonstracao.`)
    return true
  }
  console.error(`verifica-bundle: ${resultado.motivo}`)
  for (const { caminho, achados } of resultado.suspeitos || []) {
    console.error(`  ${caminho} (${achados} padrao(oes) — conteudo omitido de proposito)`)
  }
  return false
}

// Comparacao por URL exata: `endsWith(basename(...))` fazia o modulo se achar
// entrypoint ao ser importado por qualquer processo cujo argv[1] terminasse em
// "bundle.mjs", e ai ele chamaria process.exit dentro do build.
const executadoDiretamente = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
if (executadoDiretamente) {
  const diretorio = process.argv[2] || 'dist'
  if (!relatarEFalhar(verificarDiretorio(diretorio), resolve(diretorio))) process.exit(1)
}
