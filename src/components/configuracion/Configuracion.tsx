import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Bell,
  BookOpen,
  Check,
  Database,
  Download,
  Pencil,
  Plus,
  Save,
  Settings,
  Trash2,
  Upload,
  User,
} from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { useExpedientes } from '../../context/ExpedientesContext'
import { useNotifications } from '../../context/NotificationsContext'
import { useProductivity, type ProfileSettings, type TogglePreference } from '../../context/ProductivityContext'
import {
  cn,
  DERECHOS,
  ESTADOS,
  FIELD_LIMITS,
  getMesRegistro,
  isValidFolio,
  normalizeFolio,
  normalizeWhitespace,
} from '../../lib/utils'
import type { ExpedienteInsert, EstadoExpediente } from '../../types/database'

type Section = 'perfil' | 'catalogos' | 'notificaciones' | 'sistema' | 'respaldos'

interface ToggleRowProps {
  id: string
  item: TogglePreference
  onToggle: () => void
}

const MAX_BACKUP_FILE_BYTES = 5 * 1024 * 1024
const MAX_BACKUP_RECORDS = 5000

function sanitizeDate(value: unknown) {
  const fallback = new Date().toISOString().split('T')[0]
  if (typeof value !== 'string' || value.length < 10) {
    return fallback
  }

  const maybeDate = new Date(value)
  if (Number.isNaN(maybeDate.getTime())) {
    return fallback
  }

  const normalized = maybeDate.toISOString().split('T')[0]
  return normalized > fallback ? fallback : normalized
}

function sanitizeEstado(value: unknown): EstadoExpediente {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (ESTADOS.includes(normalized as EstadoExpediente)) {
    return normalized as EstadoExpediente
  }

  if (normalized.toLowerCase().includes('integr')) return 'En integraci\u00f3n'
  if (normalized.toLowerCase().includes('concili')) return 'En conciliaci\u00f3n'
  if (normalized.toLowerCase().includes('archiv')) return 'Archivada'
  if (normalized.toLowerCase().includes('resuel')) return 'Resuelta'
  return 'Admitida'
}

function parseBackupRecords(raw: unknown, fallbackVisitador: string): ExpedienteInsert[] {
  const source = (() => {
    if (Array.isArray(raw)) return raw
    if (raw && typeof raw === 'object' && Array.isArray((raw as { expedientes?: unknown[] }).expedientes)) {
      return (raw as { expedientes: unknown[] }).expedientes
    }
    return []
  })()

  return source
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>

      const folio = normalizeFolio(String(record.folio ?? '')).slice(0, FIELD_LIMITS.folio)
      const fechaPresentacion = sanitizeDate(record.fecha_presentacion)
      const fechaUltimoMovimiento = sanitizeDate(record.fecha_ultimo_movimiento ?? fechaPresentacion)
      const tipoDerecho = normalizeWhitespace(String(record.tipo_derecho ?? 'Otro')).slice(0, FIELD_LIMITS.tipoDerecho)
      const autoridad = normalizeWhitespace(String(record.autoridad_responsable ?? 'No especificada')).slice(0, FIELD_LIMITS.autoridad)
      const visitador = normalizeWhitespace(String(record.visitador_asignado ?? fallbackVisitador)).slice(0, FIELD_LIMITS.visitador)
      const estado = sanitizeEstado(record.estado)
      const notas = String(record.notas_seguimiento ?? '').trim().slice(0, FIELD_LIMITS.notas)

      if (!folio || !isValidFolio(folio) || !tipoDerecho || !autoridad || !visitador) return null

      return {
        folio,
        fecha_presentacion: fechaPresentacion,
        tipo_derecho: tipoDerecho,
        autoridad_responsable: autoridad,
        visitador_asignado: visitador,
        estado,
        fecha_ultimo_movimiento: fechaUltimoMovimiento,
        notas_seguimiento: notas,
        mes_registro: String(record.mes_registro ?? getMesRegistro(fechaPresentacion)),
      } satisfies ExpedienteInsert
    })
    .filter((item): item is ExpedienteInsert => !!item)
}

function ToggleRow({ id, item, onToggle }: ToggleRowProps) {
  const descriptionId = `${id}-description`

  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 transition-colors hover:bg-slate-100">
      <div>
        <p className="font-medium text-slate-900">{item.label}</p>
        <p id={descriptionId} className="text-sm text-slate-600">
          {item.description}
        </p>
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={item.enabled}
        aria-describedby={descriptionId}
        aria-label={`${item.label}: ${item.enabled ? 'activado' : 'desactivado'}`}
        onClick={onToggle}
        className={cn(
          'relative h-6 w-11 flex-shrink-0 rounded-full border transition-colors duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
          item.enabled ? 'border-blue-500 bg-blue-600' : 'border-slate-300 bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
            item.enabled ? 'translate-x-5' : 'translate-x-0',
          )}
          aria-hidden
        />
      </button>
    </div>
  )
}

