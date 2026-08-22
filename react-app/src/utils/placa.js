// Regras de placa (formato antigo AAA-9999 e Mercosul AAA9A99).

export const normalizarPlaca = (value) => (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export const formatarPlaca = (value) => {
  const raw = normalizarPlaca(value)
  if (/^[A-Z]{3}[0-9]{4}$/.test(raw)) return `${raw.slice(0, 3)}-${raw.slice(3)}`
  return raw
}

export const placaValida = (value) => {
  const raw = normalizarPlaca(value)
  const antigo = /^[A-Z]{3}[0-9]{4}$/
  const mercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/
  return antigo.test(raw) || mercosul.test(raw)
}
