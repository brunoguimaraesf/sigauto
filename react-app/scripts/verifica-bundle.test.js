import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { verificarDiretorio } from './verifica-bundle.mjs'

// O verificador e a ultima barreira entre a senha de gestor e o artefato
// publico. Sem teste proprio, um typo numa regex o deixaria aprovando tudo em
// silencio, para sempre.

let dir

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'verifica-bundle-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const escrever = (nome, conteudo) => {
  const caminho = join(dir, nome)
  mkdirSync(join(caminho, '..'), { recursive: true })
  writeFileSync(caminho, conteudo)
  return caminho
}

describe('verificarDiretorio', () => {
  it('aprova artefato limpo', () => {
    escrever('assets/index.js', 'console.log("oi")')
    escrever('index.html', '<!doctype html><title>SIGAuto</title>')
    const r = verificarDiretorio(dir)
    expect(r.ok).toBe(true)
    expect(r.inspecionados).toBe(2)
  })

  it('reprova senha de demonstracao no JS', () => {
    escrever('assets/index.js', 'const s = "Gestor123"')
    const r = verificarDiretorio(dir)
    expect(r.ok).toBe(false)
    expect(r.suspeitos).toHaveLength(1)
  })

  it('reprova o canario, que pega falha de eliminacao de codigo morto', () => {
    // Sem nenhuma senha conhecida: e o caso de senha trocada, que a lista de
    // literais nao pegaria.
    escrever('assets/index.js', 'const x = "CANARIO_DEMO_LOGIN"')
    expect(verificarDiretorio(dir).ok).toBe(false)
  })

  it('reprova a bandeira nao substituida pelo define', () => {
    escrever('assets/index.js', 'if (__DEMO_LOGIN__) {}')
    expect(verificarDiretorio(dir).ok).toBe(false)
  })

  it('reprova credencial em sourcemap', () => {
    escrever('assets/index.js.map', '{"sourcesContent":["const s = \\"Gestor123\\""]}')
    expect(verificarDiretorio(dir).ok).toBe(false)
  })

  it('reprova credencial dentro de arquivo pre-comprimido', () => {
    const caminho = join(dir, 'assets')
    mkdirSync(caminho, { recursive: true })
    writeFileSync(join(caminho, 'index.js.gz'), gzipSync(Buffer.from('const s = "Gestor123"')))
    expect(verificarDiretorio(dir).ok).toBe(false)
  })

  it('reprova credencial em svg e em arquivo sem extensao', () => {
    escrever('icons.svg', '<svg><metadata>gestor@sigauto.com</metadata></svg>')
    expect(verificarDiretorio(dir).ok).toBe(false)

    rmSync(join(dir, 'icons.svg'))
    escrever('CONFIG', 'Mec123456')
    expect(verificarDiretorio(dir).ok).toBe(false)
  })

  it('falha fechada com diretorio ausente', () => {
    const r = verificarDiretorio(join(dir, 'nao-existe'))
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/ausente/)
  })

  it('falha fechada com diretorio vazio', () => {
    const r = verificarDiretorio(dir)
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/nenhum arquivo/)
  })

  it('nao devolve o trecho casado, so o caminho', () => {
    escrever('assets/index.js', 'const s = "Gestor123"')
    const r = verificarDiretorio(dir)
    expect(JSON.stringify(r)).not.toContain('Gestor123')
  })
})
