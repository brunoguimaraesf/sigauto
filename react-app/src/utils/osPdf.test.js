// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

const registro = vi.hoisted(() => ({ docs: [], tabelas: [] }))

vi.mock('jspdf', () => {
  class FakePDF {
    constructor() {
      this.textos = []
      this.imagens = []
      this.paginas = 1
      this.paginaAtual = 1
      this.salvoComo = null
      this.lastAutoTable = { finalY: 0 }
      this.internal = {
        pageSize: { getWidth: () => 210, getHeight: () => 297 },
        getNumberOfPages: () => this.paginas,
      }
      registro.docs.push(this)
    }
    text(t) { this.textos.push(...(Array.isArray(t) ? t : [t]).map(String)); return this }
    splitTextToSize(t) { return String(t).split('\n') }
    getTextWidth(t) { return String(t).length * 2 }
    addImage(...args) { this.imagens.push(args) }
    getImageProperties() { return { width: 200, height: 100 } }
    addPage() { this.paginas += 1; this.paginaAtual = this.paginas; return this }
    setPage(n) { this.paginaAtual = n; return this }
    save(nome) { this.salvoComo = nome }
    output(tipo) { return tipo === 'blob' ? new Blob(['%PDF'], { type: 'application/pdf' }) : '' }
  }
  for (const m of ['setFont', 'setFontSize', 'setTextColor', 'setFillColor', 'setDrawColor', 'setLineWidth', 'rect', 'roundedRect', 'line', 'setLineDash']) {
    FakePDF.prototype[m] = function () { return this }
  }
  return { default: FakePDF, jsPDF: FakePDF }
})

vi.mock('jspdf-autotable', () => ({
  default: vi.fn((doc, opts) => {
    registro.tabelas.push(opts)
    doc.lastAutoTable = { finalY: (opts.startY || 0) + 10 }
  }),
}))

import {
  criarDocumentoOS, salvarDocumentoOS, abrirDocumentoOS, imprimirDocumentoOS, nomeArquivoOS,
  reservarGuiaDocumento, resumoFinanceiroOS, ERRO_OFICINA_AUSENTE,
} from './osPdf'

const OFICINA = {
  nome_fantasia: 'Oficina Central',
  razao_social: 'Central Servicos Automotivos LTDA',
  cnpj: '11222333000181',
  telefone: '(64) 3621-0000',
  email: 'contato@central.com',
  cep: '75901000', logradouro: 'Rua Um', numero: '100', bairro: 'Centro', cidade: 'Rio Verde', uf: 'GO',
  texto_rodape: 'Garantia de 90 dias nos servicos.',
}

const OS = {
  id: 'os-1',
  numero_os: 42,
  status: 'concluida',
  descricao: 'Barulho na suspensao',
  diagnostico: 'Bucha da bandeja gasta',
  observacoes: 'Cliente aguarda no local',
  data_abertura: '2026-10-10T12:00:00Z',
  data_encerramento: '2026-10-12T15:00:00Z',
  km_entrada: 45200,
  forma_pagamento: 'pix',
  servicos_itens: [{ descricao: 'Troca de bucha', quantidade: 2, valor_unitario: 150 }],
  pecas_itens: [{ descricao: 'Bucha dianteira', quantidade: 2, valor_unitario: 50 }],
  valor_total: 360, // subtotal 400 - desconto 40
}

const CLIENTE = {
  nome: 'Joao Silva', cpf_cnpj: '123.456.789-09', telefone: '(64) 99999-0000', email: 'joao@x.com',
  endereco_estruturado: { logradouro: 'Rua Dois', numero: '5', cidade: 'Rio Verde', uf: 'GO' },
}
const VEICULO = { placa: 'ABC1D23', marca: 'VW', modelo: 'Gol', ano: 2018, cor: 'Prata' }
const EQUIPE = { mecanico: { nome: 'Carlos' }, atendente: { nome: 'Ana' } }
const EMITIDO = new Date('2026-10-14T13:00:00Z')

const dados = (extra = {}) => ({ os: OS, cliente: CLIENTE, veiculo: VEICULO, equipe: EQUIPE, oficina: OFICINA, emitidoEm: EMITIDO, ...extra })
const tudo = (doc) => doc.textos.join('\n')
const linhasDasTabelas = () => registro.tabelas.flatMap(t => t.body || []).map(l => l.join(' | '))

beforeEach(() => {
  registro.docs = []
  registro.tabelas = []
})

