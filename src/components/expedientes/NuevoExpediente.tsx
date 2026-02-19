import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  FileText,
  Hash,
  LayoutTemplate,
  Save,
  Trash2,
  User,
  Building2,
  X,
} from 'lucide-react'
import { useExpedientes } from '../../context/ExpedientesContext'
import { useNotifications } from '../../context/NotificationsContext'
import { useProductivity } from '../../context/ProductivityContext'
import {
  DERECHOS,
  ESTADOS,
  FIELD_LIMITS,
  cn,
  getMesRegistro,
  isFutureDate,
  isValidFolio,
  normalizeDateOnly,
  normalizeFolio,
  normalizeWhitespace,
} from '../../lib/utils'
import type { Expediente } from '../../types/database'

interface FormState {
  folio: string
  fecha_presentacion: string
  tipo_derecho: string
  autoridad_responsable: string
  visitador_asignado: string
  estado: string
  notas_seguimiento: string
  next_action_text: string
  next_action_due_date: string
}

const DRAFT_KEY = 'nuevo-expediente-form'

const dateToday = () => new Date().toISOString().split('T')[0]
const dateTomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

const EMPTY: FormState = {
  folio: '',
  fecha_presentacion: dateToday(),
  tipo_derecho: '',
  autoridad_responsable: '',
  visitador_asignado: '',
  estado: 'Admitida',
  notas_seguimiento: '',
  next_action_text: '',
  next_action_due_date: dateTomorrow(),
}

function withDays(base: string, days: number): string {
  const seed = normalizeDateOnly(base) ?? dateToday()
  const source = new Date(`${seed}T00:00:00`)
  source.setDate(source.getDate() + days)
  return source.toISOString().split('T')[0]
}

