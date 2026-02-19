import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  Download,
  Edit2,
  Eye,
  FileText,
  Info,
  MessageSquare,
  Paperclip,
  Scale,
  Square,
  Upload,
  User,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import type { Expediente } from '../../types/database'
import { ESTADOS, ESTADO_COLORS, cn, daysSince, formatDateLong, normalizeDateOnly, normalizeWhitespace } from '../../lib/utils'
import { useExpedientes } from '../../context/ExpedientesContext'
import { useNotifications } from '../../context/NotificationsContext'
import { useProductivity } from '../../context/ProductivityContext'
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
  mimeType: string
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

function mimeFromExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'doc') return 'application/msword'
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === 'xls') return 'application/vnd.ms-excel'
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  return 'application/octet-stream'
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

export function ExpedienteModal({ expediente, onClose, onEdit }: Props) {
  const [tab, setTab] = useState<Tab>('info')
  const { updateExpediente } = useExpedientes()
  const { addNotification } = useNotifications()
  const { getNextAction, setNextAction, toggleNextActionCompleted, removeNextAction } = useProductivity()
  const shouldReduceMotion = useReducedMotion()

  const [editingEstado, setEditingEstado] = useState(false)
  const [newEstado, setNewEstado] = useState(expediente?.estado ?? 'Admitida')
  const [savingEstado, setSavingEstado] = useState(false)

  const [nextActionText, setNextActionText] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [editingNextAction, setEditingNextAction] = useState(false)
  const [nextActionError, setNextActionError] = useState<string | null>(null)

  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsUploadingCount, setDocumentsUploadingCount] = useState(0)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [preview, setPreview] = useState<{ name: string; url: string; mimeType: string } | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const currentNextAction = expediente ? getNextAction(expediente.id) : null

  useEffect(() => {
    if (expediente) setNewEstado(expediente.estado)
    setTab('info')
    setDocuments([])
    setDocumentsError(null)
    setEditingNextAction(false)
    setNextActionError(null)
    setPreview(null)
  }, [expediente])

  useEffect(() => {
    if (!expediente) return
    setNextActionText(currentNextAction?.text ?? '')
    setNextActionDate(currentNextAction?.dueDate ?? '')
  }, [currentNextAction?.dueDate, currentNextAction?.text, expediente])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (preview) {
        setPreview(null)
        return
      }
      onClose()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, preview])

  const fetchDocuments = async (expedienteId: string) => {
    const documentsPath = `expedientes/${expedienteId}`
    setDocumentsLoading(true)
    setDocumentsError(null)
    try {
      const { data, error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .list(documentsPath, { limit: 200, sortBy: { column: 'updated_at', order: 'desc' } })

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
          mimeType: String((item.metadata as { mimetype?: string } | null)?.mimetype ?? mimeFromExtension(item.name)),
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
  const isOpenCase = !['Resuelta', 'Archivada'].includes(expediente.estado)

  const docsStats = {
    count: documents.length,
    totalSize: documents.reduce((sum, item) => sum + item.size, 0),
  }

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

  const handleSaveNextAction = () => {
    const text = normalizeWhitespace(nextActionText).slice(0, 220)
    const dueDate = normalizeDateOnly(nextActionDate)
    if (!text) {
      setNextActionError('La proxima accion no puede quedar vacia.')
      return
    }
    if (!dueDate) {
      setNextActionError('Seleccione una fecha compromiso valida.')
      return
    }
    if (dueDate < expediente.fecha_presentacion) {
      setNextActionError('La fecha compromiso no puede ser anterior a la fecha de presentacion.')
      return
    }

    setNextAction(expediente.id, { text, dueDate, completed: currentNextAction?.completed ?? false })
    setEditingNextAction(false)
    setNextActionError(null)
    addNotification({
      type: 'success',
      title: 'Proxima accion actualizada',
      message: `${expediente.folio} ahora tiene una accion programada para ${format(new Date(`${dueDate}T00:00:00`), 'dd/MM/yyyy')}.`,
    })
  }

  const handleToggleComplete = () => {
    if (!currentNextAction) return
    const completed = !currentNextAction.completed
    toggleNextActionCompleted(expediente.id, completed)
    addNotification({
      type: completed ? 'success' : 'info',
      title: completed ? 'Accion completada' : 'Accion reactivada',
      message: `${expediente.folio}: ${currentNextAction.text}`,
    })
  }

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    setDocumentsError(null)
    setDocumentsUploadingCount(files.length)

    let uploaded = 0
    let failed = 0

    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
        failed += 1
        continue
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        failed += 1
        continue
      }

      const fileName = `${Date.now()}_${safeFileName(file.name)}`
      const storagePath = `${documentsPath}/${fileName}`
      const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || mimeFromExtension(file.name),
      })

      if (error) {
        failed += 1
      } else {
        uploaded += 1
      }
    }

    setDocumentsUploadingCount(0)
    await fetchDocuments(expediente.id)

    if (uploaded > 0) {
      addNotification({
        type: 'success',
        title: 'Carga completada',
        message: `Documentos cargados: ${uploaded}${failed > 0 ? `, fallidos: ${failed}` : ''}.`,
      })
    }
    if (failed > 0) {
      setDocumentsError(`No se pudieron subir ${failed} archivo(s). Revise formato o peso maximo de 15 MB.`)
    }
  }

  const handleUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    await uploadFiles(files)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDraggingFiles(false)
    const files = Array.from(event.dataTransfer.files ?? [])
    await uploadFiles(files)
  }

  const openPreview = async (doc: DocumentItem) => {
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.path, 120)
    if (error || !data?.signedUrl) {
      addNotification({
        type: 'error',
        title: 'No se pudo abrir vista previa',
        message: error?.message ?? 'No se pudo generar un enlace temporal.',
      })
      return
    }
    setPreview({ name: doc.name, url: data.signedUrl, mimeType: doc.mimeType })
  }

  const handleDownloadDocument = async (doc: DocumentItem) => {
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
              expediente.notas_seguimiento.slice(0, 110) +
              (expediente.notas_seguimiento.length > 110 ? '...' : ''),
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
    { id: 'info', label: 'Informacion', icon: <Info className="h-3.5 w-3.5" /> },
    { id: 'timeline', label: 'Timeline', icon: <Clock className="h-3.5 w-3.5" /> },
    { id: 'documentos', label: 'Documentos', icon: <Paperclip className="h-3.5 w-3.5" /> },
    { id: 'actividad', label: 'Actividad', icon: <Activity className="h-3.5 w-3.5" /> },
  ]

  const isPreviewImage = preview?.mimeType.startsWith('image/')
  const isPreviewPdf = preview?.mimeType.includes('pdf')

  return (
    <AnimatePresence>
      <motion.div
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2 backdrop-blur-sm md:p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Expediente ${expediente.folio}`}
      >
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
          onClick={(event) => event.stopPropagation()}
          className="flex h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:h-[92vh]"
        >
          <header className="border-b border-slate-200 bg-slate-50 px-4 py-4 md:px-6">
            <div className="mb-1 text-xs font-medium text-slate-500">Dashboard &gt; Expedientes &gt; {expediente.folio}</div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xl font-bold text-blue-700">{expediente.folio}</p>
                  <span className={cn('rounded-lg px-2 py-1 text-xs font-semibold', estado?.badge)}>{expediente.estado}</span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-600">{expediente.tipo_derecho}</p>
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
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          {dias >= 30 && isOpenCase && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 md:mx-6">
              <AlertCircle className="h-4 w-4" />
              Este expediente lleva {dias} dias sin movimiento y requiere atencion.
            </div>
          )}

          <div className="px-4 pt-3 md:px-6">
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

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <AnimatePresence mode="wait">
              {tab === 'info' && (
                <motion.div key="info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
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
                          className="min-w-52 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <span className={cn('inline-flex rounded-lg px-2 py-1 text-xs font-semibold', estado?.badge)}>{expediente.estado}</span>
                    )}
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">Proxima accion</p>
                      {currentNextAction ? (
                        <button
                          onClick={() => setEditingNextAction((value) => !value)}
                          className="text-xs font-semibold text-blue-700 hover:underline"
                        >
                          {editingNextAction ? 'Cancelar' : 'Editar'}
                        </button>
                      ) : null}
                    </div>

                    {editingNextAction || !currentNextAction ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={nextActionText}
                          onChange={(event) => setNextActionText(event.target.value)}
                          placeholder="Ej. Solicitar informe a la autoridad responsable"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={nextActionDate}
                            onChange={(event) => setNextActionDate(event.target.value)}
                            min={expediente.fecha_presentacion}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={handleSaveNextAction}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            Guardar accion
                          </button>
                          {currentNextAction ? (
                            <button
                              onClick={() => {
                                removeNextAction(expediente.id)
                                setNextActionText('')
                                setNextActionDate('')
                                setEditingNextAction(false)
                              }}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Quitar
                            </button>
                          ) : null}
                        </div>
                        {nextActionError && <p className="text-xs text-red-600">{nextActionError}</p>}
                      </div>
                    ) : (
                      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-800">{currentNextAction.text}</p>
                          <button
                            onClick={handleToggleComplete}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold',
                              currentNextAction.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700',
                            )}
                          >
                            {currentNextAction.completed ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                            {currentNextAction.completed ? 'Completada' : 'Pendiente'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600">
                          Fecha compromiso: {format(new Date(`${currentNextAction.dueDate}T00:00:00`), 'dd/MM/yyyy')}
                        </p>
                      </div>
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
                <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="relative space-y-4">
                    <div className="absolute bottom-0 left-2 top-0 w-px bg-slate-200" />
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
                <motion.div key="documentos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                  {documentsError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{documentsError}</div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-sm text-slate-700">
                      {docsStats.count} documento(s) - {formatBytes(docsStats.totalSize)}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void fetchDocuments(expediente.id)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Actualizar
                      </button>
                      <button
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={documentsUploadingCount > 0}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {documentsUploadingCount > 0 ? `Subiendo ${documentsUploadingCount}...` : 'Subir documentos'}
                      </button>
                      <input
                        ref={uploadInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleUploadChange}
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.xls"
                      />
                    </div>
                  </div>

                  <div
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDraggingFiles(true)
                    }}
                    onDragLeave={() => setDraggingFiles(false)}
                    onDrop={(event) => void handleDrop(event)}
                    className={cn(
                      'rounded-xl border-2 border-dashed p-5 text-center transition-colors',
                      draggingFiles ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-300 bg-slate-50 text-slate-600',
                    )}
                  >
                    <Upload className="mx-auto mb-2 h-5 w-5" />
                    <p className="text-sm font-medium">Arrastra y suelta multiples archivos aqui</p>
                    <p className="text-xs">Formatos: PDF, Office, PNG, JPG. Maximo 15 MB por archivo.</p>
                  </div>

                  {documentsLoading ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Cargando documentos...</div>
                  ) : documents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-7 text-center text-sm text-slate-500">
                      <Paperclip className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                      No hay documentos cargados para este expediente.
                    </div>
                  ) : (
                    documents.map((doc) => (
                      <article key={doc.path} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                          <FileText className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{doc.name}</p>
                          <p className="text-xs text-slate-500">
                            {formatBytes(doc.size)}
                            {doc.updatedAt ? ` - ${format(new Date(doc.updatedAt), 'dd/MM/yyyy HH:mm')}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => void openPreview(doc)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Vista previa de ${doc.name}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
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
                <motion.div key="actividad" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
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

        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(event) => {
                event.stopPropagation()
                setPreview(null)
              }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
            >
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.98 }}
                onClick={(event) => event.stopPropagation()}
                className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white"
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-800">{preview.name}</p>
                  <button
                    onClick={() => setPreview(null)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Cerrar vista previa"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 bg-slate-100 p-2">
                  {isPreviewImage ? (
                    <img src={preview.url} alt={preview.name} className="h-full w-full rounded-lg object-contain" />
                  ) : isPreviewPdf ? (
                    <iframe title={preview.name} src={preview.url} className="h-full w-full rounded-lg border border-slate-200 bg-white" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <a
                        href={preview.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                      >
                        <Download className="h-4 w-4" />
                        Abrir archivo
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}
