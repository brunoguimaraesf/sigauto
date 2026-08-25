import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
dotenv.config()

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Retenta em erros transitórios do Gemini (503 sobrecarga, 429 rate limit)
// com backoff exponencial, evitando cair no fallback local por soluços do provedor.
export async function comRetry(fn, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn()
    } catch (e) {
      const msg = e?.message || ''
      const transitorio = /\b(503|429)\b|high demand|overloaded|rate limit/i.test(msg)
      if (!transitorio || i === tentativas - 1) throw e
      await new Promise(r => setTimeout(r, 800 * 2 ** i)) // 0.8s, 1.6s
    }
  }
}

// Estrutura real de telas e fluxos do SIGAuto. Sem isto o modelo não tem em que
// se apoiar para responder "como faço X?" e inventa caminhos de menu plausíveis
// (ex.: um menu "Financeiro", que não existe). Mantenha em sincronia com o
// Sidebar (react-app/src/components/Sidebar.jsx) e as rotas do App.jsx.
const MAPA_DO_SISTEMA = `MENUS REAIS (lateral esquerda), com quem enxerga cada um:
- Dashboard — gestor, atendente
- Ordens de Servico — todos os perfis
- Historico — todos os perfis
- Clientes — gestor, atendente
- Veiculos — gestor, atendente
- Servicos — gestor, atendente
- Estoque — gestor, atendente (mostra um contador de itens em alerta ao lado do nome)
- Relatorios — apenas gestor
- Painel IA — apenas gestor
- Funcionarios — apenas gestor
- Usuarios — apenas gestor

FLUXOS PRINCIPAIS:
- Abrir OS: menu "Ordens de Servico" > botao de nova OS. Informe a placa (o sistema busca o veiculo e o cliente), preencha a queixa e confirme. O numero da OS e gerado automaticamente. Restrito a gestor e atendente.
- Atualizar OS: menu "Ordens de Servico" > clique na OS desejada. Ali se lancam servicos e pecas e se muda o status. Todos os perfis.
- Encerrar OS: abra a OS e use a acao de encerrar; informe valor final e forma de pagamento. Restrito a gestor e atendente.
- Entrada/saida de peca: menu "Estoque" > localize o item > acao de entrada ou saida > informe quantidade e motivo.
- Cadastrar cliente ou veiculo: menus "Clientes" e "Veiculos". No cadastro de veiculo, ao digitar a placa o sistema tenta identificar o modelo automaticamente.
- Inativar cliente: menu "Clientes" > localize o cliente > acao de inativar. O sistema verifica se ha OS abertas antes de permitir.
- Ver relatorios: menu "Relatorios" (apenas gestor), com filtro por periodo e exportacao.
- Gerar recomendacoes de IA: menu "Painel IA" (apenas gestor) > botao "Analisar Dados".`

export async function responderChatbot(pergunta, perfilUsuario, historico = [], contexto = null) {
  const systemPrompt = `Você é um assistente virtual do SIGAuto, um sistema de gestão para oficinas mecânicas.
Seu nome é AutoBot. Ajude os usuários com dúvidas sobre o sistema E responda perguntas analíticas sobre os dados da oficina (rankings, médias, totais, faturamento, estoque).
Seja conciso, profissional e amigável. Responda sempre em português brasileiro.
Se o usuário apenas cumprimentar (ex.: "boa noite", "oi"), responda com uma saudação curta e ofereça ajuda — NÃO repita respostas ou cálculos de mensagens anteriores.
Formatação: use parágrafos curtos separados por uma linha em branco; quando listar passos ou itens, use marcadores começando com "- " (um por linha); use **negrito** apenas em termos-chave ou valores. Evite blocos longos de texto corrido.
Quando a pergunta puder ser respondida pelos DADOS ATUAIS abaixo, responda com o número/nome concreto — NÃO apenas diga onde encontrar no app. Nunca invente valores: se os dados não tiverem a resposta, diga que ainda não há registros suficientes.
O perfil do usuário atual é: ${perfilUsuario}.
- gestor: tem acesso total ao sistema
- atendente: gerencia clientes, veículos e OS
- mecanico: visualiza e atualiza OS atribuídas
Adapte suas respostas ao nível de acesso do usuário.

Ao explicar COMO fazer algo no sistema, use exclusivamente os nomes de menu e os passos do MAPA DO SISTEMA abaixo. NUNCA invente nomes de telas, menus ou botões: se o caminho não estiver no mapa, diga que não sabe e sugira o menu mais próximo que exista. Se a tela não for visível para o perfil ${perfilUsuario}, avise que o acesso é restrito em vez de ensinar o caminho.

MAPA DO SISTEMA:
${MAPA_DO_SISTEMA}${contexto ? `\n\nDADOS ATUAIS DA OFICINA (JSON, use para responder com precisão):\n${JSON.stringify(contexto)}` : ''}`

  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-lite-latest',
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: 800 }
  })

  const chatHistory = historico.slice(-10).map(m => ({
    role: m.remetente === 'usuario' ? 'user' : 'model',
    parts: [{ text: m.conteudo }]
  }))
  // O Gemini exige que o histórico comece com uma mensagem 'user'.
  // Remove qualquer mensagem 'model' (assistente) do início da janela.
  while (chatHistory.length && chatHistory[0].role !== 'user') chatHistory.shift()

  const chat = model.startChat({ history: chatHistory })
  const result = await comRetry(() => chat.sendMessage(pergunta))
  return result.response.text()
}

export async function gerarRecomendacoesIA(dadosHistorico) {
  const systemPrompt = `Você é um analista de dados especializado em oficinas mecânicas.
Analise os dados históricos fornecidos e retorne recomendações de negócio em formato JSON.
Retorne APENAS um JSON válido com a seguinte estrutura:
{
  "resumo": "string com resumo executivo",
  "recomendacoes": [
    {
      "titulo": "string",
      "descricao": "string",
      "prioridade": "alta|media|baixa",
      "categoria": "estoque|atendimento|financeiro|operacional"
    }
  ],
  "alertas": [
    {
      "tipo": "string",
      "mensagem": "string",
      "urgencia": "critica|alta|media|baixa"
    }
  ],
  "metricas_destaque": {
    "total_os": number,
    "faturamento_estimado": number,
    "itens_criticos_estoque": number,
    "taxa_crescimento": "string"
  }
}
Não inclua texto fora do JSON. Responda sempre em português brasileiro.`

  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-lite-latest',
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: 2000 }
  })

  const result = await comRetry(() => model.generateContent(
    `Analise estes dados históricos dos últimos 90 dias e gere recomendações:\n\n${JSON.stringify(dadosHistorico, null, 2)}`
  ))

  const texto = result.response.text()
  try {
    const jsonMatch = texto.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return JSON.parse(texto)
  } catch {
    throw new Error('Falha ao interpretar resposta da IA: JSON inválido')
  }
}
