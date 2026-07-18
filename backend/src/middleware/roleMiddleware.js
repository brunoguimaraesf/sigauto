export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.perfil)) {
    return res.status(403).json({
      erro: true,
      codigo: 'SEM_PERMISSAO',
      mensagem: 'Acesso negado para seu perfil.'
    })
  }
  next()
}