export function Configuracion() {
  const { user } = useAuth()
  const { expedientes, createExpediente, refetch } = useExpedientes()
  const { addNotification } = useNotifications()
  const {
    loading,
    profile: persistedProfile,
    notificationPrefs: persistedNotifs,
    systemPrefs: persistedSystem,
    visitadoresCatalog: persistedVisitadores,
    setProfile,
    setNotificationPrefs,
    setSystemPrefs,
    setVisitadoresCatalog,
  } = useProductivity()
  const shouldReduceMotion = useReducedMotion()

  const [section, setSection] = useState<Section>('perfil')
  const [saved, setSaved] = useState(false)
  const [importing, setImporting] = useState(false)
  const [profile, setProfileDraft] = useState<ProfileSettings>(persistedProfile)
  const [notifs, setNotifsDraft] = useState<TogglePreference[]>(persistedNotifs)
  const [sistema, setSistemaDraft] = useState<TogglePreference[]>(persistedSystem)
  const [visitadoresCatalog, setVisitadoresCatalogDraft] = useState<string[]>(persistedVisitadores)

  useEffect(() => setProfileDraft(persistedProfile), [persistedProfile])
  useEffect(() => setNotifsDraft(persistedNotifs), [persistedNotifs])
  useEffect(() => setSistemaDraft(persistedSystem), [persistedSystem])
  useEffect(() => setVisitadoresCatalogDraft(persistedVisitadores), [persistedVisitadores])

  const canSaveProfile = useMemo(
    () => profile.fullName.trim().length > 2 && profile.position.trim().length > 1,
    [profile],
  )

  const handleSave = () => {
    if (section === 'perfil' && !canSaveProfile) {
      addNotification({
        type: 'error',
        title: 'Perfil incompleto',
        message: 'Complete nombre y cargo antes de guardar.',
      })
      return
    }

    if (section === 'perfil') setProfile(profile)
    if (section === 'notificaciones') setNotificationPrefs(notifs)
    if (section === 'sistema') setSystemPrefs(sistema)
    if (section === 'catalogos') setVisitadoresCatalog(visitadoresCatalog)

    setSaved(true)
    addNotification({
      type: 'success',
      title: 'Configuracion guardada en la nube',
      message: `Los cambios en ${section} se sincronizaron correctamente.`,
    })
    window.setTimeout(() => setSaved(false), 1800)
  }

  const exportarRespaldo = () => {
    const data = JSON.stringify({ expedientes, exportedAt: new Date().toISOString() }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CEDHBC_Respaldo_${format(new Date(), 'yyyyMMdd_HHmm')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportRespaldo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    if (!/\.json$/i.test(file.name)) {
      addNotification({
        type: 'error',
        title: 'Formato invalido',
        message: 'Seleccione un archivo .json valido.',
      })
      return
    }

    if (file.size > MAX_BACKUP_FILE_BYTES) {
      addNotification({
        type: 'error',
        title: 'Archivo demasiado grande',
        message: 'El respaldo supera 5 MB. Dividalo en archivos mas pequenos.',
      })
      return
    }

    setImporting(true)
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as unknown
      const parsedRecords = parseBackupRecords(parsed, visitadoresCatalog[0] ?? 'Visitador General I')
      const records = parsedRecords.slice(0, MAX_BACKUP_RECORDS)

      if (parsedRecords.length > MAX_BACKUP_RECORDS) {
        addNotification({
          type: 'warning',
          title: 'Importacion parcial',
          message: `Se procesaron solo los primeros ${MAX_BACKUP_RECORDS} registros por seguridad.`,
        })
      }

      if (records.length === 0) {
        addNotification({
          type: 'warning',
          title: 'Archivo sin datos validos',
          message: 'El respaldo no contiene expedientes importables.',
        })
        return
      }

      const existingFolios = new Set(expedientes.map((item) => item.folio.toUpperCase()))
      let imported = 0
      let skipped = 0
      let failed = 0

      for (const record of records) {
        if (existingFolios.has(record.folio.toUpperCase())) {
          skipped += 1
          continue
        }

        const { error } = await createExpediente(record)
        if (error) {
          failed += 1
          continue
        }

        existingFolios.add(record.folio.toUpperCase())
        imported += 1
      }

      await refetch()

      addNotification({
        type: failed > 0 ? 'warning' : 'success',
        title: 'Importacion completada',
        message: `Importados: ${imported}. Omitidos: ${skipped}. Fallidos: ${failed}.`,
      })
    } catch {
      addNotification({
        type: 'error',
        title: 'Importacion fallida',
        message: 'No se pudo leer el archivo JSON seleccionado.',
      })
    } finally {
      setImporting(false)
    }
  }

  const handleAddVisitador = () => {
    const name = window.prompt('Nombre del nuevo visitador:')
    if (!name) return

    const clean = normalizeWhitespace(name).slice(0, FIELD_LIMITS.visitador)
    if (!clean) return

    if (visitadoresCatalog.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      addNotification({
        type: 'warning',
        title: 'Visitador duplicado',
        message: 'Ese visitador ya existe en el catalogo.',
      })
      return
    }

    const next = [...visitadoresCatalog, clean]
    setVisitadoresCatalogDraft(next)
    setVisitadoresCatalog(next)
    addNotification({
      type: 'success',
      title: 'Visitador agregado',
      message: `${clean} fue agregado al catalogo.`,
    })
  }

  const handleEditVisitador = (index: number) => {
    const current = visitadoresCatalog[index]
    const nextName = window.prompt('Editar nombre del visitador:', current)
    if (!nextName) return

    const clean = normalizeWhitespace(nextName).slice(0, FIELD_LIMITS.visitador)
    if (!clean) return

    if (
      visitadoresCatalog.some(
        (item, itemIndex) => itemIndex !== index && item.toLowerCase() === clean.toLowerCase(),
      )
    ) {
      addNotification({
        type: 'warning',
        title: 'Nombre en uso',
        message: 'Ya existe un visitador con ese nombre.',
      })
      return
    }

    const next = visitadoresCatalog.map((item, itemIndex) => (itemIndex === index ? clean : item))
    setVisitadoresCatalogDraft(next)
    setVisitadoresCatalog(next)
    addNotification({
      type: 'info',
      title: 'Visitador actualizado',
      message: `${current} ahora es ${clean}.`,
    })
  }

  const handleDeleteVisitador = (index: number) => {
    const target = visitadoresCatalog[index]
    const inUse = expedientes.some((exp) => exp.visitador_asignado === target)

    if (inUse) {
      addNotification({
        type: 'error',
        title: 'No se puede eliminar',
        message: `${target} tiene expedientes asignados.`,
      })
      return
    }

    if (!window.confirm(`Eliminar "${target}" del catalogo?`)) return

    const next = visitadoresCatalog.filter((_, itemIndex) => itemIndex !== index)
    setVisitadoresCatalogDraft(next)
    setVisitadoresCatalog(next)
    addNotification({
      type: 'warning',
      title: 'Visitador eliminado',
      message: `${target} fue removido del catalogo.`,
    })
  }

  const sections = [
    { id: 'perfil' as Section, label: 'Perfil', icon: User },
    { id: 'catalogos' as Section, label: 'Catalogos', icon: BookOpen },
    { id: 'notificaciones' as Section, label: 'Notificaciones', icon: Bell },
    { id: 'sistema' as Section, label: 'Sistema', icon: Settings },
    { id: 'respaldos' as Section, label: 'Respaldos', icon: Database },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Configuracion</h1>
        <p className="mt-1 text-slate-600">Preferencias sincronizadas en la nube para cualquier dispositivo</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <aside className="lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
            <div className="space-y-2">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition-all duration-300',
                    section === s.id ? 'bg-blue-700 text-white shadow-lg' : 'text-slate-700 hover:bg-slate-100',
                  )}
                >
                  <s.icon className="h-5 w-5" aria-hidden />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <motion.section
          key={section}
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
          className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        >
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Cargando configuracion...
            </div>
          ) : null}

          {section === 'perfil' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-900">Informacion del Perfil</h2>

              <div className="rounded-2xl bg-slate-50 p-5">
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-700 text-2xl font-bold text-white">
                    {profile.fullName.trim().charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">{profile.fullName}</p>
                    <p className="text-sm text-slate-600">{user?.email}</p>
                    <span className="mt-2 inline-flex rounded-lg bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                      Rol: {profile.position}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="perfil-nombre" className="mb-2 block text-sm font-medium text-slate-700">
                    Nombre completo
                  </label>
                  <input
                    id="perfil-nombre"
                    value={profile.fullName}
                    maxLength={120}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, fullName: e.target.value.slice(0, 120) }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="perfil-cargo" className="mb-2 block text-sm font-medium text-slate-700">
                    Cargo
                  </label>
                  <input
                    id="perfil-cargo"
                    value={profile.position}
                    maxLength={120}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, position: e.target.value.slice(0, 120) }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="perfil-email" className="mb-2 block text-sm font-medium text-slate-700">
                    Correo electronico
                  </label>
                  <input
                    id="perfil-email"
                    value={user?.email ?? ''}
                    readOnly
                    className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                  />
                </div>
              </div>
            </div>
          )}

          {section === 'catalogos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Catalogos del Sistema</h2>
                  <p className="text-sm text-slate-600">Listas maestras sincronizadas para clasificacion y asignacion.</p>
                </div>
                <button
                  onClick={handleAddVisitador}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-blue-800 hover:shadow-lg"
                >
                  <Plus className="h-4 w-4" />
                  Agregar visitador
                </button>
              </div>

              <details className="rounded-xl border border-slate-200" open>
                <summary className="cursor-pointer list-none px-4 py-3 font-medium text-slate-800">Visitadores</summary>
                <div className="space-y-2 border-t border-slate-200 p-3">
                  {visitadoresCatalog.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Sin visitadores registrados.</p>
                  ) : (
                    visitadoresCatalog.map((item, index) => (
                      <div key={`${item}-${index}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <span>{item}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditVisitador(index)}
                            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-200"
                            aria-label={`Editar ${item}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteVisitador(index)}
                            className="rounded-md p-1 text-red-500 transition-colors hover:bg-red-50"
                            aria-label={`Eliminar ${item}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </details>

              <details className="rounded-xl border border-slate-200">
                <summary className="cursor-pointer list-none px-4 py-3 font-medium text-slate-800">Estados</summary>
                <div className="grid grid-cols-1 gap-2 border-t border-slate-200 p-3 sm:grid-cols-2">
                  {ESTADOS.map((item) => (
                    <div key={item} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </details>

              <details className="rounded-xl border border-slate-200">
                <summary className="cursor-pointer list-none px-4 py-3 font-medium text-slate-800">Derechos humanos</summary>
                <div className="grid grid-cols-1 gap-2 border-t border-slate-200 p-3 sm:grid-cols-2">
                  {DERECHOS.map((item) => (
                    <div key={item} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {section === 'notificaciones' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-900">Preferencias de Notificaciones</h2>

              <div className="space-y-3">
                {notifs.map((item, i) => (
                  <ToggleRow
                    key={item.label}
                    id={`notif-toggle-${i}`}
                    item={item}
                    onToggle={() =>
                      setNotifsDraft((prev) => prev.map((row, idx) => (idx === i ? { ...row, enabled: !row.enabled } : row)))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {section === 'sistema' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-900">Configuracion del Sistema</h2>

              <div className="space-y-3">
                {sistema.map((item, i) => (
                  <ToggleRow
                    key={item.label}
                    id={`system-toggle-${i}`}
                    item={item}
                    onToggle={() =>
                      setSistemaDraft((prev) => prev.map((row, idx) => (idx === i ? { ...row, enabled: !row.enabled } : row)))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {section === 'respaldos' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900">Respaldos</h2>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="font-medium text-slate-900">Exportar respaldo</p>
                <p className="mt-1 text-sm text-slate-600">Descarga todos los expedientes en formato JSON.</p>
                <button
                  onClick={exportarRespaldo}
                  className="mt-3 flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-blue-800 hover:shadow-lg"
                >
                  <Download className="h-4 w-4" />
                  Exportar Respaldo
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="font-medium text-slate-900">Importar respaldo</p>
                <p className="mt-1 text-sm text-slate-600">Selecciona un archivo JSON exportado previamente.</p>
                <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600">
                  <Upload className="h-4 w-4" />
                  {importing ? 'Importando respaldo...' : 'Seleccionar archivo JSON'}
                  <input type="file" accept=".json,application/json" className="hidden" onChange={handleImportRespaldo} />
                </label>
              </div>
            </div>
          )}

          {section !== 'respaldos' && (
            <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
              <button
                onClick={handleSave}
                disabled={section === 'perfil' && !canSaveProfile}
                aria-live="polite"
                className={cn(
                  'flex items-center gap-2 rounded-xl px-6 py-2.5 font-medium text-white transition-all duration-300 disabled:opacity-60',
                  saved ? 'bg-emerald-600' : 'bg-blue-700 hover:bg-blue-800 hover:shadow-lg',
                )}
              >
                {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {saved ? 'Guardado' : 'Guardar Cambios'}
              </button>
            </div>
          )}
        </motion.section>
      </div>
    </div>
  )
}
