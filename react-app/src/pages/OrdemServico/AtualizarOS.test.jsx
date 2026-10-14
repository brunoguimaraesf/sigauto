// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AtualizarOS } from './AtualizarOS'
import { useDatabase } from '../../hooks/useDatabase'
import { abrirDocumentoOS, imprimirDocumentoOS } from '../../utils/osPdf'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))
vi.mock('../../utils/osPdf', () => ({
  abrirDocumentoOS: vi.fn(() => ({})),
  imprimirDocumentoOS: vi.fn(async () => {}),
  carregarLogoDataUrl: vi.fn(async () => null),
}))

// estoque carregado via supabase no useEffect
vi.mock('../../supabaseClient', () => {
  const q = {}
  q.select = () => q
  q.eq = () => q
  q.order = () => Promise.resolve({ data: [], error: null })
  return { supabaseDb: { from: () => q } }
})

const os = {
  id: 'o1', numero_os: 1001, veiculo_id: 'v1', cliente_id: 'c1', id_usuario: 'u1',
  status: 'aberta', descricao: 'Barulho no motor', diagnostico: '', observacoes: '',
  forma_pagamento: 'a_definir', servicos_itens: [], pecas_itens: [],
}
const baseDb = {
  clientes: [{ id: 'c1', nome: 'João Silva' }],
  veiculos: [{ id: 'v1', cliente_id: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }],
  funcionarios: [],
  servicos: [],
  ordensServico: [os],
  updateOrdemServico: vi.fn(),
}

const renderAt = (id = 'o1') => render(
  <MemoryRouter initialEntries={[`/ordens-servico/${id}`]}>
    <Routes>
      <Route path="/ordens-servico/:id" element={<AtualizarOS />} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => {
  vi.clearAllMocks()
  useDatabase.mockReturnValue(baseDb)
})

describe('Tela de Atualizar O.S.', () => {
  it('renderiza os dados da OS encontrada', () => {
    renderAt('o1')
    expect(screen.getByRole('heading', { name: /O\.S\. #1001/ })).toBeInTheDocument()
    expect(screen.getByText(/Barulho no motor/)).toBeInTheDocument()
  })

  it('mostra aviso quando a OS nao existe', () => {
    renderAt('inexistente')
    expect(screen.getByText(/Ordem de servico nao encontrada/i)).toBeInTheDocument()
  })

  // RF05: o documento da O.S. pode ser salvo ou impresso em qualquer status.
  const oficina = { id: 1, nome_fantasia: 'Oficina Central', cnpj: '11222333000181' }

  it.each(['aberta', 'em_andamento', 'aguardando_peca', 'concluida', 'cancelada'])(
    'oferece Visualizar PDF e Imprimir com a O.S. %s',
    async (status) => {
      const osStatus = { ...os, status }
      useDatabase.mockReturnValue({ ...baseDb, ordensServico: [osStatus], oficina })
      renderAt('o1')

      fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))
      await waitFor(() => expect(abrirDocumentoOS).toHaveBeenCalledTimes(1))
      expect(abrirDocumentoOS.mock.calls[0][0]).toMatchObject({
        os: expect.objectContaining({ id: 'o1', status }),
        cliente: expect.objectContaining({ nome: 'João Silva' }),
        veiculo: expect.objectContaining({ placa: 'ABC1D23' }),
        oficina,
      })

      fireEvent.click(screen.getByRole('button', { name: /Imprimir/i }))
      await waitFor(() => expect(imprimirDocumentoOS).toHaveBeenCalledTimes(1))
    },
  )

  it('avisa quando a oficina ainda nao foi cadastrada, sem gerar o documento', async () => {
    useDatabase.mockReturnValue({ ...baseDb, oficina: null })
    renderAt('o1')
    fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/oficina ainda não foram cadastrados/i)
    expect(abrirDocumentoOS).not.toHaveBeenCalled()
  })
})
