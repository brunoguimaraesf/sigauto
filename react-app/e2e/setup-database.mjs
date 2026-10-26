import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !serviceKey || !anonKey) throw new Error('Supabase local nao configurado para o seed E2E.')

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function criarConta(email, password, nome, perfil) {
  const { data: existentes, error: listarError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listarError) throw listarError
  const existente = existentes.users.find(usuario => usuario.email === email)
  let id
  if (existente) {
    id = existente.id
    const { error } = await admin.auth.admin.updateUserById(id, {
      password,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (error) throw error
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nome },
    })
    if (error) throw error
    id = data.user.id
  }
  const { error: perfilError } = await admin.from('usuario').update({ nome, perfil, ativo: true }).eq('id', id)
  if (perfilError) throw perfilError
  return id
}

const gestor = await criarConta('gestor@sigauto.com', 'Gestor123', 'Bruno Gestor', 'gestor')
const atendente = await criarConta('atendente@sigauto.com', 'Atend123', 'Ana Atendente', 'atendente')
const mecanico = await criarConta('mecanico@sigauto.com', 'Mec123456', 'Carlos Mecanico', 'mecanico')

const FUNC_GESTOR = 'a1000000-0000-4000-8000-000000000001'
const FUNC_ATEND = 'a1000000-0000-4000-8000-000000000002'
const FUNC_MEC = 'a1000000-0000-4000-8000-000000000003'
const CLIENTE = 'b1000000-0000-4000-8000-000000000001'
const CLIENTE_ALHEIO = 'b1000000-0000-4000-8000-000000000002'
const VEICULO = 'c1000000-0000-4000-8000-000000000001'
const VEICULO_ALHEIO = 'c1000000-0000-4000-8000-000000000002'
const ITEM = 'd1000000-0000-4000-8000-000000000001'
const SERVICO = 'e1000000-0000-4000-8000-000000000001'
const OS_ABERTA = 'f1000000-0000-4000-8000-000000000001'
const OS_CONCLUIDA = 'f1000000-0000-4000-8000-000000000002'

const operacoes = [
  admin.from('funcionario').upsert([
    { id: FUNC_GESTOR, nome: 'Bruno Gestor', cargo: 'gestor', id_usuario: gestor, ativo: true },
    { id: FUNC_ATEND, nome: 'Ana Atendente', cargo: 'atendente', id_usuario: atendente, ativo: true },
    { id: FUNC_MEC, nome: 'Carlos Mecanico', cargo: 'mecanico', id_usuario: mecanico, ativo: true },
  ]),
  admin.from('cliente').upsert({ id: CLIENTE, nome: 'Carlos Eduardo Ferreira', tipo_pessoa: 'fisica', cpf_cnpj: '52998224725', telefone: '(64) 99999-0000', email: 'cliente@teste.local', ativo: true }),
  admin.from('cliente').upsert({ id: CLIENTE_ALHEIO, nome: 'Cliente Sem OS do Mecanico', tipo_pessoa: 'fisica', cpf_cnpj: '11144477735', telefone: '(64) 98888-0000', ativo: true }),
  admin.from('item_estoque').upsert({ id: ITEM, codigo: 'FIL-001', nome: 'Filtro de Oleo', unidade: 'UN', quantidade: 20, qtd_minima: 3, preco_unit: 45, ativo: true }, { onConflict: 'id', ignoreDuplicates: true }),
  admin.from('servico_catalogo').upsert({ id: SERVICO, nome: 'Troca de oleo', preco: 120, ativo: true }),
  admin.from('configuracao_oficina').upsert({ id: 1, nome_fantasia: 'SIGAUTO Oficina E2E', razao_social: 'SIGAUTO Testes Ltda', cnpj: '11222333000181', telefone: '(64) 3333-0000', cidade: 'Rio Verde', uf: 'GO' }),
]
for (const operacao of operacoes) {
  const { error } = await operacao
  if (error) throw error
}

