// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlassPanel } from './GlassPanel'

describe('GlassPanel', () => {
  it('renderiza os filhos', () => {
    render(<GlassPanel>Conteúdo do painel</GlassPanel>)
    expect(screen.getByText('Conteúdo do painel')).toBeInTheDocument()
  })

  it('aplica a classe glass e a classe extra', () => {
    render(<GlassPanel className="painel-x">texto</GlassPanel>)
    const el = screen.getByText('texto')
    expect(el).toHaveClass('glass')
    expect(el).toHaveClass('painel-x')
  })
})
