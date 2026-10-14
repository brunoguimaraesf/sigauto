// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PainelIA, MSG_IA_INDISPONIVEL } from './PainelIA'
import { useDatabase } from '../hooks/useDatabase'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))

const api = { analisar: vi.fn() }
vi.mock('../services/api.js', () => ({
  iaApi: { analisar: (...a) => api.analisar(...a) }
}))

// Não há mock do supabaseClient: a tela não consulta mais o estoque. Essa
// consulta só existia para alimentar a análise local, que foi removida.

beforeEach(() => {
  vi.clearAllMocks()
  api.analisar.mockReset()
  useDatabase.mockReturnValue({ clientes: [{ id: 'c1' }], veiculos: [{ id: 'v1' }], ordensServico: [{ id: 'o1' }] })
})

describe('Painel de IA', () => {
  it('renderiza titulo, aviso consultivo e o botao de analise', () => {
    render(<PainelIA />)
    expect(screen.getByRole('heading', { name: /Painel de Inteligência Artificial/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Analisar Dados/i })).toBeInTheDocument()
    expect(screen.getByText(/car[áa]ter exclusivamente consultivo/i)).toBeInTheDocument()
  })

  it('mostra o estado inicial antes da analise', () => {
    render(<PainelIA />)
    expect(screen.getByRole('heading', { name: /Pronto para Analisar/i })).toBeInTheDocument()
  })
})

// Não existe análise local de contingência. Quando a IA cai, a tela diz isso e
// NÃO exibe número algum: número calculado por regra fixa e número vindo do
// modelo não têm a mesma origem, e exibir um no lugar do outro é pior que não
// exibir painel.
describe('Painel de IA — indisponibilidade da IA', () => {
  const falhar = async () => {
    api.analisar.mockRejectedValue(Object.assign(new Error('500'), { status: 500 }))
    render(<PainelIA />)
    fireEvent.click(screen.getByRole('button', { name: /Analisar Dados/i }))
    return screen.findByText(MSG_IA_INDISPONIVEL, {}, { timeout: 5000 })
  }

  it('avisa que a IA esta indisponivel quando a analise falha', async () => {
    expect(await falhar()).toBeInTheDocument()
  })

  it('NAO exibe resumo, metrica nem barra de confianca quando a IA falha', async () => {
    await falhar()

    expect(screen.queryByText(/Resumo Executivo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Confiança/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ordens de Serviço \(90d\)/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Faturamento Concluído/i)).not.toBeInTheDocument()
    // Nenhum percentual na tela: as barras de confiança exibiam 97%, 88%, 82% e
    // 75%, que eram literais escritos no código.
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument()
  })

  // O aviso aparece depois de um await; sem região viva o usuário clica, espera
  // e não recebe nada.
  it('anuncia o aviso como regiao viva para leitor de tela', async () => {
    await falhar()
    expect(screen.getByRole('status')).toHaveTextContent(/IA indisponível/i)
  })

  // Um 200 sem `dados` tornava `resultado` truthy com objeto vazio: todos os
  // blocos internos são condicionais, e a tela ficava em branco sem aviso.
  it('trata 200 sem analise como indisponibilidade, nao como tela vazia', async () => {
    api.analisar.mockResolvedValue({ erro: false })

    render(<PainelIA />)
    fireEvent.click(screen.getByRole('button', { name: /Analisar Dados/i }))

    expect(await screen.findByText(MSG_IA_INDISPONIVEL, {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('mostra a analise do modelo e nenhum aviso quando a IA responde', async () => {
    api.analisar.mockResolvedValue({
      dados: { resumo: 'Resumo real da IA.', recomendacoes: [], alertas: [], metricas_destaque: {} }
    })

    render(<PainelIA />)
    fireEvent.click(screen.getByRole('button', { name: /Analisar Dados/i }))

    expect(await screen.findByText(/Resumo real da IA/i)).toBeInTheDocument()
    expect(screen.queryByText(MSG_IA_INDISPONIVEL)).not.toBeInTheDocument()
  })

  // Uma falha não pode deixar resíduo: ao reanalisar com sucesso, o aviso sai.
  it('remove o aviso quando a analise seguinte tem sucesso', async () => {
    await falhar()

    api.analisar.mockResolvedValue({
      dados: { resumo: 'Agora respondeu.', recomendacoes: [], alertas: [], metricas_destaque: {} }
    })
    fireEvent.click(screen.getByRole('button', { name: /Analisar Dados/i }))

    expect(await screen.findByText(/Agora respondeu/i)).toBeInTheDocument()
    expect(screen.queryByText(MSG_IA_INDISPONIVEL)).not.toBeInTheDocument()
  })
})
