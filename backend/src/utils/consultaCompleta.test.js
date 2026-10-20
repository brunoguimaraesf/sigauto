import { describe, expect, it, vi } from 'vitest'
import { consultarTodasPaginas } from './consultaCompleta.js'

function simularPaginas(paginas) {
  const range = vi.fn()
  for (const pagina of paginas) range.mockResolvedValueOnce(pagina)
  const criarConsulta = vi.fn(() => ({ range }))
  return { criarConsulta, range }
}

describe('consultarTodasPaginas — RF11/RN43: contexto completo, sem totais parciais', () => {
  it('retorna uma lista vazia somente com contagem exata zero', async () => {
    const { criarConsulta, range } = simularPaginas([{ data: [], count: 0, error: null }])

    await expect(consultarTodasPaginas(criarConsulta)).resolves.toEqual([])
    expect(range).toHaveBeenCalledExactlyOnceWith(0, 499)
  })

  it('busca três páginas mesmo quando o servidor limita abaixo do tamanho solicitado', async () => {
    const registros = Array.from({ length: 5 }, (_, indice) => ({ id: `os-${indice}`, valor: indice * 100 }))
    const { criarConsulta, range } = simularPaginas([
      { data: registros.slice(0, 2), count: 5 },
      { data: registros.slice(2, 4), count: 5 },
      { data: registros.slice(4), count: 5 },
    ])

    await expect(consultarTodasPaginas(criarConsulta)).resolves.toEqual(registros)
    expect(criarConsulta).toHaveBeenCalledTimes(3)
    expect(range.mock.calls).toEqual([[0, 499], [2, 501], [4, 503]])
  })

  it('respeita o tamanho de página configurado e aceita IDs que são nomes de propriedades', async () => {
    const { criarConsulta, range } = simularPaginas([
      { data: [{ id: '__proto__' }], count: 2 },
      { data: [{ id: 'constructor' }], count: 2 },
    ])

    await expect(consultarTodasPaginas(criarConsulta, { tamanhoPagina: 1 })).resolves.toEqual([
      { id: '__proto__' }, { id: 'constructor' },
    ])
    expect(range.mock.calls).toEqual([[0, 0], [1, 1]])
  })

  it('falha na segunda página sem devolver os registros parciais', async () => {
    const erro = { message: 'Banco indisponível' }
    const { criarConsulta } = simularPaginas([
      { data: [{ id: 'os-1' }], count: 2 },
      { data: null, count: null, error: erro },
    ])

    await expect(consultarTodasPaginas(criarConsulta)).rejects.toMatchObject({
      message: 'Falha ao consultar todos os registros.', cause: erro,
    })
  })

  it.each([undefined, null, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1])('rejeita contagem inválida: %s', async count => {
    const { criarConsulta } = simularPaginas([{ data: [], count }])
    await expect(consultarTodasPaginas(criarConsulta)).rejects.toThrow('contagem exata válida')
  })

  it('exige a contagem também nas páginas seguintes', async () => {
    const { criarConsulta } = simularPaginas([
      { data: [{ id: 'os-1' }], count: 2 },
      { data: [{ id: 'os-2' }] },
    ])
    await expect(consultarTodasPaginas(criarConsulta)).rejects.toThrow('contagem exata válida')
  })

  it('falha se a contagem mudar durante a paginação', async () => {
    const { criarConsulta } = simularPaginas([
      { data: [{ id: 'os-1' }], count: 2 },
      { data: [{ id: 'os-2' }], count: 3 },
    ])
    await expect(consultarTodasPaginas(criarConsulta)).rejects.toThrow('contagem dos registros mudou')
  })

  it('falha se uma página vazia chegar antes de completar a contagem', async () => {
    const { criarConsulta } = simularPaginas([
      { data: [{ id: 'os-1' }], count: 2 },
      { data: [], count: 2 },
    ])
    await expect(consultarTodasPaginas(criarConsulta)).rejects.toThrow('antes de retornar todos')
  })

  it.each([
    [{ data: [{ id: 'repetido' }, { id: 'repetido' }], count: 2 }],
    [{ data: [{ id: 'repetido' }], count: 2 }, { data: [{ id: 'repetido' }], count: 2 }],
  ])('rejeita IDs duplicados dentro de uma página ou entre páginas', async (...paginas) => {
    const { criarConsulta } = simularPaginas(paginas)
    await expect(consultarTodasPaginas(criarConsulta)).rejects.toThrow('identificadores duplicados')
  })

  it.each([null, {}, 'dados'])('rejeita dados que não são uma lista: %s', async data => {
    const { criarConsulta } = simularPaginas([{ data, count: 1 }])
    await expect(consultarTodasPaginas(criarConsulta)).rejects.toThrow('dados incompatíveis')
  })

  it.each([null, [], {}, { id: 1 }, { id: '' }, { id: ' ' }])('rejeita registro sem ID string válido: %j', async registro => {
    const { criarConsulta } = simularPaginas([{ data: [registro], count: 1 }])
    await expect(consultarTodasPaginas(criarConsulta)).rejects.toThrow('identificador válido')
  })

  it('rejeita mais registros do que a contagem declarada', async () => {
    const { criarConsulta } = simularPaginas([{ data: [{ id: 'os-1' }], count: 0 }])
    await expect(consultarTodasPaginas(criarConsulta)).rejects.toThrow('dados incompatíveis')
  })

  it.each([0, -1, 1.5, NaN])('rejeita tamanho de página inválido: %s', async tamanhoPagina => {
    const criarConsulta = vi.fn()
    await expect(consultarTodasPaginas(criarConsulta, { tamanhoPagina })).rejects.toThrow('Configuração inválida')
    expect(criarConsulta).not.toHaveBeenCalled()
  })
})
