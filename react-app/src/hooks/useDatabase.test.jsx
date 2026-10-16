// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataProvider, useDatabase } from './useDatabase'

const mocks = vi.hoisted(() => ({
  tabelas: {},
  upserts: [],
  respostasUpsert: [],
  uploads: [],
  remocoes: [],
  respostasUpload: [],
  respostasRemocao: [],
  eventos: [],
  falharFuncionarioPublico: false,
  consultas: [],
}))

vi.mock('../supabaseClient', () => {
  const respostaTabela = (tabela) => {
    if (tabela === 'funcionario_publico' && mocks.falharFuncionarioPublico) {
      return {
        data: null,
        error: {
          code: 'PGRST205',
          message: "Could not find the table 'public.funcionario_publico' in the schema cache",
        },
      }
    }
    return mocks.tabelas[tabela] || { data: [], error: null }
  }

  const criarConsulta = (tabela) => {
    mocks.consultas.push(tabela)
    let operacao = 'leitura'
    let payloadUpsert
    const consulta = {
      select: vi.fn(() => consulta),
      eq: vi.fn(() => consulta),
      order: vi.fn(() => consulta),
      insert: vi.fn(() => consulta),
      update: vi.fn(() => consulta),
      delete: vi.fn(() => consulta),
      upsert: vi.fn((payload, options) => {
        operacao = 'upsert'
        payloadUpsert = payload
        mocks.upserts.push({ tabela, payload, options })
        mocks.eventos.push(`upsert:${payload.logo_path ?? 'sem-logo'}`)
        return consulta
      }),
      maybeSingle: vi.fn(async () => respostaTabela(tabela)),
      single: vi.fn(async () => {
        if (operacao !== 'upsert') return respostaTabela(tabela)
        const resposta = mocks.respostasUpsert.shift()
        return resposta || { data: payloadUpsert, error: null }
      }),
      then: (resolve, reject) => Promise.resolve(respostaTabela(tabela)).then(resolve, reject),
    }
    return consulta
  }

  const bucket = {
    upload: vi.fn(async (path, file, options) => {
      mocks.uploads.push({ path, file, options })
      mocks.eventos.push(`upload:${path}`)
      return mocks.respostasUpload.shift() || { data: { path }, error: null }
    }),
    remove: vi.fn(async (paths) => {
      mocks.remocoes.push(paths)
      mocks.eventos.push(`remove:${paths[0]}`)
      return mocks.respostasRemocao.shift() || { data: paths, error: null }
    }),
  }

  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'usuario-1' } }, error: null })),
      },
      storage: { from: vi.fn(() => bucket) },
    },
    supabaseDb: { from: vi.fn((tabela) => criarConsulta(tabela)) },
  }
})

let banco

// O valor do contexto sai por callback: reatribuir `banco` dentro do
// componente violaria a regra de pureza do render (react-hooks/globals).
function Consumidor({ aoRenderizar }) {
  const db = useDatabase()
  aoRenderizar(db)
  return <span>{db.carregandoOficina ? 'carregando' : db.oficina?.nome_fantasia || 'sem-oficina'}</span>
}

const capturar = (db) => { banco = db }

const renderProvider = async () => {
  render(<DataProvider><Consumidor aoRenderizar={capturar} /></DataProvider>)
  await waitFor(() => expect(banco.carregandoOficina).toBe(false))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tabelas = {}
  mocks.upserts = []
  mocks.respostasUpsert = []
  mocks.uploads = []
  mocks.remocoes = []
  mocks.respostasUpload = []
  mocks.respostasRemocao = []
  mocks.eventos = []
  mocks.falharFuncionarioPublico = false
  mocks.consultas = []
  banco = undefined
})

