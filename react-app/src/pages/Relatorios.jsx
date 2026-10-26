import { useEffect, useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { useDatabase } from '../hooks/useDatabase'
import { BarChart3, TrendingUp, Package, Users, Wrench, Download, Percent } from 'lucide-react'
import { calcOSCommissions, calcOSTotals, centesimos, formatCurrency, resolveEquipe } from '../utils/osFinance'
import { supabaseDb } from '../supabaseClient'
import { dentroDoPeriodo } from '../utils/periodo'
import css from './Relatorios.module.css'

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
  const { clientes, veiculos, ordensServico, servicos } = useDatabase()
  const [estoque, setEstoque] = useState([])
  // Relatorio de comissoes precisa dos campos de comissao, que so o gestor le na
  // tabela funcionario (a lista geral do app vem da view publica, sem comissao).
  const [funcionarios, setFuncionarios] = useState([])
  const [tipoSel, setTipoSel] = useState('faturamento')
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0])
  // '' = todos. Guarda o id do funcionario, nunca o nome: dois colaboradores
  // podem ser homonimos e as comissoes de um apareceriam no relatorio do outro.
  const [funcionarioSel, setFuncionarioSel] = useState('')

  // Casa a OS com o funcionario selecionado. O fallback do resolveEquipe cobre a
  // OS antiga, aberta antes de id_mecanico/id_atendente existirem.
  const daEquipe = (os) => {
    if (!funcionarioSel) return true
    if (os.id_mecanico === funcionarioSel || os.id_atendente === funcionarioSel) return true
    const { mecanico, atendente } = resolveEquipe(os, funcionarios)
    return mecanico?.id === funcionarioSel || atendente?.id === funcionarioSel
  }

  const osNoPeriodo = ordensServico.filter(os =>
    dentroDoPeriodo(os.data_abertura || os.created_at, dataInicio, dataFim) && daEquipe(os),
  )
  const getOSDateInPeriod = (os, field) =>
    dentroDoPeriodo(os[field] || os.data_abertura || os.created_at, dataInicio, dataFim)

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
    async function carregar() {
      const [est, fun] = await Promise.all([
        supabaseDb.from('item_estoque').select('*').eq('ativo', true).order('nome'),
        supabaseDb.from('funcionario').select('*').eq('ativo', true).order('nome'),
      ])
      if (!est.error) setEstoque(est.data || [])
      else console.error('Erro ao carregar estoque do Supabase:', est.error)
      if (!fun.error) setFuncionarios(fun.data || [])
      else console.error('Erro ao carregar funcionarios do Supabase:', fun.error)
    }
    carregar()
  }, [])

  const gerarDados = () => {
    if (tipoSel === 'faturamento') {
      // QA-09: receita entra no periodo pela data de ENCERRAMENTO, como no
      // chatbot, no Painel IA (RN43) e no relatorio de comissoes. Pela abertura,
      // uma O.S. aberta em setembro e paga em outubro sumia do faturamento de
      // outubro. "Total de O.S." continua contando as abertas no periodo.
      const concluidas = ordensServico.filter(os =>
        (os.status === 'concluida' || os.status === 'Concluido' || os.status === 'Concluído')
        && getOSDateInPeriod(os, 'data_encerramento')
        && daEquipe(os),
      )
      const receita = concluidas.reduce((s, os) => s + centesimos(getValorOS(os)), 0) / 100
      return {
        titulo: 'Faturamento no Periodo',
        totais: [
          { label: 'Total de O.S.', valor: osNoPeriodo.length },
          { label: 'O.S. Concluidas', valor: concluidas.length },
          { label: 'Receita Total', valor: formatCurrency(receita) },
          { label: 'Ticket Medio', valor: concluidas.length ? formatCurrency(Math.round(receita * 100 / concluidas.length) / 100) : formatCurrency(0) },
        ],
        // As linhas sao as O.S. que compoem a receita, para o CSV fechar com o
        // total exibido (RN25).
        colunas: ['N. O.S.', 'Cliente', 'Placa', 'Status', 'Valor', 'Encerramento'],
        linhas: concluidas.map(os => {
          const v = getVeiculo(os)
          const c = getCliente(os)
          return [
            `#${os.numero_os || os.id?.slice(-4)?.toUpperCase()}`,
            c.nome || '-',
            v.placa || '-',
            statusLabel(os.status),
            formatCurrency(getValorOS(os)),
            formatData(os.data_encerramento),
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
        // A escolha e POR PAPEL. Escolher o objeto inteiro ("tem snapshot? usa
        // tudo dele") zerava o papel ausente: `os_comissao` recebe uma linha por
        // papel, e uma OS encerrada sem atendente tem snapshot so do mecanico —
        // a linha do atendente saia com percentual e valor 0.
        const snapshot = os.comissoes_snapshot || {}
        const comissoes = {
          mecanico: snapshot.mecanico || calculatedComissoes.mecanico,
          atendente: snapshot.atendente || calculatedComissoes.atendente,
        }
        const totalsOS = calcOSTotals(os)
        const numero = `#${os.numero_os || os.id?.slice(-4)?.toUpperCase()}`
        const dataBase = os.data_encerramento || os.data_abertura || os.created_at

        const snapshotMecanico = comissoes.mecanico
        const snapshotAtendente = comissoes.atendente

        if ((mecanico || snapshotMecanico) && (Number(snapshotMecanico?.valor || 0) > 0 || Number(mecanico?.comissao_percentual || 0) > 0)) {
          linhasComissao.push({
            perfil: 'Mecanico',
            idFuncionario: snapshotMecanico?.id_funcionario || mecanico?.id || null,
            nome: snapshotMecanico?.nome || mecanico?.nome || 'Mecanico nao identificado',
            numero,
            cliente: c.nome || '-',
            placa: v.placa || '-',
            baseServicos: snapshotMecanico?.baseServicos ?? (snapshotMecanico?.sobreServicos ? totalsOS.valorServicos : 0),
            basePecas: snapshotMecanico?.basePecas ?? (snapshotMecanico?.sobrePecas ? totalsOS.valorPecas : 0),
            percentual: snapshotMecanico?.percentual || 0,
            valor: Number(snapshotMecanico?.valor || 0),
            data: dataBase,
          })
        }

        if ((atendente || snapshotAtendente) && (Number(snapshotAtendente?.valor || 0) > 0 || Number(atendente?.comissao_percentual || 0) > 0)) {
          linhasComissao.push({
            perfil: 'Atendente',
            idFuncionario: snapshotAtendente?.id_funcionario || atendente?.id || null,
            nome: snapshotAtendente?.nome || atendente?.nome || 'Atendente nao identificado',
            numero,
            cliente: c.nome || '-',
            placa: v.placa || '-',
            baseServicos: snapshotAtendente?.baseServicos ?? (snapshotAtendente?.sobreServicos ? totalsOS.valorServicos : 0),
            basePecas: snapshotAtendente?.basePecas ?? (snapshotAtendente?.sobrePecas ? totalsOS.valorPecas : 0),
            percentual: snapshotAtendente?.percentual || 0,
            valor: Number(snapshotAtendente?.valor || 0),
            data: dataBase,
          })
        }
      })

      // O filtro corta a LINHA, nao a OS: numa OS com mecanico e atendente, so a
      // comissao do selecionado entra, e os totais fecham com a tabela.
      const linhasDoFiltro = funcionarioSel
        ? linhasComissao.filter(item => item.idFuncionario === funcionarioSel)
        : linhasComissao

      const totalComissao = linhasDoFiltro.reduce((s, item) => s + item.valor, 0)
      const totalMecanicos = linhasDoFiltro.filter(item => item.perfil === 'Mecanico').reduce((s, item) => s + item.valor, 0)
      const totalAtendentes = linhasDoFiltro.filter(item => item.perfil === 'Atendente').reduce((s, item) => s + item.valor, 0)
      const profissionais = new Set(linhasDoFiltro.map(item => item.idFuncionario || `${item.perfil}:${item.nome}`)).size
      const osComComissao = new Set(linhasDoFiltro.map(item => item.numero)).size

      return {
        titulo: 'Comissoes no Periodo',
        totais: [
          { label: 'O.S. Concluidas', valor: funcionarioSel ? osComComissao : concluidas.length },
          { label: 'Profissionais', valor: profissionais },
          { label: 'Total Comissoes', valor: formatCurrency(totalComissao) },
          { label: 'Mecanicos', valor: formatCurrency(totalMecanicos) },
          { label: 'Atendentes', valor: formatCurrency(totalAtendentes) },
        ],
        colunas: ['Profissional', 'Perfil', 'O.S.', 'Cliente', 'Placa', 'Base Serv.', 'Base Pecas', '%', 'Comissao', 'Data'],
        linhas: [...linhasDoFiltro]
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
  // Posicao de estoque nao passa por OS, logo nao tem funcionario responsavel.
  const aceitaFiltroFuncionario = tipoSel !== 'estoque'
  const funcionarioAtivo = funcionarios.find(f => f.id === funcionarioSel) || null
  const sufixoArquivo = funcionarioAtivo
    ? `_${funcionarioAtivo.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}`
    : ''

  const exportarCSV = () => {
    const rows = [dados.colunas, ...dados.linhas]
    const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tipoSel}${sufixoArquivo}_${dataInicio}_${dataFim}.csv`
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

      <section className={`stagger-2 ${css.tipos}`}>
        {TIPOS.map(t => {
          const CardIcon = t.icon
          return (
            <GlassPanel
              key={t.id}
              className={`metric-card ${css.cardTipo}${tipoSel === t.id ? ` ${css.cardTipoAtivo}` : ''}`}
              onClick={() => setTipoSel(t.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setTipoSel(t.id)}
            >
              <CardIcon size={20} color={tipoSel === t.id ? 'var(--neon-orange)' : 'var(--text-secondary)'} className={css.cardIcone} />
              <div className={`${css.cardLabel}${tipoSel === t.id ? ` ${css.cardLabelAtivo}` : ''}`}>{t.label}</div>
              <div className={css.cardDesc}>{t.desc}</div>
            </GlassPanel>
          )
        })}
      </section>

      <GlassPanel className="panel stagger-3">
        <div className={css.filtros}>
          <div className={css.filtrosCampos}>
            <div className={`form-group ${css.campo}`}>
              <label>Data Inicio</label>
              <input type="date" className="form-control" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div className={`form-group ${css.campo}`}>
              <label>Data Fim</label>
              <input type="date" className="form-control" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            <div className={`form-group ${css.campo} ${css.campoFuncionario}`}>
              <label htmlFor="filtro-funcionario">Funcionario</label>
              <select
                id="filtro-funcionario"
                className="form-control"
                value={funcionarioSel}
                onChange={e => setFuncionarioSel(e.target.value)}
                disabled={!aceitaFiltroFuncionario}
                title={aceitaFiltroFuncionario ? undefined : 'A posicao de estoque nao depende de funcionario.'}
              >
                <option value="">Todos os funcionarios</option>
                {funcionarios.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.nome}{f.cargo ? ` - ${f.cargo}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className={`btn-secondary ${css.btnExportar}`} onClick={exportarCSV}>
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </GlassPanel>

      <GlassPanel className="panel stagger-4">
        <div className={`panel-header ${css.panelHeader}`}>
          <h3><Icon size={18} className={css.tituloIcone} />{dados.titulo}{funcionarioAtivo && aceitaFiltroFuncionario ? ` - ${funcionarioAtivo.nome}` : ''}</h3>
        </div>

        {dados.totais.length > 0 && (
          <div className={css.totais}>
            {dados.totais.map((t, i) => (
              <div key={i} className={css.total}>
                <div className={css.totalLabel}>{t.label}</div>
                <div className={css.totalValor}>{t.valor}</div>
              </div>
            ))}
          </div>
        )}

        {dados.linhas.length === 0 ? (
          <div className={css.vazio}>Nenhum dado encontrado para o periodo selecionado.</div>
        ) : (
          <div className="tech-table-container">
            <table className="tech-table">
              <thead><tr>{dados.colunas.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
              <tbody>
                {dados.linhas.map((linha, i) => (
                  <tr key={i}>{linha.map((cel, j) => <td key={j} data-label={dados.colunas[j]}>{cel}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </div>
  )
}
