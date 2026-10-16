import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { Wrench, Users, CarFront, FileText, CheckCircle, Clock, XCircle, Hourglass } from 'lucide-react'
import { statusOSLabel, statusOSClasse } from '../utils/os'
import css from './Dashboard.module.css'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// Janela [início, fim) do mês escolhido, em hora local — a mesma base que o
// `toLocaleDateString` da tela usa. Fim exclusivo evita contar duas vezes uma OS
// encerrada à meia-noite do dia 1º.
function janelaDoMes(ano, mes) {
  return { inicio: new Date(ano, mes, 1, 0, 0, 0, 0), fim: new Date(ano, mes + 1, 1, 0, 0, 0, 0) }
}

function dentroDaJanela(valor, { inicio, fim }) {
  if (!valor) return false
  const data = new Date(valor)
  return !Number.isNaN(data.getTime()) && data >= inicio && data < fim
}

export function Dashboard() {
  const { clientes, veiculos, servicos, ordensServico, loading } = useDatabase()

  const agora = useMemo(() => new Date(), [])
  const [mes, setMes] = useState(agora.getMonth())
  const [ano, setAno] = useState(agora.getFullYear())

  // Anos oferecidos: os que têm OS, mais o ano corrente. Sem lista fixa — um
  // intervalo chumbado esconderia dado histórico assim que o sistema passasse
  // do ano previsto.
  const anosDisponiveis = useMemo(() => {
    const encontrados = new Set([agora.getFullYear()])
    for (const os of ordensServico) {
      for (const campo of [os.data_abertura, os.data_encerramento, os.criado_em]) {
        const data = campo ? new Date(campo) : null
        if (data && !Number.isNaN(data.getTime())) encontrados.add(data.getFullYear())
      }
    }
    return [...encontrados].sort((a, b) => b - a)
  }, [ordensServico, agora])

  const janela = useMemo(() => janelaDoMes(ano, mes), [ano, mes])
  const ehMesCorrente = mes === agora.getMonth() && ano === agora.getFullYear()

  // Faturamento conta SOMENTE OS concluída, pela data de encerramento. Antes a
  // tela somava `valor_total` de todas as OS, inclusive cancelada e em aberto,
  // o que inflava a receita e contradizia o backend do Painel IA
  // (`metricasPainelIA.js`), que sempre filtrou por `status === 'concluida'`.
  const concluidasNoMes = useMemo(
    () => ordensServico.filter(os => os.status === 'concluida' && dentroDaJanela(os.data_encerramento, janela)),
    [ordensServico, janela],
  )
  const faturamentoMes = concluidasNoMes.reduce((soma, os) => soma + (Number(os.valor_total) || 0), 0)
  const ticketMedio = concluidasNoMes.length > 0 ? faturamentoMes / concluidasNoMes.length : 0

  // As contagens por status olham a ABERTURA: é a pergunta "quanto entrou neste
  // mês e em que pé está", diferente do faturamento, que é por encerramento.
  const aberturasNoMes = useMemo(
    () => ordensServico.filter(os => dentroDaJanela(os.data_abertura || os.criado_em, janela)),
    [ordensServico, janela],
  )

  const osStats = {
    total: aberturasNoMes.length,
    abertas: aberturasNoMes.filter(os => os.status === 'aberta').length,
    emAndamento: aberturasNoMes.filter(os => os.status === 'em_andamento').length,
    aguardando: aberturasNoMes.filter(os => os.status === 'aguardando_peca').length,
    concluidas: aberturasNoMes.filter(os => os.status === 'concluida').length,
    canceladas: aberturasNoMes.filter(os => os.status === 'cancelada').length,
  }

  // "Em Manutenção" é situação de AGORA, não do mês escolhido: responde quantos
  // carros estão no box neste instante. Filtrar pelo mês daria zero ao escolher
  // um mês passado, o que seria uma resposta errada para a pergunta.
  const emManutencaoAgora = ordensServico.filter(
    os => os.status === 'em_andamento' || os.status === 'aberta' || os.status === 'aguardando_peca',
  ).length

  const enriquecer = (os) => {
    const veiculo = veiculos.find(v => v.id === (os.id_veiculo || os.veiculo_id)) || {}
    const cliente = clientes.find(c => c.id === (veiculo.id_cliente || veiculo.cliente_id)) || {}
    const itens = os.servicos_itens || []
    const servicoNome = itens.length > 0
      ? itens.map(s => s.descricao || s.nome).filter(Boolean).join(', ')
      : (servicos.find(s => s.id === os.servico_id)?.nome || os.descricao || '—')
    return {
      ...os,
      clienteNome: cliente.nome || '—',
      veiculoInfo: veiculo.marca ? `${veiculo.marca} ${veiculo.modelo}` : '—',
      veiculoPlaca: veiculo.placa || '—',
      servicoNome,
      valorExibido: Number(os.valor_total) || 0,
    }
  }

  // No mês corrente a lista mostra a semana, que é a informação operacional do
  // dia. Em mês passado, "esta semana" não existe dentro do recorte: a lista
  // passa a ser das entradas do próprio mês, senão o painel viria sempre vazio.
  const inicioDaSemana = useMemo(() => {
    const d = new Date()
    const dia = d.getDay()
    d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1))
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const entradas = useMemo(() => {
    const base = ehMesCorrente
      ? aberturasNoMes.filter(os => {
        const data = new Date(os.data_abertura || os.criado_em)
        return !Number.isNaN(data.getTime()) && data >= inicioDaSemana
      })
      : aberturasNoMes
    return base
      .slice()
      .sort((a, b) => new Date(b.data_abertura || b.criado_em) - new Date(a.data_abertura || a.criado_em))
      .slice(0, 6)
      .map(enriquecer)
  }, [aberturasNoMes, ehMesCorrente, inicioDaSemana, veiculos, clientes, servicos])

  const tituloEntradas = ehMesCorrente ? 'Entradas desta Semana' : `Entradas de ${MESES[mes]}`
  const rotuloPeriodo = `${MESES[mes]} de ${ano}`

  if (loading) {
    return (
      <div className={css.carregando}>
        <h2>Carregando painel...</h2>
      </div>
    )
  }

  return (
    <div className="dashboard-grid">
      <section className={`welcome-section stagger-1 ${css.topo}`}>
        <div>
          <h2>Visão Geral</h2>
          <p>Resumo da operação da oficina em {rotuloPeriodo}.</p>
        </div>
        <div className={css.seletorPeriodo}>
          <label className={css.seletorRotulo} htmlFor="dashboard-mes">Mês de referência</label>
          <div className={css.seletorCampos}>
            <select
              id="dashboard-mes"
              className="form-control"
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              aria-label="Mês de referência"
            >
              {MESES.map((nome, indice) => (
                <option key={nome} value={indice}>{nome}</option>
              ))}
            </select>
            <select
              className="form-control"
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              aria-label="Ano de referência"
            >
              {anosDisponiveis.map(valor => (
                <option key={valor} value={valor}>{valor}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <GlassPanel className="metric-card metric-card--accent stagger-2">
          <div className="metric-header">
            <span className={`metric-title ${css.metricTitulo}`}>
              <CarFront size={16} className="metric-icon" /> Veículos Cadastrados
            </span>
            <span className={`metric-trend positive ${css.metricTrend}`}>ATIVOS</span>
          </div>
          <div className="metric-value">{veiculos.length}</div>
        </GlassPanel>

        <GlassPanel className="metric-card metric-card--info stagger-3">
          <div className="metric-header">
            <span className={`metric-title ${css.metricTitulo}`}>
              <Wrench size={16} className="metric-icon" /> Em Manutenção
            </span>
            <span className={`metric-trend metric-context ${css.metricTrend}`}>AGORA</span>
          </div>
          <div className="metric-value">{emManutencaoAgora}</div>
        </GlassPanel>

        <GlassPanel className="metric-card metric-card--success stagger-4 highlight-card">
          <div className="metric-header">
            <span className={`metric-title ${css.metricTitulo}`}>
              <Users size={16} className="metric-icon" /> Faturamento
            </span>
            <span className={`metric-trend positive ${css.metricTrend}`}>CONCLUÍDAS</span>
          </div>
          <div className="metric-value">
            {faturamentoMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </div>
          <div className={css.faturamentoDetalhe}>
            {concluidasNoMes.length === 0
              ? `Nenhuma O.S. concluída em ${MESES[mes]}.`
              : `${concluidasNoMes.length} O.S. concluída${concluidasNoMes.length > 1 ? 's' : ''} · ticket médio ${ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
          </div>
        </GlassPanel>
      </section>

      <section className="content-split">
        <GlassPanel className="panel stagger-5">
          <div className="panel-header">
            <h3>{tituloEntradas}</h3>
            <Link className="btn-link" to="/ordens-servico">Ver Todas as O.S.</Link>
          </div>

          <div className="list-container">
            {entradas.length === 0 ? (
              <div className={css.listaVazia}>
                <FileText size={28} color="var(--text-muted)" />
                <span className={css.listaVaziaTexto}>
                  {ehMesCorrente
                    ? 'Nenhuma O.S. aberta esta semana.'
                    : `Nenhuma O.S. aberta em ${rotuloPeriodo}.`}
                </span>
                <Link className={`btn-primary ${css.btnListaVazia}`} to="/ordens-servico/nova">Abrir nova O.S.</Link>
              </div>
            ) : (
              entradas.map((os) => (
                <Link key={os.id} className="list-item" to={`/ordens-servico/${os.id}`}>
                  <div className={`car-indicator ${css.inicialVeiculo}`}>
                    {os.veiculoInfo?.charAt(0) || 'V'}
                  </div>
                  <div className="item-details">
                    <h4>{os.veiculoInfo}</h4>
                    <span className={css.itemPlaca}>{os.veiculoPlaca} • {os.clienteNome}</span>
                    <span className={css.itemServico}>{os.servicoNome}</span>
                  </div>

                  <div className={css.itemLateral}>
                    <span className={css.itemValor}>
                      {os.valorExibido > 0 ? `R$ ${os.valorExibido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                    <div className={`status-badge ${statusOSClasse(os.status)}`}>
                      {statusOSLabel(os.status)}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </GlassPanel>

        <GlassPanel className="panel stagger-6">
          <div className="panel-header">
            <h3>Situação da Oficina</h3>
            <span className={css.totalOS}>
              {osStats.total} OS em {MESES[mes]}
            </span>
          </div>

          <div className={css.resumoGrade}>
            <div className={`resumo-oficina--accent ${css.resumoCard}`}>
              <div className={css.resumoRotulo}>
                <CarFront size={10} /> Veículos
              </div>
              <div className={css.resumoValorAccent}>{veiculos.length}</div>
            </div>
            <div className={`resumo-oficina--info ${css.resumoCard}`}>
              <div className={css.resumoRotulo}>
                <Users size={10} /> Clientes
              </div>
              <div className={css.resumoValorInfo}>{clientes.length}</div>
            </div>
          </div>

          <div className={css.statusLista}>
            {[
              { label: 'Abertas', count: osStats.abertas, color: 'var(--status-pending)', Icon: Clock },
              { label: 'Em Andamento', count: osStats.emAndamento, color: 'var(--status-progress)', Icon: Wrench },
              { label: 'Aguard. Peça', count: osStats.aguardando, color: 'var(--color-warning)', Icon: Hourglass },
              { label: 'Concluídas', count: osStats.concluidas, color: 'var(--status-done)', Icon: CheckCircle },
              { label: 'Canceladas', count: osStats.canceladas, color: 'var(--text-muted)', Icon: XCircle },
            ].map(({ label, count, color, Icon }) => {
              const pct = osStats.total > 0 ? Math.round((count / osStats.total) * 100) : 0
              return (
                <div key={label}>
                  <div className={css.statusLinha}>
                    <span className={css.statusRotulo}>
                      <Icon size={12} color={color} /> {label}
                    </span>
                    <span className={css.statusContagem} style={{ color }}>
                      {count} <span className={css.statusPercentual}>({pct}%)</span>
                    </span>
                  </div>
                  <div className={css.statusBarra}>
                    <div className={css.statusBarraPreenchida} style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>

          {osStats.total > 0 ? (
            <div className={css.taxaConclusao}>
              <span className={css.taxaRotulo}>Taxa de conclusão</span>
              <span className={css.taxaValor}>
                {Math.round((osStats.concluidas / osStats.total) * 100)}%
              </span>
            </div>
          ) : (
            <div className={css.taxaConclusao}>
              <span className={css.taxaRotulo}>Nenhuma O.S. aberta em {rotuloPeriodo}</span>
            </div>
          )}
        </GlassPanel>
      </section>
    </div>
  )
}
