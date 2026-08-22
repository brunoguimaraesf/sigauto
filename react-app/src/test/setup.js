import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// Limpa o DOM só nos testes de componente (ambiente jsdom).
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(() => cleanup())
}
