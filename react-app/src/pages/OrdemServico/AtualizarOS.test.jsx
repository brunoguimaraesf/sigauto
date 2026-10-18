// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AtualizarOS } from './AtualizarOS'
import { useDatabase } from '../../hooks/useDatabase'
import { criarUrlDocumentoOS, imprimirDocumentoOS } from '../../utils/osPdf'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))
vi.mock('../../utils/osPdf', () => ({
  criarUrlDocumentoOS: vi.fn(() => ({ url: 'blob:os', nomeArquivo: 'OS.pdf', revogar: vi.fn() })),
  imprimirDocumentoOS: vi.fn(async () => {}),
  carregarLogoDataUrl: vi.fn(async () => null),
  salvarDocumentoOS: vi.fn(async () => {}),
}))

// estoque carregado via supabase no useEffect. `estoqueMock` e mutavel para os
// testes que precisam de pecas no catalogo do modal.
const mocks = vi.hoisted(() => ({ estoque: [] }))
vi.mock('../../supabaseClient', () => {
  const q = {}
  q.select = () => q
  q.eq = () => q
  q.order = () => Promise.resolve({ data: mocks.estoque, error: null })
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
  deleteOrdemServico: vi.fn(),
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
  mocks.estoque = []
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

      // Imprimir primeiro: com o visualizador aberto existem dois botoes de
      // imprimir na tela (o da acao e o do rodape do visualizador).
      fireEvent.click(screen.getByRole('button', { name: /Imprimir/i }))
      await waitFor(() => expect(imprimirDocumentoOS).toHaveBeenCalledTimes(1))

      fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))
      await waitFor(() => expect(criarUrlDocumentoOS).toHaveBeenCalledTimes(1))
      expect(criarUrlDocumentoOS.mock.calls[0][0]).toMatchObject({
        os: expect.objectContaining({ id: 'o1', status }),
        cliente: expect.objectContaining({ nome: 'João Silva' }),
        veiculo: expect.objectContaining({ placa: 'ABC1D23' }),
        oficina,
      })
    },
  )

  it('avisa quando a oficina ainda nao foi cadastrada, sem gerar o documento', async () => {
    useDatabase.mockReturnValue({ ...baseDb, oficina: null })
    renderAt('o1')
    fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/oficina ainda não foram cadastrados/i)
    expect(criarUrlDocumentoOS).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Lancamento de itens, status e quantidade (RF05/RF10).
// ---------------------------------------------------------------------------

const SERVICO_CATALOGO = { id: 'cat1', codigo: 'SV01', nome: 'Troca de oleo', preco: 150 }
const PECA_ESTOQUE = { id: 'it1', codigo: 'PC01', nome: 'Filtro de oleo', preco_unit: 40, quantidade: 10, unidade: 'un', ativo: true }

const montarDb = (over = {}) => {
  const update = over.updateOrdemServico || vi.fn(async () => ({}))
  const db = { ...baseDb, servicos: [SERVICO_CATALOGO], ...over, updateOrdemServico: update }
  useDatabase.mockReturnValue(db)
  return update
}

// Os tres chips do resumo: [servicos, pecas, total].
const chips = (container) =>
  [...container.querySelectorAll('[class*="chipValor"]')].map(el => el.textContent)

const modalAberto = (container) => container.querySelector('.modal-overlay')

// Abre o modal, escolhe o primeiro item do catalogo e devolve o modal.
const escolherPrimeiroItem = async (container, indiceBotao) => {
  fireEvent.click(screen.getAllByRole('button', { name: /^Adicionar$/ })[indiceBotao])
  const modal = await waitFor(() => {
    const m = modalAberto(container)
    expect(m).toBeTruthy()
    return m
  })
  const linhas = [...modal.querySelectorAll('tbody tr')]
  fireEvent.click(linhas[0].querySelector('button'))
  return modal
}

describe('Atualizar O.S. — lancamento de itens', () => {
  it('lanca um servico e envia servicos_itens e totais no update', async () => {
    const update = montarDb()
    const { container } = render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )

    const modal = await escolherPrimeiroItem(container, 0)
    fireEvent.click(within(modal).getByRole('button', { name: /Salvar selecionados/i }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const [idEnviado, payload] = update.mock.calls[0]
    expect(idEnviado).toBe('o1')
    expect(payload.servicos_itens).toHaveLength(1)
    expect(payload.servicos_itens[0]).toMatchObject({
      catalogo_id: 'cat1', codigo: 'SV01', descricao: 'Troca de oleo', quantidade: 1, valor_unitario: 150,
    })
    expect(payload).toMatchObject({
      servicos_executados: 'Troca de oleo',
      pecas_itens: [],
      valor_servicos: 150, valor_pecas: 0, valor_total: 150, preco_final: 150,
    })
    // Serviços / Peças / Total
    await waitFor(() => expect(chips(container)[2]).toMatch(/150,00/))
    expect(chips(container)[0]).toMatch(/150,00/)
    expect(chips(container)[1]).toMatch(/0,00/)
  })

  it('lanca uma peca do estoque e soma no total', async () => {
    mocks.estoque = [PECA_ESTOQUE]
    const update = montarDb()
    const { container } = render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )
    // Espera o estoque chegar do supabase antes de abrir o modal.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Adicionar$/ })).toHaveLength(2))

    const modal = await escolherPrimeiroItem(container, 1)
    fireEvent.click(within(modal).getByRole('button', { name: /Salvar selecionados/i }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const payload = update.mock.calls[0][1]
    expect(payload.pecas_itens[0]).toMatchObject({
      item_id: 'it1', codigo: 'PC01', descricao: 'Filtro de oleo', quantidade: 1, valor_unitario: 40,
    })
    expect(payload).toMatchObject({ servicos_itens: [], valor_pecas: 40, valor_total: 40 })
    await waitFor(() => expect(chips(container)[1]).toMatch(/40,00/))
  })

  it('remove um servico ja lancado e zera os totais', async () => {
    const comItem = {
      ...os,
      servicos_itens: [{ id: 's1', descricao: 'Troca de oleo', quantidade: 2, valor_unitario: 150 }],
    }
    const update = montarDb({ ordensServico: [comItem] })
    const { container } = render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(chips(container)[2]).toMatch(/300,00/))

    fireEvent.click(screen.getByTitle('Remover item'))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0][1]).toMatchObject({
      servicos_itens: [], valor_servicos: 0, valor_total: 0, servicos_executados: '',
    })
    await waitFor(() => expect(chips(container)[2]).toMatch(/0,00/))
    expect(screen.getAllByText(/Nenhum item lancado/i).length).toBeGreaterThan(0)
  })

  it('mostra o erro do update em role=alert quando a gravacao falha', async () => {
    const update = vi.fn(async () => { throw new Error('violates check constraint "os_servico_quantidade_check"') })
    montarDb({ updateOrdemServico: update })
    const { container } = render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )

    const modal = await escolherPrimeiroItem(container, 0)
    fireEvent.click(within(modal).getByRole('button', { name: /Salvar selecionados/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/os_servico_quantidade_check/)
    // O modal continua aberto para o usuario corrigir.
    expect(modalAberto(container)).toBeTruthy()
  })

  // BUG: `salvarModal` em AtualizarOS.jsx:193-205 e `removerServico` em
  // AtualizarOS.jsx:207-212 aplicam a mudanca no estado local ANTES de esperar
  // o `updateOrdemServico`. Quando a gravacao falha, a mensagem de erro
  // aparece, mas o item continua na tela e os totais ficam adiantados em
  // relacao ao banco: a tela mostra R$ 150,00 numa O.S. que continua vazia.
  // Esperado: desfazer o estado local quando `persistirOS` devolve false.
  it('deve desfazer o item na tela quando o update rejeita', async () => {
    const update = vi.fn(async () => { throw new Error('falha de rede') })
    montarDb({ updateOrdemServico: update })
    const { container } = render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )

    const modal = await escolherPrimeiroItem(container, 0)
    fireEvent.click(within(modal).getByRole('button', { name: /Salvar selecionados/i }))
    await screen.findByRole('alert')

    expect(chips(container)[0]).toMatch(/^R\$\s0,00$/)
  })

  it('mantem_o_modal_aberto_quando_o_update_rejeita', async () => {
    const update = vi.fn(async () => { throw new Error('falha de rede') })
    montarDb({ updateOrdemServico: update })
    const { container } = render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )
    const modal = await escolherPrimeiroItem(container, 0)
    fireEvent.click(within(modal).getByRole('button', { name: /Salvar selecionados/i }))
    await screen.findByRole('alert')
    expect(modalAberto(container)).toBeTruthy()
  })

})

