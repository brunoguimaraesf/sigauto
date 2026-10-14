// Gerador UNICO do documento da O.S. (RF05). Salvar e imprimir consomem o
// mesmo jsPDF, entao os dois produzem o mesmo documento. Roda so no navegador,
// com dados que o usuario ja tem permissao de ver — nada vai para o backend.
import jsPDF from 'jspdf'
import * as pluginAutoTable from 'jspdf-autotable'
import { calcOSTotals, formatCurrency, getLineTotal } from './osFinance'
import { formatarEndereco } from './endereco'
import { maskCNPJ } from './masks'
import { statusOSLabel } from './os'

// O jspdf-autotable e publicado em CJS: dependendo de como o bundler resolve o
// interop, o `default` chega como funcao, como namespace ou nao chega — foi o
// "autoTable is not a function" em producao. Resolve na ordem: funcao exportada,
// metodo no documento (plugin ja aplicado) e, por fim, applyPlugin.
function desenharTabela(doc, opcoes) {
  const mod = pluginAutoTable
  const fn = typeof mod === 'function' ? mod : (mod?.default ?? mod?.autoTable)
  if (typeof fn === 'function') return fn(doc, opcoes)
  if (typeof doc.autoTable === 'function') return doc.autoTable(opcoes)
  if (typeof mod?.applyPlugin === 'function') {
    mod.applyPlugin(jsPDF)
    if (typeof doc.autoTable === 'function') return doc.autoTable(opcoes)
  }
  throw new Error('Plugin de tabelas do PDF (jspdf-autotable) nao carregou.')
}

export const ERRO_OFICINA_AUSENTE = 'CONFIGURACAO_OFICINA_AUSENTE'

export class ErroDocumentoOS extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ErroDocumentoOS'
    this.code = code
  }
}

export const PAGAMENTO_LABEL = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  boleto: 'Boleto',
  a_definir: 'A definir',
}

const CONCLUIDA = new Set(['concluida', 'Concluído'])
const CANCELADA = 'cancelada'

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100

// O banco NAO guarda desconto (ordem_servico so tem valor_total — divergencia
// registrada no DER). Na O.S. concluida o desconto e o que separa o subtotal
// dos itens do valor final persistido. Quem acabou de encerrar passa o
// desconto explicito, com o percentual escolhido na tela.
export function resumoFinanceiroOS(os, { descontoValor, descontoPercentual } = {}) {
  const { valorServicos, valorPecas, valorTotal: subtotal } = calcOSTotals(os)
  let desconto = 0
  let valorFinal = subtotal

  if (Number.isFinite(descontoValor)) {
    desconto = Math.min(arred(descontoValor), subtotal)
    valorFinal = arred(subtotal - desconto)
  } else if (CONCLUIDA.has(os?.status) && Number(os?.valor_total) > 0) {
    valorFinal = arred(os.valor_total)
    desconto = Math.max(0, arred(subtotal - valorFinal))
  }

  return {
    valorServicos: arred(valorServicos),
    valorPecas: arred(valorPecas),
    subtotal: arred(subtotal),
    descontoValor: desconto,
    descontoPercentual: desconto > 0 && Number.isFinite(descontoPercentual) ? descontoPercentual : null,
    valorFinal,
  }
}

