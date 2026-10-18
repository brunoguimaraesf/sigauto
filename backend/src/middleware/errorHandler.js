function normalizarStatus(...valores) {
  const status = valores.find(valor => (
    Number.isInteger(valor) && valor >= 400 && valor <= 599
  ))
  return status || 500
}

export function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`)
  console.error(err?.stack || err?.message || err)

  const status = normalizarStatus(err?.status, err?.statusCode)
  const codigo = err?.codigo || 'ERRO_INTERNO'
  const mensagemExplicita = typeof err?.mensagem === 'string' && err.mensagem.trim()
    ? err.mensagem
    : null
  const mensagem = mensagemExplicita || (
    status < 500 && typeof err?.message === 'string' && err.message.trim()
      ? err.message
      : 'Erro interno do servidor.'
  )

  return res.status(status).json({
    erro: true,
    codigo,
    mensagem,
    detalhes: process.env.NODE_ENV === 'development' ? {
      stack: err?.stack,
      original: err?.message
    } : undefined
  })
}
