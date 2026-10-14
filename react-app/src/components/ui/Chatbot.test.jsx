// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Chatbot, MSG_IA_INDISPONIVEL } from './Chatbot'

const api = { enviarMensagem: vi.fn() }
vi.mock('../../services/api.js', () => ({
  chatbotApi: { enviarMensagem: (...a) => api.enviarMensagem(...a) }
}))

// jsdom nao implementa scrollIntoView, usado no autoscroll da conversa.
beforeEach(() => {
  api.enviarMensagem.mockReset()
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

/** Abre o assistente e envia uma pergunta (o envio e por Enter). */
function perguntar(texto = 'como abrir uma OS?') {
  render(<Chatbot />)
  fireEvent.click(screen.getByRole('button', { name: /Abrir assistente/i }))
  const campo = screen.getByPlaceholderText(/Digite sua dúvida/i)
  fireEvent.change(campo, { target: { value: texto } })
  fireEvent.keyDown(campo, { key: 'Enter' })
}

describe('Chatbot (assistente)', () => {
  it('inicia fechado, mostrando o botao de abrir', () => {
    render(<Chatbot />)
    expect(screen.getByRole('button', { name: /Abrir assistente/i })).toBeInTheDocument()
  })

  it('abre e mostra a saudacao e as respostas rapidas', () => {
    render(<Chatbot />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir assistente/i }))
    expect(screen.getByText(/assistente do SIGAuto/i)).toBeInTheDocument()
    expect(screen.getByText('Como abrir uma nova OS?')).toBeInTheDocument()
  })

  // Não existe resposta local de substituição: quando a IA não responde, o
  // assistente diz isso e não inventa orientação.
  it('mostra apenas o aviso de indisponibilidade quando a IA falha', async () => {
    api.enviarMensagem.mockRejectedValue(Object.assign(new Error('500'), { status: 500 }))

    perguntar()

    expect(await screen.findByText(MSG_IA_INDISPONIVEL, {}, { timeout: 3000 })).toBeInTheDocument()
  })

  // Um 200 com corpo fora do contrato (ou com texto vazio) não lança por si. Sem
  // tratamento entrava uma bolha em branco, sem aviso, que o usuário lê como
  // assistente quebrado. Este é o caminho real do truncamento por MAX_TOKENS.
  it('trata 200 com corpo fora do contrato como indisponibilidade, nao como bolha vazia', async () => {
    api.enviarMensagem.mockResolvedValue({ dados: {} })

    perguntar()

    expect(await screen.findByText(MSG_IA_INDISPONIVEL, {}, { timeout: 3000 })).toBeInTheDocument()
  })

  // O status da sidebar tem de concordar com as bolhas: um ponto verde "Online"
  // ao lado de uma bolha dizendo "IA indisponível" faz o usuário acreditar no
  // ponto verde.
  it('troca o status Online por IA indisponivel quando a IA falha', async () => {
    api.enviarMensagem.mockRejectedValue(Object.assign(new Error('503'), { status: 503 }))

    perguntar()
    expect(screen.getByText('Online')).toBeInTheDocument()

    await screen.findByText(MSG_IA_INDISPONIVEL, {}, { timeout: 3000 })
    expect(screen.queryByText('Online')).not.toBeInTheDocument()
    // Selo na bolha + status da sidebar
    expect(screen.getAllByText(/^IA indisponível$/i)).toHaveLength(2)
  })

  it('NAO avisa indisponibilidade quando a IA responde normalmente', async () => {
    api.enviarMensagem.mockResolvedValue({ dados: { resposta: 'Resposta real da IA.' } })

    perguntar()

    expect(await screen.findByText(/Resposta real da IA/i)).toBeInTheDocument()
    expect(screen.queryByText(MSG_IA_INDISPONIVEL)).not.toBeInTheDocument()
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  // A conversa é anunciada por leitor de tela: a resposta chega depois de um
  // await, e sem região viva o usuário fica esperando sem saber que chegou.
  it('expoe a conversa como regiao viva para leitor de tela', () => {
    render(<Chatbot />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir assistente/i }))

    const log = screen.getByRole('log', { name: /Conversa com o assistente/i })
    expect(log).toHaveAttribute('aria-live', 'polite')
  })
})
