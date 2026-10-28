import { useContext, useEffect, useState } from 'react'
import css from './AtualizarOS.module.css'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Package, Plus, Search, Trash2, Wrench, X } from 'lucide-react'
import { GlassPanel } from '../../components/GlassPanel'
import { AcoesDocumentoOS } from '../../components/ui/AcoesDocumentoOS'
import { useDatabase } from '../../hooks/useDatabase'
import { supabaseDb } from '../../supabaseClient'
import { AuthContext } from '../../context/AuthContext'
import { calcOSCommissions, calcOSTotals, formatCurrency, getLineTotal, normalizarQuantidade, resolveEquipe, toMoney } from '../../utils/osFinance'

function SummaryChip({ label, value, tone }) {
  return (
    <div className={css.chip}>
      <div className={css.chipRotulo}>{label}</div>
      <div className={css.chipValor} style={{ color: tone || 'var(--text-primary)' }}>{formatCurrency(value)}</div>
    </div>
  )
}

const normalizarItens = (itens) => itens.map(item => ({
  ...item,
  quantidade: normalizarQuantidade(item.quantidade),
}))

export function AtualizarOS() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { clientes, veiculos, funcionarios, servicos: catalogoServicos, ordensServico, updateOrdemServico, deleteOrdemServico } = useDatabase()
  const auth = useContext(AuthContext)
  const perfil = auth?.perfil
  const podeGerenciar = auth ? perfil === 'gestor' || perfil === 'atendente' : true

  const os = ordensServico.find(o => o.id === id)
  const veiculo = veiculos.find(v => v.id === (os?.veiculo_id || os?.id_veiculo)) || {}
  const cliente = clientes.find(c => c.id === (os?.cliente_id || veiculo?.cliente_id || veiculo?.id_cliente)) || {}
  const [estoque, setEstoque] = useState([])

  const [diagnostico, setDiagnostico] = useState('')
  const [status, setStatus] = useState('aberta')
  const [observacoes, setObservacoes] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('a_definir')
  const [mecanicoId, setMecanicoId] = useState('')
  const [atendenteId, setAtendenteId] = useState('')
  const [servicosItens, setServicosItens] = useState([])
  const [pecasItens, setPecasItens] = useState([])
  const [modalTipo, setModalTipo] = useState(null)

  // Sincroniza quando os dados do banco carregam (os passa de undefined → objeto)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!os) return
    const { mecanico, atendente } = resolveEquipe(os, funcionarios)
    setDiagnostico(os.diagnostico || '')
    setStatus(os.status || 'aberta')
    setObservacoes(os.observacoes || '')
    setFormaPagamento(os.forma_pagamento || 'a_definir')
    setMecanicoId(mecanico?.id || '')
    setAtendenteId(atendente?.id || '')
    setServicosItens(os.servicos_itens || [])
    setPecasItens(os.pecas_itens || [])
  }, [os, funcionarios])
  /* eslint-enable react-hooks/set-state-in-effect */
  const [buscaModal, setBuscaModal] = useState('')
  const [selecionadosModal, setSelecionadosModal] = useState([])
  const [saved, setSaved] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')

  const totals = calcOSTotals({ servicos_itens: servicosItens, pecas_itens: pecasItens })
  const mecanicos = funcionarios.filter(f => f.cargo === 'mecanico')
  const atendentes = funcionarios.filter(f => f.cargo === 'atendente' || f.cargo === 'gestor')
  const mecanicoSelecionado = funcionarios.find(f => f.id === mecanicoId)
  const atendenteSelecionado = funcionarios.find(f => f.id === atendenteId)
  const encerrada = os?.status === 'concluida' || os?.status === 'Concluído'
  const cancelada = os?.status === 'cancelada'
  const bloqueada = encerrada || cancelada

  useEffect(() => {
    async function carregarEstoque() {
      // View sem `custo` (migracao 19), com fallback para a tabela em bancos
      // pre-19. A tela de O.S. nunca precisou do custo de aquisicao.
      let { data, error } = await supabaseDb
        .from('item_estoque_publico')
        .select('*')
        .eq('ativo', true)
        .order('nome')
      if (error) ({ data, error } = await supabaseDb
        .from('item_estoque')
        .select('*')
        .eq('ativo', true)
        .order('nome'))
      if (!error) setEstoque(data || [])
      else console.error('Erro ao carregar estoque do Supabase:', error)
    }
    carregarEstoque()
  }, [])

  if (!os) {
    return (
      <div className="dashboard-grid">
        <GlassPanel className={`panel stagger-1 ${css.painelVazio}`}>
          <p className={css.textoVazio}>Ordem de serviço não encontrada.</p>
          <button className={`btn-primary ${css.btnVoltarLista}`} onClick={() => navigate('/ordens-servico')}>Voltar</button>
        </GlassPanel>
      </div>
    )
  }

  const persistirOS = async (nextServicos = servicosItens, nextPecas = pecasItens, extra = {}) => {
    if (!podeGerenciar) {
      setErroSalvar('')
      try {
        await updateOrdemServico(id, { diagnostico, status, observacoes })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        return true
      } catch (error) {
        setErroSalvar(error?.message || 'Não foi possível salvar a ordem de serviço.')
        return false
      }
    }

    const servicosNormalizados = normalizarItens(nextServicos)
    const pecasNormalizadas = normalizarItens(nextPecas)
    const nextTotals = calcOSTotals({ servicos_itens: servicosNormalizados, pecas_itens: pecasNormalizadas })
    const nextComissoes = calcOSCommissions(
      { servicos_itens: servicosNormalizados, pecas_itens: pecasNormalizadas },
      mecanicoSelecionado,
      atendenteSelecionado
    )
    setErroSalvar('')
    try {
      await updateOrdemServico(id, {
        diagnostico,
        id_mecanico: mecanicoId || null,
        id_atendente: atendenteId || null,
        servicos_executados: servicosNormalizados.map(item => item.descricao).join('; '),
        servicos_itens: servicosNormalizados,
        pecas_itens: pecasNormalizadas,
        status,
        observacoes,
        forma_pagamento: formaPagamento,
        valor_servicos: nextTotals.valorServicos,
        valor_pecas: nextTotals.valorPecas,
        valor_total: nextTotals.valorTotal,
        preco_final: nextTotals.valorTotal,
        valor_comissao_mecanico: nextComissoes.mecanico.valor,
        valor_comissao_atendente: nextComissoes.atendente.valor,
        comissoes_snapshot: nextComissoes,
        atualizado_em: new Date().toISOString(),
        ...extra,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      return true
    } catch (error) {
      setErroSalvar(error?.message || 'Não foi possível salvar a ordem de serviço.')
      return false
    }
  }

  const handleSalvar = async (e) => {
    e.preventDefault()
    if (bloqueada) return
    if (status === 'cancelada') {
      if (!confirm('Confirmar cancelamento da O.S.? As peças baixadas serão estornadas.')) {
        setStatus(os.status || 'aberta')
        return
      }
      setErroSalvar('')
      try {
        await deleteOrdemServico(id)
      } catch (error) {
        setStatus(os.status || 'aberta')
        setErroSalvar(error?.message || 'Não foi possível cancelar a ordem de serviço.')
      }
      return
    }
    await persistirOS()
  }

  const abrirModal = (tipo) => {
    if (bloqueada) return
    setModalTipo(tipo)
    setBuscaModal('')
    setSelecionadosModal([])
  }

  const adicionarSelecionado = (item) => {
    const novo = modalTipo === 'servico'
      ? {
          id: `serv_${Date.now()}_${item.id}`,
          catalogo_id: item.id,
          codigo: item.codigo || item.id,
          descricao: item.nome,
          quantidade: 1,
          valor_unitario: toMoney(item.preco),
        }
      : {
          id: `peca_${Date.now()}_${item.id}`,
          item_id: item.id,
          codigo: item.codigo || item.id,
          descricao: item.nome,
          quantidade: 1,
          valor_unitario: toMoney(item.preco_unit),
        }
    setSelecionadosModal(items => [...items, novo])
  }

  const atualizarQtdModal = (itemId, quantidade) => {
    setSelecionadosModal(items => items.map(item => item.id === itemId ? { ...item, quantidade } : item))
  }

  const salvarModal = async () => {
    let salvo
    if (modalTipo === 'servico') {
      const nextServicos = normalizarItens([...servicosItens, ...selecionadosModal])
      salvo = await persistirOS(nextServicos, pecasItens)
      if (salvo) setServicosItens(nextServicos)
    } else {
      const nextPecas = normalizarItens([...pecasItens, ...selecionadosModal])
      salvo = await persistirOS(servicosItens, nextPecas)
      if (salvo) setPecasItens(nextPecas)
    }
    if (salvo) setModalTipo(null)
  }

  const removerServico = async (itemId) => {
    if (bloqueada) return
    const nextServicos = servicosItens.filter(item => item.id !== itemId)
    if (await persistirOS(nextServicos, pecasItens)) setServicosItens(nextServicos)
  }

  const removerPeca = async (itemId) => {
    if (bloqueada) return
    const nextPecas = pecasItens.filter(item => item.id !== itemId)
    if (await persistirOS(servicosItens, nextPecas)) setPecasItens(nextPecas)
  }

  const reabrirOS = async () => {
    if (!confirm('Confirmar reabertura da O.S.? Depois disso ela poderá ser alterada novamente.')) return
    setErroSalvar('')
    try {
      await updateOrdemServico(id, {
        status: 'em_andamento',
      })
      setStatus('em_andamento')
    } catch (error) {
      setErroSalvar(error?.message || 'Não foi possível reabrir a ordem de serviço.')
    }
  }

  return (
    <div className="dashboard-grid">

      {/* ── Cabeçalho ── */}
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>O.S. #{os.numero_os || os.id?.slice(-4)?.toUpperCase()}</h2>
          <p className={css.subtitulo}>
            {cliente.nome || 'Cliente não informado'}
            {veiculo.placa ? ` · ${veiculo.placa} ${veiculo.marca} ${veiculo.modelo}` : ''}
          </p>
        </div>
        <div className={css.acoesTopo}>
          <button className={`btn-secondary ${css.btnVoltar}`} onClick={() => navigate('/ordens-servico')}>
            <ArrowLeft size={15} /> Voltar
          </button>
          <AcoesDocumentoOS os={os} cliente={cliente} veiculo={veiculo} compacto />
          {podeGerenciar && (bloqueada ? (
            <button className={`btn-primary ${css.btnAcaoTopo}`} onClick={reabrirOS}>Reabrir O.S.</button>
          ) : (
            <button className={`btn-primary ${css.btnAcaoTopo}`} onClick={() => navigate(`/ordens-servico/${id}/encerrar`)}>Finalizar O.S.</button>
          ))}
        </div>
      </section>

      {/* ── Painel 1: resumo + formulário lado a lado ── */}
      <GlassPanel className="panel stagger-2">
        {bloqueada && (
          <div className={`alert-box ${css.alerta}`}>
            Esta O.S. está {encerrada ? 'encerrada' : 'cancelada'} e não pode ser alterada. Clique em <strong>Reabrir O.S.</strong> para editar.
          </div>
        )}
        <div className={css.colunas}>

          {/* Coluna esquerda: financeiro + queixa */}
          <div>
            <div className={css.chips}>
              <SummaryChip label="Serviços" value={totals.valorServicos} tone="var(--electric-blue)" />
              <SummaryChip label="Peças" value={totals.valorPecas} tone="var(--neon-orange)" />
              <SummaryChip label="Total" value={totals.valorTotal} tone="var(--status-done)" />
            </div>
            {os.descricao && (
              <div className={css.queixa}>
                <div className={css.queixaRotulo}>Queixa do cliente</div>
                <p className={css.queixaTexto}>{os.descricao}</p>
              </div>
            )}
          </div>

          {/* Coluna direita: form técnico */}
          <form onSubmit={handleSalvar}>
            <div className={css.formHeader}>
              <span className={css.formTitulo}>Dados técnicos</span>
              {saved && <span className={css.avisoSalvo}><CheckCircle size={13} /> Salvo</span>}
              {erroSalvar && <span role="alert" className={css.erroSalvar}>{erroSalvar}</span>}
            </div>
            <div className={css.linhaCampos}>
              <div className={`form-group ${css.campoSemMargem}`}>
                <label>Mecânico responsável</label>
                <select className="form-control" value={mecanicoId} onChange={e => setMecanicoId(e.target.value)} disabled={bloqueada || !podeGerenciar}>
                  <option value="">A definir</option>
                  {mecanicos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div className={`form-group ${css.campoSemMargem}`}>
                <label>Atendente responsável</label>
                <select className="form-control" value={atendenteId} onChange={e => setAtendenteId(e.target.value)} disabled={bloqueada || !podeGerenciar}>
                  <option value="">A definir</option>
                  {atendentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
            </div>
            <div className={css.linhaCampos}>
              <div className={`form-group ${css.campoSemMargem}`}>
                <label>Status</label>
                <select className="form-control" value={status} onChange={e => setStatus(e.target.value)} disabled={bloqueada}>
                  <option value="aberta">Aberta</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="aguardando_peca">Aguardando peça</option>
                  {encerrada && <option value="concluida">Concluída</option>}
                  {podeGerenciar && <option value="cancelada">Cancelada</option>}
                </select>
              </div>
              <div className={`form-group ${css.campoSemMargem}`}>
                <label>Forma de pagamento</label>
                <select className="form-control" value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} disabled={bloqueada || !podeGerenciar}>
                  <option value="a_definir">A definir</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">Pix</option>
                  <option value="cartao_debito">Cartão de débito</option>
                  <option value="cartao_credito">Cartão de crédito</option>
                  <option value="transferencia">Transferência</option>
                  <option value="boleto">Boleto</option>
                </select>
              </div>
            </div>
            <div className={`form-group ${css.campoDiagnostico}`}>
              <label>Diagnóstico técnico</label>
              <textarea className={`form-control ${css.textareaDiagnostico}`} value={diagnostico} onChange={e => setDiagnostico(e.target.value)} disabled={bloqueada} placeholder="Diagnóstico do mecânico..." />
            </div>
            <div className={`form-group ${css.campoObservacoes}`}>
              <label>Observações</label>
              <textarea className={`form-control ${css.textareaObservacoes}`} value={observacoes} onChange={e => setObservacoes(e.target.value)} disabled={bloqueada} placeholder="Observações internas..." />
            </div>
            <div className={css.acaoSalvar}>
              <button type="submit" className={`btn-primary ${css.btnSalvar}`} disabled={bloqueada}>Salvar alterações</button>
            </div>
          </form>
        </div>
      </GlassPanel>

      {/* ── Painel 2: serviços + peças lado a lado ── */}
      <GlassPanel className="panel stagger-3">
        <div className={css.colunas}>

          {/* Serviços */}
          <div>
            <div className={`panel-header ${css.itensHeader}`}>
              <h3 className={css.itensTitulo}><Wrench size={15} /> Serviços</h3>
              {!bloqueada && podeGerenciar && (
                <button type="button" className={`btn-secondary ${css.btnAdicionar}`} onClick={() => abrirModal('servico')}>
                  <Plus size={12} /> Adicionar
                </button>
              )}
            </div>
            <ItensTable items={servicosItens} onRemove={removerServico} locked={bloqueada || !podeGerenciar} />
          </div>

          {/* Peças */}
          <div>
            <div className={`panel-header ${css.itensHeader}`}>
              <h3 className={css.itensTitulo}><Package size={15} /> Produtos e peças</h3>
              {!bloqueada && podeGerenciar && (
                <button type="button" className={`btn-secondary ${css.btnAdicionar}`} onClick={() => abrirModal('peca')}>
                  <Plus size={12} /> Adicionar
                </button>
              )}
            </div>
            <ItensTable items={pecasItens} onRemove={removerPeca} locked={bloqueada || !podeGerenciar} />
          </div>
        </div>
      </GlassPanel>

      {modalTipo && (
        <ItensModal
          tipo={modalTipo}
          busca={buscaModal}
          setBusca={setBuscaModal}
          catalogo={modalTipo === 'servico' ? catalogoServicos : estoque}
          selecionados={selecionadosModal}
          onAdd={adicionarSelecionado}
          onQty={atualizarQtdModal}
          onRemove={(itemId) => setSelecionadosModal(items => items.filter(item => item.id !== itemId))}
          onClose={() => setModalTipo(null)}
          onSave={salvarModal}
        />
      )}
    </div>
  )
}

function ItensTable({ items, onRemove, locked }) {
  if (!items.length) {
    return <p className={css.semItens}>Nenhum item lancado.</p>
  }

  return (
    <div className="tech-table-container">
      <table className="tech-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Qtd</th>
            <th>Valor unit.</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td data-label="Descrição">{item.descricao}</td>
              <td data-label="Qtd">{item.quantidade}</td>
              <td data-label="Valor unit.">{formatCurrency(item.valor_unitario)}</td>
              <td data-label="Total">{formatCurrency(getLineTotal(item))}</td>
              <td>
                {!locked && (
                  <button type="button" className="btn-danger" onClick={() => onRemove(item.id)} title="Remover item">
                    <Trash2 size={12} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ItensModal({ tipo, busca, setBusca, catalogo, selecionados, onAdd, onQty, onRemove, onClose, onSave }) {
  const termo = busca.toLowerCase()
  const filtrados = catalogo.filter(item => {
    const codigo = String(item.codigo || item.id || '').toLowerCase()
    const nome = String(item.nome || '').toLowerCase()
    const descricao = String(item.descricao || '').toLowerCase()
    return !termo || codigo.includes(termo) || nome.includes(termo) || descricao.includes(termo)
  })

  return (
    <div className="modal-overlay">
      <div className={`modal-content ${css.modal}`}>
        <div className="modal-header">
          <h3>{tipo === 'servico' ? 'Adicionar servicos' : 'Adicionar produtos/pecas'}</h3>
          <button onClick={onClose} className={css.btnFechar}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className={css.busca}>
            <Search size={16} color="var(--text-secondary)" className={css.buscaIcone} />
            <input className={`form-control ${css.buscaInput}`} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar por código ou nome..." />
          </div>

          <div className="tech-table-container">
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Valor</th>
                  {tipo === 'peca' && <th>Saldo</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(item => (
                  <tr key={item.id}>
                    <td data-label="Código">{item.codigo || item.id}</td>
                    <td data-label="Nome">{item.nome}</td>
                    <td data-label="Valor">{formatCurrency(tipo === 'servico' ? item.preco : item.preco_unit)}</td>
                    {tipo === 'peca' && <td data-label="Saldo">{item.quantidade} {item.unidade}</td>}
                    <td><button type="button" className={`btn-secondary ${css.btnAdicionarItem}`} onClick={() => onAdd(item)}>Adicionar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className={css.tituloSelecionados}>Selecionados</h4>
          <ItensSelecionados items={selecionados} onQty={onQty} onRemove={onRemove} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={onSave} disabled={!selecionados.length}>Salvar selecionados</button>
        </div>
      </div>
    </div>
  )
}

function ItensSelecionados({ items, onQty, onRemove }) {
  if (!items.length) return <p className={css.semSelecionados}>Nenhum item selecionado.</p>
  return (
    <div className="tech-table-container">
      <table className="tech-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Qtd</th>
            <th>Valor unit.</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td data-label="Descrição">{item.descricao}</td>
              <td data-label="Qtd"><input className={`form-control ${css.campoQtd}`} type="number" min="0.01" step="0.01" value={item.quantidade} onChange={e => onQty(item.id, e.target.value)} /></td>
              <td data-label="Valor unit.">{formatCurrency(item.valor_unitario)}</td>
              <td data-label="Total">{formatCurrency(getLineTotal(item))}</td>
              <td><button type="button" className="btn-danger" onClick={() => onRemove(item.id)}><Trash2 size={12} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