const dataISO = (d) => {
  const data = d instanceof Date ? d : new Date(d)
  const pad = (n) => String(n).padStart(2, '0')
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`
}

const numeroOS = (os) => String(os?.numero_os || os?.id?.slice(-6)?.toUpperCase() || 'sem-numero')

export const nomeArquivoOS = (os, emitidoEm = new Date()) => `OS-${numeroOS(os)}-${dataISO(emitidoEm)}.pdf`

const dataHora = (valor) => {
  if (!valor) return null
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Placeholders gravados pelo cadastro rapido nao sao dado do cliente.
const valido = (v) => {
  if (v === undefined || v === null) return false
  const t = String(v).trim()
  return t !== '' && !/^n[aã]o informad[oa]$/i.test(t)
}
const documentoCliente = (doc) => (valido(doc) && !String(doc).startsWith('SC') && !/^0{3}\.0{3}\.0{3}-0{2}$/.test(doc) ? doc : null)

const FORMATOS_IMAGEM = { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WEBP' }

// Converte o Blob do bucket privado para Data URL. Logo indisponivel nao
// impede a emissao: devolve null e o documento sai so com o nome.
export async function carregarLogoDataUrl(baixarLogo, path) {
  if (!path || typeof baixarLogo !== 'function') return null
  try {
    const blob = await baixarLogo(path)
    if (!blob) return null
    return await new Promise((resolve, reject) => {
      const leitor = new FileReader()
      leitor.onload = () => resolve(leitor.result)
      leitor.onerror = () => reject(leitor.error)
      leitor.readAsDataURL(blob)
    })
  } catch (error) {
    console.warn('Logotipo indisponivel; a O.S. sera emitida sem imagem.', error)
    return null
  }
}

// Paleta de impressao: fundo branco (economiza tinta), texto escuro e o
// laranja da marca so como destaque.
const COR = {
  laranja: [232, 89, 12],
  texto: [33, 33, 38],
  suave: [96, 96, 108],
  caixa: [245, 245, 247],
  linha: [210, 210, 216],
  vermelho: [185, 28, 28],
  aviso: [146, 64, 14],
}

const MARGEM = 14
const RODAPE_ALTURA = 20
const ASSINATURA_ALTURA = 34

export function criarDocumentoOS({
  os, cliente = {}, veiculo = {}, equipe = {}, oficina, logoDataUrl = null,
  emitidoEm = new Date(), desconto = {}, formaPagamento, observacoesFinais,
}) {
  if (!oficina) {
    throw new ErroDocumentoOS(
      ERRO_OFICINA_AUSENTE,
      'Cadastre os dados da oficina (menu Oficina) antes de emitir a O.S.',
    )
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const larg = doc.internal.pageSize.getWidth()
  const alt = doc.internal.pageSize.getHeight()
  const limiteY = alt - RODAPE_ALTURA
  const util = larg - MARGEM * 2
  let y = 12

  const fonte = (tamanho, estilo = 'normal', cor = COR.texto) => {
    doc.setFont('helvetica', estilo)
    doc.setFontSize(tamanho)
    doc.setTextColor(...cor)
  }
  const garantirEspaco = (altura) => {
    if (y + altura > limiteY) {
      doc.addPage()
      y = 16
    }
  }

  // ── Cabecalho: oficina a esquerda, identificacao da O.S. a direita ──
  let textoX = MARGEM
  if (logoDataUrl) {
    try {
      const formato = FORMATOS_IMAGEM[logoDataUrl.slice(5, logoDataUrl.indexOf(';'))] || 'PNG'
      const props = doc.getImageProperties(logoDataUrl)
      const escala = Math.min(32 / props.width, 20 / props.height)
      const w = props.width * escala
      const h = props.height * escala
      doc.addImage(logoDataUrl, formato, MARGEM, y, w, h)
      textoX = MARGEM + w + 5
    } catch (error) {
      console.warn('Logotipo nao pode ser desenhado; seguindo sem imagem.', error)
    }
  }

  const colunaDireitaX = larg - MARGEM
  const larguraOficina = colunaDireitaX - 62 - textoX
  fonte(13, 'bold')
  doc.text(doc.splitTextToSize(oficina.nome_fantasia, larguraOficina), textoX, y + 5)
  const linhasOficina = [
    oficina.razao_social,
    oficina.cnpj ? `CNPJ ${maskCNPJ(oficina.cnpj)}` : null,
    [oficina.telefone, oficina.email].filter(valido).join(' · '),
    formatarEndereco(oficina),
  ].filter(valido)
  fonte(8, 'normal', COR.suave)
  let yOficina = y + 10
  for (const linha of linhasOficina) {
    const partes = doc.splitTextToSize(linha, larguraOficina)
    doc.text(partes, textoX, yOficina)
    yOficina += partes.length * 3.6
  }

  const status = os?.status
  fonte(8, 'bold', COR.suave)
  doc.text('ORDEM DE SERVIÇO', colunaDireitaX, y + 3, { align: 'right' })
  fonte(15, 'bold', COR.laranja)
  doc.text(`O.S. Nº ${numeroOS(os)}`, colunaDireitaX, y + 10, { align: 'right' })
  fonte(8.5, 'bold', status === CANCELADA ? COR.vermelho : COR.texto)
  doc.text(`Status: ${statusOSLabel(status)}`, colunaDireitaX, y + 15, { align: 'right' })
  fonte(7.5, 'normal', COR.suave)
  const datas = [
    `Abertura: ${dataHora(os?.data_abertura) || 'não informada'}`,
    ...(dataHora(os?.data_encerramento) ? [`Encerramento: ${dataHora(os.data_encerramento)}`] : []),
    `Emissão: ${dataHora(emitidoEm)}`,
  ]
  datas.forEach((linha, i) => doc.text(linha, colunaDireitaX, y + 19.5 + i * 3.6, { align: 'right' }))

  y = Math.max(yOficina, y + 19.5 + datas.length * 3.6) + 1
  doc.setDrawColor(...COR.laranja)
  doc.setLineWidth(0.6)
  doc.line(MARGEM, y, larg - MARGEM, y)
  y += 5

  // ── Aviso de situacao: cancelada ou valores ainda nao fechados ──
  if (status === CANCELADA) {
    doc.setFillColor(254, 226, 226)
    doc.rect(MARGEM, y, util, 8, 'F')
    fonte(9, 'bold', COR.vermelho)
    doc.text('O.S. CANCELADA — documento sem valor de cobrança', larg / 2, y + 5.3, { align: 'center' })
    y += 12
  } else if (!CONCLUIDA.has(status)) {
    doc.setFillColor(254, 243, 199)
    doc.rect(MARGEM, y, util, 8, 'F')
    fonte(8.5, 'bold', COR.aviso)
    doc.text(`O.S. ${statusOSLabel(status).toLowerCase()} — valores parciais, sujeitos a alteração até o encerramento`, larg / 2, y + 5.3, { align: 'center' })
    y += 12
  }

  // ── Cliente e veiculo, lado a lado ──
  const caixa = (titulo, linhas, x, w, inicioY) => {
    fonte(8.5)
    const quebradas = linhas.flatMap(l => doc.splitTextToSize(l, w - 8))
    const altura = 9 + quebradas.length * 4 + 2
    doc.setFillColor(...COR.caixa)
    doc.roundedRect(x, inicioY, w, altura, 1.5, 1.5, 'F')
    fonte(7.5, 'bold', COR.laranja)
    doc.text(titulo.toUpperCase(), x + 4, inicioY + 5)
    fonte(8.5)
    quebradas.forEach((l, i) => doc.text(l, x + 4, inicioY + 10 + i * 4))
    return inicioY + altura
  }

  const docCliente = documentoCliente(cliente.cpf_cnpj)
  const enderecoCliente = formatarEndereco(cliente.endereco_estruturado, cliente.endereco)
  const linhasCliente = [
    `Nome: ${valido(cliente.nome) ? cliente.nome : 'não informado'}`,
    ...(docCliente ? [`CPF/CNPJ: ${docCliente}`] : []),
    ...(valido(cliente.telefone) ? [`Telefone: ${cliente.telefone}`] : []),
    ...(valido(cliente.email) ? [`E-mail: ${cliente.email}`] : []),
    ...(valido(enderecoCliente) ? [`Endereço: ${enderecoCliente}`] : []),
  ]
  const descricaoVeiculo = [veiculo.marca, veiculo.modelo, veiculo.ano].filter(valido).join(' ')
  const linhasVeiculo = [
    `Placa: ${valido(veiculo.placa) ? veiculo.placa : 'não informada'}`,
    ...(descricaoVeiculo ? [`Veículo: ${descricaoVeiculo}`] : []),
    ...(valido(veiculo.cor) ? [`Cor: ${veiculo.cor}`] : []),
    ...(Number(os?.km_entrada) > 0 ? [`KM de entrada: ${Number(os.km_entrada).toLocaleString('pt-BR')} km`] : []),
  ]
  const larguraCaixa = (util - 6) / 2
  garantirEspaco(40)
  y = Math.max(
    caixa('Cliente', linhasCliente, MARGEM, larguraCaixa, y),
    caixa('Veículo', linhasVeiculo, MARGEM + larguraCaixa + 6, larguraCaixa, y),
  ) + 6

  // ── Atendimento: queixa, diagnostico, observacoes e equipe ──
  const blocos = [
    ['Queixa do cliente', os?.descricao],
    ['Diagnóstico', os?.diagnostico],
    ['Observações', observacoesFinais || os?.observacoes],
  ].filter(([, texto]) => valido(texto))
  for (const [titulo, texto] of blocos) {
    fonte(8.5)
    const linhas = doc.splitTextToSize(String(texto), util)
    garantirEspaco(6 + linhas.length * 4)
    fonte(7.5, 'bold', COR.laranja)
    doc.text(titulo.toUpperCase(), MARGEM, y)
    fonte(8.5)
    doc.text(linhas, MARGEM, y + 4.5)
    y += 6 + linhas.length * 4
  }
  garantirEspaco(8)
  fonte(8.5)
  doc.text(
    `Mecânico: ${valido(equipe.mecanico?.nome) ? equipe.mecanico.nome : 'não informado'}    ·    Atendente: ${valido(equipe.atendente?.nome) ? equipe.atendente.nome : 'não informado'}`,
    MARGEM, y + 1,
  )
  y += 8

  // ── Itens ──
  const estiloTabela = {
    theme: 'grid',
    showHead: 'everyPage',
    margin: { left: MARGEM, right: MARGEM, top: 16, bottom: RODAPE_ALTURA + 2 },
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: COR.texto, lineColor: COR.linha, lineWidth: 0.1 },
    headStyles: { fillColor: [40, 40, 46], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: COR.caixa, textColor: COR.texto, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 32 } },
  }
  const financeiro = resumoFinanceiroOS(os, desconto)
  const tabelaItens = (titulo, itens, rotuloSubtotal, subtotal) => {
    if (!itens?.length) return
    garantirEspaco(18)
    fonte(8, 'bold', COR.laranja)
    doc.text(titulo, MARGEM, y)
    desenharTabela(doc, {
      ...estiloTabela,
      startY: y + 2,
      head: [['Descrição', 'Qtd', 'Valor unitário', 'Total']],
      body: itens.map(item => [
        String(item.descricao || 'Item'),
        String(item.quantidade || 1),
        formatCurrency(item.valor_unitario),
        formatCurrency(getLineTotal(item)),
      ]),
      foot: [['', '', rotuloSubtotal, formatCurrency(subtotal)]],
      showFoot: 'lastPage',
    })
    y = doc.lastAutoTable.finalY + 6
  }
  tabelaItens('SERVIÇOS', os?.servicos_itens, 'Subtotal serviços', financeiro.valorServicos)
  tabelaItens('PEÇAS E PRODUTOS', os?.pecas_itens, 'Subtotal peças', financeiro.valorPecas)
  if (!os?.servicos_itens?.length && !os?.pecas_itens?.length) {
    fonte(8.5, 'italic', COR.suave)
    doc.text('Nenhum serviço ou peça lançado nesta O.S.', MARGEM, y)
    y += 8
  }

  // ── Resumo financeiro: nunca partido entre paginas ──
  const pagamento = formaPagamento ?? os?.forma_pagamento
  const resumo = [
    ['Subtotal serviços', formatCurrency(financeiro.valorServicos)],
    ['Subtotal peças', formatCurrency(financeiro.valorPecas)],
    ['Subtotal geral', formatCurrency(financeiro.subtotal)],
  ]
  if (financeiro.descontoValor > 0) {
    const rotulo = financeiro.descontoPercentual ? `Desconto (${financeiro.descontoPercentual}%)` : 'Desconto'
    resumo.push([rotulo, `- ${formatCurrency(financeiro.descontoValor)}`])
  }
  resumo.push(['VALOR FINAL', formatCurrency(financeiro.valorFinal)])
  if (valido(pagamento)) resumo.push(['Forma de pagamento', PAGAMENTO_LABEL[pagamento] || pagamento])

  const linhaFinal = resumo.findIndex(([r]) => r === 'VALOR FINAL')
  desenharTabela(doc, {
    ...estiloTabela,
    startY: y,
    pageBreak: 'avoid',
    showHead: 'never',
    margin: { ...estiloTabela.margin, left: larg / 2 },
    body: resumo,
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (cel) => {
      if (cel.section === 'body' && cel.row.index === linhaFinal) {
        cel.cell.styles.fontStyle = 'bold'
        cel.cell.styles.fontSize = 10
        cel.cell.styles.textColor = COR.laranja
      }
    },
  })
  y = doc.lastAutoTable.finalY + 10

  // ── Assinaturas: bloco inteiro na mesma pagina ──
  garantirEspaco(ASSINATURA_ALTURA)
  const linhaAssinatura = y + 18
  const metade = (util - 20) / 2
  doc.setDrawColor(...COR.suave)
  doc.setLineWidth(0.2)
  doc.line(MARGEM, linhaAssinatura, MARGEM + metade, linhaAssinatura)
  doc.line(larg - MARGEM - metade, linhaAssinatura, larg - MARGEM, linhaAssinatura)
  fonte(8, 'normal', COR.suave)
  doc.text('Assinatura do cliente', MARGEM, linhaAssinatura + 4.5)
  if (valido(cliente.nome)) doc.text(String(cliente.nome), MARGEM, linhaAssinatura + 8.5)
  doc.text('Responsável pela oficina', larg - MARGEM - metade, linhaAssinatura + 4.5)
  doc.text(String(oficina.nome_fantasia), larg - MARGEM - metade, linhaAssinatura + 8.5)

  // ── Rodape em todas as paginas ──
  const total = doc.internal.getNumberOfPages()
  const rodape = valido(oficina.texto_rodape) ? doc.splitTextToSize(String(oficina.texto_rodape), util).slice(0, 2) : []
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina)
    doc.setDrawColor(...COR.linha)
    doc.setLineWidth(0.2)
    doc.line(MARGEM, alt - RODAPE_ALTURA + 4, larg - MARGEM, alt - RODAPE_ALTURA + 4)
    fonte(7.5, 'normal', COR.suave)
    rodape.forEach((linha, i) => doc.text(linha, MARGEM, alt - RODAPE_ALTURA + 8.5 + i * 3.4))
    fonte(7, 'normal', COR.suave)
    doc.text(`O.S. Nº ${numeroOS(os)} · emitida em ${dataHora(emitidoEm)}`, MARGEM, alt - 6)
    doc.text(`Página ${pagina} de ${total}`, larg - MARGEM, alt - 6, { align: 'right' })
  }

  return doc
}

export async function salvarDocumentoOS(dados) {
  const doc = criarDocumentoOS(dados)
  doc.save(nomeArquivoOS(dados.os, dados.emitidoEm))
}

// Abre o MESMO PDF numa nova guia, no visualizador do navegador (que ja tem
// salvar e imprimir), em vez de baixar o arquivo direto. A URL temporaria e
// revogada por tempo: revogar antes da guia carregar deixaria a aba em branco.
export function abrirDocumentoOS(dados, windowImpl = window) {
  const doc = criarDocumentoOS(dados)
  const url = windowImpl.URL.createObjectURL(doc.output('blob'))
  const guia = windowImpl.open(url, '_blank')
  if (!guia) {
    windowImpl.URL.revokeObjectURL(url)
    throw new Error('O navegador bloqueou a nova guia. Libere os pop-ups deste site e tente novamente.')
  }
  windowImpl.setTimeout(() => windowImpl.URL.revokeObjectURL(url), 60000)
  return guia
}

// Imprime o MESMO PDF do download, num iframe oculto (sem popup). A URL
// temporaria e revogada depois da impressao, com uma rede de seguranca por
// tempo, pois nem todo navegador dispara `afterprint` dentro do iframe.
export function imprimirDocumentoOS(dados, windowImpl = window) {
  const doc = criarDocumentoOS(dados)
  const url = windowImpl.URL.createObjectURL(doc.output('blob'))
  const documento = windowImpl.document
  documento.querySelectorAll('iframe[data-os-impressao]').forEach(el => el.remove())

  const iframe = documento.createElement('iframe')
  iframe.setAttribute('data-os-impressao', '')
  iframe.setAttribute('title', 'Impressão da ordem de serviço')
  iframe.style.position = 'fixed'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.right = '0'
  iframe.style.bottom = '0'

  let limpo = false
  const limpar = () => {
    if (limpo) return
    limpo = true
    windowImpl.URL.revokeObjectURL(url)
    iframe.remove()
  }

  // A rede de seguranca e armada ANTES de anexar o iframe: se o `load` nunca
  // dispara (PDF que o navegador recusa renderizar), a URL seria revogada so
  // no recarregamento da pagina.
  windowImpl.setTimeout(limpar, 60000)

  return new Promise((resolve, reject) => {
    iframe.addEventListener('load', () => {
      try {
        const alvo = iframe.contentWindow
        alvo.addEventListener?.('afterprint', limpar, { once: true })
        alvo.focus()
        alvo.print()
        resolve()
      } catch (error) {
        limpar()
        reject(error)
      }
    }, { once: true })
    iframe.setAttribute('src', url)
    documento.body.appendChild(iframe)
  })
}
