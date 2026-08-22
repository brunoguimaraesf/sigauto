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

export function statusOSLabel(status) {
  return LABELS[status] || status || 'Aberta'
}

export function statusOSClasse(status) {
  return CLASSES[status] || 'status-pending'
}
