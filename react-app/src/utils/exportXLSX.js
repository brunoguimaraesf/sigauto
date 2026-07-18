// Exportação de planilha usando SheetJS (xlsx)
// Importado dinamicamente para não pesar o bundle inicial

export async function exportarXLSX(nomeArquivo, abas) {
  const XLSX = await import('xlsx')

  const wb = XLSX.utils.book_new()

  abas.forEach(({ nome, colunas, linhas }) => {
    const dados = [colunas, ...linhas]
    const ws = XLSX.utils.aoa_to_sheet(dados)

    // Largura automática das colunas
    const colWidths = colunas.map((col, idx) => {
      const maxLen = Math.max(col.length, ...linhas.map(row => String(row[idx] ?? '').length))
      return { wch: Math.min(maxLen + 2, 40) }
    })
    ws['!cols'] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31))
  })

  XLSX.writeFile(wb, `${nomeArquivo}_${new Date().toISOString().split('T')[0]}.xlsx`)
}

export async function exportarRelatorioXLSX(titulo, colunas, linhas) {
  return exportarXLSX(titulo.replace(/\s/g, '_'), [{ nome: titulo.slice(0, 31), colunas, linhas }])
}