describe('Atualizar O.S. — status e reabertura', () => {
  it('muda o status e envia no update', async () => {
    const update = montarDb()
    render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )

    fireEvent.change(screen.getByDisplayValue('Aberta'), { target: { value: 'em_andamento' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/i }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0][1]).toMatchObject({ status: 'em_andamento' })
    expect(await screen.findByText(/^Salvo$/)).toBeInTheDocument()
  })

  it('O.S. concluida fica bloqueada e so oferece a reabertura', () => {
    montarDb({ ordensServico: [{ ...os, status: 'concluida' }] })
    render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )

    expect(screen.getByText(/está encerrada e não pode ser alterada/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Salvar alterações/i })).toBeDisabled()
    expect(screen.getByDisplayValue('Concluída')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Adicionar$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reabrir O\.S\./i })).toBeInTheDocument()
  })

  it('reabre a O.S. concluida alterando somente o status', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const update = montarDb({ ordensServico: [{ ...os, status: 'concluida' }] })
    render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /Reabrir O\.S\./i }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith('o1', { status: 'em_andamento' })
    vi.unstubAllGlobals()
  })

  it('cancela pelo RPC dedicado sem enviar status ao RPC generico', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const update = vi.fn(async () => ({}))
    const cancelar = vi.fn(async () => ({}))
    montarDb({ updateOrdemServico: update, deleteOrdemServico: cancelar })
    render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )

    fireEvent.change(screen.getByDisplayValue('Aberta'), { target: { value: 'cancelada' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/i }))

    await waitFor(() => expect(cancelar).toHaveBeenCalledWith('o1'))
    expect(update).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('cancelar a confirmacao nao reabre a O.S.', () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const update = montarDb({ ordensServico: [{ ...os, status: 'concluida' }] })
    render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /Reabrir O\.S\./i }))
    expect(update).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('Atualizar O.S. — quantidade do item', () => {
  const abrirComQuantidade = async (valor) => {
    const update = montarDb()
    const { container } = render(
      <MemoryRouter initialEntries={['/ordens-servico/o1']}>
        <Routes><Route path="/ordens-servico/:id" element={<AtualizarOS />} /></Routes>
      </MemoryRouter>
    )
    const modal = await escolherPrimeiroItem(container, 0)
    fireEvent.change(within(modal).getByRole('spinbutton'), { target: { value: valor } })
    return { update, modal, container }
  }

  const totalDaLinha = (modal) => modal.querySelector('td[data-label="Total"]').textContent

  it('quantidade 0 e corrigida para 1 antes de persistir', async () => {
    const { update, modal } = await abrirComQuantidade('0')
    expect(totalDaLinha(modal)).toMatch(/150,00/)

    fireEvent.click(within(modal).getByRole('button', { name: /Salvar selecionados/i }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0][1].servicos_itens[0].quantidade).toBe(1)
    expect(update.mock.calls[0][1].valor_total).toBe(150)
  })

  it('quantidade negativa e corrigida para 1 antes de persistir', async () => {
    const { update, modal } = await abrirComQuantidade('-2')
    expect(totalDaLinha(modal)).toMatch(/150,00/)

    fireEvent.click(within(modal).getByRole('button', { name: /Salvar selecionados/i }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0][1].servicos_itens[0].quantidade).toBe(1)
    expect(update.mock.calls[0][1].valor_total).toBe(150)
  })

  // Texto nao numerico e descartado pelo proprio <input type="number">: o valor
  // vira string vazia, e normalizarQuantidade trata vazio como 1 na EXIBICAO.
  it('texto nao numerico volta a valer 1 na tela e no payload', async () => {
    const { update, modal } = await abrirComQuantidade('abc')
    expect(within(modal).getByRole('spinbutton')).toHaveValue(null)
    expect(totalDaLinha(modal)).toMatch(/150,00/)

    fireEvent.click(within(modal).getByRole('button', { name: /Salvar selecionados/i }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0][1].servicos_itens[0].quantidade).toBe(1)
    expect(update.mock.calls[0][1].valor_total).toBe(150)
  })

  // BUG: a linha acima mostra 1 x R$ 150,00 e o total da O.S. como R$ 150,00,
  // mas grava `quantidade: ''`. A tela e o payload discordam — exatamente o
  // problema que normalizarQuantidade (utils/osFinance.js:19-23) resolveu na
  // exibicao e que a gravacao de AtualizarOS.jsx:126-145 nao aplica: ela envia
  // `nextServicos` cru, sem normalizar a quantidade.
  it('deve gravar a quantidade normalizada que a tela mostra', async () => {
    const { update, modal } = await abrirComQuantidade('abc')
    fireEvent.click(within(modal).getByRole('button', { name: /Salvar selecionados/i }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0][1].servicos_itens[0].quantidade).toBe(1)
  })
})
