export function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`)
  console.error(err.stack || err.message || err)

  const status = err.status || err.statusCode || 500
  const codigo = err.codigo || 'ERRO_INTERNO'
  const mensagem = err.mensagem || err.message || 'Erro interno do servidor.'

  return res.status(status).json({
    erro: true,
    codigo,
    mensagem,
    detalhes: process.env.NODE_ENV === 'development' ? {
      stack: err.stack,
      original: err.message
    } : undefined
  })
}
