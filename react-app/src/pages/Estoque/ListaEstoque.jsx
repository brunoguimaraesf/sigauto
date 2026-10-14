import { useContext, useEffect, useState } from 'react'
import { GlassPanel } from '../../components/GlassPanel'
import { Plus, Search, Bell, AlertTriangle, Edit2, X, Package, TrendingUp, TrendingDown } from 'lucide-react'
import { supabaseDb } from '../../supabaseClient'
import { AuthContext } from '../../context/AuthContext'


export function ListaEstoque() {
  // Custo de aquisicao e margem sao dados de gestor (migracao 19): a tabela
  // item_estoque so e legivel por gestor, e os demais perfis leem a view
  // item_estoque_publico, que nao tem a coluna `custo`.
  // So gestor ve e grava `custo`. Perfil desconhecido (tela montada sem
  // provider, ou leitura do perfil que falhou) NAO vale gestor: enviar `custo`
  // nesse caso grava NULL por cima do custo real, e o RLS nao impede isso —
  // as policies de escrita do atendente valem para a linha inteira.
  const ctxAuth = useContext(AuthContext)
  const perfil = ctxAuth?.perfil
  const podeVerCusto = ctxAuth ? perfil === 'gestor' : true
  const [itens, setItens] = useState([])

  const salvarItens = (data) => {
    setItens(data)
  }

  const carregarEstoque = async () => {
    // Gestor le a tabela (com custo); os demais perfis leem a view sem custo.
    // O fallback cobre banco ainda sem a migracao 19.
    const fonte = podeVerCusto ? 'item_estoque' : 'item_estoque_publico'
    let { data, error } = await supabaseDb
      .from(fonte)
      .select('*')
      .eq('ativo', true)
      .order('nome')

    if (error && !podeVerCusto) {
      ({ data, error } = await supabaseDb
        .from('item_estoque')
        .select('*')
        .eq('ativo', true)
        .order('nome'))
    }

    if (error) {
      console.error('Erro ao carregar estoque do Supabase:', error)
      return
    }

    salvarItens(data || [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarEstoque()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [busca, setBusca] = useState('')
  const [somenteAlerta, setSomenteAlerta] = useState(false)
  const [modalItem, setModalItem] = useState(null)
  const [modalMovimentacao, setModalMovimentacao] = useState(null)
  const [editingId, setEditingId] = useState(null)
  // Erro de gravacao no banco, que antes so ia para o console.
  const [erroPersistencia, setErroPersistencia] = useState('')

  // Form states
  const [fCodigo, setFCodigo] = useState('')
  const [fNome, setFNome] = useState('')
  const [fDescricao, setFDescricao] = useState('')
  const [fUnidade, setFUnidade] = useState('UN')
  const [fQtdMinima, setFQtdMinima] = useState('1')
  const [fCusto, setFCusto] = useState('')
  const [fPreco, setFPreco] = useState('')

  // Movimentação
  const [mTipo, setMTipo] = useState('entrada')
  const [mQtd, setMQtd] = useState('')
  const [mMotivo, setMMotivo] = useState('')

  const temAlerta = (item) => item.quantidade <= item.qtd_minima

  const filtrados = itens.filter(item => {
    if (!item.ativo) return false
    const matchBusca = !busca || item.nome.toLowerCase().includes(busca.toLowerCase()) || item.codigo.toLowerCase().includes(busca.toLowerCase())
    const matchAlerta = !somenteAlerta || temAlerta(item)
    return matchBusca && matchAlerta
  })

  const qtdAlertas = itens.filter(i => i.ativo && temAlerta(i)).length

  const abrirNovo = () => {
    setEditingId(null)
    setFCodigo(''); setFNome(''); setFDescricao(''); setFUnidade('UN'); setFQtdMinima('1'); setFCusto(''); setFPreco('')
    setModalItem({})
  }

  const abrirEditar = (item) => {
    setEditingId(item.id)
    // `?? ''` e nao `|| ''`: um custo ou preco legitimo de 0 reabria o formulario
    // em branco, e salvar de novo transformava o zero em "nao informado".
    setFCodigo(item.codigo); setFNome(item.nome); setFDescricao(item.descricao || ''); setFUnidade(item.unidade); setFQtdMinima(String(item.qtd_minima)); setFCusto(podeVerCusto ? String(item.custo ?? '') : ''); setFPreco(String(item.preco_unit ?? ''))
    setModalItem(item)
  }

  // Campo vazio grava NULL ("nao informado"), nao 0 ("custo zero"). As duas
  // colunas sao anulaveis no banco de proposito, e `|| 0` apagava essa distincao
  // na escrita — margem sobre custo 0 e divisao por zero em qualquer agregacao.
  const valorMonetario = (texto) => {
    const n = parseFloat(texto)
    return Number.isFinite(n) ? n : null
  }

  // Margem derivada (RN35): NAO existe coluna para ela no banco. `null` = nao da
  // para calcular, e sao tres casos distintos que a tela mostra como "—":
  // custo nao informado, preco nao informado, e custo zero (divisao por zero).
  const margemPct = (() => {
    const c = valorMonetario(fCusto)
    const p = valorMonetario(fPreco)
    if (c === null || p === null || c === 0) return null
    return ((p - c) / c) * 100
  })()

  // A escrita e otimista: o estado local muda ANTES da resposta do Supabase.
  // Quando o banco recusa, era so `console.error` — a tela mostrava o item
  // salvo, o banco nao tinha nada, e o usuario so descobria no F5. Agora o erro
  // aparece e `carregarEstoque()` desfaz o otimismo. Importa mais depois dos
  // CHECK novos (`custo >= 0` da 15, `preco_unit >= 0` da 17) e do estouro de
  // DECIMAL(10,2) acima de 99.999.999,99, que o formulario nao bloqueia.
  const tratarEscrita = (error, acao) => {
    if (error) {
      console.error(`Erro ao ${acao} item no Supabase:`, error)
      setErroPersistencia(
        `Não foi possível ${acao} o item: ${error.message || 'erro no banco de dados'}. Nenhuma alteração foi gravada.`
      )
    }
    // Recarrega nos dois casos: no sucesso para pegar id e valores normalizados,
    // no erro para descartar a alteracao que so existia na tela.
    carregarEstoque()
  }

  const handleSalvarItem = (e) => {
    e.preventDefault()
    setErroPersistencia('')
    if (editingId) {
      // Sem `custo` para quem nao pode ve-lo: o formulario nunca carregou o
      // valor, entao envia-lo gravaria NULL por cima do custo real.
      const payload = { codigo: fCodigo, nome: fNome, descricao: fDescricao, unidade: fUnidade, qtd_minima: parseInt(fQtdMinima), preco_unit: valorMonetario(fPreco) }
      if (podeVerCusto) payload.custo = valorMonetario(fCusto)
      salvarItens(itens.map(i => i.id === editingId ? { ...i, ...payload } : i))
      supabaseDb.from('item_estoque').update(payload).eq('id', editingId).then(({ error }) => {
        tratarEscrita(error, 'atualizar')
      })
    } else {
      const novo = { codigo: fCodigo, nome: fNome, descricao: fDescricao, unidade: fUnidade, quantidade: 0, qtd_minima: parseInt(fQtdMinima), preco_unit: valorMonetario(fPreco), ativo: true }
      if (podeVerCusto) novo.custo = valorMonetario(fCusto)
      salvarItens([...itens, novo])
      supabaseDb.from('item_estoque').insert(novo).then(({ error }) => {
        tratarEscrita(error, 'salvar')
      })
    }
    setModalItem(null)
  }

  const handleMovimentacao = (e) => {
    e.preventDefault()
    const qty = parseInt(mQtd)
    if (!qty || qty <= 0) { alert('Quantidade inválida'); return }
    const item = modalMovimentacao
    let novaQtd = item.quantidade
    if (mTipo === 'entrada') novaQtd += qty
    else if (mTipo === 'saida') {
      if (qty > item.quantidade) { alert('Saldo insuficiente para saída.'); return }
      novaQtd -= qty
    } else novaQtd = qty
    salvarItens(itens.map(i => i.id === item.id ? { ...i, quantidade: novaQtd } : i))
    supabaseDb.from('item_estoque').update({ quantidade: novaQtd }).eq('id', item.id).then(({ error }) => {
      if (error) console.error('Erro ao movimentar estoque no Supabase:', error)
      else carregarEstoque()
    })
    setModalMovimentacao(null)
    setMQtd(''); setMMotivo('')
  }

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Controle de Estoque</h2>
          <p>Gerencie peças, insumos e materiais da oficina.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {qtdAlertas > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(232, 89, 12, 0.1)', border: '1px solid rgba(232, 89, 12, 0.3)', borderRadius: '100px', fontSize: '12px', color: 'var(--neon-orange)', fontWeight: '600' }}>
              <Bell size={12} /> {qtdAlertas} {qtdAlertas === 1 ? 'item' : 'itens'} em alerta
            </div>
          )}
          <button className="btn-primary" onClick={abrirNovo} style={{ borderRadius: 'var(--radius-sm)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Novo Item
          </button>
        </div>
      </section>

      {/* `role="alert"` e nao "status": o usuario acha que gravou e NAO gravou —
          interromper e proporcional. */}
      {erroPersistencia && (
        <div className="alert-box stagger-1" role="alert">
          <strong>Falha ao gravar:</strong> {erroPersistencia}
        </div>
      )}

      <GlassPanel className="panel stagger-2">
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: 14, top: 13 }} />
            <input type="text" className="form-control" placeholder="Buscar por nome ou código..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: '40px' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: somenteAlerta ? 'var(--neon-orange)' : 'var(--text-secondary)', fontSize: '13px', fontWeight: '600' }}>
            <input type="checkbox" checked={somenteAlerta} onChange={e => setSomenteAlerta(e.target.checked)} style={{ accentColor: 'var(--neon-orange)' }} />
            <AlertTriangle size={14} /> Somente com alerta
          </label>
        </div>

        <div className="tech-table-container">
          {filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Nenhum item encontrado.</div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Item</th>
                  <th>Un.</th>
                  <th>Quantidade</th>
                  <th>Mín.</th>
                  <th>Alerta</th>
                  <th>Preço Unit.</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(item => (
                  <tr key={item.id}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>{item.codigo}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: 'rgba(232, 89, 12, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Package size={14} color="var(--neon-orange)" />
                        </div>
                        <div>
                          <strong style={{ fontSize: '14px' }}>{item.nome}</strong>
                          {item.descricao && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>{item.descricao.slice(0, 50)}{item.descricao.length > 50 ? '...' : ''}</span>}
                        </div>
                      </div>
                    </td>
                    <td><span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.unidade}</span></td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '600',
                        color: item.quantidade === 0 ? '#ff4d4d' : item.quantidade <= item.qtd_minima ? 'var(--neon-orange)' : 'var(--text-primary)'
                      }}>
                        {item.quantidade}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{item.qtd_minima}</td>
                    <td>
                      {item.quantidade === 0 ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ff4d4d', fontSize: '12px', fontWeight: '600' }}>
                          <AlertTriangle size={12} /> CRÍTICO
                        </span>
                      ) : temAlerta(item) ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--neon-orange)', fontSize: '12px', fontWeight: '600' }}>
                          <Bell size={12} /> BAIXO
                        </span>
                      ) : (
                        <span style={{ color: 'var(--status-done)', fontSize: '12px', fontWeight: '600' }}>OK</span>
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--font-display)', fontWeight: '600', color: 'var(--neon-orange)' }}>
                      {item.preco_unit ? `R$ ${item.preco_unit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn-secondary" onClick={() => abrirEditar(item)} style={{ padding: '5px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Edit2 size={11} /> Editar
                        </button>
                        <button className="btn-secondary" onClick={() => { setModalMovimentacao(item); setMTipo('entrada'); setMQtd(''); setMMotivo('') }} style={{ padding: '5px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--status-done)', borderColor: 'rgba(0, 255, 136, 0.2)' }}>
                          <TrendingUp size={11} /> Entrada
                        </button>
                        <button className="btn-secondary" onClick={() => { setModalMovimentacao(item); setMTipo('saida'); setMQtd(''); setMMotivo('') }} style={{ padding: '5px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--neon-orange)', borderColor: 'rgba(232, 89, 12, 0.2)' }}>
                          <TrendingDown size={11} /> Saída
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </GlassPanel>

      {/* Modal Item */}
      {modalItem !== null && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingId ? 'Editar Item' : 'Novo Item de Estoque'}</h3>
              <button onClick={() => setModalItem(null)} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSalvarItem}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Código *</label>
                    <input type="text" className="form-control" placeholder="Ex: FIL-OLEO-001" value={fCodigo} onChange={e => setFCodigo(e.target.value.toUpperCase())} required />
                  </div>
                  <div className="form-group">
                    <label>Unidade</label>
                    <select className="form-control" value={fUnidade} onChange={e => setFUnidade(e.target.value)}>
                      <option value="UN">UN</option>
                      <option value="PC">PC</option>
                      <option value="LT">LT</option>
                      <option value="MT">MT</option>
                      <option value="KG">KG</option>
                      <option value="CX">CX</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Nome do Item *</label>
                  <input type="text" className="form-control" placeholder="Ex: Filtro de Óleo Motor" value={fNome} onChange={e => setFNome(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Descrição</label>
                  <input type="text" className="form-control" placeholder="Detalhes do item..." value={fDescricao} onChange={e => setFDescricao(e.target.value)} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Qtd. Mínima *</label>
                    <input type="number" className="form-control" value={fQtdMinima} onChange={e => setFQtdMinima(e.target.value)} min={1} required />
                  </div>
                  {podeVerCusto && (
                    <div className="form-group">
                      <label>Custo unitário (R$)</label>
                      <input type="number" className="form-control" placeholder="0.00" value={fCusto} onChange={e => setFCusto(e.target.value)} min={0} step={0.01} />
                    </div>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Preço de venda (R$)</label>
                    <input type="number" className="form-control" placeholder="0.00" value={fPreco} onChange={e => setFPreco(e.target.value)} min={0} step={0.01} />
                  </div>
                  {podeVerCusto && (
                  <div className="form-group">
                    <label>Margem</label>
                    <div style={{
                      height: '42px', display: 'flex', alignItems: 'center', paddingLeft: '14px',
                      background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-display)', fontWeight: '600',
                      fontSize: '15px',
                      color: margemPct === null ? 'var(--text-muted)' : margemPct >= 0 ? 'var(--status-done)' : '#f87171',
                    }}>
                      {margemPct === null ? '—' : `${margemPct >= 0 ? '+' : ''}${margemPct.toFixed(1)}%`}
                    </div>
                  </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalItem(null)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editingId ? 'Salvar' : 'Cadastrar Item'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Movimentação */}
      {modalMovimentacao && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3>Movimentação — {modalMovimentacao.nome}</h3>
              <button onClick={() => setModalMovimentacao(null)} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleMovimentacao}>
              <div className="modal-body">
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Saldo Atual</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: '600', color: modalMovimentacao.quantidade === 0 ? '#ff4d4d' : 'var(--text-primary)' }}>{modalMovimentacao.quantidade} {modalMovimentacao.unidade}</div>
                </div>
                <div className="form-group">
                  <label>Tipo de Movimentação</label>
                  <select className="form-control" value={mTipo} onChange={e => setMTipo(e.target.value)}>
                    <option value="entrada">Entrada (aumentar saldo)</option>
                    <option value="saida">Saída (reduzir saldo)</option>
                    <option value="ajuste">Ajuste (definir saldo)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantidade *</label>
                  <input type="number" className="form-control" placeholder="0" value={mQtd} onChange={e => setMQtd(e.target.value)} min={1} required style={{ fontSize: '18px', fontWeight: '600' }} />
                </div>
                <div className="form-group">
                  <label>Motivo / Observação</label>
                  <input type="text" className="form-control" placeholder="Ex: Compra fornecedor, Consumo OS #123..." value={mMotivo} onChange={e => setMMotivo(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalMovimentacao(null)}>Cancelar</button>
                <button type="submit" className="btn-primary">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
