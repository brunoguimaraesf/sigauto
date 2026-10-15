import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, CarFront, Users, Wrench, BarChart3, FileText, Package, Brain, UserCog, HardHat, History, LogOut, Building2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabaseDb } from '../supabaseClient'

const PERFIL_COLORS = {
  gestor: { color: 'var(--color-primary)', label: 'Gestor' },
  atendente: { color: 'var(--color-warning)', label: 'Atendente' },
  mecanico: { color: 'var(--color-success)', label: 'Mecanico' },
}

export function Sidebar() {
  const { user, perfil, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const pc = PERFIL_COLORS[perfil] || { color: 'var(--text-secondary)', label: perfil || 'Usuario' }
  const [qtdAlertas, setQtdAlertas] = useState(0)

  useEffect(() => {
    async function carregarAlertas() {
      // Le pela view sem `custo` (migracao 19): a tabela item_estoque passou a
      // ser legivel so por gestor. Fallback para a tabela em bancos pre-19.
      let { data, error } = await supabaseDb
        .from('item_estoque_publico')
        .select('quantidade,qtd_minima')
        .eq('ativo', true)
      if (error) ({ data, error } = await supabaseDb
        .from('item_estoque')
        .select('quantidade,qtd_minima')
        .eq('ativo', true))
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
          <img src="/logo-sigauto.png" alt="Logo SIGAUTO" />
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
                  <span style={{ marginLeft: 'auto', background: 'var(--color-warning)', color: 'var(--text-inverse)', borderRadius: '100px', fontSize: '10px', fontWeight: '700', padding: '1px 6px' }}>
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
            <li className="sidebar-item"><NavLink to="/configuracao-oficina" className={nc}><Building2 size={20} /> Oficina</NavLink></li>
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
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <LogOut size={16} />
          </button>
        )}
      </div>
    </nav>
  )
}
