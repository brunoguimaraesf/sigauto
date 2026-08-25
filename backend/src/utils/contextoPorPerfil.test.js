import { describe, it, expect } from 'vitest'
import { filtrarContextoPorPerfil } from './contextoPorPerfil.js'

const CONTEXTO_COMPLETO = {
  totais: {
    clientes: 12,
    veiculos: 20,
    ordens_servico: 63,
    faturamento_total: 65972.25,
    ticket_medio_geral: 1047.18,
  },
  ranking_clientes: [
    { nome: 'Rodrigo Rocha', qtd_os: 7, total_gasto: 6495, ticket_medio: 927.86 },
    { nome: 'Thiago Souza', qtd_os: 5, total_gasto: 5055, ticket_medio: 1011 },
  ],
  estoque_em_alerta: [{ nome: 'Filtro de oleo', quantidade: 1, qtd_minima: 5 }],
  servicos_catalogo: [{ nome: 'Troca de oleo', preco: 120 }],
}

// Serializa o contexto como ele chega ao modelo: se um valor sensível aparecer
// em qualquer profundidade do JSON, ele vazou.
const comoOModeloVe = (perfil) => JSON.stringify(filtrarContextoPorPerfil(CONTEXTO_COMPLETO, perfil))

describe('filtrarContextoPorPerfil — o chatbot não entrega o que a tela não mostra', () => {
  it('gestor recebe o contexto financeiro completo', () => {
    const ctx = filtrarContextoPorPerfil(CONTEXTO_COMPLETO, 'gestor')

    expect(ctx.totais.faturamento_total).toBe(65972.25)
    expect(ctx.totais.ticket_medio_geral).toBe(1047.18)
    expect(ctx.ranking_clientes[0].total_gasto).toBe(6495)
    expect(ctx.estoque_em_alerta).toHaveLength(1)
    expect(ctx.dados_restritos_para_este_perfil).toBeUndefined()
  })

  it('atendente não recebe faturamento nem quanto cada cliente gastou', () => {
    const ctx = filtrarContextoPorPerfil(CONTEXTO_COMPLETO, 'atendente')

    expect(ctx.totais.faturamento_total).toBeUndefined()
    expect(ctx.totais.ticket_medio_geral).toBeUndefined()
    expect(ctx.ranking_clientes[0]).toEqual({ nome: 'Rodrigo Rocha', qtd_os: 7 })
    // Mantém o que ele opera no dia a dia: cadastros, estoque e catálogo.
    expect(ctx.totais.clientes).toBe(12)
    expect(ctx.estoque_em_alerta).toHaveLength(1)
    expect(ctx.servicos_catalogo).toHaveLength(1)
  })

  it('mecanico só recebe a contagem de OS', () => {
    const ctx = filtrarContextoPorPerfil(CONTEXTO_COMPLETO, 'mecanico')

    expect(ctx.totais).toEqual({ ordens_servico: 63 })
    expect(ctx.ranking_clientes).toBeUndefined()
    expect(ctx.estoque_em_alerta).toBeUndefined()
    expect(ctx.servicos_catalogo).toBeUndefined()
  })

  it('nenhum valor financeiro sobrevive à serialização para atendente e mecanico', () => {
    for (const perfil of ['atendente', 'mecanico']) {
      const json = comoOModeloVe(perfil)

      expect(json).not.toContain('65972.25')  // faturamento total
      expect(json).not.toContain('1047.18')   // ticket medio geral
      expect(json).not.toContain('6495')      // gasto do maior cliente
      expect(json).not.toContain('5055')
    }
  })

  it('declara o que foi omitido para o modelo dizer "restrito", não "sem registros"', () => {
    const atendente = filtrarContextoPorPerfil(CONTEXTO_COMPLETO, 'atendente')
    const mecanico = filtrarContextoPorPerfil(CONTEXTO_COMPLETO, 'mecanico')

    expect(atendente.dados_restritos_para_este_perfil).toContain('faturamento e ticket medio da oficina')
    expect(mecanico.dados_restritos_para_este_perfil).toContain('estoque e tabela de precos dos servicos')
  })

  it('perfil desconhecido ou ausente é tratado como o mais restrito', () => {
    for (const perfil of [undefined, null, '', 'qualquer_coisa']) {
      const ctx = filtrarContextoPorPerfil(CONTEXTO_COMPLETO, perfil)

      expect(ctx.totais.faturamento_total).toBeUndefined()
      expect(ctx.ranking_clientes).toBeUndefined()
    }
  })

  it('contexto nulo continua nulo (falha ao montar não vira objeto vazio)', () => {
    expect(filtrarContextoPorPerfil(null, 'gestor')).toBeNull()
  })
})
