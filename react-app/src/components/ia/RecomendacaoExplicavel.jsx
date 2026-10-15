import { AlertTriangle, Brain } from 'lucide-react'
import { GlassPanel } from '../GlassPanel'
import css from './RecomendacaoExplicavel.module.css'

const CONFIG_PRIORIDADE = {
  alta: { cor: 'var(--color-danger)', fundo: 'var(--color-danger-tint)' },
  media: { cor: 'var(--color-warning)', fundo: 'var(--color-warning-tint)' },
  baixa: { cor: 'var(--text-secondary)', fundo: 'var(--bg-subtle)' },
}

function data(valor) {
  const instancia = new Date(valor)
  return Number.isNaN(instancia.getTime()) ? '—' : instancia.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function valorEvidencia(valor, unidade) {
  if (valor === null || valor === undefined) return 'Sem base'
  if (unidade === 'BRL') return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (unidade === 'percentual') return `${Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  if (unidade === 'horas') return `${Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
  return `${Number(valor).toLocaleString('pt-BR')} ${unidade ?? ''}`.trim()
}

/** Cartão somente de leitura de uma recomendação com evidências validadas no backend. */
export function RecomendacaoExplicavel({ recomendacao }) {
  const config = CONFIG_PRIORIDADE[recomendacao?.prioridade] ?? CONFIG_PRIORIDADE.baixa
  const evidencias = Array.isArray(recomendacao?.evidencias) ? recomendacao.evidencias : []
  if (!recomendacao) return null

  return (
    <GlassPanel className="panel" style={{ borderColor: config.cor }}>
      <div className={css.aviso}>
        <AlertTriangle size={11} aria-hidden="true" /> Caráter consultivo — requer aprovação do gestor
      </div>
      <div className={css.corpo}>
        <Brain size={22} color={config.cor} aria-hidden="true" className={css.icone} />
        <div className={css.conteudo}>
          <div className={css.cabecalho}>
            <h4 className={css.titulo}>{recomendacao.titulo}</h4>
            <span className={css.prioridade} style={{ color: config.cor, background: config.fundo }}>{recomendacao.prioridade}</span>
          </div>
          <p className={css.descricao}>{recomendacao.descricao}</p>
          <dl className={css.lista}>
            <div><dt className={css.rotulo}>Categoria</dt><dd className={css.valorCapitalizado}>{recomendacao.categoria}</dd></div>
            <div><dt className={css.rotulo}>Ação sugerida</dt><dd className={css.valor}>{recomendacao.acao_sugerida}</dd></div>
            <div><dt className={css.rotulo}>Impacto esperado</dt><dd className={css.valor}>{recomendacao.impacto_esperado}</dd></div>
            <div><dt className={css.rotulo}>Período analisado</dt><dd className={css.valor}>{data(recomendacao.periodo?.inicio)} a {data(recomendacao.periodo?.fim)}</dd></div>
          </dl>
          <div className={css.evidencias}>
            <strong className={css.evidenciasTitulo}>Evidências calculadas</strong>
            {evidencias.length === 0 ? <p className={css.evidenciasVazio}>Evidências indisponíveis.</p> : <ul className={css.evidenciasLista}>{evidencias.map((evidencia, indice) => <li key={`${evidencia.chave}-${indice}`}>{evidencia.chave}: {valorEvidencia(evidencia.valor, evidencia.unidade)}</li>)}</ul>}
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}
