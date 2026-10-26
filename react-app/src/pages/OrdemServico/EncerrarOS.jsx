import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Package, Wrench } from 'lucide-react'
import { GlassPanel } from '../../components/GlassPanel'
import { AcoesDocumentoOS } from '../../components/ui/AcoesDocumentoOS'
import { useDatabase } from '../../hooks/useDatabase'
import { calcDescontoPercentual, calcOSTotals, centesimos, formatCurrency, getLineTotal } from '../../utils/osFinance'
import { PAGAMENTO_LABEL } from '../../utils/osPdf'
import css from './EncerrarOS.module.css'


function Chip({ label, value, tone }) {
  return (
    <div className={css.chip}>
      <div className={css.chipRotulo}>{label}</div>
      <div className={css.chipValor} style={{ color: tone || 'var(--text-primary)' }}>{formatCurrency(value)}</div>
    </div>
  )
}

function ItensTable({ items }) {
  if (!items?.length) {
    return <p className={css.semItens}>Nenhum item lançado.</p>
  }
  return (
    <div className="tech-table-container">
      <table className="tech-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th className={css.alinhadoDireita}>Qtd</th>
            <th className={css.alinhadoDireita}>Unit.</th>
            <th className={css.alinhadoDireita}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id || i}>
              <td data-label="Descrição">{item.descricao}</td>
              <td data-label="Qtd" className={css.alinhadoDireita}>{item.quantidade}</td>
              <td data-label="Unit." className={css.alinhadoDireita}>{formatCurrency(item.valor_unitario)}</td>
              <td data-label="Total" className={css.totalItem}>{formatCurrency(getLineTotal(item))}</td>
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
  const { clientes, veiculos, ordensServico, updateOrdemServico, finalizarOrdemServico } = useDatabase()

  const os = ordensServico.find(o => o.id === id)
  const veiculo = veiculos.find(v => v.id === (os?.veiculo_id || os?.id_veiculo)) || {}
  const cliente = clientes.find(c => c.id === (os?.cliente_id || veiculo?.cliente_id || veiculo?.id_cliente)) || {}
  const totals = useMemo(() => calcOSTotals(os), [os])

  const [formaPagamento, setFormaPagamento] = useState(os?.forma_pagamento && os.forma_pagamento !== 'a_definir' ? os.forma_pagamento : '')
  const [observacoesFinais, setObservacoesFinais] = useState(os?.observacoes_finais || '')
  const [tipoDesconto, setTipoDesconto] = useState(os?.desconto_tipo || 'pct')
  const [desconto, setDesconto] = useState(String(
    os?.desconto_tipo === 'pct' ? (os?.desconto_percentual ?? 0) : (os?.desconto_valor ?? 0)
  ))
  const [confirmando, setConfirmando] = useState(false)
  const [encerrada, setEncerrada] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [erroEncerramento, setErroEncerramento] = useState('')

  const descontoInformado = Math.max(0, Number(desconto) || 0)
  const descontoNum = tipoDesconto === 'pct'
    ? Math.min(100, descontoInformado)
    : Math.min(totals.valorTotal, descontoInformado)
  // Mesma conta do RPC de encerramento, em centavos (QA-10).
  const descontoValor = tipoDesconto === 'pct'
    ? calcDescontoPercentual(totals.valorTotal, descontoNum)
    : centesimos(descontoNum) / 100
  const valorFinal = Math.max(0, (centesimos(totals.valorTotal) - centesimos(descontoValor)) / 100)

  const jaEncerrada = os?.status === 'concluida' || os?.status === 'Concluído'

  // Na previa, `extra` leva os valores ainda nao confirmados; depois do RPC,
  // os mesmos campos tambem ficam persistidos na ordem de servico.
  const extraDocumento = {
    desconto: { descontoValor, descontoPercentual: tipoDesconto === 'pct' ? descontoNum : undefined },
    formaPagamento,
    observacoesFinais,
  }

  if (!os) {
    return (
      <div className="dashboard-grid">
        <GlassPanel className={`panel ${css.painelVazio}`}>
          <p className={css.textoVazio}>Ordem de serviço não encontrada.</p>
          <button className={`btn-primary ${css.btnVoltarLista}`} onClick={() => navigate('/ordens-servico')}>Voltar</button>
        </GlassPanel>
      </div>
    )
  }

  if (jaEncerrada && !encerrada) {
    return (
      <div className="dashboard-grid">
        <GlassPanel className={`panel stagger-1 ${css.painelSucesso}`}>
          <CheckCircle size={44} color="var(--status-done)" className={css.iconeSucesso} />
          <h2 className={css.tituloSucesso}>O.S. já finalizada</h2>
          <p className={css.textoReabertura}>
            Para alterar valores, serviços ou peças, confirme primeiro a reabertura da O.S.
          </p>
          <div className={css.acoesSucesso}>
            <button className="btn-secondary" onClick={() => navigate('/ordens-servico')}>Voltar</button>
            <AcoesDocumentoOS os={os} cliente={cliente} veiculo={veiculo} />
            <button className="btn-primary" onClick={async () => {
              if (!confirm('Confirmar reabertura da O.S.?')) return
              try {
                await updateOrdemServico(id, {
                  status: 'em_andamento',
                })
                navigate(`/ordens-servico/${id}`)
              } catch (error) {
                setErroEncerramento(error?.message || 'Não foi possível reabrir a ordem de serviço.')
              }
            }}>Reabrir O.S.</button>
          </div>
        </GlassPanel>
      </div>
    )
  }

  if (encerrada) {
    return (
      <div className="dashboard-grid">
        <GlassPanel className={`panel stagger-1 ${css.painelSucesso}`}>
          <CheckCircle size={44} color="var(--status-done)" className={css.iconeSucesso} />
          <h2 className={css.tituloSucesso}>O.S. Finalizada</h2>
          <p className={css.rotuloTotalCobrado}>
            Valor total cobrado:
          </p>
          <p className={css.totalCobrado}>
            {formatCurrency(valorFinal)}
          </p>
          {descontoValor > 0 && (
            <p className={css.descontoSucesso}>
              Desconto aplicado: {formatCurrency(descontoValor)}
            </p>
          )}
          <p className={css.pagamentoSucesso}>
            {PAGAMENTO_LABEL[formaPagamento] || formaPagamento}
          </p>
          <div className={css.acoesSucesso}>
            <button className="btn-secondary" onClick={() => navigate('/historico')}>Ver Histórico</button>
            <AcoesDocumentoOS os={os} cliente={cliente} veiculo={veiculo} extra={extraDocumento} />
            <button className="btn-primary" onClick={() => navigate('/ordens-servico')}>Ordens de Serviço</button>
          </div>
        </GlassPanel>
      </div>
    )
  }

  const handleEncerrar = async (e) => {
    e.preventDefault()
    if (!formaPagamento) {
      alert('Selecione a forma de pagamento.')
      return
    }
    setFinalizando(true)
    setErroEncerramento('')
    try {
      await finalizarOrdemServico(id, {
        desconto_tipo: tipoDesconto,
        desconto_valor: descontoValor,
        desconto_percentual: tipoDesconto === 'pct' ? descontoNum : null,
        forma_pagamento: formaPagamento,
        observacoes_finais: observacoesFinais,
      })
      setEncerrada(true)
    } catch (error) {
      setErroEncerramento(error?.message || 'Nao foi possivel finalizar a O.S.')
      setConfirmando(false)
    } finally {
      setFinalizando(false)
    }
  }

  return (
    <div className="dashboard-grid">

      {/* Cabeçalho */}
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Finalizar O.S. #{os.numero_os || os.id?.slice(-4)?.toUpperCase()}</h2>
          <p className={css.subtitulo}>
            {cliente.nome || 'Cliente não informado'}
            {veiculo.placa ? ` · ${veiculo.placa} ${veiculo.marca} ${veiculo.modelo}` : ''}
          </p>
        </div>
        <button className={`btn-secondary ${css.btnVoltar}`} onClick={() => navigate(`/ordens-servico/${id}`)}>
          <ArrowLeft size={16} /> Voltar para O.S.
        </button>
      </section>

      {/* Painel 1: Itens */}
      <GlassPanel className="panel stagger-2">
        <div className={css.gradeItens}>

          <div>
            <h3 className={css.tituloServicos}>
              <Wrench size={14} /> Serviços executados
            </h3>
            <ItensTable items={os.servicos_itens} />
            {(os.servicos_itens?.length > 0) && (
              <div className={css.subtotalServicos}>
                Subtotal serviços: {formatCurrency(totals.valorServicos)}
              </div>
            )}
          </div>

          <div>
            <h3 className={css.tituloPecas}>
              <Package size={14} /> Peças e produtos
            </h3>
            <ItensTable items={os.pecas_itens} />
            {(os.pecas_itens?.length > 0) && (
              <div className={css.subtotalPecas}>
                Subtotal peças: {formatCurrency(totals.valorPecas)}
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* Painel 2: Fechamento */}
      <GlassPanel className="panel stagger-3">
        <form onSubmit={confirmando ? handleEncerrar : (e) => { e.preventDefault(); setConfirmando(true) }}>
          <div className={css.gradeFechamento}>

            {/* Coluna esquerda: cálculo financeiro */}
            <div>
              <div className={css.tituloResumo}>Resumo financeiro</div>

              <div className={css.chips}>
                <Chip label="Serviços" value={totals.valorServicos} tone="var(--electric-blue)" />
                <Chip label="Peças" value={totals.valorPecas} tone="var(--neon-orange)" />
                <Chip label="Subtotal" value={totals.valorTotal} tone="var(--text-primary)" />
              </div>

              <div className={css.desconto}>
                <label className={css.descontoRotulo}>Desconto</label>
                <div className={css.linhaDesconto}>
                  <div className={css.tiposDesconto}>
                    {['pct', 'valor'].map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setTipoDesconto(t); setDesconto('0') }}
                        className={`${css.tipoDesconto} ${tipoDesconto === t ? css.tipoDescontoAtivo : ''}`}
                      >
                        {t === 'pct' ? '%' : 'R$'}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    className={`form-control ${css.campoDesconto}`}
                    value={desconto}
                    onChange={e => setDesconto(e.target.value)}
                    min={0}
                    max={tipoDesconto === 'pct' ? 100 : undefined}
                    step={0.01}
                    placeholder="0"
                  />
                </div>
                {descontoValor > 0 && (
                  <div className={css.descontoAplicado}>
                    <span>Desconto aplicado</span>
                    <span className={css.valorDesconto}>− {formatCurrency(descontoValor)}</span>
                  </div>
                )}
              </div>

              {/* Valor final calculado */}
              <div className={css.resumoFinal}>
                <div className={css.valorFinalRotulo}>Valor final</div>
                <div className={css.valorFinal}>
                  {formatCurrency(valorFinal)}
                </div>
              </div>
            </div>

            {/* Coluna direita: pagamento + confirmação */}
            <div className={css.pagamento}>
              <div className={css.tituloPagamento}>Pagamento</div>

              <div className={`form-group ${css.campoSemMargem}`}>
                <label>Forma de pagamento <span className={css.obrigatorio}>*</span></label>
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

              <div className={`form-group ${css.campoObservacoes}`}>
                <label>Observações finais</label>
                <textarea
                  className={`form-control ${css.textarea}`}
                  value={observacoesFinais}
                  onChange={e => setObservacoesFinais(e.target.value)}
                  placeholder="Garantia, recomendações ao cliente..."
                />
              </div>

              {confirmando && (
                <div className={`alert-box ${css.alertaConfirmacao}`}>
                  Confirmar finalização com <strong>{formatCurrency(valorFinal)}</strong>
                  {descontoValor > 0 && <> (desconto {formatCurrency(descontoValor)})</>}
                  {' '}via <strong>{PAGAMENTO_LABEL[formaPagamento] || formaPagamento}</strong>. Esta ação não pode ser desfeita sem reabrir a O.S.
                </div>
              )}

              {erroEncerramento && (
                <div className="alert-box" role="alert">
                  <strong>Falha ao finalizar:</strong> {erroEncerramento}
                </div>
              )}

              <div className={css.acoesForm}>
                {confirmando ? (
                  <>
                    <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Revisar</button>
                    <AcoesDocumentoOS os={os} cliente={cliente} veiculo={veiculo} extra={extraDocumento} compacto />
                    <button type="submit" className={`btn-primary ${css.btnConfirmarFinalizacao}`} disabled={finalizando}>
                      <CheckCircle size={15} className={css.iconeRotulo} /> {finalizando ? 'Finalizando...' : 'Confirmar finalização'}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-secondary" onClick={() => navigate(`/ordens-servico/${id}`)}>Cancelar</button>
                    <AcoesDocumentoOS os={os} cliente={cliente} veiculo={veiculo} extra={extraDocumento} compacto />
                    <button type="submit" className={`btn-primary ${css.btnFinalizar}`}>Finalizar O.S.</button>
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
