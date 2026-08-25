// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Chatbot } from './Chatbot'

// buscarResposta e utilitario local (sem rede); nao precisa mock.
beforeEach(() => {})

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
})
