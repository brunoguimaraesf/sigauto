import { useState, useRef, useEffect } from 'react'
import { Bell, Wrench, Clock, Package, CheckCircle } from 'lucide-react'
import { useDatabase } from '../hooks/useDatabase'
import { useNavigate } from 'react-router-dom'

export function Header() {
  const { ordensServico, veiculos, clientes } = useDatabase()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const notifications = [
    ...ordensServico
      .filter(os => os.status === 'aberta' || os.status === 'Pendente')
      .slice(0, 4)
      .map(os => ({
        id: os.id,
        icon: <Clock size={14} color="var(--status-pending)" />,
        title: `O.S. #${os.numero_os || os.id?.slice(-4).toUpperCase()} aberta`,
        desc: os.descricao || 'Aguardando atendimento',
        color: 'var(--status-pending)',
        route: `/ordens-servico/${os.id}`,
      })),
    ...ordensServico
      .filter(os => os.status === 'aguardando_peca')
      .slice(0, 3)
      .map(os => ({
        id: os.id + '_peca',
        icon: <Package size={14} color="var(--neon-orange)" />,
        title: `O.S. #${os.numero_os || os.id?.slice(-4).toUpperCase()} — aguardando peça`,
        desc: os.descricao || 'Peça não disponível em estoque',
        color: 'var(--neon-orange)',
        route: `/ordens-servico/${os.id}`,
      })),
    ...ordensServico
      .filter(os => os.status === 'em_andamento' || os.status === 'Em Andamento')
      .slice(0, 3)
      .map(os => ({
        id: os.id + '_and',
        icon: <Wrench size={14} color="var(--status-progress)" />,
        title: `O.S. #${os.numero_os || os.id?.slice(-4).toUpperCase()} em andamento`,
        desc: os.descricao || 'Serviço em execução',
        color: 'var(--status-progress)',
        route: `/ordens-servico/${os.id}`,
      })),
  ]

  const unread = notifications.length

  return (
    <header className="top-header" style={{ justifyContent: 'flex-end', padding: '0 32px' }}>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          className="btn-icon"
          onClick={() => setOpen(v => !v)}
          style={{
            position: 'relative',
            padding: '8px',
            borderRadius: '50%',
            transition: 'background 0.15s',
            background: open ? 'rgba(232,89,12,0.1)' : 'transparent',
            color: open ? 'var(--neon-orange)' : 'var(--text-secondary)',
          }}
        >
          <Bell size={22} />
          {unread > 0 && (
            <span style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: 'var(--neon-orange)',
              color: '#fff',
              fontSize: '10px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {open && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: '340px',
            background: '#232323',
            border: '1px solid rgba(232,89,12,0.2)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 20px rgba(232,89,12,0.06)',
            zIndex: 200,
            overflow: 'hidden',
          }}>
            {/* cabeçalho do dropdown */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                Notificações
              </span>
              <span style={{ fontSize: '11px', color: 'var(--neon-orange)', fontWeight: '600' }}>
                {unread} pendentes
              </span>
            </div>

            {/* lista */}
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <CheckCircle size={28} color="var(--status-done)" style={{ marginBottom: '10px', opacity: 0.7 }} />
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Tudo em dia. Nenhum alerta.</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { navigate(n.route); setOpen(false) }}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      width: '100%',
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ marginTop: '2px', flexShrink: 0, width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {n.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {n.desc}
                      </div>
                    </div>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: n.color, flexShrink: 0, marginTop: '6px' }} />
                  </button>
                ))
              )}
            </div>

            {/* rodapé */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {veiculos.length} veíc. · {clientes.length} clientes
              </span>
              <button
                className="btn-link"
                style={{ fontSize: '11px' }}
                onClick={() => { navigate('/ordens-servico'); setOpen(false) }}
              >
                Ver todas as O.S.
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
