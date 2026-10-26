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

  it('reabre a O.S. finalizada alterando somente o status', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const db = dbWith({
      id: 'o1', numero_os: 1001, veiculo_id: 'v1', cliente_id: 'c1', status: 'concluida',
      servicos_itens: [], pecas_itens: [], valor_total: 200,
    })
    db.updateOrdemServico.mockResolvedValue({})
    useDatabase.mockReturnValue(db)
    renderAt('o1')

    fireEvent.click(screen.getByRole('button', { name: /Reabrir O\.S\./i }))
    await waitFor(() => expect(db.updateOrdemServico).toHaveBeenCalledWith('o1', { status: 'em_andamento' }))
    vi.unstubAllGlobals()
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

// ---------------------------------------------------------------------------
// Encerramento pelo RPC `finalizarOrdemServico` (RF05/RF10).
// A referencia do que o banco aceita esta em
// database/22_baixa_automatica_estoque_os.sql:270-282.
// ---------------------------------------------------------------------------

const osEmAndamento = (over = {}) => ({
  id: 'o1', numero_os: 1001, veiculo_id: 'v1', cliente_id: 'c1', status: 'em_andamento',
  servicos_itens: [{ id: 's1', descricao: 'Revisao', quantidade: 1, valor_unitario: 200 }],
  pecas_itens: [{ id: 'p1', descricao: 'Filtro', quantidade: 1, valor_unitario: 50 }],
  ...over,
})

// Monta o db com um unico espiao de `finalizarOrdemServico`, para poder
// inspecionar o payload exato.
const montarDb = (os, finalizar = vi.fn()) => {
  const db = {
    clientes: [cli], veiculos: [veic], ordensServico: [os], funcionarios: [],
    updateOrdemServico: vi.fn(), finalizarOrdemServico: finalizar, oficina,
  }
  useDatabase.mockReturnValue(db)
  return db
}

const campoDesconto = () => screen.getByRole('spinbutton')
const selectPagamento = () => screen.getByRole('combobox')
const valorFinalExibido = () => screen.getByText('Valor final').nextSibling.textContent

describe('Encerrar O.S. — chamada do RPC finalizarOrdemServico', () => {
  it('envia desconto, forma de pagamento e observacoes no payload do RPC', async () => {
    const finalizar = vi.fn(async () => ({}))
    montarDb(osEmAndamento(), finalizar)
    renderAt('o1')

    fireEvent.change(campoDesconto(), { target: { value: '10' } })
    fireEvent.change(selectPagamento(), { target: { value: 'pix' } })
    fireEvent.change(screen.getByPlaceholderText(/Garantia/i), { target: { value: 'Garantia de 90 dias' } })

    // Passo 1: revisao.
    fireEvent.click(screen.getByRole('button', { name: /^Finalizar O\.S\.$/i }))
    expect(screen.getByText(/Confirmar finalização com/i)).toBeInTheDocument()
    expect(finalizar).not.toHaveBeenCalled()

    // Passo 2: confirmacao.
    fireEvent.click(screen.getByRole('button', { name: /Confirmar finalização/i }))
    await waitFor(() => expect(finalizar).toHaveBeenCalledTimes(1))

    expect(finalizar).toHaveBeenCalledWith('o1', {
      desconto_tipo: 'pct',
      desconto_valor: 25,
      desconto_percentual: 10,
      forma_pagamento: 'pix',
      observacoes_finais: 'Garantia de 90 dias',
    })
    expect(await screen.findByRole('heading', { name: /O\.S\. Finalizada/i })).toBeInTheDocument()
  })

  it('desconto em valor vai como desconto_valor e desconto_percentual nulo', async () => {
    const finalizar = vi.fn(async () => ({}))
    montarDb(osEmAndamento(), finalizar)
    renderAt('o1')

    fireEvent.click(screen.getByRole('button', { name: 'R$' }))
    fireEvent.change(campoDesconto(), { target: { value: '30' } })
    fireEvent.change(selectPagamento(), { target: { value: 'dinheiro' } })
    expect(valorFinalExibido()).toMatch(/220,00/)

    fireEvent.click(screen.getByRole('button', { name: /^Finalizar O\.S\.$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar finalização/i }))

    await waitFor(() => expect(finalizar).toHaveBeenCalledTimes(1))
    expect(finalizar.mock.calls[0][1]).toEqual({
      desconto_tipo: 'valor',
      desconto_valor: 30,
      desconto_percentual: null,
      forma_pagamento: 'dinheiro',
      observacoes_finais: '',
    })
  })

  it('sem forma de pagamento avisa e nao chama o RPC', () => {
    const alerta = vi.fn()
    vi.stubGlobal('alert', alerta)
    const finalizar = vi.fn(async () => ({}))
    montarDb(osEmAndamento(), finalizar)
    const { container } = renderAt('o1')

    // O `required` do <select> barraria o envio num navegador real; o submit
    // direto exercita a guarda de dentro do handler, que e a ultima defesa.
    const form = container.querySelector('form')
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(alerta).toHaveBeenCalledWith('Selecione a forma de pagamento.')
    expect(finalizar).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('desconto em valor acima do subtotal zera a tela e segue para o RPC', async () => {
    const finalizar = vi.fn(async () => ({}))
    montarDb(osEmAndamento(), finalizar)
    renderAt('o1')

    // Em R$ o campo nao tem `max`, entao a validacao nativa deixa passar.
    fireEvent.click(screen.getByRole('button', { name: 'R$' }))
    fireEvent.change(campoDesconto(), { target: { value: '400' } })
    expect(valorFinalExibido()).toMatch(/0,00/)
    expect(campoDesconto()).not.toHaveAttribute('max')

    fireEvent.change(selectPagamento(), { target: { value: 'pix' } })
    fireEvent.click(screen.getByRole('button', { name: /^Finalizar O\.S\.$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar finalização/i }))
    await waitFor(() => expect(finalizar).toHaveBeenCalledTimes(1))
    expect(finalizar.mock.calls[0][1]).toMatchObject({ desconto_tipo: 'valor', desconto_valor: 250 })
  })

  // BUG: desconto em valor maior que o subtotal (250) e enviado ao RPC como
  // 400. O banco recusa com "O desconto nao pode superar o subtotal da OS."
  // (database/22_baixa_automatica_estoque_os.sql:280-282). A tela deveria
  // limitar o desconto ao subtotal, ou bloquear a confirmacao, em vez de
  // mostrar R$ 0,00 e deixar o usuario descobrir o erro no servidor.
  it('deve recusar desconto em valor maior que o subtotal antes do RPC', async () => {
    const finalizar = vi.fn(async () => ({}))
    montarDb(osEmAndamento(), finalizar)
    renderAt('o1')

    fireEvent.click(screen.getByRole('button', { name: 'R$' }))
    fireEvent.change(campoDesconto(), { target: { value: '400' } })
    fireEvent.change(selectPagamento(), { target: { value: 'pix' } })
    fireEvent.click(screen.getByRole('button', { name: /^Finalizar O\.S\.$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar finalização/i }))

    await waitFor(() => expect(finalizar).toHaveBeenCalledTimes(1))
    expect(finalizar.mock.calls[0][1].desconto_valor).toBeLessThanOrEqual(250)
  })

  // Em % o campo tem min=0/max=100: a validacao nativa (jsdom implementa a
  // mesma do navegador) barra o envio, e o RPC nunca recebe 150.
  it('desconto percentual de 150 zera a tela e a validacao nativa barra o envio', () => {
    const finalizar = vi.fn(async () => ({}))
    montarDb(osEmAndamento(), finalizar)
    renderAt('o1')

    fireEvent.change(campoDesconto(), { target: { value: '150' } })
    expect(valorFinalExibido()).toMatch(/0,00/)
    expect(campoDesconto()).toHaveAttribute('max', '100')
    expect(campoDesconto().validity.rangeOverflow).toBe(true)

    fireEvent.change(selectPagamento(), { target: { value: 'pix' } })
    fireEvent.click(screen.getByRole('button', { name: /^Finalizar O\.S\.$/i }))
    // Nem chega a etapa de confirmacao.
    expect(screen.queryByRole('button', { name: /Confirmar finalização/i })).not.toBeInTheDocument()
    expect(finalizar).not.toHaveBeenCalled()
  })

  it('desconto negativo nao reduz o total e a validacao nativa barra o envio', () => {
    const finalizar = vi.fn(async () => ({}))
    montarDb(osEmAndamento(), finalizar)
    renderAt('o1')

    fireEvent.change(campoDesconto(), { target: { value: '-10' } })
    // Math.max(0, ...) impede desconto negativo virar acrescimo.
    expect(valorFinalExibido()).toMatch(/250,00/)
    expect(campoDesconto().validity.rangeUnderflow).toBe(true)

    fireEvent.change(selectPagamento(), { target: { value: 'pix' } })
    fireEvent.click(screen.getByRole('button', { name: /^Finalizar O\.S\.$/i }))
    expect(finalizar).not.toHaveBeenCalled()
  })

  // BUG: a validacao nativa so protege o caminho do clique. O mesmo
  // formulario, enviado por requestSubmit/Enter em navegador com novalidate ou
  // apos um `setConfirmando` ja feito com valor valido, leva 150% ao RPC — que
  // recusa com "Percentual de desconto invalido."
  // (database/22_baixa_automatica_estoque_os.sql:270-273). O componente
  // deveria limitar `descontoNum` a 100, como limita o negativo a 0.
  it('deve limitar o desconto percentual a 100 no proprio estado', () => {
    const finalizar = vi.fn(async () => ({}))
    montarDb(osEmAndamento(), finalizar)
    const { container } = renderAt('o1')

    fireEvent.change(campoDesconto(), { target: { value: '150' } })
    fireEvent.change(selectPagamento(), { target: { value: 'pix' } })
    const form = container.querySelector('form')
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(finalizar).toHaveBeenCalledTimes(1)
    expect(finalizar.mock.calls[0][1].desconto_percentual).toBeLessThanOrEqual(100)
  })

  it('fora da validacao nativa, 150% e limitado a 100 no RPC', () => {
    const finalizar = vi.fn(async () => ({}))
    montarDb(osEmAndamento(), finalizar)
    const { container } = renderAt('o1')

    fireEvent.change(campoDesconto(), { target: { value: '150' } })
    fireEvent.change(selectPagamento(), { target: { value: 'pix' } })
    const form = container.querySelector('form')
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(finalizar).toHaveBeenCalledTimes(1)
    expect(finalizar.mock.calls[0][1]).toMatchObject({ desconto_percentual: 100, desconto_valor: 250 })
  })

  it('erro do RPC aparece em role=alert e a O.S. nao e dada como concluida', async () => {
    const finalizar = vi.fn(async () => { throw new Error('O desconto nao pode superar o subtotal da OS.') })
    montarDb(osEmAndamento(), finalizar)
    renderAt('o1')

    fireEvent.change(selectPagamento(), { target: { value: 'pix' } })
    fireEvent.click(screen.getByRole('button', { name: /^Finalizar O\.S\.$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar finalização/i }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/Falha ao finalizar/i)
    expect(alerta).toHaveTextContent(/desconto nao pode superar o subtotal/i)
    expect(screen.queryByRole('heading', { name: /O\.S\. Finalizada/i })).not.toBeInTheDocument()
    // Volta para a etapa de revisao, com o formulario ainda editavel.
    expect(screen.getByRole('button', { name: /^Finalizar O\.S\.$/i })).toBeInTheDocument()
  })

  it('mantem a precisao de centavos com 3 x 33,33 e 10% de desconto', async () => {
    const finalizar = vi.fn(async () => ({}))
    montarDb(osEmAndamento({
      servicos_itens: [{ id: 's1', descricao: 'Mao de obra', quantidade: 3, valor_unitario: 33.33 }],
      pecas_itens: [],
    }), finalizar)
    renderAt('o1')

    fireEvent.change(campoDesconto(), { target: { value: '10' } })
    // 3 x 33,33 = 99,99 ; 10% = round(9,999, 2) = 10,00 ; final = 89,99
    expect(valorFinalExibido()).toMatch(/89,99/)

    fireEvent.change(selectPagamento(), { target: { value: 'pix' } })
    fireEvent.click(screen.getByRole('button', { name: /^Finalizar O\.S\.$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar finalização/i }))
    await waitFor(() => expect(finalizar).toHaveBeenCalledTimes(1))
    // QA-10: a tela calcula como o RPC, round(subtotal * pct / 100, 2), e envia
    // o mesmo valor que o banco gravara.
    expect(finalizar.mock.calls[0][1].desconto_valor).toBe(10)
  })
})
