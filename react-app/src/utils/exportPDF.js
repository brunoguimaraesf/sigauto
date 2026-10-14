// Exportação de PDF usando jsPDF + jspdf-autotable
// Nota: importado dinamicamente para reduzir bundle inicial

// O documento da O.S. tem gerador unico em ./osPdf.js (salvar e imprimir).

export async function exportarRelatorioPDF(titulo, colunas, linhas, periodo) {
  const { jsPDF } = await import('jspdf')
  const plugin = await import('jspdf-autotable')
  // Mesmo interop do osPdf.js: o default do jspdf-autotable nem sempre chega
  // como funcao depois do bundle.
  const autoTable = typeof plugin === 'function' ? plugin : (plugin?.default ?? plugin?.autoTable)
  if (typeof autoTable !== 'function') throw new Error('Plugin de tabelas do PDF (jspdf-autotable) nao carregou.')

  const doc = new jsPDF({ orientation: linhas.length > 10 ? 'landscape' : 'portrait' })
  const laranja = [232, 89, 12]
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
