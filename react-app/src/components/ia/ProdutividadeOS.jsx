import { GlassPanel } from '../GlassPanel'
import css from './ProdutividadeOS.module.css'

const ROTULOS_STATUS = {
  aberta: 'Abertas',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peça',
  concluida: 'Concluídas',
  cancelada: 'Canceladas',
}

function numero(valor, opcoes = {}) {
  return valor !== null && valor !== '' && Number.isFinite(Number(valor)) ? Number(valor).toLocaleString('pt-BR', opcoes) : '—'
}

function horas(valor) {
  return valor !== null && valor !== '' && Number.isFinite(Number(valor)) ? `${numero(valor, { maximumFractionDigits: 1 })} h` : '—'
}

function data(valor) {
  const instancia = new Date(valor)
  return Number.isNaN(instancia.getTime()) ? '—' : instancia.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

/** Mostra produtividade observada sem inferir duração por etapa de status. */
export function ProdutividadeOS({ produtividade }) {
  const totais = produtividade?.total_por_status ?? {}
  const antigas = Array.isArray(produtividade?.os_abertas_mais_antigas) ? produtividade.os_abertas_mais_antigas : []
  const porMecanico = Array.isArray(produtividade?.conclusoes_por_mecanico) ? produtividade.conclusoes_por_mecanico : []

  return (
    <GlassPanel className="panel stagger-2">
      <div className="panel-header"><h3>Produtividade das OS</h3></div>
      <div className="metrics-grid" aria-label="Totais por status">
        {Object.entries(ROTULOS_STATUS).map(([status, rotulo]) => (
          <div key={status} className={`metric-card ${css.card}`}>
            <span className="metric-title">{rotulo}</span>
            <div className={`metric-value ${css.valor}`}>{numero(totais[status] ?? 0)}</div>
          </div>
        ))}
      </div>
      <div className={`metrics-grid ${css.gridSecundaria}`}>
        <div className={`metric-card ${css.card}`}><span className="metric-title">Taxa de conclusão</span><div className={`metric-value ${css.valor}`}>{produtividade?.taxa_conclusao == null ? '—' : `${numero(produtividade.taxa_conclusao, { maximumFractionDigits: 1 })}%`}</div></div>
        <div className={`metric-card ${css.card}`}><span className="metric-title">Tempo médio</span><div className={`metric-value ${css.valor}`}>{horas(produtividade?.tempo_medio_horas)}</div></div>
        <div className={`metric-card ${css.card}`}><span className="metric-title">Tempo mediano</span><div className={`metric-value ${css.valor}`}>{horas(produtividade?.tempo_mediano_horas)}</div></div>
      </div>
      <section className={css.secao} aria-label="Ordens abertas há mais tempo">
        <h4 className={css.secaoTitulo}>OS abertas há mais tempo</h4>
        {antigas.length === 0 ? <p className={css.vazio}>Não há OS abertas para listar.</p> : (
          <div className={css.scroll}><table className={`data-table ${css.tabelaAntigas}`}><thead><tr><th>OS</th><th>Status</th><th>Data de abertura</th></tr></thead><tbody>{antigas.map((os, indice) => <tr key={os.id ?? `${os.numero_os}-${indice}`}><td>{os.numero_os ?? '—'}</td><td>{os.status ?? '—'}</td><td>{data(os.data_abertura)}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <section className={css.secao} aria-label="Conclusões por mecânico">
        <h4 className={css.secaoTitulo}>Conclusões por mecânico</h4>
        {porMecanico.length === 0 ? <p className={css.vazio}>Não há conclusões por mecânico no período.</p> : (
          <div className={css.scroll}><table className={`data-table ${css.tabelaMecanicos}`}><thead><tr><th>Mecânico</th><th>OS concluídas</th><th>Valor médio</th></tr></thead><tbody>{porMecanico.map((mecanico, indice) => <tr key={mecanico.id_mecanico ?? `${mecanico.nome}-${indice}`}><td>{mecanico.nome || 'Mecânico não identificado'}</td><td>{numero(mecanico.quantidade_concluida)}</td><td>{Number.isFinite(Number(mecanico.valor_medio)) ? Number(mecanico.valor_medio).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </GlassPanel>
  )
}
