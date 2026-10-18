// Mapeamento de status de Ordem de Serviço para rótulo e classe de badge.
// Aceita os valores do enum (aberta, em_andamento, ...) e valores legados
// em português ("Pendente", "Em Andamento", "Concluído").

const LABELS = {
  aberta: 'Aberta', Pendente: 'Aberta',
  em_andamento: 'Em Andamento', 'Em Andamento': 'Em Andamento',
  aguardando_peca: 'Aguard. Peça',
  concluida: 'Concluída', 'Concluído': 'Concluída',
  cancelada: 'Cancelada',
}

const CLASSES = {
  aberta: 'status-pending', Pendente: 'status-pending',
  em_andamento: 'status-progress', 'Em Andamento': 'status-progress',
  aguardando_peca: 'status-pending',
  concluida: 'status-done', 'Concluído': 'status-done',
  cancelada: 'status-pending',
}

// Status canonico do enum a partir de qualquer valor gravado, inclusive os
// legados em portugues ("Pendente", "Em Andamento", "Concluido"/"Concluído").
// Serve para FILTRAR: comparar `os.status` cru com o valor do seletor deixava a
// OS historica fora de qualquer filtro.
const CANONICOS = {
  aberta: 'aberta', Pendente: 'aberta',
  em_andamento: 'em_andamento', 'Em Andamento': 'em_andamento',
  aguardando_peca: 'aguardando_peca',
  concluida: 'concluida', Concluido: 'concluida', 'Concluído': 'concluida',
  cancelada: 'cancelada',
}

export function statusOSCanonico(status) {
  return CANONICOS[status] || status || 'aberta'
}

export function statusOSLabel(status) {
  return LABELS[status] || status || 'Aberta'
}

export function statusOSClasse(status) {
  return CLASSES[status] || 'status-pending'
}
