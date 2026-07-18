import { supabase } from '../services/supabaseClient.js'

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        erro: true,
        codigo: 'TOKEN_AUSENTE',
        mensagem: 'Token de autenticação não fornecido.'
      })
    }

    const token = authHeader.split(' ')[1]

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({
        erro: true,
        codigo: 'TOKEN_INVALIDO',
        mensagem: 'Token inválido ou expirado.'
      })
    }

    const { data: perfil, error: perfilError } = await supabase
      .from('usuario')
      .select('id, perfil, email, ativo')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil) {
      return res.status(401).json({
        erro: true,
        codigo: 'USUARIO_NAO_ENCONTRADO',
        mensagem: 'Usuário não encontrado no sistema.'
      })
    }

    if (!perfil.ativo) {
      return res.status(401).json({
        erro: true,
        codigo: 'USUARIO_INATIVO',
        mensagem: 'Usuário inativo. Contate o administrador.'
      })
    }

    req.user = {
      id: perfil.id,
      perfil: perfil.perfil,
      email: perfil.email
    }

    next()
  } catch (err) {
    next(err)
  }
}
