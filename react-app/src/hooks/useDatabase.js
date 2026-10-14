import { createContext, useContext, useEffect, useState, createElement } from 'react'
import { supabase, supabaseDb } from '../supabaseClient'
import { somenteDigitos, enderecoVazio } from '../utils/endereco'

const DataContext = createContext(null)

const newUuid = () => crypto.randomUUID()
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')
const toInteger = (value) => {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isInteger(number) ? number : null
}

// O endereco mora na tabela `endereco` (1:1 com cliente). O PostgREST devolve
// objeto quando reconhece a relacao como 1:1 pelo UNIQUE, mas array quando a
// deteccao falha — aceitamos os dois para nao depender disso.
const mapEnderecoFromDb = (raw) => {
  const e = Array.isArray(raw) ? raw[0] : raw
  if (!e) return null
  return { ...e, cep: e.cep || '', uf: e.uf || '' }
}

const mapClienteFromDb = (c) => ({
  ...c,
  tipo_pessoa: c.tipo_pessoa || 'fisica',
  // `endereco` (string) continua sendo o campo legado de texto livre;
  // `endereco_estruturado` e a entidade nova.
  endereco_estruturado: mapEnderecoFromDb(c.endereco_estruturado),
})

const normalizeEnderecoForDb = (idCliente, e = {}) => ({
  id_cliente: idCliente,
  cep: somenteDigitos(e.cep).slice(0, 8) || null,
  logradouro: e.logradouro?.trim() || null,
  numero: e.numero?.trim() || null,
  complemento: e.complemento?.trim() || null,
  bairro: e.bairro?.trim() || null,
  cidade: e.cidade?.trim() || null,
  uf: e.uf ? e.uf.toUpperCase().trim().slice(0, 2) : null,
  ponto_referencia: e.ponto_referencia?.trim() || null,
})

const mapVeiculoFromDb = (v) => ({
  ...v,
  cliente_id: v.id_cliente,
  id_cliente: v.id_cliente,
  servico_atual: v.servico_atual || '',
  status: v.status || 'Pendente',
})

// Item de OS (servico ou peca) vindo das tabelas os_servico/os_peca
// (ou, como fallback, dos antigos arrays JSONB servicos_itens/pecas_itens).
const mapItemFromDb = (row) => ({
  id: row.id || newUuid(),
  catalogo_id: row.id_servico ?? row.catalogo_id ?? null,
  item_id: row.id_item ?? row.item_id ?? null,
  codigo: row.codigo || null,
  descricao: row.descricao || '',
  quantidade: Number(row.quantidade ?? 1) || 1,
  valor_unitario: Number(row.valor_unitario ?? row.valor ?? 0) || 0,
})

const mapOSFromDb = (os) => {
  const servicosRaw = (os.os_servico && os.os_servico.length) ? os.os_servico : (os.servicos_itens || [])
  const pecasRaw = (os.os_peca && os.os_peca.length) ? os.os_peca : (os.pecas_itens || [])
  return {
    ...os,
    cliente_id: os.id_cliente,
    veiculo_id: os.id_veiculo,
    id_veiculo: os.id_veiculo,
    id_mecanico: os.id_mecanico || null,
    id_atendente: os.id_atendente || null,
    descricao: os.descricao || os.descricao_problema || '',
    preco_final: os.valor_total || 0,
    servicos_itens: servicosRaw.map(mapItemFromDb),
    pecas_itens: pecasRaw.map(mapItemFromDb),
    // normaliza data: tabela usa criado_em, não created_at
    data_abertura: os.data_abertura || os.criado_em || null,
    created_at: os.created_at || os.criado_em || null,
  }
}

const normalizeClienteForDb = (cliente) => ({
  ...(isUuid(cliente.id) ? { id: cliente.id } : {}),
  nome: cliente.nome,
  tipo_pessoa: cliente.tipo_pessoa || 'fisica',
  cpf_cnpj: cliente.cpf_cnpj || `SC${Date.now().toString().slice(-9)}`,
  telefone: cliente.telefone || 'Nao informado',
  email: cliente.email || null,
  endereco: cliente.endereco || null,
  ativo: cliente.ativo !== false,
})

