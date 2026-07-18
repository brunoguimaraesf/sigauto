import { supabase } from '../services/supabaseClient.js'
import { responderChatbot } from '../services/claudeService.js'

export async function mensagem(req, res, next) {
  try {
    const { pergunta } = req.body

    if (!pergunta || !pergunta.trim()) {
      return res.status(400).json({
        erro: true,
        codigo: 'MENSAGEM_OBRIGATORIA',
        mensagem: 'A mensagem não pode estar vazia.'
      })
    }

    const { data: historico } = await supabase
      .from('mensagem_chatbot')
      .select('papel, conteudo')
      .eq('id_usuario', req.user.id)
      .order('criado_em', { ascending: false })
      .limit(10)

    const historicoOrdenado = (historico || []).reverse()

    const resposta = await responderChatbot(
      pergunta.trim(),
      req.user.perfil,
      historicoOrdenado
    )

    await supabase.from('mensagem_chatbot').insert([
      {
        id_usuario: req.user.id,
        papel: 'usuario',
        conteudo: pergunta.trim()
      },
      {
        id_usuario: req.user.id,
        papel: 'assistente',
        conteudo: resposta
      }
    ])

    return res.status(200).json({
      erro: false,
      dados: { resposta }
    })
  } catch (err) {
    next(err)
  }
}

export async function historico(req, res, next) {
  try {
    const { page = 1, limit = 50 } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const { data, error, count } = await supabase
      .from('mensagem_chatbot')
      .select('*', { count: 'exact' })
      .eq('id_usuario', req.user.id)
      .order('criado_em', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1)

    if (error) throw error

    return res.status(200).json({
      erro: false,
      dados: data,
      paginacao: {
        total: count,
        pagina: parseInt(page),
        limite: parseInt(limit),
        totalPaginas: Math.ceil(count / parseInt(limit))
      }
    })
  } catch (err) {
    next(err)
  }
}
