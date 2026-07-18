import { useRef } from 'react'

export function GlassPanel({ children, className = '', style = {}, ...props }) {
  const panelRef = useRef(null)

  const handleMouseMove = (e) => {
    if (!panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    panelRef.current.style.setProperty('--mouse-x', `${x}px`)
    panelRef.current.style.setProperty('--mouse-y', `${y}px`)
  }

  const handleMouseEnter = () => {
    if (!panelRef.current) return
    panelRef.current.style.background = `radial-gradient(800px circle at var(--mouse-x) var(--mouse-y), rgba(255, 77, 0, 0.05), transparent 40%), var(--bg-surface-hover)`
  }

  const handleMouseLeave = () => {
    if (!panelRef.current) return
    panelRef.current.style.background = 'var(--bg-surface)'
  }

  return (
    <div 
      ref={panelRef}
      className={`glass ${className}`}
      style={style}
      {...props}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  )
}
