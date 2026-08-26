// Regras de endereco: mascara e validacao de CEP, consulta ao ViaCEP e
// formatacao para exibicao.

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export const somenteDigitos = (v = '') => (v || '').replace(/\D/g, '')

export const maskCep = (v = '') => {
  const d = somenteDigitos(v).slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

export const cepValido = (v = '') => /^[0-9]{8}$/.test(somenteDigitos(v))

// Consulta o ViaCEP. Servico de terceiro, gratuito e sem chave: pode cair, e
// quando cai o cadastro NAO pode travar — devolvemos null e o usuario digita
// na mao. Por isso nada aqui lanca excecao para quem chama.
export async function buscarCep(cep, { fetchImpl = globalThis.fetch, timeoutMs = 6000 } = {}) {
  const digitos = somenteDigitos(cep)
  if (!cepValido(digitos)) return null

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`https://viacep.com.br/ws/${digitos}/json/`, { signal: abort.signal })
    if (!res.ok) return null
    const dados = await res.json()
    // O ViaCEP responde 200 com { erro: true } quando o CEP nao existe.
    if (!dados || dados.erro) return null
    return {
      cep: digitos,
      logradouro: dados.logradouro || '',
      bairro: dados.bairro || '',
      cidade: dados.localidade || '',
      uf: (dados.uf || '').toUpperCase(),
    }
  } catch {
    // Rede fora, timeout ou resposta ilegivel: o preenchimento automatico e uma
    // conveniencia, nunca um pre-requisito.
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Monta "Rua X, 123 - Centro, Goiania/GO - 74000-000" pulando o que faltar.
// `fallback` recebe o texto livre do campo legado cliente.endereco, usado
// enquanto o cliente antigo nao tiver endereco estruturado.
export function formatarEndereco(endereco, fallback = '') {
  if (!endereco) return fallback || ''

  const { logradouro, numero, complemento, bairro, cidade, uf, cep } = endereco

  const rua = [logradouro, numero].filter(Boolean).join(', ')
  const linha1 = [rua, complemento].filter(Boolean).join(' - ')
  const municipio = cidade && uf ? `${cidade}/${uf}` : (cidade || uf || '')
  const partes = [linha1, bairro, municipio].filter(Boolean).join(' - ')
  const comCep = cep ? [partes, maskCep(cep)].filter(Boolean).join(' - ') : partes

  return comCep || fallback || ''
}

// Um endereco so vale a pena gravar se tiver algum conteudo: o formulario
// sempre devolve o objeto completo, quase sempre todo vazio.
export const enderecoVazio = (e) =>
  !e || !['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'ponto_referencia']
    .some(campo => (e[campo] || '').toString().trim())
