// Roteador de respostas locais do chatbot (fallback quando a IA não responde).
// Extraído para permitir testes de verificação.

export const RESPOSTAS_LOCAIS = {
  'os': 'Para abrir uma O.S., acesse **Ordens de Serviço > Nova O.S.**, informe a placa do veículo para busca automática do cliente, preencha a queixa e confirme. O número da OS é gerado automaticamente.',
  'estoque': 'Para registrar entrada de peças, acesse **Estoque**, localize o item e clique em **Entrada**. Informe a quantidade e o motivo.',
  'encerrar': 'Para encerrar uma OS, acesse a lista de O.S., clique em **Encerrar** na OS desejada, informe o valor final e a forma de pagamento, e confirme.',
  'cliente': 'Para inativar um cliente, acesse **Clientes**, localize o cliente e clique em **Inativar**. O sistema verifica se há OS abertas antes de permitir a inativação.',
  'veiculo': 'Veículos são cadastrados em **Veículos > Adicionar Veículo**. Ao digitar a placa, o sistema tenta identificar automaticamente o modelo pela API de placas.',
  'dashboard': 'O Dashboard exibe: OS abertas e em andamento, alertas de estoque, resumo financeiro e entradas recentes.',
  'relatorio': 'Os relatórios estão disponíveis em **Relatórios** (acesso gestor). Você pode filtrar por período e exportar em CSV.',
  'usuario': 'Usuários são gerenciados em **Usuários** (acesso gestor). Perfis disponíveis: Gestor, Atendente e Mecânico.',
}

export function buscarResposta(pergunta) {
  const p = (pergunta || '').toLowerCase()
  // Tópicos específicos primeiro; "OS" por último e só como palavra
  // (evita casar dentro de "reabastecidOS", "atendimentOS", etc.)
  if (p.includes('estoque') || p.includes('peça') || p.includes('peca') || p.includes('reabastec') || p.includes('reposi') || p.includes('entrada') || p.includes('saída') || p.includes('saida')) return RESPOSTAS_LOCAIS['estoque']
  if (p.includes('encerrar') || p.includes('fechar') || p.includes('concluir')) return RESPOSTAS_LOCAIS['encerrar']
  if (p.includes('cliente') || p.includes('inativar')) return RESPOSTAS_LOCAIS['cliente']
  if (p.includes('veiculo') || p.includes('veículo') || p.includes('placa')) return RESPOSTAS_LOCAIS['veiculo']
  if (p.includes('dashboard') || p.includes('painel')) return RESPOSTAS_LOCAIS['dashboard']
  if (p.includes('relatorio') || p.includes('relatório') || p.includes('faturamento')) return RESPOSTAS_LOCAIS['relatorio']
  if (p.includes('usuario') || p.includes('usuário') || p.includes('perfil')) return RESPOSTAS_LOCAIS['usuario']
  if (/\bo\.?s\.?\b/.test(p) || p.includes('ordem') || p.includes('serviço') || p.includes('servico') || p.includes('abrir')) return RESPOSTAS_LOCAIS['os']
  return 'Não encontrei uma resposta específica para sua dúvida. Para suporte técnico, consulte o manual do sistema ou entre em contato com o administrador. Posso ajudar com dúvidas sobre OS, estoque, clientes, veículos, relatórios e usuários.'
}
