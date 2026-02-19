import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Database, Expediente, ExpedienteInsert, ExpedienteUpdate } from '../types/database'
import {
  ESTADOS,
  FIELD_LIMITS,
  getMesRegistro,
  isFutureDate,
  isValidFolio,
  normalizeDateOnly,
  normalizeFolio,
  truncateText,
} from '../lib/utils'
import { useAuth } from './AuthContext'

interface ExpedientesContextType {
  expedientes: Expediente[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  createExpediente: (data: ExpedienteInsert) => Promise<{ error: string | null; data: Expediente | null }>
  updateExpediente: (id: string, data: ExpedienteUpdate) => Promise<{ error: string | null; data: Expediente | null }>
  deleteExpediente: (id: string) => Promise<{ error: string | null }>
}

const ExpedientesContext = createContext<ExpedientesContextType | undefined>(undefined)
const TABLE_NAME = 'expedientes' as const

type ExpedienteInsertRow = Database['public']['Tables']['expedientes']['Insert']
type ExpedienteUpdateRow = Database['public']['Tables']['expedientes']['Update']

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeCreatePayload(data: ExpedienteInsert): { payload: ExpedienteInsertRow | null; error: string | null } {
  const folio = normalizeFolio(data.folio).slice(0, FIELD_LIMITS.folio)
  if (!folio) return { payload: null, error: 'El folio es obligatorio.' }
  if (!isValidFolio(folio)) {
    return { payload: null, error: 'El folio debe usar formato CEDHBC-AAAA-000.' }
  }

  const fechaPresentacion = normalizeDateOnly(data.fecha_presentacion)
  if (!fechaPresentacion) return { payload: null, error: 'La fecha de presentacion es invalida.' }
  if (isFutureDate(fechaPresentacion)) {
    return { payload: null, error: 'La fecha de presentacion no puede ser futura.' }
  }

  const tipoDerecho = truncateText(data.tipo_derecho, FIELD_LIMITS.tipoDerecho)
  if (!tipoDerecho) return { payload: null, error: 'El tipo de derecho es obligatorio.' }

  const autoridad = truncateText(data.autoridad_responsable, FIELD_LIMITS.autoridad)
  if (!autoridad) return { payload: null, error: 'La autoridad responsable es obligatoria.' }

  const visitador = truncateText(data.visitador_asignado, FIELD_LIMITS.visitador)
  if (!visitador) return { payload: null, error: 'El visitador asignado es obligatorio.' }

  const estado = (data.estado ?? 'Admitida') as Expediente['estado']
  if (!ESTADOS.includes(estado)) {
    return { payload: null, error: 'El estado seleccionado no es valido.' }
  }

  const notas = (data.notas_seguimiento ?? '').trim().slice(0, FIELD_LIMITS.notas)
  const fechaMovimiento = normalizeDateOnly(data.fecha_ultimo_movimiento ?? fechaPresentacion)
  if (!fechaMovimiento) {
    return { payload: null, error: 'La fecha de ultimo movimiento es invalida.' }
  }
  if (isFutureDate(fechaMovimiento)) {
    return { payload: null, error: 'La fecha de ultimo movimiento no puede ser futura.' }
  }
  if (fechaMovimiento < fechaPresentacion) {
    return {
      payload: null,
      error: 'La fecha de ultimo movimiento no puede ser anterior a la fecha de presentacion.',
    }
  }

  const mesRegistro = truncateText(data.mes_registro ?? getMesRegistro(fechaPresentacion), 60) || getMesRegistro(fechaPresentacion)

  return {
    payload: {
      folio,
      fecha_presentacion: fechaPresentacion,
      tipo_derecho: tipoDerecho,
      autoridad_responsable: autoridad,
      visitador_asignado: visitador,
      estado,
      fecha_ultimo_movimiento: fechaMovimiento,
      notas_seguimiento: notas,
      mes_registro: mesRegistro,
    },
    error: null,
  }
}

function normalizeUpdatePayload(data: ExpedienteUpdate): { payload: ExpedienteUpdateRow | null; error: string | null } {
  const payload: ExpedienteUpdateRow = {}

  if (typeof data.folio === 'string') {
    const folio = normalizeFolio(data.folio).slice(0, FIELD_LIMITS.folio)
    if (!folio) return { payload: null, error: 'El folio no puede quedar vacio.' }
    if (!isValidFolio(folio)) {
      return { payload: null, error: 'El folio debe usar formato CEDHBC-AAAA-000.' }
    }
    payload.folio = folio
  }

  if (typeof data.fecha_presentacion === 'string') {
    const fecha = normalizeDateOnly(data.fecha_presentacion)
    if (!fecha) return { payload: null, error: 'La fecha de presentacion es invalida.' }
    if (isFutureDate(fecha)) {
      return { payload: null, error: 'La fecha de presentacion no puede ser futura.' }
    }
    payload.fecha_presentacion = fecha
    if (!payload.mes_registro) {
      payload.mes_registro = getMesRegistro(fecha)
    }
  }

  if (typeof data.tipo_derecho === 'string') {
    const tipoDerecho = truncateText(data.tipo_derecho, FIELD_LIMITS.tipoDerecho)
    if (!tipoDerecho) return { payload: null, error: 'El tipo de derecho no puede quedar vacio.' }
    payload.tipo_derecho = tipoDerecho
  }

  if (typeof data.autoridad_responsable === 'string') {
    const autoridad = truncateText(data.autoridad_responsable, FIELD_LIMITS.autoridad)
    if (!autoridad) return { payload: null, error: 'La autoridad responsable no puede quedar vacia.' }
    payload.autoridad_responsable = autoridad
  }

  if (typeof data.visitador_asignado === 'string') {
    const visitador = truncateText(data.visitador_asignado, FIELD_LIMITS.visitador)
    if (!visitador) return { payload: null, error: 'El visitador asignado no puede quedar vacio.' }
    payload.visitador_asignado = visitador
  }

  if (typeof data.estado === 'string') {
    const estado = data.estado as Expediente['estado']
    if (!ESTADOS.includes(estado)) {
      return { payload: null, error: 'El estado seleccionado no es valido.' }
    }
    payload.estado = estado
  }

  if (typeof data.notas_seguimiento === 'string') {
    payload.notas_seguimiento = data.notas_seguimiento.trim().slice(0, FIELD_LIMITS.notas)
  }

  if (typeof data.fecha_ultimo_movimiento === 'string') {
    const fecha = normalizeDateOnly(data.fecha_ultimo_movimiento)
    if (!fecha) return { payload: null, error: 'La fecha de ultimo movimiento es invalida.' }
    if (isFutureDate(fecha)) {
      return { payload: null, error: 'La fecha de ultimo movimiento no puede ser futura.' }
    }
    payload.fecha_ultimo_movimiento = fecha
  }

  if (typeof data.mes_registro === 'string') {
    const mesRegistro = truncateText(data.mes_registro, 60)
    if (!mesRegistro) return { payload: null, error: 'El mes de registro no puede quedar vacio.' }
    payload.mes_registro = mesRegistro
  }

  if (
    payload.fecha_presentacion &&
    payload.fecha_ultimo_movimiento &&
    payload.fecha_ultimo_movimiento < payload.fecha_presentacion
  ) {
    return {
      payload: null,
      error: 'La fecha de ultimo movimiento no puede ser anterior a la fecha de presentacion.',
    }
  }

  if (Object.keys(payload).length === 0) {
    return { payload: null, error: 'No hay cambios para guardar.' }
  }

  const shouldTouchLastMovement =
    !payload.fecha_ultimo_movimiento &&
    (payload.estado !== undefined ||
      payload.tipo_derecho !== undefined ||
      payload.autoridad_responsable !== undefined ||
      payload.visitador_asignado !== undefined ||
      payload.notas_seguimiento !== undefined)

  if (shouldTouchLastMovement) {
    payload.fecha_ultimo_movimiento = new Date().toISOString().split('T')[0]
  }

  return { payload, error: null }
}

export function ExpedientesProvider({ children }: { children: ReactNode }) {
  const [expedientes, setExpedientes] = useState<Expediente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { session } = useAuth()

  const fetchExpedientes = useCallback(async () => {
    if (!session) {
      setExpedientes([])
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message || 'No se pudieron cargar los expedientes.')
        setLoading(false)
        return
      }

      setExpedientes((data ?? []) as Expediente[])
      setLoading(false)
    } catch {
      setError('Error de conexion al consultar expedientes.')
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void fetchExpedientes()

    if (!session) return

    let refreshTimeout: number | null = null

    const channel = supabase
      .channel(`expedientes-changes-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAME }, () => {
        if (refreshTimeout) window.clearTimeout(refreshTimeout)
        refreshTimeout = window.setTimeout(() => {
          void fetchExpedientes()
        }, 120)
      })
      .subscribe()

    return () => {
      if (refreshTimeout) window.clearTimeout(refreshTimeout)
      void supabase.removeChannel(channel)
    }
  }, [fetchExpedientes, session])

  const createExpediente = async (data: ExpedienteInsert) => {
    const { payload, error: validationError } = normalizeCreatePayload(data)
    if (validationError || !payload) {
      return { error: validationError ?? 'Datos invalidos para crear expediente.', data: null }
    }

    const duplicate = expedientes.some(
      (item) => item.folio.toUpperCase() === payload.folio.toUpperCase(),
    )
    if (duplicate) {
      return { error: `El folio ${payload.folio} ya existe.`, data: null }
    }

    try {
      const { data: inserted, error: insertError } = await supabase
        .from(TABLE_NAME)
        .insert([payload] as never)
        .select('*')
        .single()
      if (insertError) {
        const message = insertError.code === '23505' ? 'El folio ya existe en base de datos.' : insertError.message
        return { error: message, data: null }
      }

      await fetchExpedientes()
      return { error: null, data: (inserted as Expediente) ?? null }
    } catch {
      return { error: 'No se pudo crear el expediente por un error de red.', data: null }
    }
  }

  const updateExpediente = async (id: string, data: ExpedienteUpdate) => {
    if (!isUuid(id)) {
      return { error: 'Identificador de expediente invalido.', data: null }
    }

    const current = expedientes.find((item) => item.id === id)
    if (!current) {
      return { error: 'No se encontro el expediente a actualizar.', data: null }
    }

    const { payload, error: validationError } = normalizeUpdatePayload(data)
    if (validationError || !payload) {
      return { error: validationError ?? 'Datos invalidos para actualizar expediente.', data: null }
    }

    if (payload.folio) {
      const duplicate = expedientes.some(
        (item) => item.id !== id && item.folio.toUpperCase() === payload.folio?.toUpperCase(),
      )
      if (duplicate) {
        return { error: `El folio ${payload.folio} ya existe.`, data: null }
      }
    }

    const nextFechaPresentacion = payload.fecha_presentacion ?? current.fecha_presentacion
    const nextFechaMovimiento = payload.fecha_ultimo_movimiento ?? current.fecha_ultimo_movimiento

    if (nextFechaMovimiento < nextFechaPresentacion) {
      return {
        error: 'La fecha de ultimo movimiento no puede ser anterior a la fecha de presentacion.',
        data: null,
      }
    }
    if (isFutureDate(nextFechaMovimiento)) {
      return { error: 'La fecha de ultimo movimiento no puede ser futura.', data: null }
    }

    try {
      const { data: updated, error: updateError } = await supabase
        .from(TABLE_NAME)
        .update(payload as never)
        .eq('id', id)
        .select('*')
        .single()
      if (updateError) {
        const message = updateError.code === '23505' ? 'El folio ya existe en base de datos.' : updateError.message
        return { error: message, data: null }
      }

      await fetchExpedientes()
      return { error: null, data: (updated as Expediente) ?? null }
    } catch {
      return { error: 'No se pudo actualizar el expediente por un error de red.', data: null }
    }
  }

  const deleteExpediente = async (id: string) => {
    if (!isUuid(id)) {
      return { error: 'Identificador de expediente invalido.' }
    }

    try {
      const { error: deleteError } = await supabase.from(TABLE_NAME).delete().eq('id', id)
      if (deleteError) return { error: deleteError.message }

      await fetchExpedientes()
      return { error: null }
    } catch {
      return { error: 'No se pudo eliminar el expediente por un error de red.' }
    }
  }

  return (
    <ExpedientesContext.Provider
      value={{
        expedientes,
        loading,
        error,
        refetch: fetchExpedientes,
        createExpediente,
        updateExpediente,
        deleteExpediente,
      }}
    >
      {children}
    </ExpedientesContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useExpedientes() {
  const ctx = useContext(ExpedientesContext)
  if (!ctx) throw new Error('useExpedientes debe usarse dentro de ExpedientesProvider')
  return ctx
}
