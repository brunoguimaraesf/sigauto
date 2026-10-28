// @vitest-environment jsdom
// RF05: o documento da O.S. tipica cabe numa folha A4. Usa o jsPDF real (o
// osPdf.test.js simula o jsPDF e nao mede a altura do que e desenhado).
import { describe, it, expect } from 'vitest'
import { criarDocumentoOS } from './osPdf'

const oficina = {
  nome_fantasia: 'Auto Center Rio Verde',
  razao_social: 'Auto Center Rio Verde Ltda',
  cnpj: '11222333000181',
  telefone: '(64) 3620-0000',
  email: 'contato@oficina.local',
  logradouro: 'Avenida Presidente Vargas', numero: '1200', bairro: 'Centro', cidade: 'Rio Verde', uf: 'GO', cep: '75901000',
  texto_rodape: 'Garantia de 90 dias para servicos e pecas, conforme o Codigo de Defesa do Consumidor. Pecas substituidas ficam a disposicao do cliente por 7 dias.',
}

// Mesma O.S. #168 do teste do dia completo (27/10/2026), que saia em 2 paginas.
const os = {
  numero_os: 168,
  status: 'concluida',
  data_abertura: '2026-10-27T11:38:00Z',
  data_encerramento: '2026-10-27T21:45:00Z',
  km_entrada: 87350,
  descricao: 'Troca de oleo vencida e barulho de metal ao frear na roda dianteira.',
  diagnostico: 'Oleo escuro e abaixo do minimo. Pastilhas dianteiras com 2 mm, disco sem sulcos. Trocar oleo, filtro e pastilhas.',
  observacoes: 'Cliente autorizou por telefone as 09:20.',
  observacoes_finais: 'Garantia de 90 dias em pecas e servicos. Proxima troca em 10.000 km.',
  forma_pagamento: 'pix',
  desconto_tipo: 'percentual', desconto_valor: 41.75, desconto_percentual: 5, valor_total: 793.25,
  servicos_itens: [
    { descricao: 'Troca de oleo e filtro', quantidade: 1, valor_unitario: 120 },
    { descricao: 'Revisao de freios', quantidade: 1, valor_unitario: 280 },
  ],
  pecas_itens: [
    { descricao: 'Oleo 5W30 sintetico', quantidade: 4, valor_unitario: 55 },
    { descricao: 'Filtro de oleo', quantidade: 1, valor_unitario: 35 },
    { descricao: 'Pastilha de freio dianteira', quantidade: 1, valor_unitario: 180 },
  ],
}
const cliente = {
  nome: 'Marcos Pereira', cpf_cnpj: '529.787.381-97', telefone: '(64) 99999-0000', email: 'marcos@email.local',
  endereco_estruturado: { logradouro: 'Rua Augusta', numero: '1450', bairro: 'Centro', cidade: 'Rio Verde', uf: 'GO', cep: '75901000', ponto_referencia: 'Ao lado da padaria' },
}
const veiculo = { placa: 'QWE9A87', marca: 'Volkswagen', modelo: 'Gol 1.6', ano: 2019, cor: 'Branco' }
const equipe = { mecanico: { nome: 'Carlos Mecanico' }, atendente: { nome: 'Ana Atendente' } }

describe('Documento da O.S. em uma pagina (RF05)', () => {
  it('O.S. com 5 itens, diagnostico, observacoes e desconto cabe em 1 pagina A4', () => {
    const doc = criarDocumentoOS({ os, cliente, veiculo, equipe, oficina, emitidoEm: new Date('2026-10-27T21:50:00Z') })
    expect(doc.internal.getNumberOfPages()).toBe(1)
  })

  it('lista longa de itens continua paginando em vez de cortar conteudo', () => {
    const muitos = Array.from({ length: 40 }, (_, i) => ({ descricao: `Peca ${i + 1}`, quantidade: 1, valor_unitario: 10 }))
    const doc = criarDocumentoOS({ os: { ...os, pecas_itens: muitos }, cliente, veiculo, equipe, oficina })
    expect(doc.internal.getNumberOfPages()).toBeGreaterThan(1)
  })
})
