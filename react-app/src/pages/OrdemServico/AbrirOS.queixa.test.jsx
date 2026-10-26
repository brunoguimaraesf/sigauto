// @vitest-environment jsdom
// RN15: queixa com no minimo 10 caracteres (fronteira 9/10, espacos nao contam).
// RN16: a O.S. sai da tela com status Aberta.
// A tela antecipa a mensagem e a migracao 34 repete a barreira no banco.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AbrirOS } from './AbrirOS'
import { useDatabase } from '../../hooks/useDatabase'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

let addOrdemServico
let alerta

beforeEach(() => {
  addOrdemServico = vi.fn().mockResolvedValue({ numero_os: 42 })
  alerta = vi.spyOn(window, 'alert').mockImplementation(() => {})
  useDatabase.mockReturnValue({
    clientes: [{ id: 'c1', nome: 'João Silva', cpf_cnpj: '123.456.789-09' }],
    veiculos: [],
    funcionarios: [{ id: 'f2', nome: 'Ana', cargo: 'atendente', id_usuario: 'u2' }],
    currentUserId: 'u2',
    addCliente: vi.fn(),
    addVeiculo: vi.fn().mockResolvedValue({ id: 'v-novo', placa: 'QUE1X15', marca: 'Fiat', modelo: 'Uno' }),
    addOrdemServico,
  })
})

afterEach(() => alerta.mockRestore())

async function abrirComQueixa(queixa) {
  render(<MemoryRouter><AbrirOS /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText(/Buscar cliente por nome/i), { target: { value: 'joao' } })
  fireEvent.click(screen.getByText('João Silva'))
  fireEvent.click(screen.getAllByRole('button', { name: '+ Novo' }).at(-1))
  fireEvent.change(screen.getByPlaceholderText('Placa *'), { target: { value: 'QUE1X15' } })
  fireEvent.change(screen.getByPlaceholderText('Marca *'), { target: { value: 'Fiat' } })
  fireEvent.change(screen.getByPlaceholderText('Modelo *'), { target: { value: 'Uno' } })
  fireEvent.change(screen.getByPlaceholderText(/Descreva a queixa/i), { target: { value: queixa } })
  fireEvent.click(screen.getByRole('button', { name: /Confirmar Abertura/i }))
}

describe('Abrir O.S. — RN15 e RN16', () => {
  it('recusa queixa de 9 caracteres sem gravar nada', async () => {
    await abrirComQueixa('123456789')
    await waitFor(() => expect(alerta).toHaveBeenCalledWith(expect.stringMatching(/10 caracteres/)))
    expect(addOrdemServico).not.toHaveBeenCalled()
  })

  it('nao conta espacos das pontas: 9 caracteres uteis entre espacos sao recusados', async () => {
    await abrirComQueixa('   123456789    ')
    await waitFor(() => expect(alerta).toHaveBeenCalled())
    expect(addOrdemServico).not.toHaveBeenCalled()
  })

  it('aceita exatamente 10 caracteres e envia a O.S. com status Aberta', async () => {
    await abrirComQueixa('1234567890')
    await waitFor(() => expect(addOrdemServico).toHaveBeenCalledTimes(1))
    expect(addOrdemServico.mock.calls[0][0]).toMatchObject({ descricao: '1234567890', status: 'aberta' })
    expect(alerta).not.toHaveBeenCalled()
  })
})
