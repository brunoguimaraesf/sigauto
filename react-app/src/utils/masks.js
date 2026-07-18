// Funções de máscara para inputs — não dependem de biblioteca externa

export const maskCPF = (v = '') => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export const maskCNPJ = (v = '') => {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export const maskCpfCnpj = (v = '', tipo = 'fisica') =>
  tipo === 'juridica' ? maskCNPJ(v) : maskCPF(v)

export const maskTelefone = (v = '') => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export const maskPlaca = (v = '') => {
  const raw = v.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7)
  if (raw.length <= 3) return raw
  return `${raw.slice(0, 3)}-${raw.slice(3)}`
}

export const maskAno = (v = '') => v.replace(/\D/g, '').slice(0, 4)

export const unmask = (v = '') => v.replace(/\D/g, '')
