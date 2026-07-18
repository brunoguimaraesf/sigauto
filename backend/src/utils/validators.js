export function validarCPF(cpf) {
  if (!cpf) return false
  const limpo = cpf.replace(/\D/g, '')
  if (limpo.length !== 11) return false
  if (/^(\d)\1+$/.test(limpo)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(limpo[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(limpo[9])) return false

  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(limpo[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(limpo[10])) return false

  return true
}

export function validarCNPJ(cnpj) {
  if (!cnpj) return false
  const limpo = cnpj.replace(/\D/g, '')
  if (limpo.length !== 14) return false
  if (/^(\d)\1+$/.test(limpo)) return false

  const calcDigito = (cnpjStr, tamanho) => {
    let soma = 0
    let pos = tamanho - 7
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(cnpjStr[tamanho - i]) * pos--
      if (pos < 2) pos = 9
    }
    const resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11)
    return resultado
  }

  if (calcDigito(limpo, 12) !== parseInt(limpo[12])) return false
  if (calcDigito(limpo, 13) !== parseInt(limpo[13])) return false

  return true
}

export function validarPlaca(placa) {
  if (!placa) return false
  const limpa = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  // Formato antigo: AAA-9999
  const formatoAntigo = /^[A-Z]{3}[0-9]{4}$/
  // Formato Mercosul: AAA9A99
  const formatoMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/
  return formatoAntigo.test(limpa) || formatoMercosul.test(limpa)
}

export function validarEmail(email) {
  if (!email) return false
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}

export function validarSenha(senha) {
  if (!senha || senha.length < 8) return false
  if (!/[A-Z]/.test(senha)) return false
  if (!/[0-9]/.test(senha)) return false
  return true
}
