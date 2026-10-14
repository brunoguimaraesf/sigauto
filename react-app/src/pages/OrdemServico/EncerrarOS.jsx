import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Package, Wrench } from 'lucide-react'
import { GlassPanel } from '../../components/GlassPanel'
import { AcoesDocumentoOS } from '../../components/ui/AcoesDocumentoOS'
import { useDatabase } from '../../hooks/useDatabase'
import { calcOSTotals, formatCurrency, getLineTotal } from '../../utils/osFinance'
import { PAGAMENTO_LABEL } from '../../utils/osPdf'


function Chip({ label, value, tone }) {
  return (
    <div style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '600', color: tone || 'var(--text-primary)' }}>{formatCurrency(value)}</div>
    </div>
  )
}

function ItensTable({ items }) {
  if (!items?.length) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '12px' }}>Nenhum item lançado.</p>
  }
  return (
    <div className="tech-table-container">
      <table className="tech-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th style={{ textAlign: 'right' }}>Qtd</th>
            <th style={{ textAlign: 'right' }}>Unit.</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id || i}>
              <td>{item.descricao}</td>
              <td style={{ textAlign: 'right' }}>{item.quantidade}</td>
              <td style={{ textAlign: 'right' }}>{formatCurrency(item.valor_unitario)}</td>
              <td style={{ textAlign: 'right', color: 'var(--neon-orange)', fontWeight: '600' }}>{formatCurrency(getLineTotal(item))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EncerrarOS() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { clientes, veiculos, ordensServico, updateOrdemServico } = useDatabase()

  const os = ordensServico.find(o => o.id === id)
  const veiculo = veiculos.find(v => v.id === (os?.veiculo_id || os?.id_veiculo)) || {}
  const cliente = clientes.find(c => c.id === (os?.cliente_id || veiculo?.cliente_id || veiculo?.id_cliente)) || {}
  const totals = useMemo(() => calcOSTotals(os), [os])

  const [formaPagamento, setFormaPagamento] = useState(os?.forma_pagamento && os.forma_pagamento !== 'a_definir' ? os.forma_pagamento : '')
  const [observacoesFinais, setObservacoesFinais] = useState(os?.observacoes_finais || '')
  const [tipoDesconto, setTipoDesconto] = useState('pct')
  const [desconto, setDesconto] = useState('0')
  const [confirmando, setConfirmando] = useState(false)
  const [encerrada, setEncerrada] = useState(false)

  const descontoNum = Math.max(0, Number(desconto) || 0)
  const descontoValor = tipoDesconto === 'pct'
    ? totals.valorTotal * (descontoNum / 100)
    : descontoNum
  const valorFinal = Math.max(0, totals.valorTotal - descontoValor)

  const jaEncerrada = os?.status === 'concluida' || os?.status === 'Concluído'

  // O que a tela de encerramento sabe e o banco ainda nao: vai para o PDF
  // da previa e do comprovante logo apos finalizar.
  const extraDocumento = {
    desconto: { descontoValor, descontoPercentual: tipoDesconto === 'pct' ? descontoNum : undefined },
    formaPagamento,
    observacoesFinais,
  }

  if (!os) {
    return (
      <div className="dashboard-grid">
        <GlassPanel className="panel" style={{ textAlign: 'center', padding: '64px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Ordem de serviço não encontrada.</p>
          <button className="btn-primary" onClick={() => navigate('/ordens-servico')} style={{ marginTop: '16px' }}>Voltar</button>
        </GlassPanel>
      </div>
    )
  }

  if (jaEncerrada && !encerrada) {
    return (
      <div className="dashboard-grid">
        <GlassPanel className="panel stagger-1" style={{ textAlign: 'center', padding: '64px 48px' }}>
          <CheckCircle size={44} color="var(--status-done)" style={{ marginBottom: '20px' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '12px' }}>O.S. já finalizada</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Para alterar valores, serviços ou peças, confirme primeiro a reabertura da O.S.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => navigate('/ordens-servico')}>Voltar</button>
            <AcoesDocumentoOS os={os} cliente={cliente} veiculo={veiculo} />
            <button className="btn-primary" onClick={() => {
              if (!confirm('Confirmar reabertura da O.S.?')) return
              updateOrdemServico(id, { status: 'em_andamento', data_reabertura: new Date().toISOString(), atualizado_em: new Date().toISOString() })
              navigate(`/ordens-servico/${id}`)
            }}>Reabrir O.S.</button>
          </div>
        </GlassPanel>
      </div>
    )
  }

  if (encerrada) {
    return (
      <div className="dashboard-grid">
        <GlassPanel className="panel stagger-1" style={{ textAlign: 'center', padding: '64px 48px' }}>
          <CheckCircle size={44} color="var(--status-done)" style={{ marginBottom: '20px' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '12px' }}>O.S. Finalizada</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Valor total cobrado:
          </p>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: '700', color: 'var(--neon-orange)', marginBottom: '8px' }}>
            {formatCurrency(valorFinal)}
          </p>
          {descontoValor > 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>
              Desconto aplicado: {formatCurrency(descontoValor)}
            </p>
          )}
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '32px' }}>
            {PAGAMENTO_LABEL[formaPagamento] || formaPagamento}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => navigate('/historico')}>Ver Histórico</button>
            <AcoesDocumentoOS os={os} cliente={cliente} veiculo={veiculo} extra={extraDocumento} />
            <button className="btn-primary" onClick={() => navigate('/ordens-servico')}>Ordens de Serviço</button>
          </div>
        </GlassPanel>
      </div>
    )
  }

  const handleEncerrar = (e) => {
    e.preventDefault()
    if (!formaPagamento) {
      alert('Selecione a forma de pagamento.')
      return
    }
    updateOrdemServico(id, {
      status: 'concluida',
      valor_servicos: totals.valorServicos,
      valor_pecas: totals.valorPecas,
      desconto_tipo: tipoDesconto,
      desconto_valor: descontoValor,
      desconto_percentual: tipoDesconto === 'pct' ? descontoNum : null,
      valor_total: valorFinal,
      preco_final: valorFinal,
      forma_pagamento: formaPagamento,
      data_encerramento: new Date().toISOString(),
      observacoes_finais: observacoesFinais,
      observacoes: observacoesFinais || os.observacoes,
      atualizado_em: new Date().toISOString(),
    })
    setEncerrada(true)
  }

  return (
    <div className="dashboard-grid">

      {/* Cabeçalho */}
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Finalizar O.S. #{os.numero_os || os.id?.slice(-4)?.toUpperCase()}</h2>
          <p style={{ fontSize: '13px' }}>
            {cliente.nome || 'Cliente não informado'}
            {veiculo.placa ? ` · ${veiculo.placa} ${veiculo.marca} ${veiculo.modelo}` : ''}
          </p>
        </div>
        <button className="btn-secondary" onClick={() => navigate(`/ordens-servico/${id}`)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> Voltar para O.S.
        </button>
      </section>

      {/* Painel 1: Itens */}
      <GlassPanel className="panel stagger-2">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', marginBottom: '12px', color: 'var(--electric-blue)' }}>
              <Wrench size={14} /> Serviços executados
            </h3>
            <ItensTable items={os.servicos_itens} />
            {(os.servicos_itens?.length > 0) && (
              <div style={{ textAlign: 'right', marginTop: '8px', fontSize: '13px', color: 'var(--electric-blue)', fontWeight: '600' }}>
                Subtotal serviços: {formatCurrency(totals.valorServicos)}
              </div>
            )}
          </div>

          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', marginBottom: '12px', color: 'var(--neon-orange)' }}>
              <Package size={14} /> Peças e produtos
            </h3>
            <ItensTable items={os.pecas_itens} />
            {(os.pecas_itens?.length > 0) && (
              <div style={{ textAlign: 'right', marginTop: '8px', fontSize: '13px', color: 'var(--neon-orange)', fontWeight: '600' }}>
                Subtotal peças: {formatCurrency(totals.valorPecas)}
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* Painel 2: Fechamento */}
      <GlassPanel className="panel stagger-3">
        <form onSubmit={confirmando ? handleEncerrar : (e) => { e.preventDefault(); setConfirmando(true) }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>

            {/* Coluna esquerda: cálculo financeiro */}
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>Resumo financeiro</div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <Chip label="Serviços" value={totals.valorServicos} tone="var(--electric-blue)" />
                <Chip label="Peças" value={totals.valorPecas} tone="var(--neon-orange)" />
                <Chip label="Subtotal" value={totals.valorTotal} tone="var(--text-primary)" />
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Desconto</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-color)', flexShrink: 0 }}>
                    {['pct', 'valor'].map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setTipoDesconto(t); setDesconto('0') }}
                        style={{
                          padding: '7px 14px',
                          fontSize: '12px',
                          fontWeight: '600',
                          border: 'none',
                          cursor: 'pointer',
                          background: tipoDesconto === t ? 'var(--neon-orange)' : 'transparent',
                          color: tipoDesconto === t ? '#fff' : 'var(--text-secondary)',
                          transition: 'background 0.15s',
                        }}
                      >
                        {t === 'pct' ? '%' : 'R$'}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    className="form-control"
                    value={desconto}
                    onChange={e => setDesconto(e.target.value)}
                    min={0}
                    max={tipoDesconto === 'pct' ? 100 : undefined}
                    step={0.01}
                    placeholder="0"
                    style={{ flex: 1 }}
                  />
                </div>
                {descontoValor > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Desconto aplicado</span>
                    <span style={{ color: '#f87171', fontWeight: '600' }}>− {formatCurrency(descontoValor)}</span>
                  </div>
                )}
              </div>

              {/* Valor final calculado */}
              <div style={{ padding: '16px', background: 'rgba(232,89,12,0.06)', border: '1px solid rgba(232,89,12,0.2)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Valor final</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: '700', color: 'var(--neon-orange)' }}>
                  {formatCurrency(valorFinal)}
                </div>
              </div>
            </div>

            {/* Coluna direita: pagamento + confirmação */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0' }}>Pagamento</div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Forma de pagamento <span style={{ color: 'var(--neon-orange)' }}>*</span></label>
                <select className="form-control" value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} required>
                  <option value="">Selecione...</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">Pix</option>
                  <option value="cartao_debito">Cartão de débito</option>
                  <option value="cartao_credito">Cartão de crédito</option>
                  <option value="transferencia">Transferência</option>
                  <option value="boleto">Boleto</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                <label>Observações finais</label>
                <textarea
                  className="form-control"
                  value={observacoesFinais}
                  onChange={e => setObservacoesFinais(e.target.value)}
                  placeholder="Garantia, recomendações ao cliente..."
                  style={{ minHeight: '80px', resize: 'vertical' }}
                />
              </div>

              {confirmando && (
                <div className="alert-box" style={{ borderColor: 'rgba(255,179,0,0.3)', fontSize: '13px' }}>
                  Confirmar finalização com <strong>{formatCurrency(valorFinal)}</strong>
                  {descontoValor > 0 && <> (desconto {formatCurrency(descontoValor)})</>}
                  {' '}via <strong>{PAGAMENTO_LABEL[formaPagamento] || formaPagamento}</strong>. Esta ação não pode ser desfeita sem reabrir a O.S.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 'auto', flexWrap: 'wrap' }}>
                {confirmando ? (
                  <>
                    <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Revisar</button>
                    <AcoesDocumentoOS os={os} cliente={cliente} veiculo={veiculo} extra={extraDocumento} compacto />
                    <button type="submit" className="btn-primary" style={{ padding: '10px 24px', background: 'linear-gradient(135deg, var(--status-done), #00cc66)' }}>
                      <CheckCircle size={15} style={{ marginRight: '6px' }} /> Confirmar finalização
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-secondary" onClick={() => navigate(`/ordens-servico/${id}`)}>Cancelar</button>
                    <AcoesDocumentoOS os={os} cliente={cliente} veiculo={veiculo} extra={extraDocumento} compacto />
                    <button type="submit" className="btn-primary" style={{ padding: '10px 24px' }}>Finalizar O.S.</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </form>
      </GlassPanel>
    </div>
  )
}
