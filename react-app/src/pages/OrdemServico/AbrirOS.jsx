import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Car, CheckCircle, Search, User, Wrench } from 'lucide-react'
import { GlassPanel } from '../../components/GlassPanel'
import { useDatabase } from '../../hooks/useDatabase'
import { maskCpfCnpj, maskTelefone, maskPlaca } from '../../utils/masks'
import { filtrarClientesPorTermo, descreverResultado } from '../../utils/clienteBusca'
import css from './AbrirOS.module.css'

const CONSUMIDOR_ID = 'cliente-consumidor'

const emptyCliente = { nome: '', telefone: '', email: '', cpf_cnpj: '', tipo_pessoa: 'fisica' }
const emptyVeiculo = { placa: '', marca: '', modelo: '', ano: '', cor: '', km_atual: '' }

export function AbrirOS() {
  const navigate = useNavigate()
  const { clientes, veiculos, funcionarios, currentUserId, addCliente, addVeiculo, addOrdemServico } = useDatabase()

  const [clienteId, setClienteId] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
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

  const mecanicos = useMemo(() => funcionarios.filter(f => f.cargo === 'mecanico'), [funcionarios])
  const atendentes = useMemo(() => funcionarios.filter(f => f.cargo === 'atendente' || f.cargo === 'gestor'), [funcionarios])
  const funcionarioAtual = funcionarios.find(f => f.id_usuario === currentUserId)
  const atendentePadrao = funcionarioAtual && funcionarioAtual.cargo !== 'mecanico'
    ? funcionarioAtual
    : atendentes[0]
  const atendenteSelecionadoId = atendenteId || atendentePadrao?.id || ''

  // O Consumidor ja gravado entra com o id real: com o id ficticio, os veiculos
  // dele nao seriam encontrados e a O.S. de balcao nao abriria.
  const clientesComConsumidor = useMemo(() => {
    const consumidor = clientes.find(c => c.id === CONSUMIDOR_ID || c.nome?.toLowerCase() === 'consumidor')
    const base = consumidor || {
      id: CONSUMIDOR_ID,
      nome: 'Consumidor',
      telefone: 'Não informado',
      email: '',
      tipo_pessoa: 'fisica',
      cpf_cnpj: '000.000.000-00',
      ativo: true,
    }
    return [base, ...clientes.filter(c => c.id !== base.id && c.nome?.toLowerCase() !== 'consumidor')]
  }, [clientes])

  // No balcao o atendente costuma ter a placa ou o documento em maos, e nao o
  // nome exato como foi cadastrado — por isso a busca cobre os tres.
  const resultadosBusca = useMemo(
    () => filtrarClientesPorTermo(clientesComConsumidor, veiculos, buscaCliente, 8),
    [clientesComConsumidor, veiculos, buscaCliente]
  )

  const clienteSelecionado = clientesComConsumidor.find(c => c.id === clienteId)
  const veiculosDoCliente = veiculos.filter(v => {
    const owner = v.cliente_id || v.id_cliente
    return owner === clienteId
  })
  const veiculoSelecionado = veiculos.find(v => v.id === veiculoId)

  const formularioPreenchido = Boolean(
    clienteId || veiculoId || mecanicoId || atendenteId || descricao.trim() || kmEntrada ||
    observacoes.trim() || prioridade !== 'normal' || formaPagamento !== 'a_definir' ||
    clienteForm.nome.trim() || clienteForm.telefone.trim() || clienteForm.email.trim() || clienteForm.cpf_cnpj.trim() ||
    Object.values(veiculoForm).some(valor => String(valor).trim())
  )

  const cancelarAbertura = () => {
    if (formularioPreenchido && !confirm('Descartar os dados preenchidos da O.S.?')) return
    navigate('/ordens-servico')
  }

  const garantirConsumidor = async () => {
    const existente = clientes.find(c => c.id === CONSUMIDOR_ID || c.nome?.toLowerCase() === 'consumidor')
    if (existente) return existente
    return addCliente({
      id: CONSUMIDOR_ID,
      nome: 'Consumidor',
      telefone: 'Não informado',
      email: '',
      tipo_pessoa: 'fisica',
      cpf_cnpj: '000.000.000-00',
      ativo: true,
    })
  }

  // addCliente/addVeiculo resolvem so depois do insert. Esperar aqui e o que
  // garante a ordem cliente -> veiculo -> O.S. que as FKs exigem.
  const salvarClienteRapido = async () => {
    if (!clienteForm.nome.trim()) {
      alert('Informe o nome do cliente.')
      return null
    }
    let cliente
    try {
      cliente = await addCliente({
        ...clienteForm,
        nome: clienteForm.nome.trim(),
        telefone: clienteForm.telefone || 'Não informado',
        cpf_cnpj: clienteForm.cpf_cnpj || `SC${Date.now().toString().slice(-9)}`,
        ativo: true,
      })
    } catch (err) {
      alert(`Erro ao salvar cliente: ${err?.message || 'tente novamente.'}`)
      return null
    }
    setClienteId(cliente.id)
    setNovoCliente(false)
    setClienteForm(emptyCliente)
    return cliente
  }

  const salvarVeiculoRapido = async (ownerId) => {
    const resolvedOwner = typeof ownerId === 'string' ? ownerId : null
    if (!veiculoForm.placa.trim() || !veiculoForm.marca.trim() || !veiculoForm.modelo.trim()) {
      alert('Informe placa, marca e modelo do veículo.')
      return null
    }
    let donoId = resolvedOwner || clienteId
    try {
      if (!resolvedOwner && clienteId === CONSUMIDOR_ID) {
        donoId = (await garantirConsumidor()).id
        setClienteId(donoId)
      }
    } catch (err) {
      alert(`Erro ao salvar cliente: ${err?.message || 'tente novamente.'}`)
      return null
    }
    if (!donoId) donoId = (await salvarClienteRapido())?.id
    if (!donoId) return null
    let veiculo
    try {
      veiculo = await addVeiculo({
        ...veiculoForm,
        placa: veiculoForm.placa.toUpperCase(),
        ano: veiculoForm.ano || new Date().getFullYear(),
        cor: veiculoForm.cor || 'Não informada',
        cliente_id: donoId,
        id_cliente: donoId,
        status: 'Pendente',
        ativo: true,
      })
    } catch (err) {
      alert(`Erro ao salvar veículo: ${err?.message || 'tente novamente.'}`)
      return null
    }
    setVeiculoId(veiculo.id)
    setNovoVeiculo(false)
    setVeiculoForm(emptyVeiculo)
    return veiculo
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    let clienteFinal = clienteSelecionado
    let veiculoFinal = veiculoSelecionado

    if (descricao.trim().length < 10) {
      alert('A descrição da queixa deve ter pelo menos 10 caracteres.')
      return
    }

    // Trava o botao ja aqui: cliente e veiculo novos sao gravados antes da
    // O.S., e um segundo clique nesse intervalo duplicaria os cadastros.
    setSubmitting(true)
    try {
      if (novoCliente) {
        clienteFinal = await salvarClienteRapido()
        if (!clienteFinal) return
      }
      if (clienteId === CONSUMIDOR_ID) {
        try {
          clienteFinal = await garantirConsumidor()
        } catch (err) {
          alert(`Erro ao salvar cliente: ${err?.message || 'tente novamente.'}`)
          return
        }
      }
      if (!clienteFinal) {
        alert('Selecione ou cadastre um cliente.')
        return
      }
      if (novoVeiculo) {
        veiculoFinal = await salvarVeiculoRapido(clienteFinal.id)
        if (!veiculoFinal) return
      }
      if (!veiculoFinal) {
        alert('Selecione ou cadastre um veículo.')
        return
      }

      const saved = await addOrdemServico({
        veiculo_id: veiculoFinal.id,
        id_veiculo: veiculoFinal.id,
        cliente_id: clienteFinal.id,
        id_usuario: currentUserId || null,
        id_mecanico: mecanicoId || null,
        id_atendente: atendenteSelecionadoId || null,
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
        <GlassPanel className={`panel stagger-1 ${css.painelSucesso}`}>
          <CheckCircle size={44} color="var(--status-done)" className={css.iconeSucesso} />
          <h2 className={css.tituloSucesso}>O.S. Aberta com Sucesso</h2>
          <p className={css.numeroSucesso}>{successModal.numero}</p>
          <p className={css.dadosSucesso}>
            {successModal.cliente.nome} - {successModal.veiculo.placa} {successModal.veiculo.marca} {successModal.veiculo.modelo}
          </p>
          <div className={css.acoesSucesso}>
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
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Abrir Nova O.S.</h2>
          <p>Selecione o cliente, escolha o veículo e registre a entrada.</p>
        </div>
        <button type="button" className={`btn-secondary ${css.btnVoltar}`} onClick={cancelarAbertura}>
          <ArrowLeft size={16} /> Voltar
        </button>
      </section>

      <form onSubmit={handleSubmit}>
        <GlassPanel className="panel stagger-2">
          <p className={css.legendaObrigatorios}>* Campos obrigatórios</p>

          {/* ── Linha 1: Cliente | Veículo ── */}
          <h3 className={css.etapaTitulo}>1. Cliente e veículo</h3>
          <div className={css.colunas}>

            {/* CLIENTE */}
            <div>
              <div className={css.secaoHeader}>
                <span className={css.secaoTitulo}>
                  <User size={12} className={css.iconeRotulo} />Cliente *
                </span>
                <button type="button" className={`btn-link ${css.btnAtalho}`} onClick={() => setNovoCliente(v => !v)}>
                  {novoCliente ? 'Usar existente' : '+ Novo'}
                </button>
              </div>

              {!novoCliente ? (
                <>
                  {clienteSelecionado ? (
                    <div className={css.resumoCliente}>
                      <div>
                        <strong className={css.resumoNome}>{clienteSelecionado.nome}</strong>
                        <span className={css.linhaPropria}>{clienteSelecionado.telefone || '—'}</span>
                      </div>
                      <button
                        type="button"
                        className={`btn-link ${css.btnTrocar}`}
                        onClick={() => { setClienteId(''); setVeiculoId(''); setBuscaCliente('') }}
                      >
                        Trocar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className={css.busca}>
                        <Search size={14} className={css.buscaIcone} />
                        <input
                          type="text"
                          className={`form-control ${css.buscaInput}`}
                          placeholder="Buscar por nome, CPF/CNPJ ou placa"
                          value={buscaCliente}
                          onChange={e => setBuscaCliente(e.target.value)}
                          aria-label="Buscar cliente por nome, CPF, CNPJ ou placa"
                        />
                      </div>

                      {buscaCliente.trim() && resultadosBusca.length === 0 && (
                        <div className={css.semResultado}>
                          Nenhum cliente encontrado. Use <strong>+ Novo</strong> para cadastrar.
                        </div>
                      )}

                      {resultadosBusca.length > 0 && (
                        <ul className={css.resultados}>
                          {resultadosBusca.map(resultado => (
                            <li key={resultado.cliente.id}>
                              <button
                                type="button"
                                onClick={() => { setClienteId(resultado.cliente.id); setVeiculoId(''); setBuscaCliente('') }}
                                className={css.resultado}
                              >
                                {resultado.cliente.nome}
                                <span className={css.resultadoDetalhe}>
                                  {descreverResultado(resultado)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Venda de balcao sem cadastro: atalho para o cliente generico. */}
                      {!buscaCliente.trim() && (
                        <button
                          type="button"
                          className={`btn-link ${css.btnConsumidor}`}
                          onClick={() => { setClienteId(clientesComConsumidor[0].id); setVeiculoId('') }}
                        >
                          Usar &quot;Consumidor&quot;
                        </button>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className={css.cadastroRapido}>
                  <div className={css.campoRapido}>
                    <label htmlFor="os-cliente-nome">Nome *</label>
                    <input id="os-cliente-nome" className="form-control" placeholder="Nome *" value={clienteForm.nome} onChange={e => setClienteForm(f => ({ ...f, nome: e.target.value }))} />
                  </div>
                  <div className={css.campoRapido}>
                    <label htmlFor="os-cliente-telefone">Telefone</label>
                    <input id="os-cliente-telefone" className="form-control" placeholder="(00) 00000-0000" value={clienteForm.telefone} onChange={e => setClienteForm(f => ({ ...f, telefone: maskTelefone(e.target.value) }))} />
                  </div>
                  <div className={css.linha2}>
                    <div className={css.campoRapido}>
                      <label htmlFor="os-cliente-email">E-mail</label>
                      <input id="os-cliente-email" className="form-control" type="email" placeholder="E-mail" value={clienteForm.email} onChange={e => setClienteForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className={css.campoRapido}>
                      <label htmlFor="os-cliente-documento">CPF/CNPJ</label>
                      <input id="os-cliente-documento" className="form-control" placeholder="CPF/CNPJ" value={clienteForm.cpf_cnpj} onChange={e => setClienteForm(f => ({ ...f, cpf_cnpj: maskCpfCnpj(e.target.value, f.tipo_pessoa) }))} />
                    </div>
                  </div>
                  <button type="button" className={`btn-secondary ${css.btnSalvarRapido}`} onClick={salvarClienteRapido}>
                    Salvar cliente
                  </button>
                </div>
              )}
            </div>

            {/* VEÍCULO */}
            <div>
              <div className={css.secaoHeader}>
                <span className={css.secaoTitulo}>
                  <Car size={12} className={css.iconeRotulo} />Veículo *
                </span>
                <button type="button" className={`btn-link ${css.btnAtalho}`} onClick={() => setNovoVeiculo(v => !v)} disabled={!clienteId && !novoCliente}>
                  {novoVeiculo ? 'Usar cadastrado' : '+ Novo'}
                </button>
              </div>

              {!novoVeiculo ? (
                <>
                  <select aria-label="Veículo" className="form-control" value={veiculoId} onChange={e => setVeiculoId(e.target.value)} disabled={!clienteId} required>
                    <option value="">{clienteId ? 'Selecione o veículo...' : 'Selecione um cliente primeiro'}</option>
                    {veiculosDoCliente.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>)}
                  </select>
                  {clienteId && veiculosDoCliente.length === 0 && (
                    <p className={css.semVeiculo}>Nenhum veículo. Use <strong>+ Novo</strong> para cadastrar.</p>
                  )}
                  {veiculoSelecionado && (
                    <div className={css.resumoVeiculo}>
                      <strong className={css.placaVeiculo}>{veiculoSelecionado.placa}</strong>
                      <span> — {veiculoSelecionado.marca} {veiculoSelecionado.modelo}</span>
                      <span className={css.linhaPropria}>{veiculoSelecionado.ano} · {veiculoSelecionado.cor}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className={css.cadastroRapido}>
                  <div className={css.linha3}>
                    <div className={css.campoRapido}>
                      <label htmlFor="os-veiculo-placa">Placa *</label>
                      <input id="os-veiculo-placa" className="form-control" placeholder="Placa *" value={veiculoForm.placa} onChange={e => setVeiculoForm(f => ({ ...f, placa: maskPlaca(e.target.value) }))} />
                    </div>
                    <div className={css.campoRapido}>
                      <label htmlFor="os-veiculo-marca">Marca *</label>
                      <input id="os-veiculo-marca" className="form-control" placeholder="Marca *" value={veiculoForm.marca} onChange={e => setVeiculoForm(f => ({ ...f, marca: e.target.value }))} />
                    </div>
                    <div className={css.campoRapido}>
                      <label htmlFor="os-veiculo-modelo">Modelo *</label>
                      <input id="os-veiculo-modelo" className="form-control" placeholder="Modelo *" value={veiculoForm.modelo} onChange={e => setVeiculoForm(f => ({ ...f, modelo: e.target.value }))} />
                    </div>
                  </div>
                  <div className={css.linha3}>
                    <div className={css.campoRapido}>
                      <label htmlFor="os-veiculo-ano">Ano</label>
                      <input id="os-veiculo-ano" className="form-control" type="number" placeholder="Ano" value={veiculoForm.ano} onChange={e => setVeiculoForm(f => ({ ...f, ano: e.target.value }))} />
                    </div>
                    <div className={css.campoRapido}>
                      <label htmlFor="os-veiculo-cor">Cor</label>
                      <input id="os-veiculo-cor" className="form-control" placeholder="Cor" value={veiculoForm.cor} onChange={e => setVeiculoForm(f => ({ ...f, cor: e.target.value }))} />
                    </div>
                    <div className={css.campoRapido}>
                      <label htmlFor="os-veiculo-km">KM atual</label>
                      <input id="os-veiculo-km" className="form-control" type="number" placeholder="KM atual" value={veiculoForm.km_atual} onChange={e => setVeiculoForm(f => ({ ...f, km_atual: e.target.value }))} />
                    </div>
                  </div>
                  <button type="button" className={`btn-secondary ${css.btnSalvarRapido}`} onClick={() => salvarVeiculoRapido()}>
                    Salvar veículo
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Divisor ── */}
          <div className={css.divisor} />

          <h3 className={css.etapaTitulo}>2. Responsáveis</h3>
          <div className={css.gradeEquipe}>
            <div className={`form-group ${css.campoSemMargem}`}>
              <label htmlFor="os-mecanico"><Wrench size={12} className={css.iconeRotulo} />Mecânico responsável</label>
              <select id="os-mecanico" className="form-control" value={mecanicoId} onChange={e => setMecanicoId(e.target.value)}>
                <option value="">A definir</option>
                {mecanicos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className={`form-group ${css.campoSemMargem}`}>
              <label htmlFor="os-atendente"><User size={12} className={css.iconeRotulo} />Atendente responsável *</label>
              <select id="os-atendente" className="form-control" value={atendenteSelecionadoId} onChange={e => setAtendenteId(e.target.value)} required>
                <option value="">Selecione...</option>
                {atendentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
          </div>

          <div className={css.divisor} />

          {/* ── Linha 2: Detalhes da O.S. ── */}
          <h3 className={css.etapaTitulo}>3. Dados da entrada</h3>
          <div className={`form-group ${css.campoQueixa}`}>
            <label htmlFor="os-queixa">Queixa / Descrição do problema *</label>
            <textarea id="os-queixa" className={`form-control ${css.textarea}`} value={descricao} onChange={e => setDescricao(e.target.value)} minLength={10} required placeholder="Descreva a queixa do cliente e os sintomas observados..." />
          </div>

          <div className={css.gradeDetalhes}>
            <div className={`form-group ${css.campoSemMargem}`}>
              <label>Prioridade</label>
              <select className="form-control" value={prioridade} onChange={e => setPrioridade(e.target.value)}>
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div className={`form-group ${css.campoSemMargem}`}>
              <label>KM de entrada</label>
              <input type="number" className="form-control" value={kmEntrada} onChange={e => setKmEntrada(e.target.value)} min={0} placeholder={veiculoSelecionado?.km_atual || 'Ex: 45200'} />
            </div>
            <div className={`form-group ${css.campoSemMargem}`}>
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
            <div className={`form-group ${css.campoSemMargem}`}>
              <label>Observações internas</label>
              <input className="form-control" value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div className={css.acoesForm}>
            <button type="button" className={`btn-secondary ${css.btnCancelar}`} onClick={cancelarAbertura}>Cancelar</button>
            <button type="submit" className={`btn-primary ${css.btnConfirmar}`} disabled={submitting}>
              {submitting ? 'Registrando...' : 'Confirmar Abertura'}
            </button>
          </div>
        </GlassPanel>
      </form>
    </div>
  )
}
