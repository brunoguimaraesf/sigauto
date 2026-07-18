import { supabase } from '../services/supabaseClient.js'

export async function historico(req, res, next) {
  try {
    const { page = 1, limit = 50, id_item, id_os, tipo, data_inicio, data_fim } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let query = supabase
      .from('movimentacao_estoque')
      .select(`
        *,
        item:id_item(id, codigo, descricao, unidade),
        os:id_os(id, numero_os),
        usuario:id_usuario(id, nome)
      `, { count: 'exact' })
      .order('data_movimentacao', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1)

    if (id_item) query = query.eq('id_item', id_item)
    if (id_os) query = query.eq('id_os', id_os)
    if (tipo) query = query.eq('tipo', tipo)
    if (data_inicio) query = query.gte('data_movimentacao', data_inicio)
    if (data_fim) query = query.lte('data_movimentacao', data_fim)

    const { data, error, count } = await query

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
