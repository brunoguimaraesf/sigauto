import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export function ProtectedRoute({ children, requiredRoles }) {
  const { isAuthenticated, perfil, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)', color: 'var(--text-secondary)',
        fontFamily: 'var(--font-body)', flexDirection: 'column', gap: '16px'
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          border: '3px solid rgba(232, 89, 12, 0.2)',
          borderTopColor: 'var(--neon-orange)',
          animation: 'spin 0.8s linear infinite'
        }} />
        <span>Verificando sessão...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRoles && perfil && !requiredRoles.includes(perfil)) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)', color: 'var(--text-secondary)',
        fontFamily: 'var(--font-body)', flexDirection: 'column', gap: '16px', textAlign: 'center'
      }}>
        <div style={{ fontSize: '48px' }}>⚠️</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Acesso Negado</h2>
        <p>Seu perfil ({perfil}) não tem permissão para acessar esta página.</p>
      </div>
    )
  }

  return children
}
