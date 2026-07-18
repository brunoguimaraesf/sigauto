import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Package, Plus, Search, Trash2, Wrench, X } from 'lucide-react'
import { GlassPanel } from '../../components/GlassPanel'
import { useDatabase } from '../../hooks/useDatabase'
import { supabaseDb } from '../../supabaseClient'
import { calcOSCommissions, calcOSTotals, formatCurrency, getLineTotal, toMoney } from '../../utils/osFinance'

function SummaryChip({ label, value, tone }) {
  return (
    <div style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.02)', flex: 1 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '600', color: tone || 'var(--text-primary)' }}>{formatCurrency(value)}</div>
    </div>
  )
}

export function AtualizarOS() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { clientes, veiculos, usuarios, servicos: catalogoServicos, ordensServico, updateOrdemServico } = useDatabase()

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
    const responsavel = usuarios.find(u => u.id === os.id_usuario)
    setDiagnostico(os.diagnostico || '')
    setStatus(os.status || 'aberta')
    setObservacoes(os.observacoes || '')
    setFormaPagamento(os.forma_pagamento || 'a_definir')
    const nextMecanicoId = os.id_mecanico || (responsavel?.perfil === 'mecanico' ? os.id_usuario : '') || ''
    const nextAtendenteId = os.id_atendente || (responsavel && responsavel.perfil !== 'mecanico' ? os.id_usuario : '') || ''
    setMecanicoId(nextMecanicoId === nextAtendenteId && responsavel?.perfil !== 'mecanico' ? '' : nextMecanicoId)
    setAtendenteId(nextMecanicoId === nextAtendenteId && responsavel?.perfil === 'mecanico' ? '' : nextAtendenteId)
    setServicosItens(os.servicos_itens || [])
    setPecasItens(os.pecas_itens || [])
  }, [os, usuarios])
  /* eslint-enable react-hooks/set-state-in-effect */
  const [buscaModal, setBuscaModal] = useState('')
  const [selecionadosModal, setSelecionadosModal] = useState([])
  const [saved, setSaved] = useState(false)

  const totals = calcOSTotals({ servicos_itens: servicosItens, pecas_itens: pecasItens })
  const mecanicos = usuarios.filter(u => u.perfil === 'mecanico')
  const atendentes = usuarios.filter(u => u.perfil === 'atendente' || u.perfil === 'gestor')
  let mecanicoSelecionado = usuarios.find(u => u.id === mecanicoId)
  let atendenteSelecionado = usuarios.find(u => u.id === atendenteId)
  if (mecanicoSelecionado?.id && mecanicoSelecionado.id === atendenteSelecionado?.id) {
    if (mecanicoSelecionado.perfil === 'mecanico') atendenteSelecionado = null
    else mecanicoSelecionado = null
  }
  const encerrada = os?.status === 'concluida' || os?.status === 'Concluído'
  const cancelada = os?.status === 'cancelada'
  const bloqueada = encerrada || cancelada

  useEffect(() => {
    async function carregarEstoque() {
      const { data, error } = await supabaseDb
        .from('item_estoque')
        .select('*')
        .eq('ativo', true)
        .order('nome')
      if (!error) setEstoque(data || [])
      else console.error('Erro ao carregar estoque do Supabase:', error)
    }
    carregarEstoque()
  }, [])

  if (!os) {
    return (
      <div className="dashboard-grid">
        <GlassPanel className="panel stagger-1" style={{ textAlign: 'center', padding: '64px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Ordem de servico nao encontrada.</p>
          <button className="btn-primary" onClick={() => navigate('/ordens-servico')} style={{ marginTop: '16px' }}>Voltar</button>
        </GlassPanel>
      </div>
    )
  }

  const persistirOS = (nextServicos = servicosItens, nextPecas = pecasItens, extra = {}) => {
    const nextTotals = calcOSTotals({ servicos_itens: nextServicos, pecas_itens: nextPecas })
    const nextComissoes = calcOSCommissions(
      { servicos_itens: nextServicos, pecas_itens: nextPecas },
      mecanicoSelecionado,
      atendenteSelecionado
    )
    updateOrdemServico(id, {
      diagnostico,
      id_usuario: mecanicoId || atendenteId || null,
      servicos_executados: nextServicos.map(item => item.descricao).join('; '),
      servicos_itens: nextServicos,
      pecas_itens: nextPecas,
      status,
      observacoes,
      forma_pagamento: formaPagamento,
      valor_servicos: nextTotals.valorServicos,
      valor_pecas: nextTotals.valorPecas,
      valor_total: nextTotals.valorTotal,
      preco_final: nextTotals.valorTotal,
      valor_comissao_mecanico: nextComissoes.mecanico.valor,
      valor_comissao_atendente: nextComissoes.atendente.valor,
      comissao_detalhes: nextComissoes,
      atualizado_em: new Date().toISOString(),
      ...extra,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleSalvar = (e) => {
    e.preventDefault()
    if (bloqueada) return
    persistirOS()
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

  const salvarModal = () => {
    if (modalTipo === 'servico') {
      const nextServicos = [...servicosItens, ...selecionadosModal]
      setServicosItens(nextServicos)
      persistirOS(nextServicos, pecasItens)
    } else {
      const nextPecas = [...pecasItens, ...selecionadosModal]
      setPecasItens(nextPecas)
      persistirOS(servicosItens, nextPecas)
    }
    setModalTipo(null)
  }

  const removerServico = (itemId) => {
    if (bloqueada) return
    const nextServicos = servicosItens.filter(item => item.id !== itemId)
    setServicosItens(nextServicos)
    persistirOS(nextServicos, pecasItens)
  }

  const removerPeca = (itemId) => {
    if (bloqueada) return
    const nextPecas = pecasItens.filter(item => item.id !== itemId)
    setPecasItens(nextPecas)
    persistirOS(servicosItens, nextPecas)
  }

  const reabrirOS = () => {
    if (!confirm('Confirmar reabertura da O.S.? Depois disso ela poderá ser alterada novamente.')) return
    setStatus('em_andamento')
    updateOrdemServico(id, {
      status: 'em_andamento',
      data_reabertura: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
  }

  return (
    <div className="dashboard-grid">

      {/* ── Cabeçalho ── */}
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>O.S. #{os.numero_os || os.id?.slice(-4)?.toUpperCase()}</h2>
          <p style={{ fontSize: '13px' }}>
            {cliente.nome || 'Cliente não informado'}
            {veiculo.placa ? ` · ${veiculo.placa} ${veiculo.marca} ${veiculo.modelo}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary" onClick={() => navigate('/ordens-servico')} style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={15} /> Voltar
          </button>
          {bloqueada ? (
            <button className="btn-primary" onClick={reabrirOS} style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)' }}>Reabrir O.S.</button>
          ) : (
            <button className="btn-primary" onClick={() => navigate(`/ordens-servico/${id}/encerrar`)} style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)' }}>Finalizar O.S.</button>
          )}
        </div>
      </section>

      {/* ── Painel 1: resumo + formulário lado a lado ── */}
      <GlassPanel className="panel stagger-2">
        {bloqueada && (
          <div className="alert-box" style={{ marginBottom: '16px' }}>
            Esta O.S. está {encerrada ? 'encerrada' : 'cancelada'} e não pode ser alterada. Clique em <strong>Reabrir O.S.</strong> para editar.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

          {/* Coluna esquerda: financeiro + queixa */}
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <SummaryChip label="Serviços" value={totals.valorServicos} tone="var(--electric-blue)" />
              <SummaryChip label="Peças" value={totals.valorPecas} tone="var(--neon-orange)" />
              <SummaryChip label="Total" value={totals.valorTotal} tone="var(--status-done)" />
            </div>
            {os.descricao && (
              <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Queixa do cliente</div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>{os.descricao}</p>
              </div>
            )}
          </div>

          {/* Coluna direita: form técnico */}
          <form onSubmit={handleSalvar}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Dados técnicos</span>
              {saved && <span style={{ color: 'var(--status-done)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={13} /> Salvo</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mecanico responsavel</label>
                <select className="form-control" value={mecanicoId} onChange={e => setMecanicoId(e.target.value)} disabled={bloqueada}>
                  <option value="">A definir</option>
                  {mecanicos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Atendente responsavel</label>
                <select className="form-control" value={atendenteId} onChange={e => setAtendenteId(e.target.value)} disabled={bloqueada}>
                  <option value="">A definir</option>
                  {atendentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Status</label>
                <select className="form-control" value={status} onChange={e => setStatus(e.target.value)} disabled={bloqueada}>
                  <option value="aberta">Aberta</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="aguardando_peca">Aguardando peça</option>
                  <option value="concluida">Concluída</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Forma de pagamento</label>
                <select className="form-control" value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} disabled={bloqueada}>
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
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Diagnóstico técnico</label>
              <textarea className="form-control" value={diagnostico} onChange={e => setDiagnostico(e.target.value)} disabled={bloqueada} style={{ minHeight: '72px', resize: 'vertical' }} placeholder="Diagnóstico do mecânico..." />
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Observações</label>
              <textarea className="form-control" value={observacoes} onChange={e => setObservacoes(e.target.value)} disabled={bloqueada} style={{ minHeight: '52px', resize: 'vertical' }} placeholder="Observações internas..." />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-primary" disabled={bloqueada} style={{ borderRadius: 'var(--radius-sm)', padding: '8px 20px' }}>Salvar alterações</button>
            </div>
          </form>
        </div>
      </GlassPanel>

      {/* ── Painel 2: serviços + peças lado a lado ── */}
      <GlassPanel className="panel stagger-3">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

          {/* Serviços */}
          <div>
            <div className="panel-header" style={{ marginBottom: '12px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px' }}><Wrench size={15} /> Serviços</h3>
              {!bloqueada && (
                <button type="button" className="btn-secondary" onClick={() => abrirModal('servico')} style={{ borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={12} /> Adicionar
                </button>
              )}
            </div>
            <ItensTable items={servicosItens} onRemove={removerServico} locked={bloqueada} />
          </div>

          {/* Peças */}
          <div>
            <div className="panel-header" style={{ marginBottom: '12px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px' }}><Package size={15} /> Produtos e peças</h3>
              {!bloqueada && (
                <button type="button" className="btn-secondary" onClick={() => abrirModal('peca')} style={{ borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={12} /> Adicionar
                </button>
              )}
            </div>
            <ItensTable items={pecasItens} onRemove={removerPeca} locked={bloqueada} />
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
    return <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '16px' }}>Nenhum item lancado.</p>
  }

  return (
    <div className="tech-table-container">
      <table className="tech-table">
        <thead>
          <tr>
            <th>Descricao</th>
            <th>Qtd</th>
            <th>Valor unit.</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td>{item.descricao}</td>
              <td>{item.quantidade}</td>
              <td>{formatCurrency(item.valor_unitario)}</td>
              <td>{formatCurrency(getLineTotal(item))}</td>
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
      <div className="modal-content" style={{ maxWidth: '900px' }}>
        <div className="modal-header">
          <h3>{tipo === 'servico' ? 'Adicionar servicos' : 'Adicionar produtos/pecas'}</h3>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: 14, top: 13 }} />
            <input className="form-control" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar por codigo ou nome..." style={{ paddingLeft: '40px' }} />
          </div>

          <div className="tech-table-container">
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Nome</th>
                  <th>Valor</th>
                  {tipo === 'peca' && <th>Saldo</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(item => (
                  <tr key={item.id}>
                    <td>{item.codigo || item.id}</td>
                    <td>{item.nome}</td>
                    <td>{formatCurrency(tipo === 'servico' ? item.preco : item.preco_unit)}</td>
                    {tipo === 'peca' && <td>{item.quantidade} {item.unidade}</td>}
                    <td><button type="button" className="btn-secondary" onClick={() => onAdd(item)} style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>Adicionar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 style={{ marginTop: '24px', marginBottom: '12px' }}>Selecionados</h4>
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
  if (!items.length) return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum item selecionado.</p>
  return (
    <div className="tech-table-container">
      <table className="tech-table">
        <thead>
          <tr>
            <th>Descricao</th>
            <th>Qtd</th>
            <th>Valor unit.</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td>{item.descricao}</td>
              <td><input className="form-control" type="number" min="0.01" step="0.01" value={item.quantidade} onChange={e => onQty(item.id, e.target.value)} style={{ width: '90px' }} /></td>
              <td>{formatCurrency(item.valor_unitario)}</td>
              <td>{formatCurrency(getLineTotal(item))}</td>
              <td><button type="button" className="btn-danger" onClick={() => onRemove(item.id)}><Trash2 size={12} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