describe('configuracao da oficina no DataProvider', () => {
  it('mantem os dados e usa fallback seguro quando funcionario_publico nao existe', async () => {
    mocks.falharFuncionarioPublico = true
    mocks.tabelas.cliente = { data: [{ id: 'cliente-1', nome: 'Cliente existente' }], error: null }
    mocks.tabelas.veiculo = { data: [{ id: 'veiculo-1', placa: 'ABC1D23' }], error: null }
    mocks.tabelas.ordem_servico = {
      data: [{ id: 'os-1', numero_os: 15, os_servico: [], os_peca: [], os_comissao: [] }],
      error: null,
    }
    mocks.tabelas.funcionario = {
      data: [{ id: 'funcionario-1', nome: 'Mecanico', cargo: 'mecanico', ativo: true }],
      error: null,
    }

    await renderProvider()

    expect(banco.supabaseConnected).toBe(true)
    expect(banco.databaseError).toBe('')
    expect(banco.clientes).toHaveLength(1)
    expect(banco.veiculos).toHaveLength(1)
    expect(banco.ordensServico).toHaveLength(1)
    expect(banco.funcionarios).toHaveLength(1)
    expect(mocks.consultas).toContain('funcionario_publico')
    expect(mocks.consultas).toContain('funcionario')
  })

  it('representa o singleton ausente como null sem derrubar os demais dados', async () => {
    mocks.tabelas.configuracao_oficina = { data: null, error: null }
    mocks.tabelas.cliente = { data: [{ id: 'cliente-1', nome: 'Cliente' }], error: null }

    await renderProvider()

    expect(banco.oficina).toBeNull()
    expect(banco.clientes).toHaveLength(1)
    expect(banco.supabaseConnected).toBe(true)
  })

  it('expõe o singleton existente e não fabrica registro quando a consulta falha', async () => {
    const existente = { id: 1, nome_fantasia: 'Oficina Central', cnpj: '12345678000190' }
    mocks.tabelas.configuracao_oficina = { data: existente, error: null }
    await renderProvider()
    expect(banco.oficina).toEqual(existente)
  })

  it('normaliza CNPJ, CEP, UF, espaços e opcionais antes do upsert', async () => {
    await renderProvider()

    await act(async () => {
      await banco.salvarOficina({
        nome_fantasia: '  Oficina Central  ',
        razao_social: '   ',
        cnpj: '12.345.678/0001-90',
        telefone: '  (64) 99999-0000  ',
        email: '',
        cep: '75.901-000',
        logradouro: '  Rua Um ',
        numero: '',
        complemento: null,
        bairro: ' Centro ',
        cidade: ' Rio Verde ',
        uf: ' go ',
        logo_path: '',
        texto_rodape: '  Obrigado! ',
      })
    })

    expect(mocks.upserts).toEqual([{
      tabela: 'configuracao_oficina',
      options: { onConflict: 'id' },
      payload: {
        id: 1,
        nome_fantasia: 'Oficina Central',
        razao_social: null,
        cnpj: '12345678000190',
        telefone: '(64) 99999-0000',
        email: null,
        cep: '75901000',
        logradouro: 'Rua Um',
        numero: null,
        complemento: null,
        bairro: 'Centro',
        cidade: 'Rio Verde',
        uf: 'GO',
        logo_path: null,
        texto_rodape: 'Obrigado!',
      },
    }])
    expect(banco.oficina.nome_fantasia).toBe('Oficina Central')
  })

  it('preserva a oficina atual quando o upsert falha', async () => {
    const existente = { id: 1, nome_fantasia: 'Antes', cnpj: '12345678000190', logo_path: null }
    mocks.tabelas.configuracao_oficina = { data: existente, error: null }
    mocks.respostasUpsert.push({ data: null, error: new Error('RLS negou a escrita') })
    await renderProvider()

    await expect(act(async () => banco.salvarOficina({ ...existente, nome_fantasia: 'Depois' })))
      .rejects.toThrow('RLS negou a escrita')
    expect(banco.oficina).toEqual(existente)
  })

  it.each([
    ['MIME inválido', new File(['x'], 'logo.gif', { type: 'image/gif' })],
    ['arquivo acima de 2 MiB', new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'logo.png', { type: 'image/png' })],
  ])('rejeita %s antes de acessar o Storage', async (_caso, file) => {
    await renderProvider()

    await expect(banco.uploadLogoOficina(file)).rejects.toThrow()
    expect(mocks.uploads).toHaveLength(0)
  })

  it('troca o logo e remove o antigo somente depois do upsert', async () => {
    const existente = {
      id: 1,
      nome_fantasia: 'Oficina',
      cnpj: '12345678000190',
      logo_path: 'oficina/logo-antigo.png',
    }
    mocks.tabelas.configuracao_oficina = { data: existente, error: null }
    await renderProvider()

    let salvo
    await act(async () => {
      salvo = await banco.uploadLogoOficina(new File(['imagem'], 'nome-do-usuario.png', { type: 'image/png' }))
    })

    expect(mocks.uploads[0].path).toMatch(/^oficina\/logo-[a-zA-Z0-9-]+\.png$/)
    expect(mocks.uploads[0].path).not.toContain('nome-do-usuario')
    expect(mocks.eventos[0]).toMatch(/^upload:/)
    expect(mocks.eventos[1]).toMatch(/^upsert:oficina\/logo-/)
    expect(mocks.eventos[2]).toBe('remove:oficina/logo-antigo.png')
    expect(salvo.logo_path).toBe(mocks.uploads[0].path)
    expect(banco.oficina.logo_path).toBe(mocks.uploads[0].path)
  })

  it('limpa o upload novo e preserva o logo antigo quando o upsert falha', async () => {
    const existente = {
      id: 1,
      nome_fantasia: 'Oficina',
      cnpj: '12345678000190',
      logo_path: 'oficina/logo-antigo.webp',
    }
    mocks.tabelas.configuracao_oficina = { data: existente, error: null }
    mocks.respostasUpsert.push({ data: null, error: new Error('Falha ao persistir') })
    await renderProvider()

    await expect(banco.uploadLogoOficina(new File(['imagem'], 'novo.webp', { type: 'image/webp' })))
      .rejects.toThrow('Falha ao persistir')

    expect(mocks.remocoes).toHaveLength(1)
    expect(mocks.remocoes[0][0]).toBe(mocks.uploads[0].path)
    expect(mocks.remocoes.flat()).not.toContain('oficina/logo-antigo.webp')
    expect(banco.oficina).toEqual(existente)
  })

  it('rejeita a remoção de path fora do prefixo controlado', async () => {
    await renderProvider()

    await expect(banco.removerLogoOficina('outra-pasta/logo.png')).rejects.toThrow(/caminho/i)
    expect(mocks.remocoes).toHaveLength(0)
    expect(mocks.upserts).toHaveLength(0)
  })
})
