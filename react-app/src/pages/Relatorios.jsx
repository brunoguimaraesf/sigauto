import { useEffect, useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { BarChart3, TrendingUp, Package, Users, Wrench, Download, Percent } from 'lucide-react'
import { calcOSCommissions, calcOSTotals, formatCurrency, resolveEquipe } from '../utils/osFinance'
import { supabaseDb } from '../supabaseClient'

const TIPOS = [
  { id: 'faturamento', label: 'Faturamento', icon: TrendingUp, desc: 'Receita por periodo' },
  { id: 'atendimentos', label: 'Atendimentos', icon: BarChart3, desc: 'OS abertas e concluidas' },
  { id: 'estoque', label: 'Estoque', icon: Package, desc: 'Posicao atual de estoque' },
  { id: 'servicos', label: 'Servicos Frequentes', icon: Wrench, desc: 'Servicos mais realizados' },
  { id: 'clientes', label: 'Clientes Frequentes', icon: Users, desc: 'Clientes com mais OS' },
  { id: 'comissoes', label: 'Comissoes', icon: Percent, desc: 'Valores por responsavel' },
]

const statusLabel = (status) => ({
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peca',
  concluida: 'Concluida',
  cancelada: 'Cancelada',
  Pendente: 'Aberta',
  'Em Andamento': 'Em andamento',
  'Concluido': 'Concluida',
  'Concluído': 'Concluida',
}[status] || status || 'Sem status')

export function Relatorios() {
  const { clientes, veiculos, funcionarios, ordensServico, servicos } = useDatabase()
  const [estoque, setEstoque] = useState([])
  const [tipoSel, setTipoSel] = useState('faturamento')
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0])

  const osNoPeriodo = ordensServico.filter(os => {
    const dt = new Date(os.data_abertura || os.created_at)
    return dt >= new Date(dataInicio) && dt <= new Date(`${dataFim}T23:59:59`)
  })
  const getOSDateInPeriod = (os, field) => {
    const dt = new Date(os[field] || os.data_abertura || os.created_at)
    return dt >= new Date(dataInicio) && dt <= new Date(`${dataFim}T23:59:59`)
  }

  const getVeiculo = (os) => veiculos.find(v => v.id === (os.veiculo_id || os.id_veiculo)) || {}
  const getCliente = (os) => {
    const v = getVeiculo(os)
    return clientes.find(c => c.id === (os.cliente_id || v.cliente_id || v.id_cliente)) || {}
  }
  const getResponsaveisOS = (os) => resolveEquipe(os, funcionarios)
  const getValorOS = (os) => os.valor_total || os.preco_final || calcOSTotals(os).valorTotal
  const isConcluida = (os) => os.status === 'concluida' || os.status === 'Concluido' || os.status === 'ConcluÒ­do'
  const formatData = (value) => {
    const d = new Date(value)
    return isNaN(d) ? '-' : d.toLocaleDateString('pt-BR')
  }

  useEffect(() => {
    async function carregarEstoque() {
      const { data, error } = await supabaseDb.from('item_estoque').select('*').eq('ativo', true).order('nome')
      if (!error) setEstoque(data || [])
      else console.error('Erro ao carregar estoque do Supabase:', error)
    }
    carregarEstoque()
  }, [])

  const gerarDados = () => {
    if (tipoSel === 'faturamento') {
      const concluidas = osNoPeriodo.filter(os => os.status === 'concluida' || os.status === 'Concluido' || os.status === 'Concluído')
      const receita = concluidas.reduce((s, os) => s + getValorOS(os), 0)
      return {
        titulo: 'Faturamento no Periodo',
        totais: [
          { label: 'Total de O.S.', valor: osNoPeriodo.length },
          { label: 'O.S. Concluidas', valor: concluidas.length },
          { label: 'Receita Total', valor: formatCurrency(receita) },
          { label: 'Ticket Medio', valor: concluidas.length ? formatCurrency(receita / concluidas.length) : formatCurrency(0) },
        ],
        colunas: ['N. O.S.', 'Cliente', 'Placa', 'Status', 'Valor', 'Data'],
        linhas: osNoPeriodo.map(os => {
          const v = getVeiculo(os)
          const c = getCliente(os)
          return [
            `#${os.numero_os || os.id?.slice(-4)?.toUpperCase()}`,
            c.nome || '-',
            v.placa || '-',
            statusLabel(os.status),
            formatCurrency(getValorOS(os)),
            new Date(os.data_abertura || os.created_at).toLocaleDateString('pt-BR'),
          ]
        }),
      }
    }

    if (tipoSel === 'atendimentos') {
      const contagem = {}
      osNoPeriodo.forEach(os => {
        const label = statusLabel(os.status)
        contagem[label] = (contagem[label] || 0) + 1
      })
      return {
        titulo: 'Atendimentos no Periodo',
        totais: [{ label: 'Total no Periodo', valor: osNoPeriodo.length }, ...Object.entries(contagem).map(([s, n]) => ({ label: s, valor: n }))],
        colunas: ['Status', 'Quantidade', '% do Total'],
        linhas: Object.entries(contagem).map(([s, n]) => [s, n, `${osNoPeriodo.length ? Math.round((n / osNoPeriodo.length) * 100) : 0}%`]),
      }
    }

    if (tipoSel === 'estoque') {
      const ativos = estoque.filter(i => i.ativo !== false)
      return {
        titulo: 'Posicao Atual de Estoque',
        totais: [
          { label: 'Total de Itens', valor: ativos.length },
          { label: 'Itens em Alerta', valor: ativos.filter(i => Number(i.quantidade) <= Number(i.qtd_minima || 0)).length },
          { label: 'Itens Zerados', valor: ativos.filter(i => Number(i.quantidade) === 0).length },
        ],
        colunas: ['Codigo', 'Item', 'Un.', 'Qtd.', 'Min.', 'Status'],
        linhas: ativos.map(i => [
          i.codigo || i.id,
          i.nome,
          i.unidade,
          i.quantidade,
          i.qtd_minima || 0,
          Number(i.quantidade) === 0 ? 'CRITICO' : Number(i.quantidade) <= Number(i.qtd_minima || 0) ? 'BAIXO' : 'OK',
        ]),
      }
    }

    if (tipoSel === 'servicos') {
      const contagem = {}
      osNoPeriodo.forEach(os => {
        const itens = os.servicos_itens?.length
          ? os.servicos_itens
          : [{ descricao: os.servicos_executados || os.servicoNome || os.descricao?.slice(0, 40) || 'Servico Geral' }]
        itens.forEach(item => {
          const desc = item.descricao || servicos.find(s => s.id === item.catalogo_id)?.nome || 'Servico Geral'
          contagem[desc] = (contagem[desc] || 0) + Number(item.quantidade || 1)
        })
      })
      const total = Object.values(contagem).reduce((s, n) => s + n, 0)
      const top10 = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 10)
      return {
        titulo: 'Servicos Mais Frequentes',
        totais: [{ label: 'Total de O.S.', valor: osNoPeriodo.length }, { label: 'Servicos Lancados', valor: total }],
        colunas: ['Servico', 'Qtd. Realizacoes', '% do Total'],
        linhas: top10.map(([s, n]) => [s, n, `${total ? Math.round((n / total) * 100) : 0}%`]),
      }
    }

    if (tipoSel === 'comissoes') {
      const concluidas = ordensServico.filter(os => isConcluida(os) && getOSDateInPeriod(os, 'data_encerramento'))
      const linhasComissao = []

      concluidas.forEach(os => {
        const v = getVeiculo(os)
        const c = getCliente(os)
        const { mecanico, atendente } = getResponsaveisOS(os)
        const calculatedComissoes = calcOSCommissions(os, mecanico, atendente)
        const comissoes = os.comissao_detalhes || calculatedComissoes
        const totalsOS = calcOSTotals(os)
        const numero = `#${os.numero_os || os.id?.slice(-4)?.toUpperCase()}`
        const dataBase = os.data_encerramento || os.data_abertura || os.created_at

        if (mecanico && (Number(comissoes.mecanico?.valor || 0) > 0 || Number(mecanico.comissao_percentual || 0) > 0)) {
          linhasComissao.push({
            perfil: 'Mecanico',
            nome: mecanico.nome,
            numero,
            cliente: c.nome || '-',
            placa: v.placa || '-',
            baseServicos: comissoes.mecanico?.sobreServicos ? totalsOS.valorServicos : 0,
            basePecas: comissoes.mecanico?.sobrePecas ? totalsOS.valorPecas : 0,
            percentual: comissoes.mecanico?.percentual || 0,
            valor: Number(comissoes.mecanico?.valor || 0),
            data: dataBase,
          })
        }

        if (atendente && (Number(comissoes.atendente?.valor || 0) > 0 || Number(atendente.comissao_percentual || 0) > 0)) {
          linhasComissao.push({
            perfil: 'Atendente',
            nome: atendente.nome,
            numero,
            cliente: c.nome || '-',
            placa: v.placa || '-',
            baseServicos: comissoes.atendente?.sobreServicos ? totalsOS.valorServicos : 0,
            basePecas: comissoes.atendente?.sobrePecas ? totalsOS.valorPecas : 0,
            percentual: comissoes.atendente?.percentual || 0,
            valor: Number(comissoes.atendente?.valor || 0),
            data: dataBase,
          })
        }
      })

      const totalComissao = linhasComissao.reduce((s, item) => s + item.valor, 0)
      const totalMecanicos = linhasComissao.filter(item => item.perfil === 'Mecanico').reduce((s, item) => s + item.valor, 0)
      const totalAtendentes = linhasComissao.filter(item => item.perfil === 'Atendente').reduce((s, item) => s + item.valor, 0)
      const profissionais = new Set(linhasComissao.map(item => `${item.perfil}:${item.nome}`)).size

      return {
        titulo: 'Comissoes no Periodo',
        totais: [
          { label: 'O.S. Concluidas', valor: concluidas.length },
          { label: 'Profissionais', valor: profissionais },
          { label: 'Total Comissoes', valor: formatCurrency(totalComissao) },
          { label: 'Mecanicos', valor: formatCurrency(totalMecanicos) },
          { label: 'Atendentes', valor: formatCurrency(totalAtendentes) },
        ],
        colunas: ['Profissional', 'Perfil', 'O.S.', 'Cliente', 'Placa', 'Base Serv.', 'Base Pecas', '%', 'Comissao', 'Data'],
        linhas: linhasComissao
          .sort((a, b) => a.nome.localeCompare(b.nome) || new Date(a.data) - new Date(b.data))
          .map(item => [
            item.nome,
            item.perfil,
            item.numero,
            item.cliente,
            item.placa,
            formatCurrency(item.baseServicos),
            formatCurrency(item.basePecas),
            `${Number(item.percentual || 0).toLocaleString('pt-BR')}%`,
            formatCurrency(item.valor),
            formatData(item.data),
          ]),
      }
    }

    const contagem = {}
    osNoPeriodo.forEach(os => {
      const c = getCliente(os)
      if (c.nome) contagem[c.nome] = (contagem[c.nome] || 0) + 1
    })
    const top10 = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 10)
    return {
      titulo: 'Clientes Mais Frequentes',
      totais: [{ label: 'Total de Clientes', valor: clientes.length }, { label: 'Clientes no Periodo', valor: Object.keys(contagem).length }],
      colunas: ['Cliente', 'Total de O.S.', '% do Periodo'],
      linhas: top10.map(([c, n]) => [c, n, `${osNoPeriodo.length ? Math.round((n / osNoPeriodo.length) * 100) : 0}%`]),
    }
  }

  const dados = gerarDados()
  const tipo = TIPOS.find(t => t.id === tipoSel)
  const Icon = tipo.icon

  const exportarCSV = () => {
    const rows = [dados.colunas, ...dados.linhas]
    const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tipoSel}_${dataInicio}_${dataFim}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="dashboard-grid">
      <section className="welcome-section stagger-1">
        <h2>Relatorios Gerenciais</h2>
        <p>Analise de desempenho da oficina por periodo.</p>
      </section>

      <section style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }} className="stagger-2">
        {TIPOS.map(t => {
          const CardIcon = t.icon
          return (
            <GlassPanel
              key={t.id}
              className="metric-card"
              onClick={() => setTipoSel(t.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setTipoSel(t.id)}
              style={{
                cursor: 'pointer', padding: '16px 20px', flex: '1', minWidth: '160px', textAlign: 'center',
                borderColor: tipoSel === t.id ? 'rgba(232, 89, 12, 0.4)' : 'var(--border-color)',
                background: tipoSel === t.id ? 'rgba(232, 89, 12, 0.06)' : 'var(--bg-surface)',
              }}
            >
              <CardIcon size={20} color={tipoSel === t.id ? 'var(--neon-orange)' : 'var(--text-secondary)'} style={{ marginBottom: '8px' }} />
              <div style={{ fontWeight: '600', fontSize: '13px', color: tipoSel === t.id ? 'var(--neon-orange)' : 'var(--text-primary)', marginBottom: '2px' }}>{t.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.desc}</div>
            </GlassPanel>
          )
        })}
      </section>

      <GlassPanel className="panel stagger-3">
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label>Data Inicio</label>
              <input type="date" className="form-control" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label>Data Fim</label>
              <input type="date" className="form-control" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
          </div>
          <button className="btn-secondary" onClick={exportarCSV} style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-end' }}>
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </GlassPanel>

      <GlassPanel className="panel stagger-4">
        <div className="panel-header" style={{ marginBottom: '24px' }}>
          <h3><Icon size={18} style={{ marginRight: '8px', verticalAlign: 'middle', color: 'var(--neon-orange)' }} />{dados.titulo}</h3>
        </div>

        {dados.totais.length > 0 && (
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {dados.totais.map((t, i) => (
              <div key={i} style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', flex: 1, minWidth: '140px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{t.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: '600', color: 'var(--neon-orange)' }}>{t.valor}</div>
              </div>
            ))}
          </div>
        )}

        {dados.linhas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Nenhum dado encontrado para o periodo selecionado.</div>
        ) : (
          <div className="tech-table-container">
            <table className="tech-table">
              <thead><tr>{dados.colunas.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
              <tbody>
                {dados.linhas.map((linha, i) => (
                  <tr key={i}>{linha.map((cel, j) => <td key={j}>{cel}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </div>
  )
}
