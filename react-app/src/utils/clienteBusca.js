// Busca de cliente por nome, CPF/CNPJ ou placa de um veiculo dele.
//
// Existe porque o seletor de cliente da abertura de OS era um <select> com a
// lista inteira: no balcao o atendente costuma ter em maos a placa do carro ou
// o documento, e nao o nome exato como foi cadastrado.

import { normalizarPlaca } from './placa'

const semAcento = (v = '') =>
  (v || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const soDigitos = (v = '') => (v || '').toString().replace(/\D/g, '')

// Cada resultado diz por que casou, para a tela poder mostrar "via placa
// ABC-1234" — sem isso o atendente busca por placa e ve so uma lista de nomes,
// sem saber qual carro deu o resultado.
export function filtrarClientesPorTermo(clientes = [], veiculos = [], termo = '', limite = 20) {
  const busca = semAcento(termo)
  if (!busca) return []

  const digitos = soDigitos(termo)
  const placaBusca = normalizarPlaca(termo)

  const veiculosPorCliente = veiculos.reduce((acc, v) => {
    const dono = v.id_cliente || v.cliente_id
    if (!dono) return acc
    if (!acc[dono]) acc[dono] = []
    acc[dono].push(v)
    return acc
  }, {})

  const resultados = []

  for (const cliente of clientes) {
    if (cliente.ativo === false) continue

    // Nome vem primeiro: e como o atendente busca na maioria das vezes.
    if (semAcento(cliente.nome).includes(busca)) {
      resultados.push({ cliente, motivo: 'nome' })
      continue
    }

    // Documento so casa com 3+ digitos — abaixo disso qualquer numero digitado
    // traria meia base de clientes. E so quando o termo NAO tem letras: numa
    // busca por placa ("ABC1234") os digitos sozinhos casariam por acaso com o
    // pedaco de algum CPF, e o resultado apareceria como se fosse documento.
    const pareceDocumento = digitos.length >= 3 && !/[a-z]/i.test(termo)
    if (pareceDocumento && soDigitos(cliente.cpf_cnpj).includes(digitos)) {
      resultados.push({ cliente, motivo: 'documento' })
      continue
    }

    const veiculoCasado = (veiculosPorCliente[cliente.id] || []).find(v =>
      placaBusca.length >= 3 && normalizarPlaca(v.placa).includes(placaBusca)
    )
    if (veiculoCasado) {
      resultados.push({ cliente, motivo: 'placa', veiculo: veiculoCasado })
    }
  }

  return resultados.slice(0, limite)
}

// Texto curto para a linha do resultado, explicando o que casou.
export function descreverResultado({ cliente, motivo, veiculo }) {
  if (motivo === 'placa' && veiculo) {
    const modelo = [veiculo.marca, veiculo.modelo].filter(Boolean).join(' ')
    return `Placa ${veiculo.placa}${modelo ? ` — ${modelo}` : ''}`
  }
  if (motivo === 'documento') return cliente.cpf_cnpj || ''
  return cliente.telefone || ''
}
