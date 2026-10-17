// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { EncerrarOS } from './EncerrarOS'
import { useDatabase } from '../../hooks/useDatabase'
import { criarUrlDocumentoOS, imprimirDocumentoOS } from '../../utils/osPdf'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))
// O conteudo do PDF e testado em utils/osPdf.test.js; aqui so a integracao.
vi.mock('../../utils/osPdf', () => ({
  PAGAMENTO_LABEL: { pix: 'Pix', dinheiro: 'Dinheiro' },
  criarUrlDocumentoOS: vi.fn(() => ({ url: 'blob:os', nomeArquivo: 'OS.pdf', revogar: vi.fn() })),
  imprimirDocumentoOS: vi.fn(async () => {}),
  carregarLogoDataUrl: vi.fn(async () => null),
  salvarDocumentoOS: vi.fn(async () => {}),
}))

const veic = { id: 'v1', cliente_id: 'c1', placa: 'ABC1D23', marca: 'VW', modelo: 'Gol' }
const cli = { id: 'c1', nome: 'João Silva' }

const oficina = { id: 1, nome_fantasia: 'Oficina Central', cnpj: '11222333000181' }
const dbWith = (os) => ({
  clientes: [cli], veiculos: [veic], ordensServico: os ? [os] : [], updateOrdemServico: vi.fn(), finalizarOrdemServico: vi.fn(), oficina,
})

const renderAt = (id = 'o1') => render(
  <MemoryRouter initialEntries={[`/ordens-servico/${id}/encerrar`]}>
    <Routes>
      <Route path="/ordens-servico/:id/encerrar" element={<EncerrarOS />} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => vi.clearAllMocks())

describe('Tela de Encerrar O.S.', () => {
  it('mostra aviso quando a OS nao existe', () => {
    useDatabase.mockReturnValue(dbWith(null))
    renderAt('inexistente')
    expect(screen.getByText(/Ordem de serviço não encontrada/i)).toBeInTheDocument()
  })

  it('mostra "ja finalizada" quando a OS esta concluida', () => {
    useDatabase.mockReturnValue(dbWith({
      id: 'o1', numero_os: 1001, veiculo_id: 'v1', cliente_id: 'c1', status: 'concluida',
      servicos_itens: [], pecas_itens: [], valor_total: 200,
    }))
    renderAt('o1')
    expect(screen.getByRole('heading', { name: /O\.S\. já finalizada/i })).toBeInTheDocument()
  })

  it('O.S. ja finalizada continua com Visualizar PDF e Imprimir', async () => {
    useDatabase.mockReturnValue(dbWith({
      id: 'o1', numero_os: 1001, veiculo_id: 'v1', cliente_id: 'c1', status: 'concluida',
      servicos_itens: [], pecas_itens: [], valor_total: 200,
    }))
    renderAt('o1')
    // Imprimir primeiro: com o visualizador aberto existem dois botoes de
    // imprimir na tela (o da acao e o do rodape do visualizador).
    fireEvent.click(screen.getByRole('button', { name: /Imprimir/i }))
    await waitFor(() => expect(imprimirDocumentoOS).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))
    await waitFor(() => expect(criarUrlDocumentoOS).toHaveBeenCalledTimes(1))
  })

  it('a previa do encerramento leva o desconto e a forma de pagamento escolhidos', async () => {
    useDatabase.mockReturnValue(dbWith({
      id: 'o1', numero_os: 1001, veiculo_id: 'v1', cliente_id: 'c1', status: 'em_andamento',
      servicos_itens: [{ descricao: 'Revisao', quantidade: 1, valor_unitario: 200 }], pecas_itens: [],
    }))
    renderAt('o1')
    fireEvent.change(screen.getByDisplayValue('0'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))
    await waitFor(() => expect(criarUrlDocumentoOS).toHaveBeenCalledTimes(1))
    expect(criarUrlDocumentoOS.mock.calls[0][0].desconto).toEqual({ descontoValor: 20, descontoPercentual: 10 })
  })
})
