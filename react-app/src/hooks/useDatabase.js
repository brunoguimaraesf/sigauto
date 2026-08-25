import { createContext, useContext, useEffect, useState, createElement } from 'react'
import { supabase, supabaseDb } from '../supabaseClient'

const DataContext = createContext(null)

const newUuid = () => crypto.randomUUID()
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')
const toInteger = (value) => {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isInteger(number) ? number : null
}

const mapClienteFromDb = (c) => ({
  ...c,
  tipo_pessoa: c.tipo_pessoa || 'fisica',
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
      const [{ data: sessionData }, clientesRes, veiculosRes, osRes, servicosRes, usuariosRes, funcionariosRes] = await Promise.all([
        supabase.auth.getUser(),
        supabaseDb.from('cliente').select('*').eq('ativo', true).order('nome'),
        supabaseDb.from('veiculo').select('*').eq('ativo', true).order('placa'),
        supabaseDb.from('ordem_servico').select('*, os_servico(*), os_peca(*)').order('data_abertura', { ascending: false }),
        supabaseDb.from('servico_catalogo').select('*').eq('ativo', true).order('nome'),
        supabaseDb.from('usuario').select('*').eq('ativo', true).order('nome'),
        // Lista geral pela view publica (sem comissao) — usada em dropdowns e
        // na resolucao de nomes. Comissao so nas telas de gestor (Relatorios,
        // Funcionarios), que consultam a tabela funcionario diretamente.
        supabaseDb.from('funcionario_publico').select('*').eq('ativo', true).order('nome'),
      ])

      if (clientesRes.error) throw clientesRes.error
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
        clientes: (clientesRes.data || []).map(mapClienteFromDb),
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
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addCliente = (newC) => {
    const localCliente = { ...newC, id: isUuid(newC.id) ? newC.id : newUuid() }
    salvarState({ clientes: [...clientes, localCliente] })

    supabaseDb.from('cliente').insert(normalizeClienteForDb(localCliente)).select().single().then(({ data, error }) => {
      if (error) { console.error('Erro ao salvar cliente no Supabase:', error); return }
      const saved = mapClienteFromDb(data)
      salvarState({ clientes: [saved, ...clientes.filter(c => c.id !== localCliente.id)] })
    })

    return localCliente
  }

  const updateCliente = (id, updatedC) => {
    const next = clientes.map(c => c.id === id ? { ...c, ...updatedC } : c)
    salvarState({ clientes: next })
    supabaseDb.from('cliente').update(normalizeClienteForDb({ ...clientes.find(c => c.id === id), ...updatedC })).eq('id', id).then(({ error }) => {
      if (error) console.error('Erro ao atualizar cliente no Supabase:', error)
    })
  }

  const deleteCliente = (id) => {
    salvarState({ clientes: clientes.filter(c => c.id !== id) })
    supabaseDb.from('cliente').update({ ativo: false }).eq('id', id).then(({ error }) => {
      if (error) console.error('Erro ao inativar cliente no Supabase:', error)
    })
  }

  const addVeiculo = (newV) => {
    const localVeiculo = { ...newV, id: isUuid(newV.id) ? newV.id : newUuid() }
    salvarState({ veiculos: [...veiculos, localVeiculo] })
    supabaseDb.from('veiculo').insert(normalizeVeiculoForDb(localVeiculo)).select().single().then(({ data, error }) => {
      if (error) { console.error('Erro ao salvar veiculo no Supabase:', error); return }
      const saved = mapVeiculoFromDb(data)
      salvarState({ veiculos: [saved, ...veiculos.filter(v => v.id !== localVeiculo.id)] })
    })
    return localVeiculo
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
