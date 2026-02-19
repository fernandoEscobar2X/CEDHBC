import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCheck,
  ChevronRight,
  Clock,
  FilePlus,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Scale,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationsContext'
import { useExpedientes } from '../../context/ExpedientesContext'
import { useProductivity } from '../../context/ProductivityContext'
import { cn } from '../../lib/utils'
import { format, formatDistanceToNow, isThisWeek, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Panel Principal', end: true },
  { to: '/expedientes', icon: FileText, label: 'Expedientes' },
  { to: '/nuevo', icon: FilePlus, label: 'Nuevo Expediente' },
  { to: '/reportes', icon: BarChart3, label: 'Reportes' },
  { to: '/configuracion', icon: Settings, label: 'Configuracion' },
]

const NOTIF_META = {
  success: {
    icon: RefreshCw,
    dot: 'bg-emerald-500',
    iconColor: 'text-emerald-600',
    bg: 'bg-emerald-50',
    unread: 'border-emerald-200',
  },
  warning: {
    icon: Clock,
    dot: 'bg-amber-500',
    iconColor: 'text-amber-600',
    bg: 'bg-amber-50',
    unread: 'border-amber-200',
  },
  info: {
    icon: FileText,
    dot: 'bg-blue-500',
    iconColor: 'text-blue-600',
    bg: 'bg-blue-50',
    unread: 'border-blue-200',
  },
  error: {
    icon: AlertTriangle,
    dot: 'bg-red-500',
    iconColor: 'text-red-600',
    bg: 'bg-red-50',
    unread: 'border-red-200',
  },
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const SYSTEM_NOTIF_IDS = {
  staleCases: 'system-stale-cases',
  createdToday: 'system-created-today',
  dailyPlanner: 'system-daily-planner',
}

export function AppLayout() {
  const { user, signOut } = useAuth()
  const { expedientes, loading: expedientesLoading } = useExpedientes()
  const { nextActions } = useProductivity()
  const {
    notifications,
    unreadCount,
    markAllRead,
    markRead,
    clearAll,
    upsertSystemNotification,
    removeNotification,
    addNotification,
  } =
    useNotifications()
  const [notifOpen, setNotifOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const shouldReduceMotion = useReducedMotion()
  const notifTriggerRef = useRef<HTMLButtonElement | null>(null)
  const notifPanelRef = useRef<HTMLElement | null>(null)

  const closeNotif = () => setNotifOpen(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    const { error } = await signOut()
    if (error) {
      setSigningOut(false)
      addNotification({
        type: 'error',
        title: 'Error al cerrar sesion',
        message: error,
      })
    }
  }

  const today = format(new Date(), 'dd MMM yyyy', { locale: es })

  const groupedNotifications = useMemo(() => {
    const groups = {
      Hoy: notifications.filter((n) => isToday(n.timestamp)),
      Ayer: notifications.filter((n) => isYesterday(n.timestamp)),
      'Esta semana': notifications.filter(
        (n) => isThisWeek(n.timestamp, { weekStartsOn: 1 }) && !isToday(n.timestamp) && !isYesterday(n.timestamp),
      ),
      Anteriores: notifications.filter(
        (n) => !isThisWeek(n.timestamp, { weekStartsOn: 1 }) && !isToday(n.timestamp) && !isYesterday(n.timestamp),
      ),
    }

    return Object.entries(groups).filter(([, values]) => values.length > 0)
  }, [notifications])

  useEffect(() => {
    if (expedientesLoading) return

    const abiertos = (estado: string) => !['Resuelta', 'Archivada'].includes(estado)
    const staleCases = expedientes.filter((exp) => abiertos(exp.estado) && (() => {
      const movedAt = new Date(exp.fecha_ultimo_movimiento)
      const now = new Date()
      const diffDays = Math.floor((now.getTime() - movedAt.getTime()) / (1000 * 60 * 60 * 24))
      return diffDays >= 30
    })())
    const createdToday = expedientes.filter((exp) => isToday(new Date(exp.created_at))).length

    if (staleCases.length > 0) {
      upsertSystemNotification(SYSTEM_NOTIF_IDS.staleCases, {
        type: 'warning',
        title: 'Casos sin movimiento',
        message: `Hay ${staleCases.length} expediente${staleCases.length === 1 ? '' : 's'} con mas de 30 dias sin actualizacion.`,
      })
    } else {
      removeNotification(SYSTEM_NOTIF_IDS.staleCases)
    }

    if (createdToday > 0) {
      upsertSystemNotification(SYSTEM_NOTIF_IDS.createdToday, {
        type: 'info',
        title: 'Nuevos expedientes hoy',
        message: `Se registraron ${createdToday} expediente${createdToday === 1 ? '' : 's'} durante el dia.`,
      })
    } else {
      removeNotification(SYSTEM_NOTIF_IDS.createdToday)
    }

    const today = new Date().toISOString().split('T')[0]
    const openCases = expedientes.filter((exp) => abiertos(exp.estado))
    const overdueActions = openCases.filter((exp) => {
      const action = nextActions[exp.id]
      return action && !action.completed && action.dueDate < today
    }).length
    const dueTodayActions = openCases.filter((exp) => {
      const action = nextActions[exp.id]
      return action && !action.completed && action.dueDate === today
    }).length
    const missingActions = openCases.filter((exp) => !nextActions[exp.id]).length

    if (overdueActions > 0 || dueTodayActions > 0 || missingActions > 0) {
      const pieces = [
        overdueActions > 0 ? `${overdueActions} vencidas` : null,
        dueTodayActions > 0 ? `${dueTodayActions} para hoy` : null,
        missingActions > 0 ? `${missingActions} sin accion` : null,
      ].filter(Boolean)

      upsertSystemNotification(SYSTEM_NOTIF_IDS.dailyPlanner, {
        type: overdueActions > 0 ? 'warning' : 'info',
        title: 'Agenda diaria',
        message: `Pendientes de hoy: ${pieces.join(', ')}.`,
      })
    } else {
      removeNotification(SYSTEM_NOTIF_IDS.dailyPlanner)
    }
  }, [expedientes, expedientesLoading, upsertSystemNotification, removeNotification, nextActions])

  useEffect(() => {
    if (!notifOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [notifOpen])

  useEffect(() => {
    if (!notifOpen) return

    const panel = notifPanelRef.current
    if (!panel) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const triggerButton = notifTriggerRef.current
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    const first = focusables[0] ?? panel
    const last = focusables[focusables.length - 1] ?? panel

    const rafId = window.requestAnimationFrame(() => first.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeNotif()
        return
      }

      if (event.key !== 'Tab') return
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(rafId)
      document.removeEventListener('keydown', handleKeyDown)
      ;(previousFocus ?? triggerButton)?.focus()
    }
  }, [notifOpen])

  return (
    <div className="h-screen overflow-hidden bg-slate-100">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.button
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            aria-label="Cerrar menu lateral"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-slate-900 text-white shadow-2xl transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="border-b border-blue-700/50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm">
              <Scale className="h-7 w-7 text-blue-200" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-bold">CEDHBC</h1>
              <p className="text-xs text-blue-200">Sistema de Expedientes</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2 p-4" aria-label="Navegacion principal">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 focus-visible:ring-white/80 focus-visible:ring-offset-blue-900',
                  isActive
                    ? 'bg-white text-blue-900 shadow-lg shadow-blue-950/20'
                    : 'text-blue-100 hover:translate-x-1 hover:bg-white/10 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn('h-5 w-5', isActive && 'text-blue-600')} aria-hidden />
                  <span className="font-medium">{item.label}</span>
                  {isActive && <ChevronRight className="ml-auto h-4 w-4 text-blue-600" aria-hidden />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-blue-700/50 p-4">
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Administrador</p>
              <p className="truncate text-xs text-blue-300">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-200 transition-all duration-200 hover:bg-red-500/20 hover:text-white disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Cerrar Sesion
          </button>
        </div>
      </aside>

      <div className="flex h-full flex-col lg:ml-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 px-4 py-4 shadow-sm backdrop-blur-sm sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
                aria-label="Abrir menu lateral"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
              <div>
                <p className="text-sm text-slate-600">Bienvenido de nuevo</p>
                <p className="font-semibold text-slate-900">{user?.email ?? 'Administrador'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                ref={notifTriggerRef}
                onClick={() => setNotifOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={notifOpen}
                aria-controls="notifications-panel"
                aria-label={`Notificaciones${unreadCount > 0 ? `, ${unreadCount} sin leer` : ''}`}
                className="relative rounded-xl border border-slate-200 bg-white p-3 transition-all duration-200 hover:shadow-md"
              >
                <Bell className="h-5 w-5 text-slate-700" aria-hidden />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden />
                )}
              </button>

              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2">
                <p className="text-xs font-semibold text-blue-700 capitalize">{today}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8">
          <Outlet />
        </main>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur-sm lg:hidden"
        aria-label="Accesos rapidos"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
          {NAV_ITEMS.slice(0, 4).map((item) => (
            <NavLink
              key={`mobile-${item.to}`}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold transition-colors',
                  isActive ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              <item.icon className="h-4 w-4" aria-hidden />
              <span className="truncate">{item.label.replace('Panel ', '')}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <AnimatePresence>
        {notifOpen && (
          <>
            <motion.button
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
              onClick={closeNotif}
              className="fixed inset-0 z-40 bg-black/20"
              aria-label="Cerrar panel de notificaciones"
            />

            <motion.aside
              id="notifications-panel"
              ref={notifPanelRef}
              tabIndex={-1}
              initial={shouldReduceMotion ? { x: 0 } : { x: '100%' }}
              animate={{ x: 0 }}
              exit={shouldReduceMotion ? { x: 0 } : { x: '100%' }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
              aria-label="Centro de notificaciones"
              aria-modal="true"
              role="dialog"
            >
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="notifications-title" className="text-xl font-bold text-slate-900">
                      Notificaciones
                    </h2>
                    <p className="text-xs text-slate-500">{unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al dia'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={markAllRead}
                      className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      aria-label="Marcar todas como leidas"
                    >
                      <CheckCheck className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={clearAll}
                      className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label="Eliminar notificaciones"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={closeNotif}
                      className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Cerrar"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-4">
                {notifications.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center text-slate-400">
                    <Bell className="mb-2 h-10 w-10 opacity-30" aria-hidden />
                    <p className="text-sm">Sin notificaciones</p>
                  </div>
                ) : (
                  groupedNotifications.map(([title, items]) => (
                    <section key={title}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
                      <div className="space-y-2">
                        {items.map((n) => {
                          const meta = NOTIF_META[n.type]
                          const Icon = meta.icon
                          return (
                            <motion.button
                              key={n.id}
                              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: 16 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
                              onClick={() => markRead(n.id)}
                              className={cn(
                                'w-full rounded-xl border p-3 text-left transition-colors hover:bg-slate-50',
                                n.read ? 'border-slate-200 bg-white' : `${meta.bg} ${meta.unread}`,
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={cn(
                                    'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
                                    meta.bg,
                                  )}
                                >
                                  <Icon className={cn('h-4 w-4', meta.iconColor)} aria-hidden />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden />
                                    <p className="truncate text-sm font-semibold text-slate-900">{n.title}</p>
                                  </div>
                                  <p className="mt-0.5 text-xs text-slate-600">{n.message}</p>
                                  <p className="mt-1.5 text-[11px] text-slate-400">
                                    {formatDistanceToNow(n.timestamp, { addSuffix: true, locale: es })}
                                  </p>
                                </div>
                              </div>
                            </motion.button>
                          )
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
