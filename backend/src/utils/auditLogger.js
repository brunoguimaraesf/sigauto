export async function registrarAuditoria(supabase, {
  idUsuario,
  acao,
  tabela,
  idRegistro,
  dadosAntes,
  dadosDepois,
  ipOrigem
}) {
  try {
    await supabase.from('log_auditoria').insert({
      id_usuario: idUsuario,
      acao,
      tabela,
      id_registro: idRegistro,
      dados_antes: dadosAntes,
      dados_depois: dadosDepois,
      ip_origem: ipOrigem
    })
  } catch (err) {
    console.error('[AUDIT] Falha ao registrar auditoria:', err.message)
  }
}
