// @vitest-environment jsdom
// RN45 (QA-05): servico precisa de nome preenchido e preco base valido. O
// `required` do HTML aceitava nome so com espacos; o submit do formulario e
// disparado direto para nao depender da validacao nativa do navegador.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Servicos } from './Servicos'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

let addServico
let alerta

beforeEach(() => {
  addServico = vi.fn()
  alerta = vi.spyOn(window, 'alert').mockImplementation(() => {})
  useDatabase.mockReturnValue({ loading: false, servicos: [], addServico, updateServico: vi.fn(), deleteServico: vi.fn() })
})

afterEach(() => alerta.mockRestore())

function enviar(nome, preco) {
  render(<Servicos />)
  fireEvent.click(screen.getByRole('button', { name: /Novo Serviço/i }))
  fireEvent.change(screen.getByPlaceholderText(/Alinhamento 3D/i), { target: { value: nome } })
  fireEvent.change(screen.getByPlaceholderText('Ex: 450'), { target: { value: preco } })
  fireEvent.submit(screen.getByRole('button', { name: /Adicionar ao Catálogo/i }).closest('form'))
}

describe('Servicos — RN45', () => {
  it('recusa nome so com espacos', () => {
    enviar('    ', '100')
    expect(alerta).toHaveBeenCalledWith(expect.stringMatching(/nome/i))
    expect(addServico).not.toHaveBeenCalled()
  })

  it.each([['', 'vazio'], ['-5', 'negativo']])('recusa preco %j (%s)', (preco) => {
    enviar('Alinhamento', preco)
    expect(alerta).toHaveBeenCalledWith(expect.stringMatching(/preço/i))
    expect(addServico).not.toHaveBeenCalled()
  })

  it('aceita nome valido aparando espacos e preco zero', () => {
    enviar('  Cortesia de revisao  ', '0')
    expect(addServico).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Cortesia de revisao', preco: 0 }))
  })
})
