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
  // Escritas (insert/update/delete) e chamadas de RPC: o que sairia para o
  // PostgREST, mais a resposta que cada tabela/funcao deve devolver.
  escritas: [],
  respostasEscrita: {},
  chamadasRpc: [],
  respostasRpc: {},
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
      insert: vi.fn((payload) => {
        operacao = 'escrita'
        mocks.escritas.push({ tabela, op: 'insert', payload })
        return consulta
      }),
      update: vi.fn((payload) => {
        operacao = 'escrita'
        mocks.escritas.push({ tabela, op: 'update', payload })
        return consulta
      }),
      delete: vi.fn(() => {
        operacao = 'escrita'
        mocks.escritas.push({ tabela, op: 'delete' })
        return consulta
      }),
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
      then: (resolve, reject) => {
        const resposta = operacao === 'escrita'
          ? (mocks.respostasEscrita[tabela] || { data: null, error: null })
          : respostaTabela(tabela)
        return Promise.resolve(resposta).then(resolve, reject)
      },
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
    supabaseDb: {
      from: vi.fn((tabela) => criarConsulta(tabela)),
      rpc: vi.fn((nome, args) => {
        mocks.chamadasRpc.push({ nome, args })
        // Sem resposta configurada, o RPC ecoa o payload: e o que o
        // `salvar_cliente_com_endereco` devolve no caminho feliz.
        const resposta = mocks.respostasRpc[nome]
          || { data: { ...(args?.p_cliente || {}), id: args?.p_id_cliente }, error: null }
        return {
          single: vi.fn(async () => resposta),
          then: (resolve, reject) => Promise.resolve(resposta).then(resolve, reject),
        }
      }),
    },
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
  mocks.escritas = []
  mocks.respostasEscrita = {}
  mocks.chamadasRpc = []
  mocks.respostasRpc = {}
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

// ─────────────────────────────────────────────────────────────────────────────
// Camada de escrita do DataProvider: rollback otimista, repasse de erro e
// normalização dos itens da O.S. antes do RPC.
// ─────────────────────────────────────────────────────────────────────────────

const ID_CLIENTE = '55555555-5555-4555-8555-555555555555'
const ID_CLIENTE_NOVO = '66666666-6666-4666-8666-666666666666'
const ID_VEICULO = '33333333-3333-4333-8333-333333333333'
const ID_FUNCIONARIO = '44444444-4444-4444-8444-444444444444'
const OS_CONCLUIDA = '11111111-1111-4111-8111-111111111111'
const OS_ABERTA = '22222222-2222-4222-8222-222222222222'
const ID_ITEM = '77777777-7777-4777-8777-777777777777'

const comDadosBasicos = () => {
  mocks.tabelas.cliente = { data: [{ id: ID_CLIENTE, nome: 'Maria Souza', ativo: true }], error: null }
  mocks.tabelas.veiculo = { data: [{ id: ID_VEICULO, id_cliente: ID_CLIENTE, placa: 'ABC1D23' }], error: null }
  mocks.tabelas.funcionario = { data: [{ id: ID_FUNCIONARIO, nome: 'Carlos', cargo: 'mecanico', ativo: true }], error: null }
  mocks.tabelas.funcionario_publico = mocks.tabelas.funcionario
  mocks.tabelas.ordem_servico = {
    data: [
      { id: OS_CONCLUIDA, numero_os: 1, status: 'concluida', os_servico: [], os_peca: [], os_comissao: [] },
      { id: OS_ABERTA, numero_os: 2, status: 'aberta', os_servico: [], os_peca: [], os_comissao: [] },
    ],
    error: null,
  }
}

const rpcDe = (nome) => mocks.chamadasRpc.filter(c => c.nome === nome)

