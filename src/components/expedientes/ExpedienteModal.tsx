import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Edit2,
  FileText,
  Info,
  MessageSquare,
  Paperclip,
  Scale,
  Upload,
  User,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import type { Expediente } from '../../types/database'
import { ESTADOS, ESTADO_COLORS, cn, daysSince, formatDateLong } from '../../lib/utils'
import { useExpedientes } from '../../context/ExpedientesContext'
import { useNotifications } from '../../context/NotificationsContext'
import { supabase } from '../../lib/supabase'

type Tab = 'info' | 'timeline' | 'documentos' | 'actividad'

interface Props {
  expediente: Expediente | null
  onClose: () => void
  onEdit?: (e: Expediente) => void
}

interface DocumentItem {
  name: string
  path: string
  size: number
  updatedAt: string | null
}

const TIMELINE_ICONS: Record<string, JSX.Element> = {
  registrado: <FileText className="h-3.5 w-3.5" />,
  actualizado: <Edit2 className="h-3.5 w-3.5" />,
  nota: <MessageSquare className="h-3.5 w-3.5" />,
  resuelto: <CheckCircle2 className="h-3.5 w-3.5" />,
}

const DOCUMENTS_BUCKET = import.meta.env.VITE_SUPABASE_DOCUMENTS_BUCKET || 'expedientes-documentos'
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024
const ALLOWED_FILE_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'xlsx', 'xls'])

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** index
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function ExpedienteModal({ expediente, onClose, onEdit }: Props) {
  const [tab, setTab] = useState<Tab>('info')
  const { updateExpediente } = useExpedientes()
  const { addNotification } = useNotifications()
  const shouldReduceMotion = useReducedMotion()

  const [editingEstado, setEditingEstado] = useState(false)
  const [newEstado, setNewEstado] = useState(expediente?.estado ?? 'Admitida')
  const [savingEstado, setSavingEstado] = useState(false)

  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsUploading, setDocumentsUploading] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (expediente) setNewEstado(expediente.estado)
    setTab('info')
    setDocuments([])
    setDocumentsError(null)
  }, [expediente])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const fetchDocuments = async (expedienteId: string) => {
    const documentsPath = `expedientes/${expedienteId}`
    setDocumentsLoading(true)
    setDocumentsError(null)
    try {
      const { data, error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .list(documentsPath, { limit: 100, sortBy: { column: 'updated_at', order: 'desc' } })

      if (error) {
        const message =
          error.message.includes('not found') || error.message.includes('Bucket')
            ? `No se encontro el bucket "${DOCUMENTS_BUCKET}". Configure Supabase Storage antes de usar documentos.`
            : `No se pudieron cargar documentos: ${error.message}`
        setDocumentsError(message)
        setDocuments([])
        return
      }

      const nextDocs: DocumentItem[] = (data ?? [])
        .filter((item) => !!item.name)
        .map((item) => ({
          name: item.name,
          path: `${documentsPath}/${item.name}`,
          size: Number((item.metadata as { size?: number } | null)?.size ?? 0),
          updatedAt: item.updated_at ?? item.created_at ?? null,
        }))

      setDocuments(nextDocs)
    } catch {
      setDocumentsError('No se pudieron cargar documentos por un error de red.')
      setDocuments([])
    } finally {
      setDocumentsLoading(false)
    }
  }

  useEffect(() => {
    if (!expediente || tab !== 'documentos') return
    void fetchDocuments(expediente.id)
  }, [tab, expediente])

  if (!expediente) return null

  const estado = ESTADO_COLORS[expediente.estado as keyof typeof ESTADO_COLORS]
  const dias = daysSince(expediente.fecha_ultimo_movimiento)
  const documentsPath = `expedientes/${expediente.id}`

  const handleSaveEstado = async () => {
    if (newEstado === expediente.estado) {
      setEditingEstado(false)
      return
    }

    setSavingEstado(true)
    const { error } = await updateExpediente(expediente.id, { estado: newEstado as Expediente['estado'] })
    setSavingEstado(false)

    if (error) {
      addNotification({
        type: 'error',
        title: 'No se pudo actualizar el estado',
        message: error,
      })
      return
    }

    addNotification({
      type: 'success',
      title: 'Estado actualizado',
      message: `${expediente.folio} cambio a ${newEstado}.`,
    })
    setEditingEstado(false)
  }

  const handleUploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
      setDocumentsError('Tipo de archivo no permitido. Use PDF, Office o imagen.')
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setDocumentsError('El archivo supera el limite de 15 MB.')
      return
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
    const storagePath = `${documentsPath}/${Date.now()}_${safeName}`

    setDocumentsUploading(true)
    setDocumentsError(null)

    const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    })

    setDocumentsUploading(false)

    if (error) {
      setDocumentsError(`No se pudo subir el archivo: ${error.message}`)
      addNotification({
        type: 'error',
        title: 'Error al subir documento',
        message: error.message,
      })
      return
    }

    addNotification({
      type: 'success',
      title: 'Documento cargado',
      message: `${file.name} se agrego al expediente ${expediente.folio}.`,
    })
    void fetchDocuments(expediente.id)
  }

  const handleDownloadDocument = async (doc: DocumentItem) => {
    try {
      const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.path, 60)

      if (error || !data?.signedUrl) {
        addNotification({
          type: 'error',
          title: 'Error al descargar',
          message: error?.message ?? 'No se pudo generar el enlace de descarga.',
        })
        return
      }

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch {
      addNotification({
        type: 'error',
        title: 'Error al descargar',
        message: 'No se pudo completar la descarga por un error de red.',
      })
    }
  }

  const timeline = [
    {
      tipo: 'registrado',
      texto: 'Expediente registrado en el sistema',
      fecha: expediente.created_at,
      autor: 'Sistema',
    },
    ...(expediente.notas_seguimiento
      ? [
          {
            tipo: 'nota',
            texto:
              expediente.notas_seguimiento.slice(0, 100) +
              (expediente.notas_seguimiento.length > 100 ? '...' : ''),
            fecha: expediente.updated_at,
            autor: 'Registrador',
          },
        ]
      : []),
    ...(expediente.estado !== 'Admitida'
      ? [
          {
            tipo: 'actualizado',
            texto: `Estado actualizado a: ${expediente.estado}`,
            fecha: expediente.fecha_ultimo_movimiento,
            autor: expediente.visitador_asignado,
          },
        ]
      : []),
  ].reverse()

  const actividad = [
    {
      label: 'Estado actualizado',
      detail: `${expediente.estado} por ${expediente.visitador_asignado}`,
      at: expediente.updated_at,
    },
    {
      label: 'Registro inicial',
      detail: `${expediente.folio} creado en sistema`,
      at: expediente.created_at,
    },
  ]

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'info', label: 'Informacion general', icon: <Info className="h-3.5 w-3.5" /> },
    { id: 'timeline', label: 'Timeline', icon: <Clock className="h-3.5 w-3.5" /> },
    { id: 'documentos', label: 'Documentos', icon: <Paperclip className="h-3.5 w-3.5" /> },
    { id: 'actividad', label: 'Actividad', icon: <Activity className="h-3.5 w-3.5" /> },
  ]

  return (
    <AnimatePresence>
      <motion.div
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label={`Expediente ${expediente.folio}`}
      >
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
          onClick={(event) => event.stopPropagation()}
          className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <header className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="mb-2 text-xs font-medium text-slate-500">Dashboard &gt; Expedientes &gt; {expediente.folio}</div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xl font-bold text-blue-700">{expediente.folio}</p>
                  <span className={cn('rounded-lg px-2 py-1 text-xs font-semibold', estado?.badge)}>{expediente.estado}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{expediente.tipo_derecho}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onEdit?.(expediente)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => setTab('documentos')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5" />
                  Documentos
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          {dias >= 30 && !['Resuelta', 'Archivada'].includes(expediente.estado) && (
            <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4" aria-hidden />
              Este expediente lleva {dias} dias sin movimiento y requiere atencion.
            </div>
          )}

          <div className="px-6 pt-4">
            <div className="flex flex-wrap gap-1.5">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    tab === item.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              {tab === 'info' && (
                <motion.div
                  key="info"
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {[
                      { icon: Calendar, label: 'Fecha de presentacion', value: formatDateLong(expediente.fecha_presentacion) },
                      { icon: Calendar, label: 'Ultimo movimiento', value: formatDateLong(expediente.fecha_ultimo_movimiento) },
                      { icon: Scale, label: 'Derecho', value: expediente.tipo_derecho },
                      { icon: Building2, label: 'Autoridad', value: expediente.autoridad_responsable },
                      { icon: User, label: 'Visitador', value: expediente.visitador_asignado },
                      { icon: FileText, label: 'Mes de registro', value: expediente.mes_registro },
                    ].map((field) => (
                      <article key={field.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-1 flex items-center gap-1.5">
                          <field.icon className="h-3.5 w-3.5 text-slate-400" />
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{field.label}</p>
                        </div>
                        <p className="text-sm font-medium text-slate-800">{field.value}</p>
                      </article>
                    ))}
                  </div>

                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado del expediente</p>
                      <button
                        onClick={() => setEditingEstado((value) => !value)}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        {editingEstado ? 'Cancelar' : 'Cambiar estado'}
                      </button>
                    </div>

                    {editingEstado ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={newEstado}
                          onChange={(event) => setNewEstado(event.target.value as typeof expediente.estado)}
                          className="min-w-48 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {ESTADOS.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleSaveEstado}
                          disabled={savingEstado}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {savingEstado ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    ) : (
                      <span className={cn('inline-flex rounded-lg px-2 py-1 text-xs font-semibold', estado?.badge)}>
                        {expediente.estado}
                      </span>
                    )}
                  </section>

                  {expediente.notas_seguimiento && (
                    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Notas</p>
                      <p className="text-sm leading-relaxed text-slate-700">{expediente.notas_seguimiento}</p>
                    </section>
                  )}
                </motion.div>
              )}

              {tab === 'timeline' && (
                <motion.div
                  key="timeline"
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                >
                  <div className="relative space-y-4">
                    <div className="absolute bottom-0 left-2 top-0 w-px bg-slate-200" aria-hidden />
                    {timeline.map((event, index) => (
                      <motion.article
                        key={index}
                        initial={shouldReduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16, delay: index * 0.04 }}
                        className="relative pl-8"
                      >
                        <div className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                          {TIMELINE_ICONS[event.tipo] ?? <Info className="h-3 w-3" />}
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm text-slate-800">{event.texto}</p>
                          <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                            <span>{event.autor}</span>
                            <span>{format(new Date(event.fecha), 'dd/MM/yyyy HH:mm')}</span>
                          </div>
                        </div>
                      </motion.article>
                    ))}
                  </div>
                </motion.div>
              )}

              {tab === 'documentos' && (
                <motion.div
                  key="documentos"
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  className="space-y-3"
                >
                  {documentsError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{documentsError}</div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700">Archivos del expediente</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void fetchDocuments(expediente.id)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Actualizar
                      </button>
                      <button
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={documentsUploading}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {documentsUploading ? 'Subiendo...' : 'Subir documento'}
                      </button>
                      <input
                        ref={uploadInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleUploadDocument}
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.xls"
                      />
                    </div>
                  </div>

                  {documentsLoading ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      Cargando documentos...
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-7 text-center text-sm text-slate-500">
                      <Paperclip className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                      No hay documentos cargados para este expediente.
                    </div>
                  ) : (
                    documents.map((doc) => (
                      <article
                        key={doc.path}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                          <FileText className="h-4 w-4 text-red-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{doc.name}</p>
                          <p className="text-xs text-slate-500">
                            {formatBytes(doc.size)}
                            {doc.updatedAt ? ` - ${format(new Date(doc.updatedAt), 'dd/MM/yyyy HH:mm')}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => void handleDownloadDocument(doc)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Descargar ${doc.name}`}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </article>
                    ))
                  )}
                </motion.div>
              )}

              {tab === 'actividad' && (
                <motion.div
                  key="actividad"
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  className="space-y-2"
                >
                  {actividad.map((item, index) => (
                    <article key={index} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-600">{item.detail}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{format(new Date(item.at), 'dd/MM/yyyy HH:mm')}</p>
                    </article>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
