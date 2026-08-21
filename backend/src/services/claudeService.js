import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
dotenv.config()

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Retenta em erros transitórios do Gemini (503 sobrecarga, 429 rate limit)
// com backoff exponencial, evitando cair no fallback local por soluços do provedor.
async function comRetry(fn, tentativas = 3) {
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

export async function responderChatbot(pergunta, perfilUsuario, historico = [], contexto = null) {
  const systemPrompt = `Você é um assistente virtual do SIGAuto, um sistema de gestão para oficinas mecânicas.
Seu nome é AutoBot. Ajude os usuários com dúvidas sobre o sistema E responda perguntas analíticas sobre os dados da oficina (rankings, médias, totais, faturamento, estoque).
Seja conciso, profissional e amigável. Responda sempre em português brasileiro.
Quando a pergunta puder ser respondida pelos DADOS ATUAIS abaixo, responda com o número/nome concreto — NÃO apenas diga onde encontrar no app. Nunca invente valores: se os dados não tiverem a resposta, diga que ainda não há registros suficientes.
O perfil do usuário atual é: ${perfilUsuario}.
- gestor: tem acesso total ao sistema
- atendente: gerencia clientes, veículos e OS
- mecanico: visualiza e atualiza OS atribuídas
Adapte suas respostas ao nível de acesso do usuário.${contexto ? `\n\nDADOS ATUAIS DA OFICINA (JSON, use para responder com precisão):\n${JSON.stringify(contexto)}` : ''}`

  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-lite-latest',
    systemInstruction: systemPrompt
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
