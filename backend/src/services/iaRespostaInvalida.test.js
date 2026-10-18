// Painel de IA: o que acontece quando o modelo responde algo que nao e o JSON
// esperado. O contrato aqui e "erro claro", nunca `undefined` chegando ao
// validador de recomendacoes. SDK do Gemini mockado — nenhuma chamada real.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const estado = vi.hoisted(() => ({ texto: '{}', chamadas: 0 }))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      const responder = async () => {
        estado.chamadas += 1
        return { response: { text: () => estado.texto } }
      }
      return { generateContent: responder, startChat: () => ({ sendMessage: responder }) }
    }
  },
}))

const { gerarRecomendacoesIA, responderChatbot } = await import('./iaService.js')

beforeEach(() => {
  estado.texto = '{}'
  estado.chamadas = 0
})

describe('gerarRecomendacoesIA — resposta que nao e JSON', () => {
  it('deve_lancar_erro_claro_quando_a_resposta_vem_vazia', async () => {
    estado.texto = ''

    await expect(gerarRecomendacoesIA({})).rejects.toThrow('Falha ao interpretar resposta da IA: JSON inválido')
  })

  it('deve_lancar_erro_claro_quando_a_resposta_so_tem_espacos', async () => {
    estado.texto = '   \n  '

    await expect(gerarRecomendacoesIA({})).rejects.toThrow('JSON inválido')
  })

  it('deve_lancar_erro_claro_quando_a_resposta_e_prosa_sem_json', async () => {
    estado.texto = 'Desculpe, nao posso analisar esses dados agora.'

    await expect(gerarRecomendacoesIA({})).rejects.toThrow('JSON inválido')
  })

  it('deve_lancar_erro_claro_quando_o_json_esta_truncado_por_MAX_TOKENS', async () => {
    estado.texto = '{"resumo":"ok","recomendacoes":[{"titulo":"Repor filtro'

    await expect(gerarRecomendacoesIA({})).rejects.toThrow('JSON inválido')
  })

  it('nao_aceita_objeto_interno_quando_o_json_raiz_esta_truncado', async () => {
    estado.texto = '{"resumo":"ok","recomendacoes":[{"titulo":"Repor filtro"}]'

    await expect(gerarRecomendacoesIA({})).rejects.toThrow('JSON inválido')
  })

  it('deve_rejeitar_array_no_lugar_do_objeto_esperado', async () => {
    estado.texto = '[{"titulo":"x"}]'

    await expect(gerarRecomendacoesIA({})).rejects.toThrow('JSON inválido')
  })

  it('deve_rejeitar_json_literal_null', async () => {
    estado.texto = 'null'

    await expect(gerarRecomendacoesIA({})).rejects.toThrow('JSON inválido')
  })

  it('nunca_resolve_com_undefined', async () => {
    for (const texto of ['', 'texto solto', '```', '{']) {
      estado.texto = texto
      const resultado = await gerarRecomendacoesIA({}).catch(e => e)
      expect(resultado).toBeInstanceOf(Error)
      expect(resultado.message).toContain('JSON inválido')
    }
  })

  it('extrai_o_json_quando_vem_cercado_de_cerca_markdown', async () => {
    estado.texto = '```json\n{"resumo":"ok","recomendacoes":[],"alertas":[]}\n```'

    await expect(gerarRecomendacoesIA({})).resolves.toMatchObject({ resumo: 'ok' })
  })

  it('aceita_json_valido_seguido_de_texto_com_chaves', async () => {
    estado.texto = '{"resumo":"ok","recomendacoes":[],"alertas":[]}\n\nObservacao: use {chave} com cuidado.'

    await expect(gerarRecomendacoesIA({})).resolves.toMatchObject({ resumo: 'ok' })
  })

  it('texto_antes_do_json_e_tolerado', async () => {
    estado.texto = 'Segue a analise:\n{"resumo":"ok","recomendacoes":[],"alertas":[]}'

    await expect(gerarRecomendacoesIA({})).resolves.toMatchObject({ resumo: 'ok' })
  })
})

describe('responderChatbot — resposta vazia do modelo', () => {
  it('deve_lancar_quando_o_modelo_devolve_string_vazia', async () => {
    estado.texto = ''

    await expect(responderChatbot('oi', 'gestor', [], null)).rejects.toThrow('A IA retornou uma resposta vazia')
  })

  it('deve_lancar_quando_o_modelo_devolve_so_espacos', async () => {
    estado.texto = ' \n\t '

    await expect(responderChatbot('oi', 'gestor', [], null)).rejects.toThrow('A IA retornou uma resposta vazia')
  })

  it('nao_retenta_resposta_vazia_porque_nao_e_erro_transitorio_do_provedor', async () => {
    estado.texto = ''

    await expect(responderChatbot('oi', 'gestor', [], null)).rejects.toThrow()
    expect(estado.chamadas).toBe(1)
  })
})
