// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AcoesDocumentoOS } from './AcoesDocumentoOS'
import { useDatabase } from '../../hooks/useDatabase'
import { abrirDocumentoOS, reservarGuiaDocumento, salvarDocumentoOS } from '../../utils/osPdf'

vi.mock('../../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))
vi.mock('../../utils/osPdf', () => ({
  abrirDocumentoOS: vi.fn(),
  carregarLogoDataUrl: vi.fn(async () => null),
  imprimirDocumentoOS: vi.fn(async () => {}),
  reservarGuiaDocumento: vi.fn(),
  salvarDocumentoOS: vi.fn(async () => {}),
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
})

describe('AcoesDocumentoOS', () => {
  it('usa a guia reservada para abrir o documento', async () => {
    const guia = { location: { replace: vi.fn() }, close: vi.fn() }
    reservarGuiaDocumento.mockReturnValue(guia)
    render(<AcoesDocumentoOS os={{ id: 'os-1' }} cliente={{}} veiculo={{}} />)

    fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))

    await waitFor(() => expect(abrirDocumentoOS).toHaveBeenCalledWith(
      expect.objectContaining({ os: { id: 'os-1' }, oficina: db.oficina }),
      window,
      guia,
    ))
    expect(salvarDocumentoOS).not.toHaveBeenCalled()
  })

  it('salva o PDF quando o navegador bloqueia a nova guia', async () => {
    reservarGuiaDocumento.mockReturnValue(null)
    render(<AcoesDocumentoOS os={{ id: 'os-1' }} cliente={{}} veiculo={{}} />)

    fireEvent.click(screen.getByRole('button', { name: /Visualizar PDF/i }))

    await waitFor(() => expect(salvarDocumentoOS).toHaveBeenCalledTimes(1))
    expect(abrirDocumentoOS).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/foi bloqueada.*foi salvo/i)
  })
})