const normalizeVeiculoForDb = (veiculo) => ({
  ...(isUuid(veiculo.id) ? { id: veiculo.id } : {}),
  id_cliente: veiculo.id_cliente || veiculo.cliente_id,
  placa: veiculo.placa?.toUpperCase().replace(/[^A-Z0-9]/g, ''),
  marca: veiculo.marca,
  modelo: veiculo.modelo,
  ano: Number(veiculo.ano) || new Date().getFullYear(),
  cor: veiculo.cor || 'Nao informada',
  km_atual: veiculo.km_atual ? Number(veiculo.km_atual) : null,
  observacoes: veiculo.observacoes || null,
  ativo: veiculo.ativo !== false,
})

const normalizeFuncionarioForDb = (f) => ({
  ...(isUuid(f.id) ? { id: f.id } : {}),
  nome: f.nome,
  cargo: f.cargo || 'atendente',
  comissao_percentual: Math.min(100, Math.max(0, Number(f.comissao_percentual) || 0)),
  comissao_sobre_servicos: Boolean(f.comissao_sobre_servicos),
  comissao_sobre_pecas: Boolean(f.comissao_sobre_pecas),
  id_usuario: isUuid(f.id_usuario) ? f.id_usuario : null,
  ativo: f.ativo !== false,
})

// Campos ESCALARES da OS. Os itens (servicos/pecas) sao gravados a parte,
// nas tabelas os_servico/os_peca, via syncItensOS(). id_usuario referencia
// usuario (quem registrou); id_mecanico/id_atendente referenciam funcionario.
const pickOSFields = (os, userId) => ({
  ...(isUuid(os.id) ? { id: os.id } : {}),
  ...(toInteger(os.numero_os) ? { numero_os: toInteger(os.numero_os) } : {}),
  id_veiculo: os.id_veiculo || os.veiculo_id,
  id_usuario: (isUuid(os.id_usuario) ? os.id_usuario : null) || userId,
  id_mecanico: isUuid(os.id_mecanico) ? os.id_mecanico : null,
  id_atendente: isUuid(os.id_atendente) ? os.id_atendente : null,
  descricao: os.descricao || os.descricao_problema || 'Ordem de servico',
  diagnostico: os.diagnostico || null,
  status: os.status || 'aberta',
  prioridade: os.prioridade || 'normal',
  data_abertura: os.data_abertura || new Date().toISOString(),
  data_encerramento: os.data_encerramento || null,
  km_entrada: os.km_entrada ? Number(os.km_entrada) : null,
  valor_total: Number(os.valor_total || os.preco_final || 0),
  forma_pagamento: os.forma_pagamento || null,
  observacoes: os.observacoes || null,
  valor_servicos: Number(os.valor_servicos || 0),
  valor_pecas: Number(os.valor_pecas || 0),
})

// Sincroniza os itens da OS nas tabelas relacionais: apaga os antigos e insere
// os atuais (estrategia simples de "substituir tudo" a cada salvamento).
const syncItensOS = async (supabaseDb, osId, servicos = [], pecas = []) => {
  await supabaseDb.from('os_servico').delete().eq('id_os', osId)
  await supabaseDb.from('os_peca').delete().eq('id_os', osId)
  const sRows = (servicos || []).map(it => ({
    id_os: osId,
    id_servico: isUuid(it.catalogo_id) ? it.catalogo_id : null,
    descricao: String(it.descricao || 'Servico').slice(0, 200),
    quantidade: Number(it.quantidade) || 1,
    valor_unitario: Number(it.valor_unitario) || 0,
  }))
  const pRows = (pecas || []).map(it => ({
    id_os: osId,
    id_item: isUuid(it.item_id) ? it.item_id : null,
    descricao: String(it.descricao || 'Peca').slice(0, 200),
    quantidade: Number(it.quantidade) || 1,
    valor_unitario: Number(it.valor_unitario) || 0,
  }))
  if (sRows.length) {
    const { error } = await supabaseDb.from('os_servico').insert(sRows)
    if (error) console.error('Erro ao salvar servicos da OS:', error)
  }
  if (pRows.length) {
    const { error } = await supabaseDb.from('os_peca').insert(pRows)
    if (error) console.error('Erro ao salvar pecas da OS:', error)
  }
}

