import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookmarkPlus,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit2,
  Eye,
  Filter,
  ListFilter,
  Search,
  Trash2,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { subMonths } from 'date-fns'
import { useExpedientes } from '../../context/ExpedientesContext'
import { useNotifications } from '../../context/NotificationsContext'
import { useProductivity } from '../../context/ProductivityContext'
import { ESTADO_COLORS, ESTADOS, cn, daysSince, formatDate, sanitizeSpreadsheetCell } from '../../lib/utils'
import type { Expediente } from '../../types/database'
import { ExpedienteModal } from './ExpedienteModal'

type DateFilter = 'todos' | 'este_mes' | 'ultimo_mes' | 'este_anio'

const PAGE_SIZE = 10

export function ExpedientesList() {
  const navigate = useNavigate()
  const location = useLocation()
  const { expedientes, loading, deleteExpediente } = useExpedientes()
  const { addNotification } = useNotifications()
  const { savedFilters, saveFilter, deleteFilter, getNextAction, visitadoresCatalog } = useProductivity()

  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState('Todos')
  const [filterVisitador, setFilterVisitador] = useState('Todos')
  const [filterFecha, setFilterFecha] = useState<DateFilter>('todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [staleOnly, setStaleOnly] = useState(false)
  const [withoutNextAction, setWithoutNextAction] = useState(false)
  const [selectedSavedFilter, setSelectedSavedFilter] = useState('')
  const [page, setPage] = useState(1)
  const [selectedExp, setSelectedExp] = useState<Expediente | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const query = new URLSearchParams(location.search).get('q') ?? ''
    setSearch(query)
    setPage(1)
  }, [location.search])

  const isOpenCase = useCallback((estado: string) => !['Resuelta', 'Archivada'].includes(estado), [])

  const matchesDate = useCallback(
    (exp: Expediente) => {
      const created = new Date(exp.created_at)
      const presentacion = new Date(`${exp.fecha_presentacion}T00:00:00`)
      const now = new Date()

      let byPreset = true
      if (filterFecha === 'este_mes') {
        byPreset = created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()
      } else if (filterFecha === 'ultimo_mes') {
        const prev = subMonths(now, 1)
        byPreset = created.getMonth() === prev.getMonth() && created.getFullYear() === prev.getFullYear()
      } else if (filterFecha === 'este_anio') {
        byPreset = created.getFullYear() === now.getFullYear()
      }

      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null
      const to = dateTo ? new Date(`${dateTo}T00:00:00`) : null
      const afterFrom = !from || presentacion >= from
      const beforeTo = !to || presentacion <= to

      return byPreset && afterFrom && beforeTo
    },
    [filterFecha, dateFrom, dateTo],
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return expedientes.filter((exp) => {
      const nextAction = getNextAction(exp.id)

      const matchSearch =
        !query ||
        exp.folio.toLowerCase().includes(query) ||
        exp.tipo_derecho.toLowerCase().includes(query) ||
        exp.autoridad_responsable.toLowerCase().includes(query) ||
        exp.visitador_asignado.toLowerCase().includes(query) ||
        exp.estado.toLowerCase().includes(query) ||
        exp.notas_seguimiento.toLowerCase().includes(query) ||
        (nextAction?.text.toLowerCase().includes(query) ?? false)

      const matchEstado = filterEstado === 'Todos' || exp.estado === filterEstado
      const matchVisitador = filterVisitador === 'Todos' || exp.visitador_asignado === filterVisitador
      const matchStale = !staleOnly || (isOpenCase(exp.estado) && daysSince(exp.fecha_ultimo_movimiento) >= 30)
      const matchWithoutAction = !withoutNextAction || !nextAction

      return matchSearch && matchEstado && matchVisitador && matchStale && matchWithoutAction && matchesDate(exp)
    })
  }, [expedientes, search, filterEstado, filterVisitador, staleOnly, withoutNextAction, matchesDate, getNextAction, isOpenCase])

  const visitadorOptions = useMemo(() => {
    const fromData = expedientes.map((item) => item.visitador_asignado)
    return Array.from(new Set([...visitadoresCatalog, ...fromData])).filter(Boolean)
  }, [expedientes, visitadoresCatalog])

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
    setDateFrom('')
    setDateTo('')
    setStaleOnly(false)
    setWithoutNextAction(false)
    setSelectedSavedFilter('')
    setPage(1)
  }

  const applySavedFilter = (id: string) => {
    const selected = savedFilters.find((item) => item.id === id)
    if (!selected) return

    setSearch(selected.search)
    setFilterEstado(selected.estado)
    setFilterVisitador(selected.visitador)
    setFilterFecha(selected.fecha)
    setDateFrom(selected.dateFrom || '')
    setDateTo(selected.dateTo || '')
    setStaleOnly(selected.staleOnly)
    setWithoutNextAction(selected.withoutNextAction)
    setPage(1)
  }

  const saveCurrentFilter = () => {
    const name = window.prompt('Nombre para este filtro:')
    if (!name) return

    saveFilter({
      name,
      search,
      estado: filterEstado,
      visitador: filterVisitador,
      fecha: filterFecha,
      dateFrom,
      dateTo,
      staleOnly,
      withoutNextAction,
    })

    addNotification({
      type: 'success',
      title: 'Filtro guardado',
      message: `Se guardo el filtro "${name.trim()}".`,
    })
  }

  const exportList = () => {
    const headers = ['Folio', 'Fecha', 'Derecho', 'Autoridad', 'Visitador', 'Estado', 'Proxima accion']
    const rows = filtered.map((exp) =>
      [
        exp.folio,
        formatDate(exp.fecha_presentacion),
        exp.tipo_derecho,
        exp.autoridad_responsable,
        exp.visitador_asignado,
        exp.estado,
        getNextAction(exp.id)?.text ?? '-',
      ]
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
    <div className="space-y-6 animate-fade-in pb-24 md:pb-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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

      <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-slate-600" />
          <h2 className="font-medium text-slate-900">Filtros avanzados</h2>
          <button
            onClick={resetFilters}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50"
          >
            Limpiar
          </button>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="relative md:col-span-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Buscar por folio, notas, estado o proxima accion..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="relative md:col-span-3">
            <select
              value={filterEstado}
              onChange={(event) => {
                setFilterEstado(event.target.value)
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

          <div className="relative md:col-span-2">
            <select
              value={filterVisitador}
              onChange={(event) => {
                setFilterVisitador(event.target.value)
                setPage(1)
              }}
              className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Todos">Todos los visitadores</option>
              {visitadorOptions.map((visitador) => (
                <option key={visitador} value={visitador}>
                  {visitador}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="md:col-span-2">
            <select
              value={filterFecha}
              onChange={(event) => {
                setFilterFecha(event.target.value as DateFilter)
                setPage(1)
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todo</option>
              <option value="este_mes">Este mes</option>
              <option value="ultimo_mes">Ultimo mes</option>
              <option value="este_anio">Este anio</option>
            </select>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Desde (presentacion)</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value)
                setPage(1)
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Hasta (presentacion)</label>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value)
                setPage(1)
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={staleOnly}
              onChange={(event) => {
                setStaleOnly(event.target.checked)
                setPage(1)
              }}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Solo estancados (+30 dias)
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={withoutNextAction}
              onChange={(event) => {
                setWithoutNextAction(event.target.checked)
                setPage(1)
              }}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Sin proxima accion
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <ListFilter className="h-4 w-4 text-slate-500" />
          <select
            value={selectedSavedFilter}
            onChange={(event) => {
              setSelectedSavedFilter(event.target.value)
              if (event.target.value) applySavedFilter(event.target.value)
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Filtros guardados</option>
            {savedFilters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            onClick={saveCurrentFilter}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            Guardar filtro
          </button>
          {selectedSavedFilter ? (
            <button
              onClick={() => {
                const selected = savedFilters.find((item) => item.id === selectedSavedFilter)
                if (!selected) return
                if (!window.confirm(`Eliminar filtro "${selected.name}"?`)) return
                deleteFilter(selectedSavedFilter)
                setSelectedSavedFilter('')
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar filtro
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Cargando expedientes...</div>
        ) : paginated.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No se encontraron expedientes con los filtros actuales.
          </div>
        ) : (
          paginated.map((exp) => {
            const estado = ESTADO_COLORS[exp.estado as keyof typeof ESTADO_COLORS]
            const stale = isOpenCase(exp.estado) && daysSince(exp.fecha_ultimo_movimiento) >= 30
            const nextAction = getNextAction(exp.id)

            return (
              <article key={exp.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-semibold text-blue-700">{exp.folio}</p>
                    <p className="text-xs text-slate-500">{formatDate(exp.fecha_presentacion)}</p>
                  </div>
                  <span className={cn('rounded-md border px-2 py-1 text-[11px] font-semibold', estado?.badge)}>{exp.estado}</span>
                </div>

                <p className="text-sm font-medium text-slate-900">{exp.tipo_derecho}</p>
                <p className="text-xs text-slate-600">{exp.autoridad_responsable}</p>
                <p className="mt-2 text-xs text-slate-500">Visitador: {exp.visitador_asignado}</p>

                <div className="mt-2 space-y-1">
                  {nextAction ? (
                    <p className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700">
                      <Clock className="h-3.5 w-3.5" />
                      {nextAction.text}
                    </p>
                  ) : (
                    <p className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Sin proxima accion
                    </p>
                  )}
                  {stale && (
                    <p className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Estancado {daysSince(exp.fecha_ultimo_movimiento)} dias
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-end gap-1">
                  <button
                    onClick={() => setSelectedExp(exp)}
                    className="rounded p-2 text-blue-600 transition-colors hover:bg-blue-50"
                    aria-label={`Ver detalle del expediente ${exp.folio}`}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => navigate('/nuevo', { state: { expediente: exp } })}
                    className="rounded p-2 text-slate-600 transition-colors hover:bg-slate-100"
                    aria-label={`Editar expediente ${exp.folio}`}
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(exp)}
                    disabled={deletingId === exp.id}
                    className="rounded p-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                    aria-label={`Eliminar expediente ${exp.folio}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            )
          })
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
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
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">Cargando expedientes...</td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                    <p>No se encontraron expedientes con los filtros actuales.</p>
                    <button
                      onClick={resetFilters}
                      className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Limpiar filtros
                    </button>
                  </td>
                </tr>
              ) : (
                paginated.map((exp) => {
                  const estado = ESTADO_COLORS[exp.estado as keyof typeof ESTADO_COLORS]
                  const stale = isOpenCase(exp.estado) && daysSince(exp.fecha_ultimo_movimiento) >= 30
                  const nextAction = getNextAction(exp.id)

                  return (
                    <tr key={exp.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-blue-600">{exp.folio}</span>
                          {stale && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                          {nextAction?.completed && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{formatDate(exp.fecha_presentacion)}</td>
                      <td className="max-w-[220px] truncate px-6 py-4 text-sm text-slate-900">{exp.tipo_derecho}</td>
                      <td className="max-w-[220px] truncate px-6 py-4 text-sm text-slate-600">{exp.autoridad_responsable}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{exp.visitador_asignado}</td>
                      <td className="px-6 py-4">
                        <span className={cn('rounded-md border px-2.5 py-1 text-xs font-medium', estado?.badge)}>{exp.estado}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setSelectedExp(exp)}
                            className="rounded p-1.5 text-blue-600 transition-colors hover:bg-blue-50"
                            aria-label={`Ver detalle del expediente ${exp.folio}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => navigate('/nuevo', { state: { expediente: exp } })}
                            className="rounded p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
                            aria-label={`Editar expediente ${exp.folio}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(exp)}
                            disabled={deletingId === exp.id}
                            className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-600">
          Mostrando <span className="font-medium">{pageStart}-{pageEnd}</span> de <span className="font-medium">{filtered.length}</span> expedientes
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Pagina anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: totalPages }, (_, idx) => idx + 1).slice(0, 5).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
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
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Pagina siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ExpedienteModal
        expediente={selectedExp}
        onClose={() => setSelectedExp(null)}
        onEdit={(expediente) => {
          setSelectedExp(null)
          navigate('/nuevo', { state: { expediente } })
        }}
      />
    </div>
  )
}