const { data: itemAtual, error: itemError } = await admin.from('item_estoque').select('quantidade').eq('id', ITEM).single()
if (itemError) throw itemError
if (Number(itemAtual.quantidade) !== 20) {
  const { error } = await admin.from('movimentacao_estoque').insert({
    id_item: ITEM,
    id_usuario: gestor,
    tipo: 'ajuste',
    quantidade: 20,
    motivo: 'Restauracao da fixture E2E',
    origem: 'manual',
  })
  if (error) throw error
}

for (const operacao of [
  admin.from('endereco').upsert({ id_cliente: CLIENTE, cep: '75901000', logradouro: 'Rua dos Testes', numero: '42', bairro: 'Centro', cidade: 'Rio Verde', uf: 'GO' }, { onConflict: 'id_cliente' }),
  admin.from('veiculo').upsert({ id: VEICULO, id_cliente: CLIENTE, placa: 'ABC1D23', marca: 'Volkswagen', modelo: 'Gol', ano: 2022, cor: 'Prata', ativo: true }),
  admin.from('veiculo').upsert({ id: VEICULO_ALHEIO, id_cliente: CLIENTE_ALHEIO, placa: 'XYZ9A99', marca: 'Fiat', modelo: 'Argo', ano: 2023, cor: 'Branco', ativo: true }),
]) {
  const { error } = await operacao
  if (error) throw error
}

const { error: osError } = await admin.from('ordem_servico').upsert([
  { id: OS_ABERTA, numero_os: 9001, id_veiculo: VEICULO, id_usuario: gestor, id_mecanico: FUNC_MEC, id_atendente: FUNC_ATEND, descricao: 'Revisao preventiva', status: 'aberta', valor_total: 165, forma_pagamento: 'a_definir' },
  { id: OS_CONCLUIDA, numero_os: 9002, id_veiculo: VEICULO, id_usuario: gestor, id_mecanico: FUNC_MEC, id_atendente: FUNC_ATEND, descricao: 'Troca concluida', status: 'em_andamento' },
], { onConflict: 'id', ignoreDuplicates: true })
if (osError) throw osError

async function inserirItemSeAusente(tabela, colunaItem, linha) {
  const { data, error: consultaError } = await admin.from(tabela)
    .select('id')
    .eq('id_os', linha.id_os)
    .eq(colunaItem, linha[colunaItem])
    .limit(1)
  if (consultaError) throw consultaError
  if (data.length > 0) return
  const { error } = await admin.from(tabela).insert(linha)
  if (error) throw error
}

await inserirItemSeAusente('os_servico', 'id_servico', { id_os: OS_ABERTA, id_servico: SERVICO, descricao: 'Troca de oleo', quantidade: 1, valor_unitario: 120 })
await inserirItemSeAusente('os_servico', 'id_servico', { id_os: OS_CONCLUIDA, id_servico: SERVICO, descricao: 'Troca de oleo', quantidade: 1, valor_unitario: 120 })
await inserirItemSeAusente('os_peca', 'id_item', { id_os: OS_ABERTA, id_item: ITEM, descricao: 'Filtro de Oleo', quantidade: 1, valor_unitario: 45 })
await inserirItemSeAusente('os_peca', 'id_item', { id_os: OS_CONCLUIDA, id_item: ITEM, descricao: 'Filtro de Oleo', quantidade: 1, valor_unitario: 45 })

const gestorDb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { error: loginError } = await gestorDb.auth.signInWithPassword({ email: 'gestor@sigauto.com', password: 'Gestor123' })
if (loginError) throw loginError
const { error: finalizarError } = await gestorDb.rpc('finalizar_ordem_servico', {
  p_id_os: OS_CONCLUIDA,
  p_desconto_tipo: 'valor',
  p_desconto_valor: 10,
  p_desconto_percentual: null,
  p_forma_pagamento: 'pix',
  p_observacoes_finais: 'Garantia de 90 dias',
})
if (finalizarError) throw finalizarError

console.log('Banco E2E preparado com fixtures deterministicas.')
