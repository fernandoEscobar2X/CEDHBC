import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  Eye,
  Filter,
  Search,
  Trash2,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { subMonths } from 'date-fns'
import { useExpedientes } from '../../context/ExpedientesContext'
import { useNotifications } from '../../context/NotificationsContext'
import { ESTADO_COLORS, ESTADOS, VISITADORES, cn, daysSince, formatDate, sanitizeSpreadsheetCell } from '../../lib/utils'
import type { Expediente } from '../../types/database'
import { ExpedienteModal } from './ExpedienteModal'

type DateFilter = 'todos' | 'este_mes' | 'ultimo_mes' | 'este_anio'

const PAGE_SIZE = 10

export function ExpedientesList() {
  const navigate = useNavigate()
  const location = useLocation()
  const { expedientes, loading, deleteExpediente } = useExpedientes()
  const { addNotification } = useNotifications()

  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState('Todos')
  const [filterVisitador, setFilterVisitador] = useState('Todos')
  const [filterFecha, setFilterFecha] = useState<DateFilter>('todos')
  const [page, setPage] = useState(1)
  const [selectedExp, setSelectedExp] = useState<Expediente | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const query = new URLSearchParams(location.search).get('q') ?? ''
    setSearch(query)
    setPage(1)
  }, [location.search])

  const matchesDate = useCallback(
    (exp: Expediente) => {
      if (filterFecha === 'todos') return true

      const created = new Date(exp.created_at)
      const now = new Date()

      if (filterFecha === 'este_mes') {
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()
      }

      if (filterFecha === 'ultimo_mes') {
        const prev = subMonths(now, 1)
        return created.getMonth() === prev.getMonth() && created.getFullYear() === prev.getFullYear()
      }

      return created.getFullYear() === now.getFullYear()
    },
    [filterFecha],
  )

  const filtered = useMemo(() => {
    return expedientes.filter((e) => {
      const matchSearch =
        !search ||
        e.folio.toLowerCase().includes(search.toLowerCase()) ||
        e.tipo_derecho.toLowerCase().includes(search.toLowerCase()) ||
        e.autoridad_responsable.toLowerCase().includes(search.toLowerCase()) ||
        e.visitador_asignado.toLowerCase().includes(search.toLowerCase()) ||
        e.estado.toLowerCase().includes(search.toLowerCase())

      const matchEstado = filterEstado === 'Todos' || e.estado === filterEstado
      const matchVisitador = filterVisitador === 'Todos' || e.visitador_asignado === filterVisitador

      return matchSearch && matchEstado && matchVisitador && matchesDate(e)
    })
  }, [expedientes, search, filterEstado, filterVisitador, matchesDate])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(filtered.length, page * PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  const resetFilters = () => {
    setSearch('')
    setFilterEstado('Todos')
    setFilterVisitador('Todos')
    setFilterFecha('todos')
    setPage(1)
  }

  const exportList = () => {
    const headers = ['Folio', 'Fecha', 'Derecho', 'Autoridad', 'Visitador', 'Estado']
    const rows = filtered.map((exp) =>
      [exp.folio, formatDate(exp.fecha_presentacion), exp.tipo_derecho, exp.autoridad_responsable, exp.visitador_asignado, exp.estado]
        .map((v) => `"${sanitizeSpreadsheetCell(String(v)).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'CEDHBC_Expedientes.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDelete = async (exp: Expediente) => {
    const confirmed = window.confirm(`Eliminar expediente ${exp.folio}? Esta accion no se puede deshacer.`)
    if (!confirmed) return

    setDeletingId(exp.id)
    const { error } = await deleteExpediente(exp.id)
    setDeletingId(null)

    if (error) {
      addNotification({ type: 'error', title: 'No se pudo eliminar', message: error })
      return
    }

    addNotification({
      type: 'warning',
      title: 'Expediente eliminado',
      message: `${exp.folio} fue removido del sistema.`,
    })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Expedientes</h1>
          <p className="mt-1 text-slate-600">Gestion y seguimiento de casos</p>
        </div>
        <button
          onClick={exportList}
          className="flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-medium text-white transition-all duration-300 hover:bg-blue-800 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Download className="h-5 w-5" />
          Exportar Lista
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-600" />
          <h2 className="font-medium text-slate-900">Filtros</h2>
          <button
            onClick={resetFilters}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Limpiar
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Buscar por folio, derecho, autoridad, visitador..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="relative">
            <select
              value={filterEstado}
              onChange={(e) => {
                setFilterEstado(e.target.value)
                setPage(1)
              }}
              className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Todos">Todos los estados</option>
              {ESTADOS.map((estado) => (
                <option key={estado} value={estado}>
                  {estado}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="relative">
            <select
              value={filterVisitador}
              onChange={(e) => {
                setFilterVisitador(e.target.value)
                setPage(1)
              }}
              className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Todos">Todos los visitadores</option>
              {VISITADORES.map((visitador) => (
                <option key={visitador} value={visitador}>
                  {visitador}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Fecha:</label>
          <select
            value={filterFecha}
            onChange={(e) => {
              setFilterFecha(e.target.value as DateFilter)
              setPage(1)
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todo</option>
            <option value="este_mes">Este mes</option>
            <option value="ultimo_mes">Ultimo mes</option>
            <option value="este_anio">Este anio</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">Listado de expedientes filtrados por folio, estado, visitador y fecha</caption>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600">Folio</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600">Fecha</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600">Derecho</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600">Autoridad</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600">Visitador</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600">Estado</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                    Cargando expedientes...
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                    <p>No se encontraron expedientes con los filtros actuales.</p>
                    <button
                      onClick={resetFilters}
                      className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      Limpiar filtros
                    </button>
                  </td>
                </tr>
              ) : (
                paginated.map((exp) => {
                  const estado = ESTADO_COLORS[exp.estado as keyof typeof ESTADO_COLORS]
                  const stale =
                    !['Resuelta', 'Archivada'].includes(exp.estado) &&
                    daysSince(exp.fecha_ultimo_movimiento) >= 30

                  return (
                    <tr key={exp.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-blue-600">{exp.folio}</span>
                          {stale && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{formatDate(exp.fecha_presentacion)}</td>
                      <td className="max-w-[220px] truncate px-6 py-4 text-sm text-slate-900">{exp.tipo_derecho}</td>
                      <td className="max-w-[220px] truncate px-6 py-4 text-sm text-slate-600">{exp.autoridad_responsable}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{exp.visitador_asignado}</td>
                      <td className="px-6 py-4">
                        <span className={cn('rounded-md border px-2.5 py-1 text-xs font-medium', estado?.badge)}>
                          {exp.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setSelectedExp(exp)}
                            className="rounded p-1.5 text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                            title="Ver detalle"
                            aria-label={`Ver detalle del expediente ${exp.folio}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => navigate('/nuevo', { state: { expediente: exp } })}
                            className="rounded p-1.5 text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                            title="Editar"
                            aria-label={`Editar expediente ${exp.folio}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(exp)}
                            disabled={deletingId === exp.id}
                            className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
                            title="Eliminar"
                            aria-label={`Eliminar expediente ${exp.folio}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <p className="text-sm text-slate-600">
            Mostrando <span className="font-medium">{pageStart}-{pageEnd}</span> de{' '}
            <span className="font-medium">{filtered.length}</span> expedientes
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              aria-label="Pagina anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).slice(0, 5).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
                  page === p ? 'bg-blue-600 text-white' : 'border border-slate-300 hover:bg-white',
                )}
                aria-label={`Ir a pagina ${p}`}
                aria-current={page === p ? 'page' : undefined}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              aria-label="Pagina siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <ExpedienteModal
        expediente={selectedExp}
        onClose={() => setSelectedExp(null)}
        onEdit={(e) => {
          setSelectedExp(null)
          navigate('/nuevo', { state: { expediente: e } })
        }}
      />
    </div>
  )
}
