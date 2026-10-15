import { useState, useRef, useEffect } from 'react'
import { Bell, Wrench, Clock, Package, CheckCircle } from 'lucide-react'
import { useDatabase } from '../hooks/useDatabase'
import { useNavigate } from 'react-router-dom'
import css from './Header.module.css'

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
        icon: <Package size={14} color="var(--color-warning)" />,
        title: `O.S. #${os.numero_os || os.id?.slice(-4).toUpperCase()} — aguardando peça`,
        desc: os.descricao || 'Peça não disponível em estoque',
        color: 'var(--color-warning)',
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
    <header className={`top-header ${css.header}`}>
      <div ref={ref} className={css.wrapper}>
        <button
          className={`btn-icon ${css.bell}${open ? ` ${css.bellOpen}` : ''}`}
          onClick={() => setOpen(v => !v)}
          aria-label="Notificações"
          aria-expanded={open}
        >
          <Bell size={22} />
          {unread > 0 && (
            <span className={css.badge}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {open && (
          <div className={css.dropdown}>
            {/* cabeçalho do dropdown */}
            <div className={css.dropHeader}>
              <span className={css.dropTitulo}>
                Notificações
              </span>
              <span className={css.dropContador}>
                {unread} pendentes
              </span>
            </div>

            {/* lista */}
            <div className={css.lista}>
              {notifications.length === 0 ? (
                <div className={css.vazio}>
                  <CheckCircle size={28} color="var(--status-done)" className={css.vazioIcone} />
                  <p className={css.vazioTexto}>Tudo em dia. Nenhum alerta.</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { navigate(n.route); setOpen(false) }}
                    className={css.notifItem}
                  >
                    <div className={css.notifIcone}>
                      {n.icon}
                    </div>
                    <div className={css.notifTexto}>
                      <div className={css.notifTitulo}>
                        {n.title}
                      </div>
                      <div className={css.notifDesc}>
                        {n.desc}
                      </div>
                    </div>
                    <div className={css.notifDot} style={{ background: n.color }} />
                  </button>
                ))
              )}
            </div>

            {/* rodapé */}
            <div className={css.rodape}>
              <span className={css.rodapeInfo}>
                {veiculos.length} veíc. · {clientes.length} clientes
              </span>
              <button
                className={`btn-link ${css.rodapeBtn}`}
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