describe('escrita de cliente no DataProvider', () => {
  beforeEach(comDadosBasicos)

  it('addCliente_remove_o_otimista_e_rejeita_quando_o_rpc_falha', async () => {
    mocks.respostasRpc.salvar_cliente_com_endereco = { data: null, error: new Error('RLS negou o insert') }
    await renderProvider()
    expect(banco.clientes).toHaveLength(1)

    await expect(
      act(async () => { await banco.addCliente({ id: ID_CLIENTE_NOVO, nome: 'Joao Novo' }) })
    ).rejects.toThrow('RLS negou o insert')

    expect(banco.clientes).toHaveLength(1)
    expect(banco.clientes.map(c => c.id)).not.toContain(ID_CLIENTE_NOVO)
  })

  it('addCliente_mantem_o_cliente_e_resolve_com_o_registro_gravado', async () => {
    await renderProvider()
    let salvo
    await act(async () => {
      salvo = await banco.addCliente({ id: ID_CLIENTE_NOVO, nome: 'Joao Novo' })
    })
    expect(salvo.id).toBe(ID_CLIENTE_NOVO)
    expect(banco.clientes.map(c => c.id)).toContain(ID_CLIENTE_NOVO)
    expect(rpcDe('salvar_cliente_com_endereco')[0].args.p_novo).toBe(true)
  })

  it('addCliente_nao_envia_endereco_quando_todos_os_campos_estao_vazios', async () => {
    await renderProvider()
    await act(async () => {
      await banco.addCliente({
        id: ID_CLIENTE_NOVO,
        nome: 'Joao',
        endereco_estruturado: { cep: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '' },
      })
    })
    expect(rpcDe('salvar_cliente_com_endereco')[0].args.p_endereco).toBeNull()
  })

  it('updateCliente_restaura_o_registro_anterior_e_relanca_em_erro', async () => {
    mocks.respostasRpc.salvar_cliente_com_endereco = { data: null, error: new Error('permission denied') }
    await renderProvider()

    await expect(
      act(async () => { await banco.updateCliente(ID_CLIENTE, { nome: 'Nome Trocado' }) })
    ).rejects.toThrow('permission denied')

    expect(banco.clientes).toHaveLength(1)
    expect(banco.clientes[0].nome).toBe('Maria Souza')
  })

  it('updateCliente_aplica_a_alteracao_quando_o_rpc_aceita', async () => {
    await renderProvider()
    await act(async () => { await banco.updateCliente(ID_CLIENTE, { nome: 'Maria Atualizada' }) })
    expect(banco.clientes[0].nome).toBe('Maria Atualizada')
    expect(rpcDe('salvar_cliente_com_endereco')[0].args.p_novo).toBe(false)
  })

  it('deleteCliente_restaura_a_lista_e_relanca_o_erro_do_supabase', async () => {
    mocks.respostasEscrita.cliente = { data: null, error: { message: 'RLS: inativacao negada' } }
    await renderProvider()

    await expect(
      act(async () => { await banco.deleteCliente(ID_CLIENTE) })
    ).rejects.toMatchObject({ message: 'RLS: inativacao negada' })

    expect(banco.clientes.map(c => c.id)).toEqual([ID_CLIENTE])
  })

  it('deleteCliente_inativa_sem_apagar_a_linha_quando_o_supabase_aceita', async () => {
    await renderProvider()
    await act(async () => { await banco.deleteCliente(ID_CLIENTE) })
    expect(banco.clientes).toHaveLength(0)
    const escrita = mocks.escritas.find(e => e.tabela === 'cliente')
    expect(escrita).toMatchObject({ op: 'update', payload: { ativo: false } })
  })
})

describe('escrita de veiculo e funcionario no DataProvider', () => {
  beforeEach(comDadosBasicos)

  it('deleteVeiculo_restaura_a_lista_e_relanca_o_erro_do_supabase', async () => {
    mocks.respostasEscrita.veiculo = { data: null, error: { message: 'FK em uso por O.S.' } }
    await renderProvider()

    await expect(
      act(async () => { await banco.deleteVeiculo(ID_VEICULO) })
    ).rejects.toMatchObject({ message: 'FK em uso por O.S.' })

    expect(banco.veiculos.map(v => v.id)).toEqual([ID_VEICULO])
  })

  it('deleteVeiculo_inativa_quando_o_supabase_aceita', async () => {
    await renderProvider()
    await act(async () => { await banco.deleteVeiculo(ID_VEICULO) })
    expect(banco.veiculos).toHaveLength(0)
    expect(mocks.escritas.find(e => e.tabela === 'veiculo')).toMatchObject({ payload: { ativo: false } })
  })

  it('deleteFuncionario_restaura_a_lista_e_relanca_o_erro_do_supabase', async () => {
    mocks.respostasEscrita.funcionario = { data: null, error: { message: 'apenas gestor pode inativar' } }
    await renderProvider()
    const antes = banco.funcionarios.map(f => f.id)

    await expect(
      act(async () => { await banco.deleteFuncionario(ID_FUNCIONARIO) })
    ).rejects.toMatchObject({ message: 'apenas gestor pode inativar' })

    expect(banco.funcionarios.map(f => f.id)).toEqual(antes)
  })

  it('deleteFuncionario_inativa_quando_o_supabase_aceita', async () => {
    await renderProvider()
    await act(async () => { await banco.deleteFuncionario(ID_FUNCIONARIO) })
    expect(banco.funcionarios).toHaveLength(0)
    expect(mocks.escritas.find(e => e.tabela === 'funcionario')).toMatchObject({ payload: { ativo: false } })
  })
})

