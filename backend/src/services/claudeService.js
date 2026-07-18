import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
dotenv.config()

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

export async function responderChatbot(pergunta, perfilUsuario, historico = []) {
  const systemPrompt = `Você é um assistente virtual do SIGAuto, um sistema de gestão para oficinas mecânicas.
Seu nome é AutoBot. Você deve ajudar os usuários com dúvidas sobre o sistema, ordens de serviço, clientes, veículos e estoque.
Seja conciso, profissional e amigável. Responda sempre em português brasileiro.
O perfil do usuário atual é: ${perfilUsuario}.
- gestor: tem acesso total ao sistema
- atendente: gerencia clientes, veículos e OS
- mecanico: visualiza e atualiza OS atribuídas
Adapte suas respostas ao nível de acesso do usuário.`

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt
  })

  const chatHistory = historico.slice(-10).map(m => ({
    role: m.papel === 'usuario' ? 'user' : 'model',
    parts: [{ text: m.conteudo }]
  }))

  const chat = model.startChat({ history: chatHistory })
  const result = await chat.sendMessage(pergunta)
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
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: 2000 }
  })

  const result = await model.generateContent(
    `Analise estes dados históricos dos últimos 90 dias e gere recomendações:\n\n${JSON.stringify(dadosHistorico, null, 2)}`
  )

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
