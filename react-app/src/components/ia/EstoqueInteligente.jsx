import { GlassPanel } from '../GlassPanel'
import css from './EstoqueInteligente.module.css'

function numero(valor) {
  return valor !== null && valor !== '' && Number.isFinite(Number(valor))
    ? Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    : '—'
}

function Cobertura({ dias }) {
  return dias === null || dias === undefined
    ? 'Sem consumo no período'
    : `${numero(dias)} dias`
}

function Tabela({ titulo, descricao, itens, colunas, vazio }) {
  return (
    <section className={css.secao} aria-label={titulo}>
      <h4 className={css.titulo}>{titulo}</h4>
      {descricao && <p className={css.descricao}>{descricao}</p>}
      {itens.length === 0 ? (
        <p className={css.vazio}>{vazio}</p>
      ) : (
        <div className={css.scroll}>
          <table className={`data-table ${css.tabela}`}>
            <thead><tr>{colunas.map((coluna) => <th key={coluna.titulo}>{coluna.titulo}</th>)}</tr></thead>
            <tbody>
              {itens.map((item, indice) => (
                <tr key={item.id ?? item.codigo ?? `${item.nome}-${indice}`}>
                  {colunas.map((coluna) => <td key={coluna.titulo}>{coluna.renderizar(item)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Mostra o saldo atual e consumo calculado, sem executar reposições. */
export function EstoqueInteligente({ estoque }) {
  const maisConsumidos = Array.isArray(estoque?.mais_consumidos) ? estoque.mais_consumidos : []
  const criticos = Array.isArray(estoque?.itens_criticos) ? estoque.itens_criticos : []
  const parados = Array.isArray(estoque?.itens_parados) ? estoque.itens_parados : []

  return (
    <GlassPanel className="panel stagger-2">
      <div className="panel-header"><h3>Estoque inteligente</h3></div>
      <p className={css.formula}>
        Reposição sugerida = máximo(0, estoque mínimo + consumo diário × 30 − quantidade atual). A sugestão é apenas consultiva e não altera o estoque.
      </p>
      <Tabela
        titulo="Itens críticos"
        descricao="Itens com quantidade atual igual ou abaixo do estoque mínimo."
        itens={criticos}
        vazio="Nenhum item crítico no momento."
        colunas={[
          { titulo: 'Item', renderizar: (item) => item.nome || 'Item sem nome' },
          { titulo: 'Atual / mínimo', renderizar: (item) => `${numero(item.quantidade)} / ${numero(item.qtd_minima)}` },
          { titulo: 'Cobertura', renderizar: (item) => <Cobertura dias={item.cobertura_dias} /> },
          { titulo: 'Reposição sugerida', renderizar: (item) => `${numero(item.sugestao_reposicao)} ${item.unidade ?? ''}`.trim() },
        ]}
      />
      <Tabela
        titulo="Peças com maior saída"
        itens={maisConsumidos}
        vazio="Não há saídas de estoque registradas no período."
        colunas={[
          { titulo: 'Item', renderizar: (item) => item.nome || 'Item sem nome' },
          { titulo: 'Saídas no período', renderizar: (item) => `${numero(item.quantidade_saida)} ${item.unidade ?? ''}`.trim() },
          { titulo: 'Consumo diário', renderizar: (item) => `${numero(item.consumo_diario)} ${item.unidade ?? ''}`.trim() },
          { titulo: 'Cobertura', renderizar: (item) => <Cobertura dias={item.cobertura_dias} /> },
        ]}
      />
      <Tabela
        titulo="Itens sem movimentação"
        itens={parados}
        vazio="Não há itens sem movimentação no período."
        colunas={[
          { titulo: 'Item', renderizar: (item) => item.nome || 'Item sem nome' },
          { titulo: 'Quantidade atual', renderizar: (item) => `${numero(item.quantidade)} ${item.unidade ?? ''}`.trim() },
          { titulo: 'Cobertura', renderizar: (item) => <Cobertura dias={item.cobertura_dias} /> },
        ]}
      />
    </GlassPanel>
  )
}
