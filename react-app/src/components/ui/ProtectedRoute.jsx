import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import css from './ProtectedRoute.module.css'

export function ProtectedRoute({ children, requiredRoles }) {
  const { isAuthenticated, perfil, loading } = useAuth()

  if (loading) {
    return (
      <div className={css.tela}>
        <div className={css.spinner} />
        <span>Verificando sessão...</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRoles && perfil && !requiredRoles.includes(perfil)) {
    return (
      <div className={`${css.tela} ${css.negado}`}>
        <div className={css.icone}>⚠️</div>
        <h2 className={css.titulo}>Acesso Negado</h2>
        <p>Seu perfil ({perfil}) não tem permissão para acessar esta página.</p>
      </div>
    )
  }

  return children
}
