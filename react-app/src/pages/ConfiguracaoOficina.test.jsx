// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ConfiguracaoOficina } from './ConfiguracaoOficina'
import { ProtectedRoute } from '../components/ui/ProtectedRoute'
import { useDatabase } from '../hooks/useDatabase'
import { useAuth } from '../context/AuthContext'
import { buscarCep } from '../utils/endereco'

vi.mock('../hooks/useDatabase', () => ({ useDatabase: vi.fn() }))
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../utils/endereco', async (importOriginal) => ({
  ...(await importOriginal()),
  buscarCep: vi.fn(),
}))

const OFICINA = {
  id: 1,
  nome_fantasia: 'Oficina Central',
  razao_social: 'Central Servicos Automotivos LTDA',
  cnpj: '11222333000181',
  telefone: '(64) 3621-0000',
  email: 'contato@central.com',
  cep: '75901000',
  logradouro: 'Rua Um',
  numero: '100',
  bairro: 'Centro',
  cidade: 'Rio Verde',
  uf: 'GO',
  logo_path: null,
  texto_rodape: 'Garantia de 90 dias',
  atualizado_em: '2026-10-14T10:00:00Z',
}

let db
const renderPage = () => render(<MemoryRouter><ConfiguracaoOficina /></MemoryRouter>)
const campo = (rotulo) => screen.getByLabelText(rotulo)

beforeEach(() => {
  vi.clearAllMocks()
  db = {
    oficina: null,
    carregandoOficina: false,
    erroOficina: '',
    salvarOficina: vi.fn(async (p) => ({ ...p, id: 1, atualizado_em: 'agora' })),
    uploadLogoOficina: vi.fn(),
    removerLogoOficina: vi.fn(),
    baixarLogoOficina: vi.fn(async () => null),
  }
  useDatabase.mockImplementation(() => db)
  useAuth.mockReturnValue({ isAuthenticated: true, perfil: 'gestor', loading: false })
})

describe('Configuracao da Oficina', () => {
  it('orienta o gestor quando a oficina ainda nao foi cadastrada', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Configuração da Oficina/i })).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma oficina cadastrada/i)).toBeInTheDocument()
    expect(campo(/Nome fantasia/i)).toHaveValue('')
  })

  it('cadastra a oficina com CNPJ mascarado e confirma o salvamento', async () => {
    renderPage()
    fireEvent.change(campo(/Nome fantasia/i), { target: { value: 'Oficina Nova' } })
    fireEvent.change(campo(/^CNPJ/i), { target: { value: '11222333000181' } })
    expect(campo(/^CNPJ/i)).toHaveValue('11.222.333/0001-81')
    fireEvent.click(screen.getByRole('button', { name: /Salvar dados/i }))

    await waitFor(() => expect(db.salvarOficina).toHaveBeenCalledTimes(1))
    expect(db.salvarOficina.mock.calls[0][0]).toMatchObject({ nome_fantasia: 'Oficina Nova', cnpj: '11.222.333/0001-81' })
    expect(await screen.findByRole('status')).toHaveTextContent(/salv/i)
  })

  it('recusa CNPJ invalido sem chamar o banco', async () => {
    renderPage()
    fireEvent.change(campo(/Nome fantasia/i), { target: { value: 'Oficina Nova' } })
    fireEvent.change(campo(/^CNPJ/i), { target: { value: '11222333000100' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar dados/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/CNPJ inválido/i)
    expect(db.salvarOficina).not.toHaveBeenCalled()
  })

  it('carrega os dados existentes para edicao', () => {
    db.oficina = OFICINA
    renderPage()
    expect(screen.queryByText(/Nenhuma oficina cadastrada/i)).not.toBeInTheDocument()
    expect(campo(/Nome fantasia/i)).toHaveValue('Oficina Central')
    expect(campo(/^CNPJ/i)).toHaveValue('11.222.333/0001-81')
    expect(campo(/^UF/i)).toHaveValue('GO')
  })

  it('mostra o erro do banco ao salvar', async () => {
    db.oficina = OFICINA
    db.salvarOficina = vi.fn().mockRejectedValue(new Error('new row violates row-level security policy'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Salvar dados/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/row-level security/i)
  })

  it('segue editavel quando o ViaCEP nao responde', async () => {
    buscarCep.mockResolvedValue(null)
    renderPage()
    fireEvent.change(campo(/^CEP/i), { target: { value: '75901000' } })

    expect(await screen.findByText(/Preencha manualmente/i)).toBeInTheDocument()
    fireEvent.change(campo(/Logradouro/i), { target: { value: 'Rua Digitada' } })
    expect(campo(/Logradouro/i)).toHaveValue('Rua Digitada')
  })

  it('preenche o endereco pelo CEP quando o ViaCEP responde', async () => {
    buscarCep.mockResolvedValue({ cep: '75901000', logradouro: 'Rua do CEP', bairro: 'Centro', cidade: 'Rio Verde', uf: 'GO' })
    renderPage()
    fireEvent.change(campo(/^CEP/i), { target: { value: '75901000' } })
    await waitFor(() => expect(campo(/Logradouro/i)).toHaveValue('Rua do CEP'))
    expect(campo(/^UF/i)).toHaveValue('GO')
  })

  it('so permite enviar logotipo depois de a oficina existir', () => {
    renderPage()
    expect(campo(/Enviar logotipo/i)).toBeDisabled()
  })

  it('mostra o motivo quando o logotipo e recusado', async () => {
    db.oficina = OFICINA
    db.uploadLogoOficina = vi.fn().mockRejectedValue(new Error('O logotipo deve ser uma imagem PNG, JPEG ou WebP.'))
    renderPage()
    const arquivo = new File(['x'], 'logo.gif', { type: 'image/gif' })
    fireEvent.change(campo(/Enviar logotipo/i), { target: { files: [arquivo] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/PNG, JPEG ou WebP/i)
    expect(db.uploadLogoOficina).toHaveBeenCalledWith(arquivo)
  })

  it('envia o logotipo valido e confirma', async () => {
    db.oficina = OFICINA
    db.uploadLogoOficina = vi.fn(async () => ({ ...OFICINA, logo_path: 'oficina/logo-abc.png' }))
    renderPage()
    fireEvent.change(campo(/Enviar logotipo/i), { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } })
    expect(await screen.findByRole('status')).toHaveTextContent(/Logotipo atualizado/i)
  })

  it('nao renderiza para atendente (rota exclusiva do gestor)', () => {
    useAuth.mockReturnValue({ isAuthenticated: true, perfil: 'atendente', loading: false })
    render(
      <MemoryRouter>
        <ProtectedRoute requiredRoles={['gestor']}><ConfiguracaoOficina /></ProtectedRoute>
      </MemoryRouter>
    )
    expect(screen.getByText(/Acesso Negado/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Configuração da Oficina/i })).not.toBeInTheDocument()
  })
})
