// @vitest-environment jsdom
// O aviso de indisponibilidade é por BOLHA, não global: cada resposta carrega a
// própria procedência. Chatbot.test.jsx cobre o caso simples (uma falha, uma
// resposta boa); aqui ficam as sequências, que é onde um aviso global ou um
// estado de componente passariam no outro arquivo e falhariam neste.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Chatbot, MSG_IA_INDISPONIVEL } from './Chatbot'

const api = { enviarMensagem: vi.fn() }
vi.mock('../../services/api.js', () => ({
  chatbotApi: { enviarMensagem: (...a) => api.enviarMensagem(...a) }
}))

beforeEach(() => {
  api.enviarMensagem.mockReset()
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

function abrir() {
  render(<Chatbot />)
  fireEvent.click(screen.getByRole('button', { name: /Abrir assistente/i }))
}

function perguntar(texto) {
  const campo = screen.getByPlaceholderText(/Digite sua dúvida/i)
  fireEvent.change(campo, { target: { value: texto } })
  fireEvent.keyDown(campo, { key: 'Enter' })
}

/** Quantas bolhas de indisponibilidade existem na conversa. */
const avisos = () => screen.queryAllByText(MSG_IA_INDISPONIVEL)

describe('Chatbot — a procedência acompanha cada resposta', () => {
  it('nao marca a resposta boa que vem depois de uma falha', async () => {
    api.enviarMensagem.mockRejectedValueOnce(Object.assign(new Error('503'), { status: 503 }))
    abrir()
    perguntar('como abrir uma OS?')
    expect(await screen.findByText(MSG_IA_INDISPONIVEL, {}, { timeout: 3000 })).toBeInTheDocument()

    api.enviarMensagem.mockResolvedValueOnce({ dados: { resposta: 'Resposta real da IA.' } })
    perguntar('e como encerrar?')
    expect(await screen.findByText(/Resposta real da IA/i, {}, { timeout: 3000 })).toBeInTheDocument()

    // A bolha antiga continua com o aviso; a nova, não.
    expect(avisos()).toHaveLength(1)
    // E o status volta a Online, porque a última resposta veio da IA.
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('marca as duas respostas quando a IA cai duas vezes seguidas', async () => {
    api.enviarMensagem.mockRejectedValue(Object.assign(new Error('503'), { status: 503 }))
    abrir()

    perguntar('primeira pergunta')
    await waitFor(() => expect(avisos()).toHaveLength(1), { timeout: 3000 })

    perguntar('segunda pergunta')
    await waitFor(() => expect(avisos()).toHaveLength(2), { timeout: 3000 })
  })

  it('a saudacao inicial nunca aparece como indisponivel', () => {
    abrir()
    expect(avisos()).toHaveLength(0)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('limpar a conversa remove o aviso e devolve o status para Online', async () => {
    api.enviarMensagem.mockRejectedValue(Object.assign(new Error('503'), { status: 503 }))
    abrir()
    perguntar('como abrir uma OS?')
    await waitFor(() => expect(avisos()).toHaveLength(1), { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: /Limpar conversa/i }))

    expect(avisos()).toHaveLength(0)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })
})
