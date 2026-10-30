import { useContext, useEffect, useState } from 'react'
import { GlassPanel } from '../../components/GlassPanel'
import { Plus, Search, Bell, AlertTriangle, Edit2, X, Package, TrendingUp, TrendingDown } from 'lucide-react'
import { supabaseDb } from '../../supabaseClient'
import { AuthContext } from '../../context/AuthContext'
import css from './ListaEstoque.module.css'


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
  const usuarioAtual = ctxAuth?.user
  const podeVerCusto = ctxAuth ? perfil === 'gestor' : true
  const [itens, setItens] = useState([])
  const [movimentacoes, setMovimentacoes] = useState([])

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

  const carregarMovimentacoes = async () => {
    const { data, error } = await supabaseDb
      .from('historico_movimentacao_estoque')
      .select('*')
      .order('data_hora', { ascending: false })
      .limit(100)
    if (error) {
      console.error('Erro ao carregar histórico de estoque:', error)
      return
    }
    setMovimentacoes(data || [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarEstoque()
    carregarMovimentacoes()
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

  const handleMovimentacao = async (e) => {
    e.preventDefault()
    setErroPersistencia('')
    const qty = Number(mQtd)
    if (!qty || qty <= 0) { alert('Quantidade inválida'); return }
    if (!mMotivo.trim()) { alert('Informe o motivo da movimentação.'); return }
    const item = modalMovimentacao
    if (mTipo === 'saida' && qty > Number(item.quantidade)) { alert('Saldo insuficiente para saída.'); return }
    if (!usuarioAtual?.id) {
      setErroPersistencia('Não foi possível identificar o usuário responsável pela movimentação.')
      return
    }
    const { error } = await supabaseDb.from('movimentacao_estoque').insert({
      id_item: item.id,
      id_usuario: usuarioAtual.id,
      tipo: mTipo,
      quantidade: qty,
      motivo: mMotivo.trim(),
      origem: 'manual',
    })
    if (error) {
      setErroPersistencia(`Não foi possível registrar a movimentação: ${error.message || 'erro no banco de dados'}.`)
      return
    }
    await Promise.all([carregarEstoque(), carregarMovimentacoes()])
    setModalMovimentacao(null)
    setMQtd(''); setMMotivo('')
  }

  return (
    <div className="dashboard-grid">
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Controle de Estoque</h2>
          <p>Gerencie peças, insumos e materiais da oficina.</p>
        </div>
        <div className={css.acoesTopo}>
          {qtdAlertas > 0 && (
            <div className={css.contadorAlerta}>
              <Bell size={12} /> {qtdAlertas} {qtdAlertas === 1 ? 'item' : 'itens'} em alerta
            </div>
          )}
          <button className={`btn-primary ${css.btnNovo}`} onClick={abrirNovo}>
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
        <div className={css.filtros}>
          <div className={css.busca}>
            <Search size={16} color="var(--text-secondary)" className={css.buscaIcone} />
            <input type="text" className={`form-control ${css.buscaInput}`} placeholder="Buscar por nome ou código..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <label className={css.filtroAlerta} style={{ color: somenteAlerta ? 'var(--neon-orange)' : 'var(--text-secondary)' }}>
            <input type="checkbox" checked={somenteAlerta} onChange={e => setSomenteAlerta(e.target.checked)} className={css.caixaAlerta} />
            <AlertTriangle size={14} /> Somente com alerta
          </label>
        </div>

        <div className="tech-table-container">
          {filtrados.length === 0 ? (
            <div className={css.vazio}>Nenhum item encontrado.</div>
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
                    <td data-label="Código"><span className={css.codigo}>{item.codigo}</span></td>
                    <td data-label="Item">
                      <div className={css.celulaNome}>
                        <div className={css.icone}>
                          <Package size={14} color="var(--neon-orange)" />
                        </div>
                        <div>
                          <strong className={css.nome}>{item.nome}</strong>
                          {item.descricao && <span className={css.categoria}>{item.descricao.slice(0, 50)}{item.descricao.length > 50 ? '...' : ''}</span>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Unidade"><span className={css.unidade}>{item.unidade}</span></td>
                    <td data-label="Quantidade">
                      <span className={css.quantidade} style={{ color: item.quantidade === 0 ? 'var(--color-danger)' : item.quantidade <= item.qtd_minima ? 'var(--color-warning)' : 'var(--text-primary)' }}>
                        {item.quantidade}
                      </span>
                    </td>
                    <td data-label="Mínimo" className={css.minimo}>{item.qtd_minima}</td>
                    <td data-label="Alerta">
                      {item.quantidade === 0 ? (
                        <span className={css.situacaoZerada}>
                          <AlertTriangle size={12} /> CRÍTICO
                        </span>
                      ) : temAlerta(item) ? (
                        <span className={css.situacaoAlerta}>
                          <Bell size={12} /> BAIXO
                        </span>
                      ) : (
                        <span className={css.situacaoNormal}>OK</span>
                      )}
                    </td>
                    <td data-label="Preço unit." className={css.preco}>
                      {item.preco_unit ? `R$ ${item.preco_unit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td>
                      <div className={css.acoes}>
                        <button className={`btn-secondary ${css.btnAcao}`} onClick={() => abrirEditar(item)}>
                          <Edit2 size={11} /> Editar
                        </button>
                        <button className={`btn-secondary ${css.btnEntrada}`} onClick={() => { setModalMovimentacao(item); setMTipo('entrada'); setMQtd(''); setMMotivo('') }}>
                          <TrendingUp size={11} /> Entrada
                        </button>
                        <button className={`btn-secondary ${css.btnSaida}`} onClick={() => { setModalMovimentacao(item); setMTipo('saida'); setMQtd(''); setMMotivo('') }}>
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

      <GlassPanel className="panel stagger-3">
        <div className={css.historicoCabecalho}>
          <div>
            <h3>Histórico de movimentações</h3>
            <p>Entradas, saídas e ajustes com motivo, O.S. e usuário responsável.</p>
          </div>
        </div>
        <div className="tech-table-container">
          {movimentacoes.length === 0 ? (
            <div className={css.vazio}>Nenhuma movimentação registrada.</div>
          ) : (
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Motivo / O.S.</th>
                  <th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map(mov => {
                  return <tr key={mov.id}>
                    <td data-label="Data">{new Date(mov.data_hora).toLocaleString('pt-BR')}</td>
                    <td data-label="Item">{mov.item_codigo ? `${mov.item_codigo} · ` : ''}{mov.item_nome || 'Item removido'}</td>
                    <td data-label="Tipo">
                      <span className={mov.tipo === 'entrada' ? css.movEntrada : mov.tipo === 'saida' ? css.movSaida : css.movAjuste}>
                        {mov.tipo === 'entrada' ? 'Entrada' : mov.tipo === 'saida' ? 'Saída' : 'Ajuste'}
                      </span>
                    </td>
                    <td data-label="Quantidade">{Number(mov.quantidade).toLocaleString('pt-BR')} {mov.item_unidade || ''}</td>
                    <td data-label="Motivo / O.S.">
                      {mov.motivo || 'Sem motivo informado'}
                      {mov.numero_os && <span className={css.movOs}> O.S. #{mov.numero_os}</span>}
                    </td>
                    <td data-label="Responsável">{mov.responsavel_nome || 'Usuário não identificado'}</td>
                  </tr>
                })}
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
              <button type="button" onClick={() => setModalItem(null)} className={css.btnFechar} aria-label="Fechar formulário de item" title="Fechar formulário"><X size={20} /></button>
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
                    <div className={css.margem} style={{ color: margemPct === null ? 'var(--text-muted)' : margemPct >= 0 ? 'var(--status-done)' : 'var(--color-danger)' }}>
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
          <div className={`modal-content ${css.modalMovimentacao}`}>
            <div className="modal-header">
              <h3>Movimentação — {modalMovimentacao.nome}</h3>
              <button type="button" onClick={() => setModalMovimentacao(null)} className={css.btnFechar} aria-label="Fechar movimentação de estoque" title="Fechar movimentação"><X size={20} /></button>
            </div>
            <form onSubmit={handleMovimentacao}>
              <div className="modal-body">
                <div className={css.saldoAtual}>
                <div className={css.saldoRotulo}>Saldo Atual</div>
                  <div className={css.saldoValor} style={{ color: modalMovimentacao.quantidade === 0 ? 'var(--color-danger)' : 'var(--text-primary)' }}>{modalMovimentacao.quantidade} {modalMovimentacao.unidade}</div>
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
                  <input type="number" className={`form-control ${css.campoQuantidade}`} placeholder="0" value={mQtd} onChange={e => setMQtd(e.target.value)} min="0.01" step="0.01" required />
                </div>
                <div className="form-group">
                  <label>Motivo / Observação *</label>
                  <input type="text" className="form-control" placeholder="Ex: Compra fornecedor, ajuste de inventário..." value={mMotivo} onChange={e => setMMotivo(e.target.value)} maxLength={100} required />
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
