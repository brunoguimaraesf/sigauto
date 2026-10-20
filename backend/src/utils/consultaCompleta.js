// RF11/RN43: o contexto da IA só pode usar uma consulta completa dos registros.
// O chamador fornece uma consulta nova por página, com count: 'exact' e order('id').
export async function consultarTodasPaginas(criarConsulta, { tamanhoPagina = 500 } = {}) {
  if (typeof criarConsulta !== 'function' || !Number.isSafeInteger(tamanhoPagina) || tamanhoPagina <= 0) {
    throw new Error('Configuração inválida para consultar todas as páginas.')
  }

  const registros = []
  const ids = new Set()
  let totalEsperado

  while (true) {
    const resposta = await criarConsulta().range(registros.length, registros.length + tamanhoPagina - 1)
    if (!resposta || resposta.error) {
      throw new Error('Falha ao consultar todos os registros.', { cause: resposta?.error })
    }

    const { data, count } = resposta
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('A consulta não informou uma contagem exata válida.')
    }
    if (totalEsperado !== undefined && count !== totalEsperado) {
      throw new Error('A contagem dos registros mudou durante a consulta. Tente novamente.')
    }
    totalEsperado = count

    if (!Array.isArray(data) || data.length > tamanhoPagina || registros.length + data.length > totalEsperado) {
      throw new Error('A consulta retornou dados incompatíveis com a contagem de registros.')
    }
    for (const registro of data) {
      if (!registro || typeof registro !== 'object' || Array.isArray(registro) || typeof registro.id !== 'string' || !registro.id.trim()) {
        throw new Error('A consulta retornou um registro sem identificador válido.')
      }
      if (ids.has(registro.id)) {
        throw new Error('A consulta retornou identificadores duplicados entre os registros.')
      }
      ids.add(registro.id)
      registros.push(registro)
    }

    if (registros.length === totalEsperado) return registros
    if (data.length === 0) {
      throw new Error('A consulta foi interrompida antes de retornar todos os registros.')
    }
    // O limite do servidor pode ser menor que o solicitado: avançar pelo recebido.
  }
}
