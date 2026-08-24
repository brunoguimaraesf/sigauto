import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, CarFront, Users, Wrench, BarChart3, FileText, Package, Brain, UserCog, HardHat, History, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabaseDb } from '../supabaseClient'

const PERFIL_COLORS = {
  gestor: { color: 'var(--neon-orange)', label: 'Gestor' },
  atendente: { color: 'var(--electric-blue)', label: 'Atendente' },
  mecanico: { color: 'var(--status-done)', label: 'Mecanico' },
}

export function Sidebar() {
  const { user, perfil, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const pc = PERFIL_COLORS[perfil] || { color: 'var(--text-secondary)', label: perfil || 'Usuario' }
  const [qtdAlertas, setQtdAlertas] = useState(0)

  useEffect(() => {
    async function carregarAlertas() {
      const { data, error } = await supabaseDb
        .from('item_estoque')
        .select('quantidade,qtd_minima')
        .eq('ativo', true)
      if (!error) setQtdAlertas((data || []).filter(i => i.quantidade <= i.qtd_minima).length)
    }
    carregarAlertas()
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isGestorOuAtendente = !perfil || perfil === 'gestor' || perfil === 'atendente'
  const isGestor = !perfil || perfil === 'gestor'
  const nc = ({ isActive }) => isActive ? 'nav-link active' : 'nav-link'

  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="brand-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--neon-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="var(--neon-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="var(--neon-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="brand-name">SIGAUTO</h1>
      </div>

      <ul className="nav-links">
        {isGestorOuAtendente && <li className="sidebar-item"><NavLink to="/" className={nc} end><LayoutDashboard size={20} /> Dashboard</NavLink></li>}
        <li className="sidebar-item"><NavLink to="/ordens-servico" className={nc}><FileText size={20} /> Ordens de Servico</NavLink></li>
        <li className="sidebar-item"><NavLink to="/historico" className={nc}><History size={20} /> Historico</NavLink></li>
        {isGestorOuAtendente && (
          <>
            <li className="sidebar-item"><NavLink to="/clientes" className={nc}><Users size={20} /> Clientes</NavLink></li>
            <li className="sidebar-item"><NavLink to="/veiculos" className={nc}><CarFront size={20} /> Veiculos</NavLink></li>
            <li className="sidebar-item"><NavLink to="/servicos" className={nc}><Wrench size={20} /> Servicos</NavLink></li>
            <li className="sidebar-item" style={{ position: 'relative' }}>
              <NavLink to="/estoque" className={nc}>
                <Package size={20} /> Estoque
                {qtdAlertas > 0 && (
                  <span style={{ marginLeft: 'auto', background: 'var(--neon-orange)', color: '#fff', borderRadius: '100px', fontSize: '10px', fontWeight: '700', padding: '1px 6px' }}>
                    {qtdAlertas}
                  </span>
                )}
              </NavLink>
            </li>
          </>
        )}
        {isGestor && (
          <>
            <li className="sidebar-item"><NavLink to="/relatorios" className={nc}><BarChart3 size={20} /> Relatorios</NavLink></li>
            <li className="sidebar-item"><NavLink to="/painel-ia" className={nc}><Brain size={20} /> Painel IA</NavLink></li>
            <li className="sidebar-item"><NavLink to="/funcionarios" className={nc}><HardHat size={20} /> Funcionarios</NavLink></li>
            <li className="sidebar-item"><NavLink to="/usuarios" className={nc}><UserCog size={20} /> Usuarios</NavLink></li>
          </>
        )}
      </ul>

      <div className="user-profile">
        <div className="avatar"></div>
        <div className="user-info" style={{ flex: 1 }}>
          <span className="user-name">{user?.user_metadata?.nome || user?.email?.split('@')[0] || 'Usuario'}</span>
          <span className="user-role" style={{ color: pc.color }}>{pc.label}</span>
        </div>
        {isAuthenticated && (
          <button onClick={handleLogout} title="Sair" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--neon-orange)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <LogOut size={16} />
          </button>
        )}
      </div>
    </nav>
  )
}
