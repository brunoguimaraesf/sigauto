import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Car, CheckCircle, User, Wrench } from 'lucide-react'
import { GlassPanel } from '../../components/GlassPanel'
import { useDatabase } from '../../hooks/useDatabase'
import { maskCpfCnpj, maskTelefone, maskPlaca } from '../../utils/masks'

const CONSUMIDOR_ID = 'cliente-consumidor'

const emptyCliente = { nome: '', telefone: '', email: '', cpf_cnpj: '', tipo_pessoa: 'fisica' }
const emptyVeiculo = { placa: '', marca: '', modelo: '', ano: '', cor: '', km_atual: '' }

export function AbrirOS() {
  const navigate = useNavigate()
  const { clientes, veiculos, usuarios, currentUserId, addCliente, addVeiculo, addOrdemServico } = useDatabase()

  const [clienteId, setClienteId] = useState('')
  const [veiculoId, setVeiculoId] = useState('')
  const [novoCliente, setNovoCliente] = useState(false)
  const [novoVeiculo, setNovoVeiculo] = useState(false)
  const [clienteForm, setClienteForm] = useState(emptyCliente)
  const [veiculoForm, setVeiculoForm] = useState(emptyVeiculo)
  const [descricao, setDescricao] = useState('')
  const [prioridade, setPrioridade] = useState('normal')
  const [kmEntrada, setKmEntrada] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('a_definir')
  const [mecanicoId, setMecanicoId] = useState('')
  const [atendenteId, setAtendenteId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successModal, setSuccessModal] = useState(null)

  const mecanicos = useMemo(() => usuarios.filter(u => u.perfil === 'mecanico'), [usuarios])
  const atendentes = useMemo(() => usuarios.filter(u => u.perfil === 'atendente' || u.perfil === 'gestor'), [usuarios])
  const usuarioAtual = usuarios.find(u => u.id === currentUserId)
  const atendentePadrao = usuarioAtual?.perfil === 'atendente' || usuarioAtual?.perfil === 'gestor'
    ? usuarioAtual
    : atendentes[0]
  const atendenteSelecionadoId = atendenteId || atendentePadrao?.id || ''

  const clientesComConsumidor = useMemo(() => {
    const consumidor = clientes.find(c => c.id === CONSUMIDOR_ID || c.nome?.toLowerCase() === 'consumidor')
    const base = consumidor || {
      id: CONSUMIDOR_ID,
      nome: 'Consumidor',
      telefone: 'Nao informado',
      email: '',
      tipo_pessoa: 'fisica',
      cpf_cnpj: '000.000.000-00',
      ativo: true,
    }
    return [base, ...clientes.filter(c => c.id !== base.id && c.nome?.toLowerCase() !== 'consumidor')]
  }, [clientes])

  const clienteSelecionado = clientesComConsumidor.find(c => c.id === clienteId)
  const veiculosDoCliente = veiculos.filter(v => {
    const owner = v.cliente_id || v.id_cliente
    return owner === clienteId
  })
  const veiculoSelecionado = veiculos.find(v => v.id === veiculoId)

  const garantirConsumidor = () => {
    const existente = clientes.find(c => c.id === CONSUMIDOR_ID || c.nome?.toLowerCase() === 'consumidor')
    if (existente) return existente
    return addCliente({
      id: CONSUMIDOR_ID,
      nome: 'Consumidor',
      telefone: 'Nao informado',
      email: '',
      tipo_pessoa: 'fisica',
      cpf_cnpj: '000.000.000-00',
      ativo: true,
    })
  }

  const salvarClienteRapido = () => {
    if (!clienteForm.nome.trim()) {
      alert('Informe o nome do cliente.')
      return null
    }
    const cliente = addCliente({
      ...clienteForm,
      nome: clienteForm.nome.trim(),
      telefone: clienteForm.telefone || 'Nao informado',
      cpf_cnpj: clienteForm.cpf_cnpj || `SC${Date.now().toString().slice(-9)}`,
      ativo: true,
    })
    setClienteId(cliente.id)
    setNovoCliente(false)
    setClienteForm(emptyCliente)
    return cliente
  }

  const salvarVeiculoRapido = (ownerId) => {
    const resolvedOwner = typeof ownerId === 'string' ? ownerId : null
    const donoId = resolvedOwner || (clienteId === CONSUMIDOR_ID ? garantirConsumidor().id : clienteId) || salvarClienteRapido()?.id
    if (!donoId) return null
    if (!veiculoForm.placa.trim() || !veiculoForm.marca.trim() || !veiculoForm.modelo.trim()) {
      alert('Informe placa, marca e modelo do veiculo.')
      return null
    }
    const veiculo = addVeiculo({
      ...veiculoForm,
      placa: veiculoForm.placa.toUpperCase(),
      ano: veiculoForm.ano || new Date().getFullYear(),
      cor: veiculoForm.cor || 'Nao informada',
      cliente_id: donoId,
      id_cliente: donoId,
      status: 'Pendente',
      ativo: true,
    })
    setVeiculoId(veiculo.id)
    setNovoVeiculo(false)
    setVeiculoForm(emptyVeiculo)
    return veiculo
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    let clienteFinal = clienteSelecionado
    let veiculoFinal = veiculoSelecionado

    if (novoCliente) clienteFinal = salvarClienteRapido()
    if (clienteId === CONSUMIDOR_ID) clienteFinal = garantirConsumidor()
    if (!clienteFinal) {
      alert('Selecione ou cadastre um cliente.')
      return
    }
    if (novoVeiculo) veiculoFinal = salvarVeiculoRapido(clienteFinal?.id)
    if (!veiculoFinal) {
      alert('Selecione ou cadastre um veiculo.')
      return
    }
    if (descricao.trim().length < 10) {
      alert('A descricao da queixa deve ter pelo menos 10 caracteres.')
      return
    }

    setSubmitting(true)
    try {
      const saved = await addOrdemServico({
        veiculo_id: veiculoFinal.id,
        id_veiculo: veiculoFinal.id,
        cliente_id: clienteFinal.id,
        id_usuario: mecanicoId || atendenteSelecionadoId || currentUserId || null,
        descricao,
        diagnostico: '',
        servicos_executados: '',
        servicos_itens: [],
        pecas_itens: [],
        prioridade,
        km_entrada: kmEntrada ? Number(kmEntrada) : Number(veiculoFinal.km_atual || 0) || null,
        observacoes,
        forma_pagamento: formaPagamento,
        status: 'aberta',
        data_abertura: new Date().toISOString(),
        valor_servicos: 0,
        valor_pecas: 0,
        valor_total: 0,
        preco_final: 0,
      })
      setSuccessModal({ numero: saved.numero_os ? `O.S. #${saved.numero_os}` : 'O.S. aberta', cliente: clienteFinal, veiculo: veiculoFinal })
    } catch (err) {
      console.error('Erro ao criar OS:', err)
      alert(`Erro ao criar O.S.: ${err?.message || 'Verifique o console para detalhes.'}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (successModal) {
    return (
      <div className="dashboard-grid">
        <GlassPanel className="panel stagger-1" style={{ textAlign: 'center', padding: '64px 48px' }}>
          <CheckCircle size={44} color="var(--status-done)" style={{ marginBottom: '20px' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '12px' }}>O.S. Aberta com Sucesso</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>{successModal.numero}</p>
          <p style={{ color: 'var(--neon-orange)', fontWeight: 700, marginBottom: '32px' }}>
            {successModal.cliente.nome} - {successModal.veiculo.placa} {successModal.veiculo.marca} {successModal.veiculo.modelo}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => navigate('/ordens-servico')}>Ver O.S.</button>
            <button className="btn-primary" onClick={() => {
              setSuccessModal(null)
              setClienteId('')
              setVeiculoId('')
              setMecanicoId('')
              setDescricao('')
              setPrioridade('normal')
              setKmEntrada('')
              setObservacoes('')
              setFormaPagamento('a_definir')
            }}>Abrir Nova O.S.</button>
          </div>
        </GlassPanel>
      </div>
    )
  }

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Abrir Nova O.S.</h2>
          <p>Selecione o cliente, escolha o veiculo e registre a entrada.</p>
        </div>
        <button className="btn-secondary" onClick={() => navigate('/ordens-servico')} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> Voltar
        </button>
      </section>

      <form onSubmit={handleSubmit}>
        <GlassPanel className="panel stagger-2">

          {/* ── Linha 1: Cliente | Veículo ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>

            {/* CLIENTE */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <User size={12} style={{ marginRight: '6px' }} />Cliente
                </span>
                <button type="button" className="btn-link" style={{ fontSize: '11px' }} onClick={() => setNovoCliente(v => !v)}>
                  {novoCliente ? 'Usar existente' : '+ Novo'}
                </button>
              </div>

              {!novoCliente ? (
                <>
                  <select className="form-control" value={clienteId} onChange={e => { setClienteId(e.target.value); setVeiculoId('') }} required>
                    <option value="">Selecione o cliente...</option>
                    {clientesComConsumidor.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  {clienteSelecionado && (
                    <div style={{ marginTop: '8px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{clienteSelecionado.nome}</strong>
                      <span style={{ display: 'block' }}>{clienteSelecionado.telefone || '—'}</span>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input className="form-control" placeholder="Nome *" value={clienteForm.nome} onChange={e => setClienteForm(f => ({ ...f, nome: e.target.value }))} />
                  <input className="form-control" placeholder="(00) 00000-0000" value={clienteForm.telefone} onChange={e => setClienteForm(f => ({ ...f, telefone: maskTelefone(e.target.value) }))} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input className="form-control" type="email" placeholder="E-mail" value={clienteForm.email} onChange={e => setClienteForm(f => ({ ...f, email: e.target.value }))} />
                    <input className="form-control" placeholder="CPF/CNPJ" value={clienteForm.cpf_cnpj} onChange={e => setClienteForm(f => ({ ...f, cpf_cnpj: maskCpfCnpj(e.target.value, f.tipo_pessoa) }))} />
                  </div>
                  <button type="button" className="btn-secondary" onClick={salvarClienteRapido} style={{ alignSelf: 'flex-start', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: '12px' }}>
                    Salvar cliente
                  </button>
                </div>
              )}
            </div>

            {/* VEÍCULO */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <Car size={12} style={{ marginRight: '6px' }} />Veículo
                </span>
                <button type="button" className="btn-link" style={{ fontSize: '11px' }} onClick={() => setNovoVeiculo(v => !v)} disabled={!clienteId && !novoCliente}>
                  {novoVeiculo ? 'Usar cadastrado' : '+ Novo'}
                </button>
              </div>

              {!novoVeiculo ? (
                <>
                  <select className="form-control" value={veiculoId} onChange={e => setVeiculoId(e.target.value)} disabled={!clienteId} required>
                    <option value="">{clienteId ? 'Selecione o veículo...' : 'Selecione um cliente primeiro'}</option>
                    {veiculosDoCliente.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>)}
                  </select>
                  {clienteId && veiculosDoCliente.length === 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--neon-orange)', marginTop: '6px' }}>Nenhum veículo. Use <strong>+ Novo</strong> para cadastrar.</p>
                  )}
                  {veiculoSelecionado && (
                    <div style={{ marginTop: '8px', padding: '8px 12px', border: '1px solid rgba(249,115,22,0.15)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--neon-orange)' }}>{veiculoSelecionado.placa}</strong>
                      <span> — {veiculoSelecionado.marca} {veiculoSelecionado.modelo}</span>
                      <span style={{ display: 'block' }}>{veiculoSelecionado.ano} · {veiculoSelecionado.cor}</span>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <input className="form-control" placeholder="Placa *" value={veiculoForm.placa} onChange={e => setVeiculoForm(f => ({ ...f, placa: maskPlaca(e.target.value) }))} />
                    <input className="form-control" placeholder="Marca *" value={veiculoForm.marca} onChange={e => setVeiculoForm(f => ({ ...f, marca: e.target.value }))} />
                    <input className="form-control" placeholder="Modelo *" value={veiculoForm.modelo} onChange={e => setVeiculoForm(f => ({ ...f, modelo: e.target.value }))} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <input className="form-control" type="number" placeholder="Ano" value={veiculoForm.ano} onChange={e => setVeiculoForm(f => ({ ...f, ano: e.target.value }))} />
                    <input className="form-control" placeholder="Cor" value={veiculoForm.cor} onChange={e => setVeiculoForm(f => ({ ...f, cor: e.target.value }))} />
                    <input className="form-control" type="number" placeholder="KM atual" value={veiculoForm.km_atual} onChange={e => setVeiculoForm(f => ({ ...f, km_atual: e.target.value }))} />
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => salvarVeiculoRapido()} style={{ alignSelf: 'flex-start', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: '12px' }}>
                    Salvar veículo
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Divisor ── */}
          <div style={{ borderTop: '1px solid var(--border-color)', margin: '0 0 20px' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label><Wrench size={12} style={{ marginRight: '6px' }} />Mecanico responsavel</label>
              <select className="form-control" value={mecanicoId} onChange={e => setMecanicoId(e.target.value)}>
                <option value="">A definir</option>
                {mecanicos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label><User size={12} style={{ marginRight: '6px' }} />Atendente responsavel</label>
              <select className="form-control" value={atendenteSelecionadoId} onChange={e => setAtendenteId(e.target.value)} required>
                <option value="">Selecione...</option>
                {atendentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', margin: '0 0 20px' }} />

          {/* ── Linha 2: Detalhes da O.S. ── */}
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Queixa / Descrição do problema</label>
            <textarea className="form-control" value={descricao} onChange={e => setDescricao(e.target.value)} minLength={10} required placeholder="Descreva a queixa do cliente e os sintomas observados..." style={{ minHeight: '72px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Prioridade</label>
              <select className="form-control" value={prioridade} onChange={e => setPrioridade(e.target.value)}>
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>KM de entrada</label>
              <input type="number" className="form-control" value={kmEntrada} onChange={e => setKmEntrada(e.target.value)} min={0} placeholder={veiculoSelecionado?.km_atual || 'Ex: 45200'} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Forma de pagamento</label>
              <select className="form-control" value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}>
                <option value="a_definir">A definir</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">Pix</option>
                <option value="cartao_debito">Cartão de débito</option>
                <option value="cartao_credito">Cartão de crédito</option>
                <option value="transferencia">Transferência</option>
                <option value="boleto">Boleto</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Observações internas</label>
              <input className="form-control" value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/ordens-servico')} style={{ borderRadius: 'var(--radius-sm)' }}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={submitting} style={{ borderRadius: 'var(--radius-sm)', padding: '10px 28px' }}>
              {submitting ? 'Registrando...' : 'Confirmar Abertura'}
            </button>
          </div>
        </GlassPanel>
      </form>
    </div>
  )
}
