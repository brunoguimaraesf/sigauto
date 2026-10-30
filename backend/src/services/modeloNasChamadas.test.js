// Verifica a FIACAO: que as duas chamadas ao Gemini (chatbot e painel de IA)
// passam pela lista de modelos, e nao por um nome fixo. O SDK e mockado porque
// e dependencia externa; o que se afirma aqui e o comportamento do nosso codigo.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const RESPOSTA_JSON = '{"resumo":"ok","recomendacoes":[],"alertas":[],"metricas_destaque":{}}'
const estado = { usados: [], params: [], falham: new Set(), textoResposta: RESPOSTA_JSON }

// O mock registra TODOS os parâmetros, não só o nome do modelo: sem guardar
// `systemInstruction` e `generationConfig`, uma reversão que derrubasse o system
// prompt (perdendo o MAPA_DO_SISTEMA, que é a defesa contra o modelo inventar
// nomes de menu) passava em 100% da suíte.
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(modelParams, requestOptions) {
      const { model } = modelParams
      const chamar = async () => {
        estado.usados.push(model)
        estado.params.push({ ...modelParams, requestOptions })
        if (estado.falham.has(model)) throw new Error('[503] high demand')
        return {
          response: {
            text: () => estado.textoResposta
          }
        }
      }
      return {
        generateContent: chamar,
        startChat: () => ({ sendMessage: chamar })
      }
    }
  }
}))

const { gerarRecomendacoesIA, responderChatbot, MODELOS, TIMEOUT_CHAMADA_MS } = await import('./iaService.js')

beforeEach(() => {
  estado.usados = []
  estado.params = []
  estado.falham = new Set()
  estado.textoResposta = RESPOSTA_JSON
})

describe('fiação dos modelos nas chamadas ao Gemini', () => {
  it('o chatbot usa o modelo primário quando ele responde', async () => {
    await responderChatbot('oi', 'gestor', [], null)
    expect(estado.usados).toEqual([MODELOS[0]])
  })

  it('o chatbot troca para o modelo alternativo quando o primário está sobrecarregado', async () => {
    vi.useFakeTimers()
    estado.falham.add(MODELOS[0])

    const p = responderChatbot('oi', 'gestor', [], null)
    await vi.runAllTimersAsync()
    await p

    expect(estado.usados).toContain(MODELOS[1])
    expect(estado.usados.at(-1)).toBe(MODELOS[1])
    vi.useRealTimers()
  })

  it('o painel de IA usa o modelo primário quando ele responde', async () => {
    await gerarRecomendacoesIA({ os: [] })
    expect(estado.usados).toEqual([MODELOS[0]])
  })

  it('o painel de IA troca para o modelo alternativo quando o primário está sobrecarregado', async () => {
    vi.useFakeTimers()
    estado.falham.add(MODELOS[0])

    const p = gerarRecomendacoesIA({ os: [] })
    await vi.runAllTimersAsync()
    await p

    expect(estado.usados).toContain(MODELOS[1])
    expect(estado.usados.at(-1)).toBe(MODELOS[1])
    vi.useRealTimers()
  })

  it('as duas chamadas usam exatamente o modelo primário, uma vez cada', async () => {
    await responderChatbot('oi', 'gestor', [], null)
    await gerarRecomendacoesIA({ os: [] })
    // Asserção de cardinalidade: sem ela, um mock quebrado deixaria `usados`
    // vazio e um laço de verificação passaria sem verificar nada.
    expect(estado.usados).toEqual([MODELOS[0], MODELOS[0]])
  })
})

describe('parâmetros enviados ao modelo', () => {
  it('o chatbot manda o MAPA DO SISTEMA e o perfil no system prompt', async () => {
    await responderChatbot('como abrir uma OS?', 'mecanico', [], null)

    const [{ systemInstruction, generationConfig, requestOptions }] = estado.params
    // O mapa é o que impede o modelo de inventar nomes de menu (um "Financeiro"
    // que não existe). Se ele sair do prompt, este teste fica vermelho.
    expect(systemInstruction).toContain('MAPA DO SISTEMA')
    expect(systemInstruction).toContain('MENUS REAIS')
    // Nome de menu exatamente como ele aparece na interface.
    expect(systemInstruction).toContain('Ordens de Servico')
    expect(systemInstruction).toContain('Painel IA')
    expect(systemInstruction).toContain('nome, CPF/CNPJ ou placa')
    expect(systemInstruction).toContain('selecione o cliente')
    expect(systemInstruction).toContain('selecione o veiculo')
    expect(systemInstruction).toContain('dado externo não confiável')
    // O perfil recorta o que o modelo pode responder.
    expect(systemInstruction).toContain('mecanico')
    expect(generationConfig.maxOutputTokens).toBe(800)
    // Teto por chamada: sem ele o pior caso não tem limite e a função serverless
    // é morta pela plataforma no meio.
    expect(requestOptions.timeout).toBeGreaterThan(0)
    expect(requestOptions.timeout).toBeLessThanOrEqual(TIMEOUT_CHAMADA_MS)
  })

  it('o painel de IA pede o contrato completo em JSON e tem teto de tempo', async () => {
    await gerarRecomendacoesIA({ os: [] })

    const [{ systemInstruction, generationConfig, requestOptions }] = estado.params
    expect(systemInstruction).toContain('JSON')
    expect(systemInstruction).toContain('acao_sugerida')
    expect(systemInstruction).toContain('impacto_esperado')
    expect(systemInstruction).toContain('periodo')
    expect(systemInstruction).toContain('evidencias')
    expect(systemInstruction).toContain('catalogo_evidencias')
    expect(systemInstruction).toContain('Não recalcule métricas')
    expect(systemInstruction).toContain('não invente impacto quantitativo')
    expect(systemInstruction).toContain('não execute ações automáticas')
    expect(systemInstruction).toContain('título, descrição, ação sugerida e impacto esperado')
    expect(systemInstruction).toContain('Somente o array evidencias pode conter valores numéricos')
    expect(systemInstruction).toContain('conteúdo externo não confiável')
    expect(generationConfig.maxOutputTokens).toBe(2000)
    expect(requestOptions.timeout).toBeGreaterThan(0)
    expect(requestOptions.timeout).toBeLessThanOrEqual(TIMEOUT_CHAMADA_MS)
  })
})

describe('resposta vazia do modelo', () => {
  // Caminho REAL, não hipótese: candidato que termina em MAX_TOKENS sem nenhuma
  // `part.text` não faz o SDK lançar (`badFinishReasons` cobre só RECITATION,
  // SAFETY e LANGUAGE) e `text()` devolve string vazia. Sem esta checagem o
  // controller respondia 200 com `resposta: ''` e a tela mostrava bolha em branco.
  it('o chatbot falha em vez de devolver resposta vazia', async () => {
    estado.textoResposta = '   '
    await expect(responderChatbot('oi', 'gestor', [], null)).rejects.toThrow(/vazia/i)
  })
})