describe('cancelamento de O.S. no DataProvider', () => {
  beforeEach(comDadosBasicos)

  it('deleteOrdemServico_cancela_os_concluida_pelo_rpc_transacional', async () => {
    await renderProvider()
    await act(async () => { await banco.deleteOrdemServico(OS_CONCLUIDA) })
    expect(mocks.chamadasRpc).toContainEqual({
      nome: 'cancelar_ordem_servico',
      args: { p_id_os: OS_CONCLUIDA },
    })
  })

  it('deleteOrdemServico_nao_chama_rpc_para_id_local', async () => {
    await renderProvider()
    await act(async () => { await banco.deleteOrdemServico('os-local') })
    expect(mocks.chamadasRpc).toHaveLength(0)
  })

  it('deleteOrdemServico_cancela_os_aberta_normalmente', async () => {
    await renderProvider()
    await act(async () => { await banco.deleteOrdemServico(OS_ABERTA) })

    expect(banco.ordensServico.map(os => os.id)).toEqual([OS_CONCLUIDA, OS_ABERTA])
    expect(mocks.chamadasRpc).toContainEqual({
      nome: 'cancelar_ordem_servico',
      args: { p_id_os: OS_ABERTA },
    })
  })

  it('deleteOrdemServico_preserva_a_lista_e_relanca_quando_o_rpc_falha', async () => {
    mocks.respostasRpc.cancelar_ordem_servico = { data: null, error: { message: 'OS travada pelo enforcement' } }
    await renderProvider()
    const antes = banco.ordensServico.map(os => os.id)

    await expect(
      act(async () => { await banco.deleteOrdemServico(OS_ABERTA) })
    ).rejects.toMatchObject({ message: 'OS travada pelo enforcement' })

    expect(banco.ordensServico.map(os => os.id)).toEqual(antes)
  })
})