export function NuevoExpediente() {
  const location = useLocation()
  const navigate = useNavigate()
  const { createExpediente, updateExpediente, expedientes } = useExpedientes()
  const { addNotification } = useNotifications()
  const {
    templates,
    visitadoresCatalog,
    getNextAction,
    setNextAction,
    saveTemplate,
    deleteTemplate,
    saveDraft,
    getDraft,
    clearDraft,
  } = useProductivity()

  const editingExp: Expediente | undefined = location.state?.expediente
  const isEditing = Boolean(editingExp)
  const initializedRef = useRef(false)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  const visitadorOptions = useMemo(() => {
    const set = new Set(visitadoresCatalog)
    const current = normalizeWhitespace(form.visitador_asignado)
    if (current) set.add(current)
    return Array.from(set)
  }, [visitadoresCatalog, form.visitador_asignado])

  const nextAutoFolio = useMemo(() => {
    const year = new Date().getFullYear()
    return `CEDHBC-${year}-${String(expedientes.length + 1).padStart(3, '0')}`
  }, [expedientes.length])

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    if (isEditing && editingExp) {
      const nextAction = getNextAction(editingExp.id)
      setForm({
        folio: editingExp.folio,
        fecha_presentacion: editingExp.fecha_presentacion,
        tipo_derecho: editingExp.tipo_derecho,
        autoridad_responsable: editingExp.autoridad_responsable,
        visitador_asignado: editingExp.visitador_asignado,
        estado: editingExp.estado,
        notas_seguimiento: editingExp.notas_seguimiento ?? '',
        next_action_text: nextAction?.text ?? '',
        next_action_due_date: nextAction?.dueDate ?? dateTomorrow(),
      })
      return
    }

    const draft = getDraft(DRAFT_KEY)
    if (draft?.values) {
      setForm({
        ...EMPTY,
        ...draft.values,
        folio: draft.values.folio || nextAutoFolio,
      })
      setDraftMessage('Borrador recuperado automaticamente.')
      return
    }

    setForm((prev) => ({ ...prev, folio: nextAutoFolio }))
  }, [editingExp, getDraft, getNextAction, isEditing, nextAutoFolio])

  useEffect(() => {
    if (isEditing || success || !initializedRef.current) return
    const id = window.setTimeout(() => {
      saveDraft(DRAFT_KEY, form as unknown as Record<string, string>)
    }, 500)
    return () => window.clearTimeout(id)
  }, [form, isEditing, saveDraft, success])

  useEffect(() => {
    if (!isEditing && !form.visitador_asignado && visitadoresCatalog.length > 0) {
      setForm((prev) => ({ ...prev, visitador_asignado: visitadoresCatalog[0] }))
    }
  }, [isEditing, form.visitador_asignado, visitadoresCatalog])

  const set = (field: keyof FormState, value: string) => {
    let nextValue = value

    if (field === 'folio') nextValue = value.toUpperCase().slice(0, FIELD_LIMITS.folio)
    if (field === 'autoridad_responsable') nextValue = value.slice(0, FIELD_LIMITS.autoridad)
    if (field === 'notas_seguimiento') nextValue = value.slice(0, FIELD_LIMITS.notas)
    if (field === 'next_action_text') nextValue = value.slice(0, 220)

    setForm((prev) => ({ ...prev, [field]: nextValue }))
    setError(null)
  }

  const applyTemplate = () => {
    if (!selectedTemplateId) return
    const template = templates.find((item) => item.id === selectedTemplateId)
    if (!template) return

    const nextDueDate = withDays(
      normalizeDateOnly(form.fecha_presentacion) ?? dateToday(),
      template.next_action_offset_days,
    )

    setForm((prev) => ({
      ...prev,
      tipo_derecho: template.tipo_derecho,
      autoridad_responsable: template.autoridad_responsable,
      visitador_asignado: template.visitador_asignado,
      estado: template.estado,
      notas_seguimiento: template.notas_seguimiento,
      next_action_text: template.next_action_text,
      next_action_due_date: nextDueDate,
    }))

    addNotification({
      type: 'info',
      title: 'Plantilla aplicada',
      message: `Se aplico la plantilla "${template.name}".`,
    })
  }

  const handleSaveTemplate = () => {
    const name = window.prompt('Nombre de la plantilla:')
    if (!name) return

    saveTemplate({
      name,
      tipo_derecho: normalizeWhitespace(form.tipo_derecho),
      autoridad_responsable: normalizeWhitespace(form.autoridad_responsable),
      visitador_asignado: normalizeWhitespace(form.visitador_asignado),
      estado: form.estado as Expediente['estado'],
      notas_seguimiento: form.notas_seguimiento.trim(),
      next_action_text: normalizeWhitespace(form.next_action_text),
      next_action_offset_days: Math.max(
        0,
        Math.ceil(
          (new Date(`${form.next_action_due_date}T00:00:00`).getTime() -
            new Date(`${form.fecha_presentacion}T00:00:00`).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      ),
    })

    addNotification({
      type: 'success',
      title: 'Plantilla guardada',
      message: `La plantilla "${name.trim()}" quedo disponible para nuevos casos.`,
    })
  }

  const validate = (): string | null => {
    const normalizedFolio = normalizeFolio(form.folio)
    if (!normalizedFolio) return 'El numero de folio es obligatorio.'
    if (!isValidFolio(normalizedFolio)) return 'Formato de folio invalido. Use CEDHBC-AAAA-000.'

    const normalizedDate = normalizeDateOnly(form.fecha_presentacion)
    if (!normalizedDate) return 'La fecha de presentacion es obligatoria.'
    if (isFutureDate(normalizedDate)) return 'La fecha de presentacion no puede ser futura.'

    if (!normalizeWhitespace(form.tipo_derecho)) return 'Seleccione el tipo de derecho vulnerado.'
    if (!normalizeWhitespace(form.autoridad_responsable)) return 'La autoridad responsable es obligatoria.'
    if (!normalizeWhitespace(form.visitador_asignado)) return 'Asigne un visitador al expediente.'

    const nextActionText = normalizeWhitespace(form.next_action_text)
    if (!nextActionText) return 'La proxima accion es obligatoria para guardar el expediente.'

    const nextActionDate = normalizeDateOnly(form.next_action_due_date)
    if (!nextActionDate) return 'La fecha de compromiso de la proxima accion es obligatoria.'
    if (nextActionDate < normalizedDate) {
      return 'La fecha de proxima accion no puede ser anterior a la fecha de presentacion.'
    }

    const duplicate = expedientes.some(
      (item) =>
        item.folio.toUpperCase() === normalizedFolio &&
        (!isEditing || (isEditing && item.id !== editingExp?.id)),
    )
    if (duplicate) return `El folio ${normalizedFolio} ya existe en el sistema.`

    return null
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)

    const normalizedDate = normalizeDateOnly(form.fecha_presentacion) ?? dateToday()
    const nextActionDate = normalizeDateOnly(form.next_action_due_date) ?? normalizedDate
    const payload = {
      folio: normalizeFolio(form.folio).slice(0, FIELD_LIMITS.folio),
      fecha_presentacion: normalizedDate,
      tipo_derecho: normalizeWhitespace(form.tipo_derecho).slice(0, FIELD_LIMITS.tipoDerecho),
      autoridad_responsable: normalizeWhitespace(form.autoridad_responsable).slice(0, FIELD_LIMITS.autoridad),
      visitador_asignado: normalizeWhitespace(form.visitador_asignado).slice(0, FIELD_LIMITS.visitador),
      estado: form.estado as Expediente['estado'],
      notas_seguimiento: form.notas_seguimiento.trim().slice(0, FIELD_LIMITS.notas),
      fecha_ultimo_movimiento: dateToday(),
      mes_registro: getMesRegistro(normalizedDate),
    }

    const nextActionText = normalizeWhitespace(form.next_action_text)
    const result = isEditing && editingExp
      ? await updateExpediente(editingExp.id, payload)
      : await createExpediente(payload)

    setSaving(false)

    if (result.error) {
      setError(`Error al guardar: ${result.error}`)
      return
    }

    const expedienteId = isEditing && editingExp ? editingExp.id : result.data?.id
    if (expedienteId) {
      setNextAction(expedienteId, {
        text: nextActionText,
        dueDate: nextActionDate,
        completed: false,
      })
    }

    if (!isEditing) clearDraft(DRAFT_KEY)

    setSuccess(true)
    addNotification({
      type: 'success',
      title: isEditing ? 'Expediente actualizado' : 'Expediente registrado',
      message: `${payload.folio} fue ${isEditing ? 'actualizado' : 'registrado'} correctamente.`,
    })

    window.setTimeout(() => {
      navigate('/expedientes')
    }, 1200)
  }

  const handleReset = () => {
    if (isEditing) {
      navigate(-1)
      return
    }

    clearDraft(DRAFT_KEY)
    setForm({ ...EMPTY, folio: nextAutoFolio })
    setDraftMessage('Borrador limpiado.')
    setError(null)
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{isEditing ? 'Expediente actualizado' : 'Expediente registrado'}</h2>
          <p className="mt-1 text-sm text-slate-500">Redirigiendo a la lista de expedientes...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{isEditing ? 'Editar Expediente' : 'Nuevo Expediente'}</h1>
          <p className="text-sm text-slate-600">
            {isEditing ? `Actualizando ${editingExp?.folio}` : 'Registro rapido con plantillas, borrador automatico y seguimiento.'}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {draftMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"
          >
            <span>{draftMessage}</span>
            <button
              type="button"
              onClick={() => setDraftMessage(null)}
              className="rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              Ocultar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {!isEditing && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-3 flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">Plantillas inteligentes</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto_auto]">
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar plantilla</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyTemplate}
              disabled={!selectedTemplateId}
              className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Guardar plantilla
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedTemplateId) return
                const selected = templates.find((template) => template.id === selectedTemplateId)
                if (!selected) return
                if (!window.confirm(`Eliminar plantilla "${selected.name}"?`)) return
                deleteTemplate(selectedTemplateId)
                setSelectedTemplateId('')
              }}
              disabled={!selectedTemplateId}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
          </div>
        </section>
      )}

      <motion.form
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-5 md:px-8">
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-blue-900">Aviso de confidencialidad</p>
              <p className="text-xs text-blue-700">
                No registrar datos personales del quejoso. Usar solo folio y datos administrativos.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-8 p-5 md:p-8">
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Hash className="h-5 w-5 text-blue-600" />
              Informacion general
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="folio" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Folio
                </label>
                <input
                  id="folio"
                  type="text"
                  required
                  value={form.folio}
                  onChange={(event) => set('folio', event.target.value)}
                  maxLength={FIELD_LIMITS.folio}
                  pattern="^CEDHBC[-/][0-9]{4}[-/][0-9]{3,6}$"
                  title="Use el formato CEDHBC-AAAA-000"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 font-mono text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="fecha" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Fecha de recepcion
                </label>
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="fecha"
                    type="date"
                    required
                    value={form.fecha_presentacion}
                    onChange={(event) => set('fecha_presentacion', event.target.value)}
                    max={dateToday()}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Building2 className="h-5 w-5 text-blue-600" />
              Clasificacion
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="derecho" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Derecho vulnerado
                </label>
                <select
                  id="derecho"
                  required
                  value={form.tipo_derecho}
                  onChange={(event) => set('tipo_derecho', event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar derecho</option>
                  {DERECHOS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="autoridad" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Autoridad responsable
                </label>
                <input
                  id="autoridad"
                  type="text"
                  required
                  value={form.autoridad_responsable}
                  onChange={(event) => set('autoridad_responsable', event.target.value)}
                  placeholder="Ej. Secretaria de Salud"
                  maxLength={FIELD_LIMITS.autoridad}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <User className="h-5 w-5 text-blue-600" />
              Asignacion
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="visitador" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Visitador asignado
                </label>
                <select
                  id="visitador"
                  required
                  value={form.visitador_asignado}
                  onChange={(event) => set('visitador_asignado', event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar visitador</option>
                  {visitadorOptions.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="estado" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Estado actual
                </label>
                <select
                  id="estado"
                  required
                  value={form.estado}
                  onChange={(event) => set('estado', event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ESTADOS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Clock3 className="h-5 w-5 text-blue-600" />
              Proxima accion (obligatoria)
            </h2>
            <p className="text-xs text-slate-600">Define el siguiente paso operativo para que el caso aparezca en la bandeja de trabajo diaria.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <label htmlFor="next-action" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Accion siguiente
                </label>
                <input
                  id="next-action"
                  type="text"
                  required
                  value={form.next_action_text}
                  onChange={(event) => set('next_action_text', event.target.value)}
                  placeholder="Ej. Solicitar informe a la autoridad responsable"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="next-action-date" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Fecha compromiso
                </label>
                <input
                  id="next-action-date"
                  type="date"
                  required
                  value={form.next_action_due_date}
                  onChange={(event) => set('next_action_due_date', event.target.value)}
                  min={normalizeDateOnly(form.fecha_presentacion) ?? dateToday()}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <FileText className="h-5 w-5 text-blue-600" />
              Notas de seguimiento
            </h2>
            <textarea
              rows={5}
              value={form.notas_seguimiento}
              onChange={(event) => set('notas_seguimiento', event.target.value)}
              placeholder="Describe avances, acuerdos o informacion adicional del expediente..."
              maxLength={FIELD_LIMITS.notas}
              className="w-full resize-none rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-right text-xs text-slate-400">{form.notas_seguimiento.length} caracteres</p>
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur-sm md:px-8">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              <X className="h-4 w-4" />
              {isEditing ? 'Cancelar' : 'Limpiar'}
            </button>

            <button
              type="submit"
              disabled={saving}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white',
                'transition-all hover:bg-blue-800 hover:shadow-lg hover:shadow-blue-500/20',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando...' : isEditing ? 'Actualizar expediente' : 'Registrar expediente'}
            </button>
          </div>
        </div>
      </motion.form>
    </div>
  )
}