describe('criarDocumentoOS', () => {
  it('recusa emitir sem a configuracao da oficina, antes de criar o arquivo', () => {
    expect(() => criarDocumentoOS(dados({ oficina: null }))).toThrow(expect.objectContaining({ code: ERRO_OFICINA_AUSENTE }))
    expect(registro.docs).toHaveLength(0)
  })

  it('traz oficina, numero, status, cliente, veiculo e equipe', () => {
    const doc = criarDocumentoOS(dados())
    const texto = tudo(doc)
    expect(texto).toContain('Oficina Central')
    expect(texto).toContain('Central Servicos Automotivos LTDA')
    expect(texto).toContain('11.222.333/0001-81')
    expect(texto).toContain('Rua Um, 100')
    expect(texto).toMatch(/O\.S\. Nº 42/)
    expect(texto).toMatch(/Concluída/)
    expect(texto).toContain('Joao Silva')
    expect(texto).toContain('123.456.789-09')
    expect(texto).toContain('Rua Dois, 5')
    expect(texto).toContain('ABC1D23')
    expect(texto).toMatch(/VW Gol/)
    expect(texto).toMatch(/45\.200 km/)
    expect(texto).toContain('Bucha da bandeja gasta')
    expect(texto).toContain('Carlos')
    expect(texto).toContain('Ana')
    expect(texto).toContain('Garantia de 90 dias nos servicos.')
  })

  it('lista servicos e pecas com quantidade, valor unitario e total da linha', () => {
    criarDocumentoOS(dados())
    const linhas = linhasDasTabelas()
    expect(linhas.some(l => l.includes('Troca de bucha') && l.includes('2') && /150,00/.test(l) && /300,00/.test(l))).toBe(true)
    expect(linhas.some(l => l.includes('Bucha dianteira') && /50,00/.test(l) && /100,00/.test(l))).toBe(true)
  })

  it('usa o valor final persistido e mostra o desconto que ele implica', () => {
    criarDocumentoOS(dados())
    const resumo = linhasDasTabelas().join('\n')
    expect(resumo).toMatch(/Subtotal geral \| R\$\s?400,00/)
    expect(resumo).toMatch(/Desconto .*40,00/)
    expect(resumo).toMatch(/VALOR FINAL \| R\$\s?360,00/)
    expect(resumo).toMatch(/Pix/)
  })

  it('emite sem logo e sem quebrar quando o logo falha', () => {
    const semLogo = criarDocumentoOS(dados())
    expect(semLogo.imagens).toHaveLength(0)

    const comLogo = criarDocumentoOS(dados({ logoDataUrl: 'data:image/png;base64,AAAA' }))
    expect(comLogo.imagens).toHaveLength(1)
  })

  it('identifica O.S. cancelada e O.S. ainda aberta', () => {
    expect(tudo(criarDocumentoOS(dados({ os: { ...OS, status: 'cancelada' } })))).toMatch(/CANCELADA/)
    const aberta = tudo(criarDocumentoOS(dados({ os: { ...OS, status: 'em_andamento', data_encerramento: null, valor_total: 0 } })))
    expect(aberta).toMatch(/Em Andamento/)
    expect(aberta).toMatch(/valores parciais/i)
  })

  it('pagina listas longas repetindo o cabecalho das tabelas', () => {
    const muitos = Array.from({ length: 60 }, (_, i) => ({ descricao: `Peca ${i + 1}`, quantidade: 1, valor_unitario: 10 }))
    criarDocumentoOS(dados({ os: { ...OS, pecas_itens: muitos } }))
    const tabelaPecas = registro.tabelas.find(t => (t.body || []).some(l => l[0] === 'Peca 60'))
    expect(tabelaPecas.body).toHaveLength(60)
    expect(tabelaPecas.showHead).toBe('everyPage')
    const resumo = registro.tabelas.find(t => (t.body || []).some(l => l[0] === 'VALOR FINAL'))
    expect(resumo.pageBreak).toBe('avoid')
  })

  it('omite campos opcionais ausentes sem fabricar conteudo', () => {
    const doc = criarDocumentoOS(dados({
      oficina: { nome_fantasia: 'So Nome', cnpj: '11222333000181' },
      cliente: { nome: 'Consumidor', cpf_cnpj: 'SC123456789', telefone: 'Nao informado' },
      veiculo: { placa: 'XYZ9A87' },
      equipe: {},
      os: { ...OS, diagnostico: null, observacoes: null, servicos_itens: [], pecas_itens: [] },
    }))
    const texto = tudo(doc)
    expect(texto).not.toContain('SC123456789')
    expect(texto).not.toContain('undefined')
    expect(texto).not.toContain('null')
  })
})