describe('normalizacao de itens da O.S. antes do RPC', () => {
  beforeEach(comDadosBasicos)

  const salvarComQuantidade = async (quantidade) => {
    await renderProvider()
    await act(async () => {
      await banco.updateOrdemServico(OS_ABERTA, {
        servicos_itens: [{ descricao: 'Troca de oleo', quantidade, valor_unitario: '10' }],
        pecas_itens: [{ item_id: ID_ITEM, descricao: 'Filtro', quantidade, valor_unitario: 20 }],
      })
    })
    const chamada = rpcDe('salvar_ordem_servico_com_itens')[0]
    return { servico: chamada.args.p_servicos[0], peca: chamada.args.p_pecas[0] }
  }

  it.each([
    ['string vazia vira 1', '', 1],
    ['null vira 1', null, 1],
    ['undefined vira 1', undefined, 1],
    ['so espaco vira 1', '   ', 1],
    ['texto nao numerico vira 1', 'duas', 1],
    ['decimal com virgula vira ponto', '2,5', 2.5],
    ['decimal com ponto', '2.5', 2.5],
    ['inteiro em texto', '3', 3],
  ])('normalizarQuantidade — %s', async (_caso, entrada, esperado) => {
    const { servico, peca } = await salvarComQuantidade(entrada)
    expect(servico.quantidade).toBe(esperado)
    expect(peca.quantidade).toBe(esperado)
  })

  // BUG: useDatabase.js:163 e :170 usam normalizarQuantidade (osFinance.js:19),
  // que só troca a vírgula e cai para 1 quando não é número. Zero e negativo
  // passam intactos para `salvar_ordem_servico_com_itens`. Numa peça, a baixa
  // automática do RF05/RF10 recebe quantidade negativa e CREDITA o estoque; e
  // o item com quantidade 0 entra na O.S. valendo nada.
  it('deve_rejeitar_ou_corrigir_quantidade_zero', async () => {
    const { servico, peca } = await salvarComQuantidade('0')
    expect(servico.quantidade).toBeGreaterThan(0)
    expect(peca.quantidade).toBeGreaterThan(0)
  })

  it('deve_rejeitar_ou_corrigir_quantidade_negativa', async () => {
    const { servico, peca } = await salvarComQuantidade('-5')
    expect(servico.quantidade).toBeGreaterThan(0)
    expect(peca.quantidade).toBeGreaterThan(0)
  })

  it.each([
    ['zero em texto', '0', 1],
    ['zero numerico', 0, 1],
    ['negativo em texto', '-5', 1],
    ['negativo numerico', -5, 1],
  ])('corrige_%s_antes_do_rpc', async (_caso, entrada, observado) => {
    const { servico, peca } = await salvarComQuantidade(entrada)
    expect(servico.quantidade).toBe(observado)
    expect(peca.quantidade).toBe(observado)
  })

  it('descarta_catalogo_id_e_item_id_que_nao_sao_uuid', async () => {
    await renderProvider()
    await act(async () => {
      await banco.updateOrdemServico(OS_ABERTA, {
        servicos_itens: [{ catalogo_id: 'nao-e-uuid', descricao: 'Avulso', quantidade: 1, valor_unitario: 10 }],
        pecas_itens: [{ item_id: '', descricao: 'Peca avulsa', quantidade: 1, valor_unitario: 5 }],
      })
    })
    const chamada = rpcDe('salvar_ordem_servico_com_itens')[0]
    expect(chamada.args.p_servicos[0].id_servico).toBeNull()
    expect(chamada.args.p_pecas[0].id_item).toBeNull()
  })

  it('trunca_descricao_em_200_caracteres_e_usa_rotulo_padrao_quando_vazia', async () => {
    await renderProvider()
    await act(async () => {
      await banco.updateOrdemServico(OS_ABERTA, {
        servicos_itens: [{ descricao: 'x'.repeat(500), quantidade: 1, valor_unitario: 1 }],
        pecas_itens: [{ descricao: '', quantidade: 1, valor_unitario: 1 }],
      })
    })
    const chamada = rpcDe('salvar_ordem_servico_com_itens')[0]
    expect(chamada.args.p_servicos[0].descricao).toHaveLength(200)
    expect(chamada.args.p_pecas[0].descricao).toBe('Peca')
  })

  it('nao_substitui_itens_quando_o_update_so_mexe_no_cabecalho', async () => {
    await renderProvider()
    await act(async () => { await banco.updateOrdemServico(OS_ABERTA, { diagnostico: 'Correia gasta' }) })
    const chamada = rpcDe('salvar_ordem_servico_com_itens')[0]
    expect(chamada.args.p_servicos).toBeNull()
    expect(chamada.args.p_pecas).toBeNull()
    expect(chamada.args.p_dados).toMatchObject({ diagnostico: 'Correia gasta' })
  })

  it('updateOrdemServico_relanca_quando_o_rpc_falha', async () => {
    mocks.respostasRpc.salvar_ordem_servico_com_itens = { data: null, error: new Error('OS concluida e imutavel') }
    await renderProvider()
    await expect(
      act(async () => { await banco.updateOrdemServico(OS_ABERTA, { diagnostico: 'x' }) })
    ).rejects.toThrow('OS concluida e imutavel')
  })

  it('valor_unitario_nao_numerico_vira_zero_em_vez_de_NaN', async () => {
    await renderProvider()
    await act(async () => {
      await banco.updateOrdemServico(OS_ABERTA, {
        servicos_itens: [{ descricao: 'Servico', quantidade: 1, valor_unitario: 'R$ 10,00' }],
      })
    })
    expect(rpcDe('salvar_ordem_servico_com_itens')[0].args.p_servicos[0].valor_unitario).toBe(0)
  })
})
