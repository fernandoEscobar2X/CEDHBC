import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  ChevronRight,
  Clock,
  FileText,
  Target,
  TrendingUp,
} from 'lucide-react'
import {
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { useExpedientes } from '../../context/ExpedientesContext'
import { useProductivity } from '../../context/ProductivityContext'
import { ESTADO_COLORS, cn, daysSince } from '../../lib/utils'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const PIE_COLORS: Record<string, string> = {
  Admitida: '#3b82f6',
  'En integracion': '#8b5cf6',
  'En conciliacion': '#f59e0b',
  Resuelta: '#10b981',
  Archivada: '#64748b',
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.35 } }),
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: '12px',
  boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
  padding: '10px 12px',
}

type ChartTooltipItem = {
  color?: string
  dataKey?: string
  name?: string
  value?: number | string
}

function DashboardLineTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean
  label?: string
  payload?: ChartTooltipItem[]
}) {
  if (!active || !payload || payload.length === 0) return null

  const rows = payload.filter((item) => item.value !== undefined)
  if (rows.length === 0) return null

  return (
    <div className="min-w-[136px] rounded-xl border border-slate-300 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm">
      <p className="mb-2 text-sm font-semibold text-slate-900">{label}</p>
      <div className="space-y-1.5 text-sm">
        {rows.map((item) => (
          <div key={item.dataKey ?? item.name} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color ?? '#94a3b8' }} />
              {item.dataKey}
            </span>
            <span className="font-semibold text-slate-900">{item.value ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DashboardPieTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ChartTooltipItem[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0]

  return (
    <div className="rounded-xl border border-slate-300 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
      <p className="text-sm text-slate-600">
        Casos: <span className="font-semibold text-slate-900">{item.value ?? 0}</span>
      </p>
    </div>
  )
}

function normalizeEstado(value: string): string {
  const lower = value.toLowerCase()
  if (lower.includes('integr')) return 'En integracion'
  if (lower.includes('concili')) return 'En conciliacion'
  return value
}

function trendLabel(current: number, previous: number) {
  if (previous === 0 && current === 0) return { text: 'Sin cambios', direction: 'flat' as const }
  if (previous === 0 && current > 0) return { text: '+100% este mes', direction: 'up' as const }

  const delta = ((current - previous) / previous) * 100
  if (Math.abs(delta) < 0.1) return { text: 'Sin cambios', direction: 'flat' as const }

  return {
    text: `${delta > 0 ? '+' : ''}${Math.round(delta)}% este mes`,
    direction: delta > 0 ? ('up' as const) : ('down' as const),
  }
}

function inMonth(date: Date, month: number, year: number) {
  return date.getMonth() === month && date.getFullYear() === year
}

export function Dashboard() {
  const { expedientes, loading } = useExpedientes()
  const { nextActions } = useProductivity()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  const data = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const previousDate = new Date(currentYear, currentMonth - 1, 1)
    const previousMonth = previousDate.getMonth()
    const previousYear = previousDate.getFullYear()

    const abiertos = (estado: string) => !['Resuelta', 'Archivada'].includes(estado)
    const thisMonth = expedientes.filter((e) => inMonth(new Date(e.created_at), currentMonth, currentYear))
    const prevMonth = expedientes.filter((e) => inMonth(new Date(e.created_at), previousMonth, previousYear))

    const casesMonth = thisMonth.length
    const casesMonthPrev = prevMonth.length

    const resolvedMonth = thisMonth.filter((e) => e.estado === 'Resuelta').length
    const resolvedMonthPrev = prevMonth.filter((e) => e.estado === 'Resuelta').length

    const inProcessTotal = expedientes.filter((e) => abiertos(e.estado)).length
    const inProcessPrev = prevMonth.filter((e) => abiertos(e.estado)).length
    const inProcessCurrent = thisMonth.filter((e) => abiertos(e.estado)).length

    const urgentTotal = expedientes.filter((e) => abiertos(e.estado) && daysSince(e.fecha_ultimo_movimiento) >= 30).length
    const urgentPrev = prevMonth.filter((e) => abiertos(e.estado) && daysSince(e.fecha_ultimo_movimiento) >= 30).length
    const urgentCurrent = thisMonth.filter((e) => abiertos(e.estado) && daysSince(e.fecha_ultimo_movimiento) >= 30).length

    const monthlyBuckets: Record<string, { ingresos: number; resueltos: number }> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1)
      const key = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`
      monthlyBuckets[key] = { ingresos: 0, resueltos: 0 }
    }

    expedientes.forEach((e) => {
      const d = new Date(e.created_at)
      const key = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`
      if (key in monthlyBuckets) {
        monthlyBuckets[key].ingresos += 1
        if (e.estado === 'Resuelta') {
          monthlyBuckets[key].resueltos += 1
        }
      }
    })

    const monthlyData = Object.entries(monthlyBuckets).map(([mes, values]) => ({
      mes,
      ingresos: values.ingresos,
      resueltos: values.resueltos,
    }))

    const estadoCounts: Record<string, number> = {}
    expedientes.forEach((e) => {
      const clean = normalizeEstado(e.estado)
      estadoCounts[clean] = (estadoCounts[clean] ?? 0) + 1
    })
    const estadoData = Object.entries(estadoCounts).map(([name, value]) => ({ name, value }))

    const recent = [...expedientes].slice(0, 6)
    const activity = [...expedientes].slice(0, 5).map((e, idx) => ({
      id: e.id,
      title: idx % 2 === 0 ? 'Nuevo expediente creado' : 'Expediente actualizado',
      detail: `${e.folio} - ${e.visitador_asignado}`,
      at: new Date(idx % 2 === 0 ? e.created_at : e.updated_at),
      dot:
        idx % 4 === 0
          ? 'bg-blue-500'
          : idx % 4 === 1
            ? 'bg-amber-500'
            : idx % 4 === 2
              ? 'bg-emerald-500'
              : 'bg-purple-500',
    }))

    const nowDate = new Date()
    const today = nowDate.toISOString().split('T')[0]
    const openCases = expedientes.filter((item) => abiertos(item.estado))
    const totalOpen = openCases.length

    const queueItems = openCases
      .map((item) => {
        const action = nextActions[item.id]
        const staleDays = daysSince(item.fecha_ultimo_movimiento)
        const overdue = action ? action.dueDate < today && !action.completed : false
        const dueToday = action ? action.dueDate === today && !action.completed : false
        const noAction = !action

        const priority = overdue ? 0 : dueToday ? 1 : noAction ? 2 : staleDays >= 30 ? 3 : 4
        const kind = overdue
          ? 'overdue'
          : dueToday
            ? 'today'
            : noAction
              ? 'missing'
              : staleDays >= 30
                ? 'stale'
                : 'planned'

        return {
          id: item.id,
          folio: item.folio,
          visitador: item.visitador_asignado,
          kind,
          priority,
          detail:
            kind === 'overdue'
              ? `Vencida: ${action?.text}`
              : kind === 'today'
                ? `Hoy: ${action?.text}`
                : kind === 'missing'
                  ? 'Sin proxima accion asignada'
                  : kind === 'stale'
                    ? `Sin movimiento ${staleDays} dias`
                    : action?.text ?? 'Planificado',
          dueDate: action?.dueDate ?? null,
          completed: action?.completed ?? false,
        }
      })
      .sort((a, b) => a.priority - b.priority)

    const actionableToday = queueItems.filter((item) => ['overdue', 'today', 'missing', 'stale'].includes(item.kind))
    const completedActions = Object.values(nextActions).filter((item) => item.completed).length
    const overdueActions = queueItems.filter((item) => item.kind === 'overdue').length
    const avgResolutionDays = (() => {
      const resolved = expedientes.filter((item) => item.estado === 'Resuelta')
      if (resolved.length === 0) return 0
      const totalDays = resolved.reduce((sum, item) => {
        const created = new Date(item.created_at)
        const updated = new Date(item.updated_at)
        const diff = Math.max(0, Math.floor((updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)))
        return sum + diff
      }, 0)
      return Math.round(totalDays / resolved.length)
    })()

    return {
      casesMonth,
      resolvedMonth,
      inProcessTotal,
      urgentTotal,
      monthlyData,
      estadoData,
      recent,
      activity,
      queue: actionableToday.slice(0, 8),
      productivity: {
        totalOpen,
        backlogWithoutAction: queueItems.filter((item) => item.kind === 'missing').length,
        completedActions,
        overdueActions,
        avgResolutionDays,
      },
      trends: {
        cases: trendLabel(casesMonth, casesMonthPrev),
        resolved: trendLabel(resolvedMonth, resolvedMonthPrev),
        inProcess: trendLabel(inProcessCurrent, inProcessPrev),
        urgent: trendLabel(urgentCurrent, urgentPrev),
      },
    }
  }, [expedientes, nextActions])

  const statCards = [
    {
      title: 'Casos del Mes',
      value: data.casesMonth,
      icon: FileText,
      iconBg: 'bg-blue-600',
      trend: data.trends.cases,
    },
    {
      title: 'Casos Resueltos',
      value: data.resolvedMonth,
      icon: CheckCircle2,
      iconBg: 'bg-emerald-600',
      trend: data.trends.resolved,
    },
    {
      title: 'En Proceso',
      value: data.inProcessTotal,
      icon: Clock,
      iconBg: 'bg-amber-500',
      trend: data.trends.inProcess,
    },
    {
      title: 'Requieren Atencion',
      value: data.urgentTotal,
      icon: AlertCircle,
      iconBg: 'bg-rose-600',
      trend: data.trends.urgent,
    },
  ]

  const chartAnimationEnabled = !shouldReduceMotion
  const hasMonthlyMovement = data.monthlyData.some((item) => item.ingresos > 0 || item.resueltos > 0)
  const estadoTotal = data.estadoData.reduce((sum, item) => sum + item.value, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Panel Principal</h1>
          <p className="mt-1 text-slate-600">Comision Estatal de Derechos Humanos de Baja California</p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-sm text-slate-600">Ultima actualizacion</p>
          <p className="text-lg font-semibold capitalize text-slate-900">
            {format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}
          </p>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">Bandeja de Hoy</h2>
          </div>
          {data.queue.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              Sin pendientes criticos para hoy.
            </p>
          ) : (
            <div className="space-y-2">
              {data.queue.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate('/expedientes')}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors',
                    item.kind === 'overdue'
                      ? 'border-red-200 bg-red-50'
                      : item.kind === 'today'
                        ? 'border-blue-200 bg-blue-50'
                        : item.kind === 'missing'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-slate-200 bg-slate-50',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold text-slate-800">{item.folio}</p>
                    <p className="truncate text-xs text-slate-600">{item.detail}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-purple-600" />
            <h2 className="text-sm font-semibold text-slate-900">Acciones Rapidas</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate('/nuevo')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Nuevo caso
            </button>
            <button
              onClick={() => navigate('/expedientes')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Buscar caso
            </button>
            <button
              onClick={() => navigate('/reportes')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Reportes
            </button>
            <button
              onClick={() => navigate('/expedientes?q=')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Bandeja hoy
            </button>
          </div>
        </article>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, idx) => (
          <motion.article
            key={card.title}
            custom={idx}
            initial={shouldReduceMotion ? { opacity: 1, y: 0 } : 'hidden'}
            animate={shouldReduceMotion ? { opacity: 1, y: 0 } : 'show'}
            variants={fadeUp}
            className="interactive-surface gpu-smooth rounded-2xl border border-slate-200 bg-white p-6 shadow-lg hover:shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-600">{card.title}</p>
                <p className="mb-2 text-3xl font-bold text-slate-900">{card.value}</p>
                <div
                  className={cn(
                    'flex items-center gap-1 text-sm font-medium',
                    card.trend.direction === 'up'
                      ? 'text-green-600'
                      : card.trend.direction === 'down'
                        ? 'text-red-600'
                        : 'text-slate-500',
                  )}
                >
                  <TrendingUp className={cn('h-4 w-4', card.trend.direction === 'down' && 'rotate-180')} aria-hidden />
                  <span>{card.trend.text}</span>
                </div>
              </div>
              <div
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-xl shadow-lg',
                  card.iconBg,
                )}
              >
                <card.icon className="h-7 w-7 text-white" aria-hidden />
              </div>
            </div>
          </motion.article>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <motion.section
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25 }}
          className="interactive-surface gpu-smooth rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Ingresos Mensuales</h2>
            <div className="rounded-lg bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">6 meses</div>
          </div>
          {hasMonthlyMovement ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.monthlyData}>
                  <CartesianGrid strokeDasharray="3 6" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="mes" stroke="#64748b" axisLine={false} tickLine={false} tickMargin={10} />
                  <YAxis stroke="#64748b" axisLine={false} tickLine={false} tickMargin={8} allowDecimals={false} width={36} />
                  <Tooltip
                    isAnimationActive={false}
                    cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1 }}
                    content={<DashboardLineTooltip />}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    wrapperStyle={{ pointerEvents: 'none' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ingresos"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
                    isAnimationActive={chartAnimationEnabled}
                    animationDuration={680}
                    animationEasing="ease-in-out"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Line
                    type="monotone"
                    dataKey="resueltos"
                    stroke="#059669"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
                    isAnimationActive={chartAnimationEnabled}
                    animationDuration={680}
                    animationEasing="ease-in-out"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-2 flex items-center justify-center gap-6 text-sm">
                <span className="inline-flex items-center gap-2 text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  ingresos
                </span>
                <span className="inline-flex items-center gap-2 text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                  resueltos
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 text-center">
              <TrendingUp className="mb-3 h-8 w-8 text-slate-400" aria-hidden />
              <p className="text-sm font-semibold text-slate-700">Sin movimiento en los ultimos 6 meses</p>
              <p className="mt-1 text-xs text-slate-500">La grafica se animara automaticamente cuando existan nuevos ingresos.</p>
            </div>
          )}
        </motion.section>

        <motion.section
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.06, duration: 0.25 }}
          className="interactive-surface gpu-smooth rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Expedientes por Estado</h2>
            <div className="rounded-lg bg-purple-50 px-3 py-1 text-sm font-medium text-purple-700">Distribucion</div>
          </div>
          {data.estadoData.length === 0 ? (
            <div className="flex h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 text-center">
              <AlertCircle className="mb-3 h-8 w-8 text-slate-400" aria-hidden />
              <p className="text-sm font-semibold text-slate-700">Sin estados para mostrar</p>
              <p className="mt-1 text-xs text-slate-500">Los estados apareceran en cuanto registres expedientes.</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data.estadoData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={104}
                    innerRadius={60}
                    paddingAngle={2}
                    cornerRadius={6}
                    isAnimationActive={chartAnimationEnabled}
                    animationDuration={680}
                    animationEasing="ease-in-out"
                  >
                    {data.estadoData.map((entry) => (
                      <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? '#94a3b8'} />
                    ))}
                    <Label
                      position="center"
                      content={({ viewBox }) => {
                        const pieViewBox = viewBox as { cx?: number; cy?: number } | undefined
                        const cx = typeof pieViewBox?.cx === 'number' ? pieViewBox.cx : 0
                        const cy = typeof pieViewBox?.cy === 'number' ? pieViewBox.cy : 0
                        return (
                          <g>
                            <text x={cx} y={cy - 2} textAnchor="middle" fill="#0f172a" fontSize={24} fontWeight={700}>
                              {estadoTotal}
                            </text>
                            <text x={cx} y={cy + 16} textAnchor="middle" fill="#64748b" fontSize={11}>
                              total
                            </text>
                          </g>
                        )
                      }}
                    />
                  </Pie>
                  <Tooltip
                    isAnimationActive={false}
                    content={<DashboardPieTooltip />}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    wrapperStyle={{ pointerEvents: 'none' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.estadoData.map((item) => {
                  const pct = estadoTotal > 0 ? Math.round((item.value / estadoTotal) * 100) : 0
                  return (
                    <div key={item.name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <span className="inline-flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[item.name] ?? '#94a3b8' }} />
                        {item.name}
                      </span>
                      <span className="font-semibold text-slate-900">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </motion.section>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Backlog abierto</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{data.productivity.totalOpen}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Sin proxima accion</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{data.productivity.backlogWithoutAction}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Acciones vencidas</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{data.productivity.overdueActions}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Resolucion promedio</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{data.productivity.avgResolutionDays} d</p>
        </article>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <motion.section
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.1, duration: 0.25 }}
          className="interactive-surface gpu-smooth rounded-2xl border border-slate-200 bg-white p-6 shadow-lg xl:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Expedientes Recientes</h2>
            <span className="text-sm font-medium text-blue-700">Ultimos registros</span>
          </div>

          {data.recent.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              No hay expedientes registrados.
            </div>
          ) : (
            <div className="space-y-2">
              {data.recent.map((exp) => {
                const estado = ESTADO_COLORS[exp.estado as keyof typeof ESTADO_COLORS]
                return (
                  <article
                    key={exp.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-300 hover:bg-slate-50"
                  >
                    <span className={cn('h-2.5 w-2.5 rounded-full', estado?.dot ?? 'bg-slate-400')} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm font-semibold text-blue-600">{exp.folio}</p>
                      <p className="truncate text-sm text-slate-600">{exp.tipo_derecho}</p>
                    </div>
                    <span className={cn('rounded-md border px-2.5 py-1 text-xs font-medium', estado?.badge)}>{exp.estado}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
                  </article>
                )
              })}
            </div>
          )}
        </motion.section>

        <motion.section
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.15, duration: 0.25 }}
          className="interactive-surface gpu-smooth rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        >
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900">
            <Activity className="h-5 w-5 text-blue-600" aria-hidden />
            Actividad Reciente
          </h2>

          {data.activity.length === 0 ? (
            <p className="text-sm text-slate-500">Sin actividad reciente</p>
          ) : (
            <div className="space-y-3">
              {data.activity.map((item) => (
                <article key={item.id} className="flex items-center gap-4 rounded-xl bg-slate-50 p-4 transition-colors hover:bg-slate-100">
                  <span className={cn('h-2 w-2 rounded-full', item.dot)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{item.title}</p>
                    <p className="truncate text-sm text-slate-600">{item.detail}</p>
                  </div>
                  <span className="text-xs text-slate-500">{format(item.at, 'dd/MM HH:mm')}</span>
                </article>
              ))}
            </div>
          )}
        </motion.section>
      </div>
    </div>
  )
}
