// Validações de formato para o caminho de escrita do frontend (o app grava
// direto no Supabase, então a validação precisa acontecer aqui, não só no
// backend). CPF/CNPJ com dígito verificador; e-mail por formato.

export function validarCPF(cpf) {
  if (!cpf) return false
  const n = String(cpf).replace(/\D/g, '')
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(n[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto >= 10) resto = 0
  if (resto !== parseInt(n[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(n[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto >= 10) resto = 0
  return resto === parseInt(n[10])
}

export function validarCNPJ(cnpj) {
  if (!cnpj) return false
  const n = String(cnpj).replace(/\D/g, '')
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false
  const digito = (tam) => {
    let soma = 0, pos = tam - 7
    for (let i = tam; i >= 1; i--) {
      soma += parseInt(n[tam - i]) * pos--
      if (pos < 2) pos = 9
    }
    return soma % 11 < 2 ? 0 : 11 - (soma % 11)
  }
  return digito(12) === parseInt(n[12]) && digito(13) === parseInt(n[13])
}

// Valida CPF ou CNPJ conforme o tipo de pessoa (default: decide pelo tamanho).
export function validarCpfCnpj(valor, tipoPessoa) {
  const n = String(valor || '').replace(/\D/g, '')
  if (!n) return false
  if (tipoPessoa === 'juridica') return validarCNPJ(n)
  if (tipoPessoa === 'fisica') return validarCPF(n)
  return n.length === 14 ? validarCNPJ(n) : validarCPF(n)
}

export function validarEmail(email) {
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))
}
