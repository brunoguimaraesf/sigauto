// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AcoesDocumentoOS } from './AcoesDocumentoOS'
import { useDatabase } from '../../hooks/useDatabase'
import { criarUrlDocumentoOS, imprimirDocumentoOS } from '../../utils/osPdf'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))
vi.mock('../../utils/osPdf', () => ({
  carregarLogoDataUrl: vi.fn(async () => null),
  criarUrlDocumentoOS: vi.fn(),
  imprimirDocumentoOS: vi.fn(async () => {}),
}))

const db = {
  oficina: { id: 1, nome_fantasia: 'Oficina Central', cnpj: '11222333000181' },
  carregandoOficina: false,
  erroOficina: '',
  funcionarios: [],
  baixarLogoOficina: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  useDatabase.mockReturnValue(db)
  criarUrlDocumentoOS.mockReturnValue({ url: 'blob:os-1', nomeArquivo: 'OS-1.pdf', revogar: vi.fn() })
})

describe('AcoesDocumentoOS', () => {
  it('abre o visualizador na propria pagina, sem pop-up', async () => {
    render(<AcoesDocumentoOS os={{ id: 'os-1' }} cliente={{}} veiculo={{}} />)

    fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))

    await waitFor(() => expect(criarUrlDocumentoOS).toHaveBeenCalledWith(
      expect.objectContaining({ os: { id: 'os-1' }, oficina: db.oficina }),
    ))
    const dialogo = await screen.findByRole('dialog', { name: /Documento da ordem de serviço/i })
    expect(dialogo.querySelector('iframe')).toHaveAttribute('src', 'blob:os-1')
    expect(screen.getByRole('link', { name: /Baixar PDF/i })).toHaveAttribute('download', 'OS-1.pdf')
  })

  it('revoga a URL temporaria ao fechar o visualizador', async () => {
    const revogar = vi.fn()
    criarUrlDocumentoOS.mockReturnValue({ url: 'blob:os-1', nomeArquivo: 'OS-1.pdf', revogar })
    render(<AcoesDocumentoOS os={{ id: 'os-1' }} cliente={{}} veiculo={{}} />)

    fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))
    const fechar = await screen.findByRole('button', { name: /Fechar visualizador/i })
    fireEvent.click(fechar)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(revogar).toHaveBeenCalled()
  })

  it('imprime do visualizador reaproveitando o documento ja montado', async () => {
    render(<AcoesDocumentoOS os={{ id: 'os-1' }} cliente={{}} veiculo={{}} />)

    fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.click(dialogo.querySelector('.modal-footer button'))

    await waitFor(() => expect(imprimirDocumentoOS).toHaveBeenCalledTimes(1))
    expect(imprimirDocumentoOS.mock.calls[0][0]).toMatchObject({ os: { id: 'os-1' } })
  })

  it('avisa quando a oficina nao esta cadastrada, sem gerar documento', async () => {
    useDatabase.mockReturnValue({ ...db, oficina: null })
    render(<AcoesDocumentoOS os={{ id: 'os-1' }} cliente={{}} veiculo={{}} />)

    fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/gestor deve preenchê-los/i)
    expect(criarUrlDocumentoOS).not.toHaveBeenCalled()
  })
})
