// Exportação de PDF usando jsPDF + jspdf-autotable
// Nota: importado dinamicamente para reduzir bundle inicial

export async function exportarOSPDF(os, veiculo, cliente) {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const laranja = [255, 77, 0]
  const cinzaEscuro = [20, 20, 25]
  const cinzaTexto = [138, 139, 148]

  // Header
  doc.setFillColor(...cinzaEscuro)
  doc.rect(0, 0, 210, 40, 'F')
  doc.setFontSize(22)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('SIGAUTO', 14, 22)
  doc.setFontSize(9)
  doc.setTextColor(...cinzaTexto)
  doc.text('Sistema Inteligente de Gestão de Oficinas Automotivas', 14, 30)

  doc.setFontSize(12)
  doc.setTextColor(...laranja)
  doc.text(`ORDEM DE SERVIÇO #${os.numero_os || os.id?.slice(-4)?.toUpperCase() || 'N/A'}`, 210 - 14, 22, { align: 'right' })
  doc.setFontSize(9)
  doc.setTextColor(...cinzaTexto)
  doc.text(new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), 210 - 14, 30, { align: 'right' })

  // Dados do Veículo e Cliente
  doc.setFontSize(10)
  doc.setTextColor(40, 40, 40)
  doc.setFont('helvetica', 'bold')
  doc.text('DADOS DO VEÍCULO', 14, 52)
  doc.setDrawColor(...laranja)
  doc.line(14, 54, 100, 54)

  autoTable(doc, {
    startY: 58,
    margin: { left: 14 },
    tableWidth: 90,
    head: [],
    body: [
      ['Marca/Modelo:', `${veiculo?.marca || ''} ${veiculo?.modelo || ''}`],
      ['Placa:', veiculo?.placa || '—'],
      ['Ano/Cor:', `${veiculo?.ano || '—'} / ${veiculo?.cor || '—'}`],
      ['KM Entrada:', os.km_entrada ? String(os.km_entrada) : '—'],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30, textColor: [...cinzaTexto] }, 1: { cellWidth: 60 } },
    theme: 'plain'
  })

  doc.setFont('helvetica', 'bold')
  doc.text('DADOS DO CLIENTE', 110, 52)
  doc.setDrawColor(...laranja)
  doc.line(110, 54, 196, 54)

  autoTable(doc, {
    startY: 58,
    margin: { left: 110 },
    tableWidth: 90,
    head: [],
    body: [
      ['Cliente:', cliente?.nome || '—'],
      ['Telefone:', cliente?.telefone || '—'],
      ['E-mail:', cliente?.email || '—'],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 22, textColor: [...cinzaTexto] }, 1: { cellWidth: 68 } },
    theme: 'plain'
  })

  const y1 = doc.lastAutoTable.finalY + 8

  // Queixa e Diagnóstico
  if (os.descricao) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...laranja)
    doc.text('QUEIXA DO CLIENTE', 14, y1)
    doc.setTextColor(60, 60, 60)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const linhasQueixa = doc.splitTextToSize(os.descricao, 182)
    doc.text(linhasQueixa, 14, y1 + 6)
  }

  const y2 = (doc.lastAutoTable?.finalY || y1) + (os.descricao ? 20 : 6)

  if (os.diagnostico) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...laranja)
    doc.text('DIAGNÓSTICO TÉCNICO', 14, y2)
    doc.setTextColor(60, 60, 60)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const linhasDiag = doc.splitTextToSize(os.diagnostico, 182)
    doc.text(linhasDiag, 14, y2 + 6)
  }

  // Valor Total
  const yValor = y2 + 40
  doc.setFillColor(...laranja)
  doc.rect(14, yValor, 182, 20, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('VALOR TOTAL DA O.S.:', 20, yValor + 13)
  doc.setFontSize(16)
  const valor = os.valor_total || os.preco_final || 0
  doc.text(`R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 196, yValor + 13, { align: 'right' })

  if (os.forma_pagamento) {
    doc.setFontSize(9)
    doc.setTextColor(...cinzaTexto)
    doc.text(`Forma de pagamento: ${os.forma_pagamento}`, 14, yValor + 28)
  }

  // Rodapé
  const pageHeight = doc.internal.pageSize.height
  doc.setFontSize(8)
  doc.setTextColor(...cinzaTexto)
  doc.text('SIGAUTO — Sistema Inteligente de Gestão de Oficinas | TFC UniRV 2026', 105, pageHeight - 10, { align: 'center' })
  doc.setTextColor(...laranja)
  doc.line(14, pageHeight - 15, 196, pageHeight - 15)

  doc.save(`OS_${os.numero_os || os.id?.slice(-4) || 'export'}_${new Date().toISOString().split('T')[0]}.pdf`)
}

export async function exportarRelatorioPDF(titulo, colunas, linhas, periodo) {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: linhas.length > 10 ? 'landscape' : 'portrait' })
  const laranja = [255, 77, 0]
  const cinzaEscuro = [20, 20, 25]

  doc.setFillColor(...cinzaEscuro)
  doc.rect(0, 0, doc.internal.pageSize.width, 30, 'F')
  doc.setFontSize(18)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('SIGAUTO', 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(...laranja)
  doc.text(titulo.toUpperCase(), doc.internal.pageSize.width - 14, 18, { align: 'right' })

  if (periodo) {
    doc.setFontSize(8)
    doc.setTextColor(138, 139, 148)
    doc.text(`Período: ${periodo}`, 14, 38)
  }

  autoTable(doc, {
    startY: periodo ? 44 : 36,
    head: [colunas],
    body: linhas,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [...laranja], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 248] },
    theme: 'striped'
  })

  const pageHeight = doc.internal.pageSize.height
  doc.setFontSize(8)
  doc.setTextColor(138, 139, 148)
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} | SIGAUTO — TFC UniRV 2026`, doc.internal.pageSize.width / 2, pageHeight - 10, { align: 'center' })

  doc.save(`${titulo.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`)
}
