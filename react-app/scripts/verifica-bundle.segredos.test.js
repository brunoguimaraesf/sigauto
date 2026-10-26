import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verificarDiretorio } from './verifica-bundle.mjs'

// Segredos de backend (service_role, sb_secret_, Gemini) nao podem sair no
// artefato publico. Os valores abaixo sao ficticios, montados em tempo de
// execucao para que nenhum formato de chave real exista no fonte.

let dir

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'verifica-segredos-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const jwt = (payload) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.assinatura-ficticia`

const verificar = (conteudo) => {
  writeFileSync(join(dir, 'index.js'), conteudo)
  return verificarDiretorio(dir)
}

describe('verificarDiretorio — segredos de backend', () => {
  // A palavra service_role pode comecar em qualquer das tres posicoes de um
  // grupo base64 (offset mod 3); cada uma gera um fragmento diferente. O prefixo
  // e montado para cair exatamente em cada posicao, conferida no proprio teste.
  const comPrefixo = (prefixo) => `{"${prefixo}":"","role":"service_role"}`
  const posicao = (texto) => texto.indexOf('service_role') % 3
  const prefixoPara = (alvo) => {
    for (let n = 1; n <= 3; n += 1) {
      if (posicao(comPrefixo('a'.repeat(n))) === alvo) return 'a'.repeat(n)
    }
    throw new Error(`sem prefixo para a posicao ${alvo}`)
  }

  it.each([0, 1, 2])('recusa JWT de service_role com a palavra na posicao %i do grupo base64', (alvo) => {
    const payload = comPrefixo(prefixoPara(alvo))
    expect(posicao(payload)).toBe(alvo)
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${Buffer.from(payload).toString('base64url')}.x`
    expect(verificar(`const k="${token}"`).ok).toBe(false)
  })

  it('recusa JWT de service_role com espaco depois dos dois-pontos', () => {
    const payload = Buffer.from('{"iss":"supabase", "role": "service_role"}').toString('base64url')
    expect(verificar(`const k="${b64({ alg: 'HS256' })}.${payload}.x"`).ok).toBe(false)
  })

  it('aprova a chave anon, que e publica por design', () => {
    const anon = jwt({ iss: 'supabase-demo', role: 'anon', exp: 1983812996 })
    expect(verificar(`const k="${anon}"`).ok).toBe(true)
  })

  it('recusa chave secreta sb_secret_ com corpo', () => {
    expect(verificar(`const k="sb_secret_${'Q'.repeat(32)}"`).ok).toBe(false)
  })

  it('aprova o guard que so compara o prefixo sb_secret_', () => {
    expect(verificar('const s=k.startsWith(`sb_secret_`)').ok).toBe(true)
  })

  it('recusa chave de API do Google', () => {
    expect(verificar(`const g="AIza${'x'.repeat(35)}"`).ok).toBe(false)
  })
})