// ── Configuracao da oficina (migracao 18) ──────────────────────────────────
// Singleton `configuracao_oficina` (id = 1) e bucket privado `logos-oficina`.
// O banco guarda so o caminho do objeto: nunca URL assinada nem Base64.
const OFICINA_BUCKET = 'logos-oficina'
const LOGO_TAMANHO_MAX = 2 * 1024 * 1024 // mesmo limite do bucket
// A extensao vem do MIME, nunca do nome que o usuario deu ao arquivo.
const LOGO_EXTENSOES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const LOGO_PATH_CONTROLADO = /^oficina\/logo-[A-Za-z0-9-]+\.(png|jpg|webp)$/

export const caminhoLogoControlado = (path) => LOGO_PATH_CONTROLADO.test(path || '')

const textoOuNull = (valor) => {
  if (valor === undefined || valor === null) return null
  const texto = String(valor).trim()
  return texto || null
}

export const normalizeOficinaForDb = (oficina = {}) => {
  const normalizada = {
    id: 1,
    nome_fantasia: textoOuNull(oficina.nome_fantasia),
    razao_social: textoOuNull(oficina.razao_social),
    cnpj: somenteDigitos(String(oficina.cnpj ?? '')),
    telefone: textoOuNull(oficina.telefone),
    email: textoOuNull(oficina.email),
    cep: somenteDigitos(String(oficina.cep ?? '')) || null,
    logradouro: textoOuNull(oficina.logradouro),
    numero: textoOuNull(oficina.numero),
    complemento: textoOuNull(oficina.complemento),
    bairro: textoOuNull(oficina.bairro),
    cidade: textoOuNull(oficina.cidade),
    uf: textoOuNull(oficina.uf)?.toUpperCase() ?? null,
    logo_path: textoOuNull(oficina.logo_path),
    texto_rodape: textoOuNull(oficina.texto_rodape),
  }
  if (!normalizada.nome_fantasia) throw new Error('Informe o nome fantasia da oficina.')
  if (normalizada.cnpj.length !== 14) throw new Error('O CNPJ da oficina deve ter 14 digitos.')
  if (normalizada.logo_path && !caminhoLogoControlado(normalizada.logo_path)) {
    throw new Error('Caminho de logotipo invalido.')
  }
  return normalizada
}