describe('resumoFinanceiroOS', () => {
  it('desconto informado no encerramento prevalece e guarda o percentual', () => {
    const r = resumoFinanceiroOS({ ...OS, status: 'em_andamento' }, { descontoValor: 40, descontoPercentual: 10 })
    expect(r).toMatchObject({ subtotal: 400, descontoValor: 40, descontoPercentual: 10, valorFinal: 360 })
  })

  it('O.S. nao concluida nao inventa desconto', () => {
    const r = resumoFinanceiroOS({ ...OS, status: 'aberta', valor_total: 0 })
    expect(r).toMatchObject({ descontoValor: 0, valorFinal: 400 })
  })

  it('usa o tipo, valor e percentual persistidos no fechamento', () => {
    const r = resumoFinanceiroOS({
      ...OS,
      desconto_tipo: 'pct',
      desconto_valor: 40,
      desconto_percentual: 10,
    })
    expect(r).toMatchObject({ subtotal: 400, descontoValor: 40, descontoPercentual: 10, valorFinal: 360 })
  })
})

describe('salvar e imprimir', () => {
  it('nomeia o arquivo como OS-<numero>-<data-emissao>.pdf', () => {
    expect(nomeArquivoOS(OS, EMITIDO)).toBe('OS-42-2026-10-14.pdf')
  })

  it('salvar baixa o documento com o nome padrao', async () => {
    await salvarDocumentoOS(dados())
    expect(registro.docs[0].salvoComo).toBe('OS-42-2026-10-14.pdf')
  })

  it('visualizar abre o mesmo PDF numa nova guia', () => {
    const revoke = vi.fn()
    const open = vi.fn(() => ({ focus: vi.fn() }))
    const win = {
      document,
      open,
      URL: { createObjectURL: vi.fn(() => 'blob:os-42'), revokeObjectURL: revoke },
      setTimeout: (fn) => fn(),
    }
    abrirDocumentoOS(dados(), win)
    expect(open).toHaveBeenCalledWith('blob:os-42', '_blank')
    expect(revoke).toHaveBeenCalledWith('blob:os-42')
    expect(registro.docs).toHaveLength(1)
  })

  it('reserva a guia antes do trabalho assincrono e navega nela depois', () => {
    const replace = vi.fn()
    const guia = { opener: window, location: { replace } }
    const open = vi.fn(() => guia)
    const win = {
      document,
      open,
      URL: { createObjectURL: vi.fn(() => 'blob:os-42'), revokeObjectURL: vi.fn() },
      setTimeout: vi.fn(),
    }

    expect(reservarGuiaDocumento(win)).toBe(guia)
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(guia.opener).toBeNull()

    abrirDocumentoOS(dados(), win, guia)
    expect(open).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('blob:os-42')
  })

  it('visualizar avisa quando o navegador bloqueia a guia', () => {
    const revoke = vi.fn()
    const win = {
      document,
      open: vi.fn(() => null),
      URL: { createObjectURL: vi.fn(() => 'blob:os-42'), revokeObjectURL: revoke },
      setTimeout: vi.fn(),
    }
    expect(() => abrirDocumentoOS(dados(), win)).toThrow(/pop-ups/i)
    expect(revoke).toHaveBeenCalledWith('blob:os-42')
  })

  it('imprimir usa o mesmo PDF num iframe e chama o dialogo de impressao', async () => {
    const print = vi.fn()
    const revoke = vi.fn()
    const win = {
      document,
      URL: { createObjectURL: vi.fn(() => 'blob:os-42'), revokeObjectURL: revoke },
      setTimeout: (fn) => fn(),
    }
    const promessa = imprimirDocumentoOS(dados(), win)
    const iframe = document.querySelector('iframe[data-os-impressao]')
    expect(iframe).not.toBeNull()
    expect(iframe.getAttribute('src')).toBe('blob:os-42')
    Object.defineProperty(iframe, 'contentWindow', { value: { focus: vi.fn(), print, addEventListener: vi.fn() } })
    iframe.dispatchEvent(new Event('load'))
    await promessa
    expect(print).toHaveBeenCalled()
    expect(registro.docs).toHaveLength(1)
  })
})
