import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { GlassPanel } from '../GlassPanel'
import css from './ComparacaoPeriodo.module.css'

const FORMATADORES = {
  faturamento: { titulo: 'Faturamento concluído', formatar: (valor) => formatarMoeda(valor) },
  ordens_abertas: { titulo: 'OS abertas', formatar: (valor) => formatarNumero(valor) },
  ordens_concluidas: { titulo: 'OS concluídas', formatar: (valor) => formatarNumero(valor) },
  ticket_medio: { titulo: 'Ticket médio', formatar: (valor) => formatarMoeda(valor) },
  duracao_media_horas: { titulo: 'Tempo médio de conclusão', formatar: (valor) => formatarHoras(valor) },
  quantidade_saidas: { titulo: 'Saídas de estoque', formatar: (valor) => formatarNumero(valor) },
  itens_criticos: { titulo: 'Itens críticos', formatar: (valor) => formatarNumero(valor) },
}

const COLUNAS_INDICADORES = ['34%', '15%', '15%', '16%', '20%']
const COLUNAS_RANKING = ['36%', '12%', '13%', '14%', '25%']

function ColunasTabela({ larguras }) {
  return (
    <colgroup>
      {larguras.map((largura, indice) => <col key={`${largura}-${indice}`} style={{ width: largura }} />)}
    </colgroup>
  )
}

function temNumero(valor) {
  return valor !== null && valor !== '' && Number.isFinite(Number(valor))
}

function formatarNumero(valor) {
  return temNumero(valor) ? Number(valor).toLocaleString('pt-BR') : '—'
}

function formatarMoeda(valor) {
  return temNumero(valor)
    ? Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'
}

function formatarHoras(valor) {
  return temNumero(valor)
    ? `${Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
    : '—'
}

function formatarData(valor) {
  if (!valor) return '—'
  const data = new Date(valor)
  return Number.isNaN(data.getTime())
    ? '—'
    : data.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function SinalVariacao({ valor }) {
  if (!temNumero(valor)) return <span className={css.semBase}>Sem base anterior</span>
  const numero = Number(valor)
  const Icone = numero > 0 ? ArrowUp : numero < 0 ? ArrowDown : Minus
  return (
    <span className={css.variacao}>
      <Icone size={14} aria-hidden="true" />
      {`${numero.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
    </span>
  )
}

function TabelaRanking({ titulo, itens }) {
  const linhas = Array.isArray(itens) ? itens : []

  return (
    <section className={css.ranking} aria-label={titulo}>
      <h4 className={css.rankingTitulo}>{titulo}</h4>
      {linhas.length === 0 ? (
        <p className={css.vazio}>Sem dados para comparar neste período.</p>
      ) : (
        <div className="data-table-wrapper">
          <table className={`data-table ${css.tabela}`} aria-label={titulo}>
            <ColunasTabela larguras={COLUNAS_RANKING} />
            <thead>
              <tr>
                <th>Item</th>
                <th className={css.num}>Atual</th>
                <th className={css.num}>Anterior</th>
                <th className={css.num}>Diferença</th>
                <th className={css.num}>Variação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((item) => (
                <tr key={item.rotulo}>
                  <td>{item.rotulo}</td>
                  <td className={css.num}>{formatarNumero(item.atual)}</td>
                  <td className={css.num}>{formatarNumero(item.anterior)}</td>
                  <td className={css.num}>{formatarNumero(item.diferenca)}</td>
                  <td className={css.num}><SinalVariacao valor={item.variacao_percentual} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Exibe comparações determinísticas; não atribui valor positivo/negativo às variações. */
export function ComparacaoPeriodo({ periodoAtual, periodoAnterior, comparacoes }) {
  const itens = Object.entries(comparacoes ?? {}).filter(([chave]) => FORMATADORES[chave])

  return (
    <GlassPanel className="panel stagger-2">
      <div className="panel-header">
        <div>
          <h3>Comparação de períodos</h3>
          <p className={css.periodo}>
            Atual: {formatarData(periodoAtual?.inicio)} a {formatarData(periodoAtual?.fim)} · Anterior: {formatarData(periodoAnterior?.inicio)} a {formatarData(periodoAnterior?.fim)}
          </p>
        </div>
      </div>

      {itens.length === 0 ? (
        <p className={css.vazio}>Não há comparações disponíveis para este período.</p>
      ) : (
        <div className="data-table-wrapper">
          <table className={`data-table ${css.tabela}`} aria-label="Comparação de indicadores entre períodos">
            <ColunasTabela larguras={COLUNAS_INDICADORES} />
            <thead>
              <tr>
                <th>Indicador</th>
                <th className={css.num}>Atual</th>
                <th className={css.num}>Anterior</th>
                <th className={css.num}>Diferença</th>
                <th className={css.num}>Variação</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(([chave, valores]) => {
                const config = FORMATADORES[chave]
                return (
                  <tr key={chave}>
                    <td>{config.titulo}</td>
                    <td className={css.num}>{config.formatar(valores?.atual)}</td>
                    <td className={css.num}>{config.formatar(valores?.anterior)}</td>
                    <td className={css.num}>{config.formatar(valores?.diferenca)}</td>
                    <td className={css.num}><SinalVariacao valor={valores?.variacao_percentual} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <TabelaRanking titulo="Modelos de veículo mais frequentes" itens={comparacoes?.modelos_veiculo} />
      <TabelaRanking titulo="Serviços mais frequentes" itens={comparacoes?.servicos_mais_frequentes} />
    </GlassPanel>
  )
}
