import { useState, useEffect, FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Save,
  X,
  Calendar,
  User,
  Building2,
  AlertCircle,
  CheckCircle2,
  Hash,
  FileText,
} from 'lucide-react'
import { useExpedientes } from '../../context/ExpedientesContext'
import { useNotifications } from '../../context/NotificationsContext'
import {
  ESTADOS,
  DERECHOS,
  VISITADORES,
  FIELD_LIMITS,
  getMesRegistro,
  isFutureDate,
  isValidFolio,
  normalizeDateOnly,
  normalizeFolio,
  normalizeWhitespace,
  cn,
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
}

const EMPTY: FormState = {
  folio: '',
  fecha_presentacion: new Date().toISOString().split('T')[0],
  tipo_derecho: '',
  autoridad_responsable: '',
  visitador_asignado: '',
  estado: 'Admitida',
  notas_seguimiento: '',
}

export function NuevoExpediente() {
  const location = useLocation()
  const navigate = useNavigate()
  const { createExpediente, updateExpediente, expedientes } = useExpedientes()
  const { addNotification } = useNotifications()

  const editingExp: Expediente | undefined = location.state?.expediente
  const isEditing = !!editingExp

  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editingExp) {
      setForm({
        folio: editingExp.folio,
        fecha_presentacion: editingExp.fecha_presentacion,
        tipo_derecho: editingExp.tipo_derecho,
        autoridad_responsable: editingExp.autoridad_responsable,
        visitador_asignado: editingExp.visitador_asignado,
        estado: editingExp.estado,
        notas_seguimiento: editingExp.notas_seguimiento ?? '',
      })
      return
    }

    const nextNum = expedientes.length + 1
    const year = new Date().getFullYear()
    setForm((prev) => ({
      ...prev,
      folio: `CEDHBC-${year}-${String(nextNum).padStart(3, '0')}`,
    }))
  }, [editingExp, expedientes.length])

  const set = (field: keyof FormState, value: string) => {
    let nextValue = value

    if (field === 'folio') nextValue = value.toUpperCase().slice(0, FIELD_LIMITS.folio)
    if (field === 'autoridad_responsable') nextValue = value.slice(0, FIELD_LIMITS.autoridad)
    if (field === 'notas_seguimiento') nextValue = value.slice(0, FIELD_LIMITS.notas)

    setForm((prev) => ({ ...prev, [field]: nextValue }))
    setError(null)
  }

  const validate = (): string | null => {
    const normalizedFolio = normalizeFolio(form.folio)
    if (!normalizedFolio) return 'El numero de folio es obligatorio.'
    if (!isValidFolio(normalizedFolio)) {
      return 'Formato de folio invalido. Use CEDHBC-AAAA-000.'
    }

    const normalizedDate = normalizeDateOnly(form.fecha_presentacion)
    if (!normalizedDate) return 'La fecha de presentacion es obligatoria.'
    if (isFutureDate(normalizedDate)) return 'La fecha de presentacion no puede ser futura.'

    if (!normalizeWhitespace(form.tipo_derecho)) return 'Seleccione el tipo de derecho vulnerado.'
    if (!normalizeWhitespace(form.autoridad_responsable)) return 'La autoridad responsable es obligatoria.'
    if (!normalizeWhitespace(form.visitador_asignado)) return 'Asigne un visitador al expediente.'

    const duplicate = expedientes.some(
      (e) =>
        e.folio.toUpperCase() === normalizedFolio &&
        (!isEditing || (isEditing && e.id !== editingExp.id)),
    )
    if (duplicate) {
      return `El folio ${normalizedFolio} ya existe en el sistema.`
    }

    return null
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)

    const normalizedDate = normalizeDateOnly(form.fecha_presentacion) ?? new Date().toISOString().split('T')[0]

    const payload = {
      folio: normalizeFolio(form.folio).slice(0, FIELD_LIMITS.folio),
      fecha_presentacion: normalizedDate,
      tipo_derecho: normalizeWhitespace(form.tipo_derecho).slice(0, FIELD_LIMITS.tipoDerecho),
      autoridad_responsable: normalizeWhitespace(form.autoridad_responsable).slice(0, FIELD_LIMITS.autoridad),
      visitador_asignado: normalizeWhitespace(form.visitador_asignado).slice(0, FIELD_LIMITS.visitador),
      estado: form.estado as Expediente['estado'],
      notas_seguimiento: form.notas_seguimiento.trim().slice(0, FIELD_LIMITS.notas),
      fecha_ultimo_movimiento: new Date().toISOString().split('T')[0],
      mes_registro: getMesRegistro(normalizedDate),
    }

    const result = isEditing ? await updateExpediente(editingExp.id, payload) : await createExpediente(payload)
    setSaving(false)

    if (result.error) {
      setError(`Error al guardar: ${result.error}`)
      return
    }

    setSuccess(true)
    addNotification({
      type: 'success',
      title: isEditing ? 'Expediente actualizado' : 'Expediente registrado',
      message: `${payload.folio} fue ${isEditing ? 'actualizado' : 'registrado'} exitosamente.`,
    })

    setTimeout(() => {
      navigate('/expedientes')
    }, 1200)
  }

  const handleReset = () => {
    if (isEditing) {
      navigate(-1)
      return
    }

    const nextNum = expedientes.length + 1
    const year = new Date().getFullYear()
    setForm({ ...EMPTY, folio: `CEDHBC-${year}-${String(nextNum).padStart(3, '0')}` })
    setError(null)
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900">
            {isEditing ? 'Expediente actualizado' : 'Expediente registrado'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">Redirigiendo a la lista de expedientes...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900">
          {isEditing ? 'Editar Expediente' : 'Nuevo Expediente'}
        </h1>
        <p className="text-sm text-slate-600">
          {isEditing ? `Actualizando ${editingExp.folio}` : 'Registro y clasificacion de expediente'}
        </p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.form
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-8 py-6">
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 text-blue-600" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-blue-900">Aviso de confidencialidad</p>
              <p className="text-xs text-blue-700">
                No registrar datos personales del quejoso. Usar solo folio y datos administrativos.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-8 p-8">
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
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
                  onChange={(e) => set('folio', e.target.value)}
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
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input
                    id="fecha"
                    type="date"
                    required
                    value={form.fecha_presentacion}
                    onChange={(e) => set('fecha_presentacion', e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
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
                  onChange={(e) => set('tipo_derecho', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar derecho</option>
                  {DERECHOS.map((d) => (
                    <option key={d}>{d}</option>
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
                  onChange={(e) => set('autoridad_responsable', e.target.value)}
                  placeholder="Ej. Secretaria de Salud"
                  maxLength={FIELD_LIMITS.autoridad}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
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
                  onChange={(e) => set('visitador_asignado', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar visitador</option>
                  {VISITADORES.map((v) => (
                    <option key={v}>{v}</option>
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
                  onChange={(e) => set('estado', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ESTADOS.map((estado) => (
                    <option key={estado}>{estado}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
              <FileText className="h-5 w-5 text-blue-600" />
              Notas de seguimiento
            </h2>
            <textarea
              rows={5}
              value={form.notas_seguimiento}
              onChange={(e) => set('notas_seguimiento', e.target.value)}
              placeholder="Describe avances, acuerdos o informacion adicional del expediente..."
              maxLength={FIELD_LIMITS.notas}
              className="w-full resize-none rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-right text-xs text-slate-400">{form.notas_seguimiento.length} caracteres</p>
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-8 py-4 backdrop-blur-sm">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              <X className="h-4 w-4" aria-hidden />
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
              <Save className="h-4 w-4" aria-hidden />
              {saving ? 'Guardando...' : isEditing ? 'Actualizar expediente' : 'Registrar expediente'}
            </button>
          </div>
        </div>
      </motion.form>
    </div>
  )
}