function useDatabaseState() {
  const [clientes, setClientes] = useState([])
  const [veiculos, setVeiculos] = useState([])
  const [servicos, setServicos] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [funcionarios, setFuncionarios] = useState([])
  const [ordensServico, setOrdensServico] = useState([])
  const [loading, setLoading] = useState(true)
  const [supabaseConnected, setSupabaseConnected] = useState(false)
  const [databaseError, setDatabaseError] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [oficina, setOficina] = useState(null)
  const [carregandoOficina, setCarregandoOficina] = useState(true)
  const [erroOficina, setErroOficina] = useState('')

  const salvarState = (next) => {
    if (next.clientes) setClientes(next.clientes)
    if (next.veiculos) setVeiculos(next.veiculos)
    if (next.servicos) setServicos(next.servicos)
    if (next.usuarios) setUsuarios(next.usuarios)
    if (next.funcionarios) setFuncionarios(next.funcionarios)
    if (next.ordensServico) setOrdensServico(next.ordensServico)
  }

  const carregarDados = async () => {
    setLoading(true)
    setDatabaseError('')
    try {
      const [{ data: sessionData }, clientesRes, veiculosRes, osRes, servicosRes, usuariosRes, funcionariosRes, oficinaRes] = await Promise.all([
        supabase.auth.getUser(),
        // Alias no embed porque `endereco` colide com a coluna legada de mesmo
        // nome em cliente.
        supabaseDb.from('cliente').select('*, endereco_estruturado:endereco(*)').eq('ativo', true).order('nome'),
        supabaseDb.from('veiculo').select('*').eq('ativo', true).order('placa'),
        supabaseDb.from('ordem_servico').select('*, os_servico(*), os_peca(*)').order('data_abertura', { ascending: false }),
        supabaseDb.from('servico_catalogo').select('*').eq('ativo', true).order('nome'),
        supabaseDb.from('usuario').select('*').eq('ativo', true).order('nome'),
        // Lista geral pela view publica (sem comissao) — usada em dropdowns e
        // na resolucao de nomes. Comissao so nas telas de gestor (Relatorios,
        // Funcionarios), que consultam a tabela funcionario diretamente.
        supabaseDb.from('funcionario_publico').select('*').eq('ativo', true).order('nome'),
        // Singleton: sem linha (oficina ainda nao cadastrada) vem data null.
        supabaseDb.from('configuracao_oficina').select('*').maybeSingle(),
      ])

      // Falha aqui (ex.: banco sem a migracao 18) nao derruba o resto do app:
      // a oficina fica nula e o erro e exposto, sem registro inventado.
      if (oficinaRes.error) {
        setOficina(null)
        setErroOficina(oficinaRes.error.message || 'Falha ao carregar a configuracao da oficina.')
      } else {
        const registro = oficinaRes.data
        setOficina(registro && typeof registro === 'object' && !Array.isArray(registro) ? registro : null)
        setErroOficina('')
      }

      // Fallback para bancos ainda sem a tabela endereco (pre-13): repete sem o
      // embed, e o cliente cai no campo de texto livre.
      let clientesData = clientesRes.data
      if (clientesRes.error) {
        const retry = await supabaseDb.from('cliente').select('*').eq('ativo', true).order('nome')
        if (retry.error) throw clientesRes.error
        clientesData = retry.data
      }
      if (veiculosRes.error) throw veiculosRes.error

      // Fallback para bancos ainda sem as tabelas os_servico/os_peca (pre-migracao):
      // repete a consulta sem o JOIN e o mapper cai nos arrays JSONB antigos.
      let osData = osRes.data
      if (osRes.error) {
        const retry = await supabaseDb.from('ordem_servico').select('*').order('data_abertura', { ascending: false })
        if (retry.error) throw retry.error
        osData = retry.data
      }

      // Fallback para bancos ainda sem a view funcionario_publico (pre-12):
      // le da tabela funcionario direto (permissivo ate o hardening rodar).
      let funcData = funcionariosRes.error ? [] : (funcionariosRes.data || [])
      if (funcionariosRes.error) {
        const retry = await supabaseDb.from('funcionario').select('id, nome, cargo, id_usuario, ativo').eq('ativo', true).order('nome')
        if (!retry.error) funcData = retry.data || []
      }

      const next = {
        clientes: (clientesData || []).map(mapClienteFromDb),
        veiculos: (veiculosRes.data || []).map(mapVeiculoFromDb),
        ordensServico: (osData || []).map(mapOSFromDb),
        servicos: servicosRes.error ? [] : (servicosRes.data || []),
        usuarios: usuariosRes.error ? [] : (usuariosRes.data || []),
        funcionarios: funcData,
      }
      setCurrentUserId(sessionData?.user?.id || usuariosRes.data?.[0]?.id || null)
      setSupabaseConnected(true)
      salvarState(next)
    } catch (error) {
      console.warn('Falha ao carregar dados do Supabase.', error)
      setDatabaseError(error.message || 'Falha ao carregar dados do Supabase.')
      setSupabaseConnected(false)
    } finally {
      setLoading(false)
      setCarregandoOficina(false)
    }
  }

  // Estado so muda depois que o banco confirmou. Escrita restrita ao gestor
  // pelo RLS da migracao 18 — o frontend nao repete essa checagem.
  const salvarOficina = async (payload) => {
    const normalizada = normalizeOficinaForDb(payload)
    const { data, error } = await supabaseDb
      .from('configuracao_oficina')
      .upsert(normalizada, { onConflict: 'id' })
      .select()
      .single()
    if (error) throw error
    setOficina(data)
    return data
  }

  // Ordem que nao deixa referencia quebrada: sobe o novo, grava o caminho e
  // so entao apaga o antigo. Se gravar o caminho falhar, o novo e descartado e
  // o cadastro continua apontando para o logo anterior.
  const uploadLogoOficina = async (file) => {
    const extensao = LOGO_EXTENSOES[file?.type]
    if (!extensao) throw new Error('O logotipo deve ser uma imagem PNG, JPEG ou WebP.')
    if (file.size > LOGO_TAMANHO_MAX) throw new Error('O logotipo deve ter no maximo 2 MB.')
    if (!oficina) throw new Error('Salve os dados da oficina antes de enviar o logotipo.')

    const bucket = supabase.storage.from(OFICINA_BUCKET)
    const novoPath = `oficina/logo-${newUuid()}.${extensao}`
    const anterior = oficina.logo_path

    const { error: erroUpload } = await bucket.upload(novoPath, file, { contentType: file.type, upsert: false })
    if (erroUpload) throw erroUpload

    let salvo
    try {
      salvo = await salvarOficina({ ...oficina, logo_path: novoPath })
    } catch (error) {
      const { error: erroLimpeza } = await bucket.remove([novoPath])
      if (erroLimpeza) console.warn('Logotipo enviado ficou orfao no Storage:', novoPath, erroLimpeza)
      throw error
    }

    if (anterior && anterior !== novoPath && caminhoLogoControlado(anterior)) {
      const { error: erroRemocao } = await bucket.remove([anterior])
      if (erroRemocao) console.warn('Logotipo anterior ficou orfao no Storage:', anterior, erroRemocao)
    }
    return salvo
  }

  // Bucket privado: o arquivo vem como Blob pela sessao do usuario. Usado na
  // previa da tela e no PDF; nenhuma URL e persistida.
  const baixarLogoOficina = async (path = oficina?.logo_path) => {
    if (!caminhoLogoControlado(path)) return null
    const { data, error } = await supabase.storage.from(OFICINA_BUCKET).download(path)
    if (error) throw error
    return data
  }

  const removerLogoOficina = async (path) => {
    if (!caminhoLogoControlado(path)) throw new Error('Caminho de logotipo invalido.')

    let salvo = oficina
    if (oficina?.logo_path === path) salvo = await salvarOficina({ ...oficina, logo_path: null })

    const { error } = await supabase.storage.from(OFICINA_BUCKET).remove([path])
    if (error) {
      throw new Error(`O logotipo foi desvinculado, mas o arquivo nao pode ser apagado: ${error.message || error}`)
    }
    return salvo
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Endereco em branco nao vira linha vazia na tabela: apaga a que existir.
  // Assim "limpar o endereco" e uma operacao possivel pela tela.
  const salvarEnderecoCliente = async (idCliente, endereco) => {
    if (!isUuid(idCliente) || endereco === undefined) return

    const consulta = enderecoVazio(endereco)
      ? supabaseDb.from('endereco').delete().eq('id_cliente', idCliente)
      : supabaseDb.from('endereco').upsert(normalizeEnderecoForDb(idCliente, endereco), { onConflict: 'id_cliente' })

    const { error } = await consulta
    if (error) console.error('Erro ao salvar endereco do cliente:', error)
  }

  // Resolve com o registro JA gravado. Quem vai referenciar o cliente por FK
  // (veiculo, O.S.) precisa esperar: o item aparece na lista na hora, mas so
  // existe no banco depois do insert. Em erro, o item otimista sai da lista —
  // senao ele continuaria selecionavel e qualquer O.S. com ele falharia na FK.
  const addCliente = async (newC) => {
    const localCliente = { ...newC, id: isUuid(newC.id) ? newC.id : newUuid() }
    salvarState({ clientes: [...clientes, localCliente] })

    const { data, error } = await supabaseDb.from('cliente').insert(normalizeClienteForDb(localCliente)).select().single()
    if (error) {
      console.error('Erro ao salvar cliente no Supabase:', error)
      salvarState({ clientes: clientes.filter(c => c.id !== localCliente.id) })
      throw error
    }
    await salvarEnderecoCliente(data.id, localCliente.endereco_estruturado)
    const saved = { ...mapClienteFromDb(data), endereco_estruturado: localCliente.endereco_estruturado ?? null }
    salvarState({ clientes: [saved, ...clientes.filter(c => c.id !== localCliente.id)] })
    return saved
  }

  const updateCliente = (id, updatedC) => {
    const next = clientes.map(c => c.id === id ? { ...c, ...updatedC } : c)
    salvarState({ clientes: next })
    supabaseDb.from('cliente').update(normalizeClienteForDb({ ...clientes.find(c => c.id === id), ...updatedC })).eq('id', id).then(({ error }) => {
      if (error) console.error('Erro ao atualizar cliente no Supabase:', error)
    })
    salvarEnderecoCliente(id, updatedC.endereco_estruturado)
  }

  const deleteCliente = (id) => {
    salvarState({ clientes: clientes.filter(c => c.id !== id) })
    supabaseDb.from('cliente').update({ ativo: false }).eq('id', id).then(({ error }) => {
      if (error) console.error('Erro ao inativar cliente no Supabase:', error)
    })
  }

  // Mesmo contrato do addCliente: resolve com o veiculo gravado, rejeita em erro.
  const addVeiculo = async (newV) => {
    const localVeiculo = { ...newV, id: isUuid(newV.id) ? newV.id : newUuid() }
    salvarState({ veiculos: [...veiculos, localVeiculo] })

    const { data, error } = await supabaseDb.from('veiculo').insert(normalizeVeiculoForDb(localVeiculo)).select().single()
    if (error) {
      console.error('Erro ao salvar veiculo no Supabase:', error)
      salvarState({ veiculos: veiculos.filter(v => v.id !== localVeiculo.id) })
      throw error
    }
    const saved = mapVeiculoFromDb(data)
    salvarState({ veiculos: [saved, ...veiculos.filter(v => v.id !== localVeiculo.id)] })
    return saved
  }

  const updateVeiculo = (id, updatedV) => {
    const original = veiculos.find(v => v.id === id) || {}
    const next = veiculos.map(v => v.id === id ? { ...v, ...updatedV } : v)
    salvarState({ veiculos: next })
    supabaseDb.from('veiculo').update(normalizeVeiculoForDb({ ...original, ...updatedV })).eq('id', id).then(({ error }) => {
      if (error) console.error('Erro ao atualizar veiculo no Supabase:', error)
    })
  }

  const deleteVeiculo = (id) => {
    salvarState({ veiculos: veiculos.filter(v => v.id !== id) })
    supabaseDb.from('veiculo').update({ ativo: false }).eq('id', id).then(({ error }) => {
      if (error) console.error('Erro ao inativar veiculo no Supabase:', error)
    })
  }

  const addServico = (newS) => {
    const localServico = { ...newS, id: newUuid(), ativo: true }
    salvarState({ servicos: [...servicos, localServico] })
    supabaseDb.from('servico_catalogo').insert(localServico).select().single().then(({ data, error }) => {
      if (error) { console.error('Erro ao salvar servico no Supabase:', error); return }
      salvarState({ servicos: [data, ...servicos.filter(s => s.id !== localServico.id)] })
    })
    return localServico
  }

  const updateServico = (id, updatedS) => {
    salvarState({ servicos: servicos.map(s => s.id === id ? { ...s, ...updatedS } : s) })
    supabaseDb.from('servico_catalogo').update(updatedS).eq('id', id).then(({ error }) => {
      if (error) console.error('Erro ao atualizar servico no Supabase:', error)
    })
  }

  const deleteServico = (id) => {
    salvarState({ servicos: servicos.filter(s => s.id !== id) })
    supabaseDb.from('servico_catalogo').update({ ativo: false }).eq('id', id).then(({ error }) => {
      if (error) console.error('Erro ao remover servico no Supabase:', error)
    })
  }

  const addOrdemServico = async (newOS) => {
    const localOS = { ...newOS, id: isUuid(newOS.id) ? newOS.id : newUuid(), created_at: new Date().toISOString() }
    const userId = currentUserId || newOS.id_usuario

    const { data, error } = await supabaseDb
      .from('ordem_servico')
      .insert(pickOSFields(localOS, userId))
      .select()
      .single()

    if (error) throw error

    const servicos = localOS.servicos_itens || []
    const pecas = localOS.pecas_itens || []
    await syncItensOS(supabaseDb, data.id, servicos, pecas)

    const saved = { ...mapOSFromDb(data), servicos_itens: servicos, pecas_itens: pecas }
    salvarState({ ordensServico: [saved, ...ordensServico] })
    return saved
  }

  const updateOrdemServico = (id, updatedOS) => {
    const original = ordensServico.find(os => os.id === id) || {}
    const merged = { ...original, ...updatedOS }
    const data = ordensServico.map(os => os.id === id ? merged : os)
    salvarState({ ordensServico: data })
    const userId = currentUserId || merged.id_usuario
    if (isUuid(id)) {
      supabaseDb.from('ordem_servico').update(pickOSFields(merged, userId)).eq('id', id).then(({ error }) => {
        if (error) console.error('Erro ao atualizar OS no Supabase:', error)
      })
      // So sincroniza itens quando o update realmente mexeu neles (evita apagar
      // itens em updates de status, ex.: reabertura da OS).
      if (updatedOS.servicos_itens !== undefined || updatedOS.pecas_itens !== undefined) {
        syncItensOS(supabaseDb, id, merged.servicos_itens || [], merged.pecas_itens || [])
      }
    }
  }

  const addFuncionario = (novo) => {
    const local = { ...novo, id: isUuid(novo.id) ? novo.id : newUuid(), ativo: true }
    salvarState({ funcionarios: [...funcionarios, local] })
    supabaseDb.from('funcionario').insert(normalizeFuncionarioForDb(local)).select().single().then(({ data, error }) => {
      if (error) { console.error('Erro ao salvar funcionario no Supabase:', error); return }
      salvarState({ funcionarios: [data, ...funcionarios.filter(f => f.id !== local.id)] })
    })
    return local
  }

  const updateFuncionario = (id, upd) => {
    const original = funcionarios.find(f => f.id === id) || {}
    salvarState({ funcionarios: funcionarios.map(f => f.id === id ? { ...f, ...upd } : f) })
    supabaseDb.from('funcionario').update(normalizeFuncionarioForDb({ ...original, ...upd })).eq('id', id).then(({ error }) => {
      if (error) console.error('Erro ao atualizar funcionario no Supabase:', error)
    })
  }

  const deleteFuncionario = (id) => {
    salvarState({ funcionarios: funcionarios.filter(f => f.id !== id) })
    supabaseDb.from('funcionario').update({ ativo: false }).eq('id', id).then(({ error }) => {
      if (error) console.error('Erro ao inativar funcionario no Supabase:', error)
    })
  }

  const deleteOrdemServico = (id) => {
    salvarState({ ordensServico: ordensServico.filter(os => os.id !== id) })
    if (isUuid(id)) {
      supabaseDb.from('ordem_servico').update({ status: 'cancelada' }).eq('id', id).then(({ error }) => {
        if (error) console.error('Erro ao cancelar OS no Supabase:', error)
      })
    }
  }

  return {
    clientes,
    veiculos,
    servicos,
    usuarios,
    funcionarios,
    ordensServico,
    loading,
    supabaseConnected,
    databaseError,
    currentUserId,
    oficina,
    carregandoOficina,
    erroOficina,
    salvarOficina,
    uploadLogoOficina,
    removerLogoOficina,
    baixarLogoOficina,
    reloadDatabase: carregarDados,
    addCliente,
    updateCliente,
    deleteCliente,
    addVeiculo,
    updateVeiculo,
    deleteVeiculo,
    addServico,
    updateServico,
    deleteServico,
    addOrdemServico,
    updateOrdemServico,
    deleteOrdemServico,
    addFuncionario,
    updateFuncionario,
    deleteFuncionario,
  }
}

// Provider que carrega os dados UMA vez e compartilha com todas as páginas.
// Antes cada página chamava useDatabase() e refazia 6 consultas ao Supabase
// a cada navegação; agora a navegação é instantânea (dados em cache no contexto).
export function DataProvider({ children }) {
  const value = useDatabaseState()
  return createElement(DataContext.Provider, { value }, children)
}

export function useDatabase() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDatabase precisa estar dentro de <DataProvider>')
  return ctx
}
