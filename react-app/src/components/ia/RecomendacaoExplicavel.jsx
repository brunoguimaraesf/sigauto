import { AlertTriangle, Brain } from 'lucide-react'
import { GlassPanel } from '../GlassPanel'

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
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontSize: '10px', fontWeight: 700, background: 'var(--color-warning-tint)', border: '1px solid var(--color-warning-border)', color: 'var(--color-warning)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '12px' }}>
        <AlertTriangle size={11} aria-hidden="true" /> Caráter consultivo — requer aprovação do gestor
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <Brain size={22} color={config.cor} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '16px' }}>{recomendacao.titulo}</h4>
            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: '10px', fontWeight: 700, color: config.cor, background: config.fundo, textTransform: 'uppercase' }}>{recomendacao.prioridade}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6, marginTop: '8px' }}>{recomendacao.descricao}</p>
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px', marginTop: '14px', fontSize: '13px' }}>
            <div><dt style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Categoria</dt><dd style={{ margin: 0, textTransform: 'capitalize' }}>{recomendacao.categoria}</dd></div>
            <div><dt style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Ação sugerida</dt><dd style={{ margin: 0 }}>{recomendacao.acao_sugerida}</dd></div>
            <div><dt style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Impacto esperado</dt><dd style={{ margin: 0 }}>{recomendacao.impacto_esperado}</dd></div>
            <div><dt style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Período analisado</dt><dd style={{ margin: 0 }}>{data(recomendacao.periodo?.inicio)} a {data(recomendacao.periodo?.fim)}</dd></div>
          </dl>
          <div style={{ marginTop: '14px' }}>
            <strong style={{ fontSize: '13px' }}>Evidências calculadas</strong>
            {evidencias.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Evidências indisponíveis.</p> : <ul style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '6px 0 0', paddingLeft: '18px' }}>{evidencias.map((evidencia, indice) => <li key={`${evidencia.chave}-${indice}`}>{evidencia.chave}: {valorEvidencia(evidencia.valor, evidencia.unidade)}</li>)}</ul>}
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}
