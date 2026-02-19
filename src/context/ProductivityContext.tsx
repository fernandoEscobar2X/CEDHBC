import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { ESTADOS, VISITADORES, normalizeDateOnly, normalizeWhitespace } from '../lib/utils'
import type { EstadoExpediente, NextActionRow, UserPreferencesRow } from '../types/database'
import { useAuth } from './AuthContext'
import { useExpedientes } from './ExpedientesContext'

export interface TogglePreference {
  label: string
  description: string
  enabled: boolean
}

export interface ProfileSettings {
  fullName: string
  position: string
}

export interface NextAction {
  expedienteId: string
  text: string
  dueDate: string
  completed: boolean
  updatedAt: string
  completedAt: string | null
}

export interface ExpedienteTemplate {
  id: string
  name: string
  tipo_derecho: string
  autoridad_responsable: string
  visitador_asignado: string
  estado: EstadoExpediente
  notas_seguimiento: string
  next_action_text: string
  next_action_offset_days: number
}

export interface SavedExpedienteFilter {
  id: string
  name: string
  search: string
  estado: string
  visitador: string
  fecha: 'todos' | 'este_mes' | 'ultimo_mes' | 'este_anio'
  dateFrom: string
  dateTo: string
  staleOnly: boolean
  withoutNextAction: boolean
}

interface ProductivityContextType {
  loading: boolean
  nextActions: Record<string, NextAction>
  templates: ExpedienteTemplate[]
  savedFilters: SavedExpedienteFilter[]
  profile: ProfileSettings
  notificationPrefs: TogglePreference[]
  systemPrefs: TogglePreference[]
  visitadoresCatalog: string[]
  getNextAction: (expedienteId: string) => NextAction | null
  setNextAction: (
    expedienteId: string,
    payload: {
      text: string
      dueDate: string
      completed?: boolean
    },
  ) => void
  toggleNextActionCompleted: (expedienteId: string, completed: boolean) => void
  removeNextAction: (expedienteId: string) => void
  saveTemplate: (
    payload: Omit<ExpedienteTemplate, 'id'> & { id?: string },
  ) => void
  deleteTemplate: (id: string) => void
  saveFilter: (
    payload: Omit<SavedExpedienteFilter, 'id'> & { id?: string },
  ) => void
  deleteFilter: (id: string) => void
  saveDraft: (key: string, values: Record<string, string>) => void
  getDraft: (key: string) => { values: Record<string, string>; updatedAt: string } | null
  clearDraft: (key: string) => void
  setProfile: (profile: ProfileSettings) => void
  setNotificationPrefs: (items: TogglePreference[]) => void
  setSystemPrefs: (items: TogglePreference[]) => void
  setVisitadoresCatalog: (items: string[]) => void
  refresh: () => Promise<void>
}

interface ProductivitySettings {
  profile: ProfileSettings
  notificationPrefs: TogglePreference[]
  systemPrefs: TogglePreference[]
  visitadoresCatalog: string[]
  templates: ExpedienteTemplate[]
  savedFilters: SavedExpedienteFilter[]
  drafts: Record<string, { values: Record<string, string>; updatedAt: string }>
}

const DEFAULT_PROFILE: ProfileSettings = {
  fullName: 'Administrador CEDHBC',
  position: 'Administrador',
}

const DEFAULT_NOTIFICATION_PREFS: TogglePreference[] = [
  { label: 'Notificaciones de expedientes nuevos', description: 'Alerta al registrar nuevos casos', enabled: true },
  { label: 'Notificaciones de cambios de estado', description: 'Aviso cuando un caso cambia de estado', enabled: true },
  { label: 'Notificaciones de vencimientos', description: 'Alerta para casos con mas de 30 dias sin movimiento', enabled: true },
  { label: 'Notificaciones de actividad', description: 'Actualizaciones relevantes del sistema', enabled: true },
]

const DEFAULT_SYSTEM_PREFS: TogglePreference[] = [
  { label: 'Validar folios duplicados', description: 'Bloquear folios repetidos en el registro', enabled: true },
  { label: 'Folio automatico', description: 'Sugerir folio consecutivo en nuevos expedientes', enabled: true },
  { label: 'Confirmar salida con cambios', description: 'Mostrar confirmacion antes de salir de un formulario', enabled: false },
]

const DEFAULT_SETTINGS: ProductivitySettings = {
  profile: DEFAULT_PROFILE,
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  systemPrefs: DEFAULT_SYSTEM_PREFS,
  visitadoresCatalog: VISITADORES,
  templates: [],
  savedFilters: [],
  drafts: {},
}

const ProductivityContext = createContext<ProductivityContextType | undefined>(undefined)

function asDateOnly(value: string): string {
  const normalized = normalizeDateOnly(value)
  return normalized ?? new Date().toISOString().split('T')[0]
}

function parseToggleArray(value: unknown, fallback: TogglePreference[]): TogglePreference[] {
  if (!Array.isArray(value)) return fallback
  const parsed = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<TogglePreference>
      const label = normalizeWhitespace(String(row.label ?? ''))
      const description = normalizeWhitespace(String(row.description ?? ''))
      if (!label || !description) return null
      return {
        label: label.slice(0, 140),
        description: description.slice(0, 240),
        enabled: Boolean(row.enabled),
      } satisfies TogglePreference
    })
    .filter((item): item is TogglePreference => !!item)
  return parsed.length > 0 ? parsed : fallback
}

function parseStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const parsed = value
    .map((item) => normalizeWhitespace(String(item ?? '')).slice(0, 120))
    .filter(Boolean)
  return parsed.length > 0 ? parsed : fallback
}

function parseTemplates(value: unknown): ExpedienteTemplate[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<ExpedienteTemplate>
      const estado = ESTADOS.includes(row.estado as EstadoExpediente) ? (row.estado as EstadoExpediente) : 'Admitida'
      const name = normalizeWhitespace(String(row.name ?? '')).slice(0, 80)
      const tipo = normalizeWhitespace(String(row.tipo_derecho ?? '')).slice(0, 120)
      const autoridad = normalizeWhitespace(String(row.autoridad_responsable ?? '')).slice(0, 160)
      const visitador = normalizeWhitespace(String(row.visitador_asignado ?? '')).slice(0, 120)
      if (!name || !tipo || !autoridad || !visitador) return null
      return {
        id: row.id || crypto.randomUUID(),
        name,
        tipo_derecho: tipo,
        autoridad_responsable: autoridad,
        visitador_asignado: visitador,
        estado,
        notas_seguimiento: String(row.notas_seguimiento ?? '').trim().slice(0, 2500),
        next_action_text: normalizeWhitespace(String(row.next_action_text ?? '')).slice(0, 220),
        next_action_offset_days: Math.max(0, Math.min(180, Number(row.next_action_offset_days) || 0)),
      } satisfies ExpedienteTemplate
    })
    .filter((item): item is ExpedienteTemplate => !!item)
}

function parseSavedFilters(value: unknown): SavedExpedienteFilter[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<SavedExpedienteFilter>
      const name = normalizeWhitespace(String(row.name ?? '')).slice(0, 80)
      if (!name) return null
      const fecha = row.fecha
      const validFecha: SavedExpedienteFilter['fecha'] =
        fecha === 'este_mes' || fecha === 'ultimo_mes' || fecha === 'este_anio' ? fecha : 'todos'
      return {
        id: row.id || crypto.randomUUID(),
        name,
        search: String(row.search ?? '').slice(0, 120),
        estado: String(row.estado ?? 'Todos'),
        visitador: String(row.visitador ?? 'Todos'),
        fecha: validFecha,
        dateFrom: normalizeDateOnly(String(row.dateFrom ?? '')) ?? '',
        dateTo: normalizeDateOnly(String(row.dateTo ?? '')) ?? '',
        staleOnly: Boolean(row.staleOnly),
        withoutNextAction: Boolean(row.withoutNextAction),
      } satisfies SavedExpedienteFilter
    })
    .filter((item): item is SavedExpedienteFilter => !!item)
}

function parseDrafts(value: unknown): Record<string, { values: Record<string, string>; updatedAt: string }> {
  if (!value || typeof value !== 'object') return {}
  const entries = Object.entries(value as Record<string, unknown>).map(([key, row]) => {
    if (!row || typeof row !== 'object') return null
    const payload = row as { values?: unknown; updatedAt?: unknown }
    const values: Record<string, string> = {}
    if (payload.values && typeof payload.values === 'object') {
      Object.entries(payload.values as Record<string, unknown>).forEach(([field, val]) => {
        values[field] = String(val ?? '')
      })
    }
    return {
      key,
      value: {
        values,
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
      },
    }
  })
  return Object.fromEntries(entries.filter((item): item is { key: string; value: { values: Record<string, string>; updatedAt: string } } => !!item).map((item) => [item.key, item.value]))
}

function parsePreferencesRow(row: UserPreferencesRow | null): ProductivitySettings {
  if (!row) return DEFAULT_SETTINGS

  return {
    profile: {
      fullName: normalizeWhitespace(row.profile_full_name || DEFAULT_PROFILE.fullName).slice(0, 120) || DEFAULT_PROFILE.fullName,
      position: normalizeWhitespace(row.profile_position || DEFAULT_PROFILE.position).slice(0, 120) || DEFAULT_PROFILE.position,
    },
    notificationPrefs: parseToggleArray(row.notifications_prefs, DEFAULT_NOTIFICATION_PREFS),
    systemPrefs: parseToggleArray(row.system_prefs, DEFAULT_SYSTEM_PREFS),
    visitadoresCatalog: parseStringArray(row.visitadores_catalog, VISITADORES),
    templates: parseTemplates(row.templates),
    savedFilters: parseSavedFilters(row.saved_filters),
    drafts: parseDrafts(row.drafts),
  }
}

function rowToNextAction(row: NextActionRow): NextAction {
  return {
    expedienteId: row.expediente_id,
    text: row.action_text,
    dueDate: row.due_date,
    completed: row.completed,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

function toPreferencesPatch(settings: Partial<ProductivitySettings>) {
  const patch: Record<string, unknown> = {}
  if (settings.profile) {
    patch.profile_full_name = settings.profile.fullName
    patch.profile_position = settings.profile.position
  }
  if (settings.notificationPrefs) {
    patch.notifications_prefs = settings.notificationPrefs
  }
  if (settings.systemPrefs) {
    patch.system_prefs = settings.systemPrefs
  }
  if (settings.visitadoresCatalog) {
    patch.visitadores_catalog = settings.visitadoresCatalog
  }
  if (settings.templates) {
    patch.templates = settings.templates
  }
  if (settings.savedFilters) {
    patch.saved_filters = settings.savedFilters
  }
  if (settings.drafts) {
    patch.drafts = settings.drafts
  }
  return patch
}

export function ProductivityProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { expedientes } = useExpedientes()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<ProductivitySettings>(DEFAULT_SETTINGS)
  const [nextActions, setNextActions] = useState<Record<string, NextAction>>({})

  const persistPreferences = useCallback(
    async (patch: Partial<ProductivitySettings>) => {
      if (!session) return
      const payload = toPreferencesPatch(patch)
      if (Object.keys(payload).length === 0) return

      await supabase.from('user_preferences').upsert(
        {
          user_id: session.user.id,
          ...payload,
        } as never,
        { onConflict: 'user_id' },
      )
    },
    [session],
  )

  const refresh = useCallback(async () => {
    if (!session) {
      setSettings(DEFAULT_SETTINGS)
      setNextActions({})
      setLoading(false)
      return
    }

    setLoading(true)

    const [prefsResult, actionsResult] = await Promise.all([
      supabase.from('user_preferences').select('*').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('expediente_next_actions').select('*').eq('user_id', session.user.id),
    ])

    if (!prefsResult.error && prefsResult.data) {
      setSettings(parsePreferencesRow(prefsResult.data as unknown as UserPreferencesRow))
    } else if (!prefsResult.error && !prefsResult.data) {
      const initial = parsePreferencesRow(null)
      setSettings(initial)
      await supabase.from('user_preferences').upsert(
        {
          user_id: session.user.id,
          ...toPreferencesPatch(initial),
        } as never,
        { onConflict: 'user_id' },
      )
    }

    if (!actionsResult.error) {
      const mapped = Object.fromEntries(
        ((actionsResult.data as NextActionRow[] | null) ?? []).map((row) => [
          row.expediente_id,
          rowToNextAction(row),
        ]),
      )
      setNextActions(mapped)
    }

    setLoading(false)
  }, [session])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const validExpIds = new Set(expedientes.map((item) => item.id))
    setNextActions((prev) => {
      const entries = Object.entries(prev).filter(([id]) => validExpIds.has(id))
      if (entries.length === Object.keys(prev).length) return prev
      return Object.fromEntries(entries)
    })
  }, [expedientes])

  const getNextAction = useCallback((expedienteId: string) => nextActions[expedienteId] ?? null, [nextActions])

  const setNextAction = useCallback(
    (
      expedienteId: string,
      payload: {
        text: string
        dueDate: string
        completed?: boolean
      },
    ) => {
      if (!session) return
      const text = normalizeWhitespace(payload.text).slice(0, 220)
      if (!text) return

      const dueDate = asDateOnly(payload.dueDate)
      const completed = Boolean(payload.completed)
      const nowIso = new Date().toISOString()

      const optimistic: NextAction = {
        expedienteId,
        text,
        dueDate,
        completed,
        completedAt: completed ? nowIso : null,
        updatedAt: nowIso,
      }

      setNextActions((prev) => ({ ...prev, [expedienteId]: optimistic }))

      void supabase.from('expediente_next_actions').upsert(
        {
          user_id: session.user.id,
          expediente_id: expedienteId,
          action_text: text,
          due_date: dueDate,
          completed,
          completed_at: completed ? nowIso : null,
        } as never,
        { onConflict: 'user_id,expediente_id' },
      )
    },
    [session],
  )

  const toggleNextActionCompleted = useCallback(
    (expedienteId: string, completed: boolean) => {
      if (!session) return
      setNextActions((prev) => {
        const current = prev[expedienteId]
        if (!current) return prev
        const nowIso = new Date().toISOString()
        const next = {
          ...current,
          completed,
          completedAt: completed ? nowIso : null,
          updatedAt: nowIso,
        }

        void supabase
          .from('expediente_next_actions')
          .update({
            completed,
            completed_at: completed ? nowIso : null,
          } as never)
          .eq('user_id', session.user.id)
          .eq('expediente_id', expedienteId)

        return { ...prev, [expedienteId]: next }
      })
    },
    [session],
  )

  const removeNextAction = useCallback(
    (expedienteId: string) => {
      if (!session) return
      setNextActions((prev) => {
        if (!prev[expedienteId]) return prev
        const next = { ...prev }
        delete next[expedienteId]
        return next
      })

      void supabase
        .from('expediente_next_actions')
        .delete()
        .eq('user_id', session.user.id)
        .eq('expediente_id', expedienteId)
    },
    [session],
  )

  const saveTemplate = useCallback(
    (payload: Omit<ExpedienteTemplate, 'id'> & { id?: string }) => {
      const estado = ESTADOS.includes(payload.estado) ? payload.estado : 'Admitida'
      const template: ExpedienteTemplate = {
        id: payload.id ?? crypto.randomUUID(),
        name: normalizeWhitespace(payload.name).slice(0, 80),
        tipo_derecho: normalizeWhitespace(payload.tipo_derecho).slice(0, 120),
        autoridad_responsable: normalizeWhitespace(payload.autoridad_responsable).slice(0, 160),
        visitador_asignado: normalizeWhitespace(payload.visitador_asignado).slice(0, 120),
        estado,
        notas_seguimiento: payload.notas_seguimiento.trim().slice(0, 2500),
        next_action_text: normalizeWhitespace(payload.next_action_text).slice(0, 220),
        next_action_offset_days: Math.max(0, Math.min(180, Number(payload.next_action_offset_days) || 0)),
      }

      if (!template.name || !template.tipo_derecho || !template.autoridad_responsable || !template.visitador_asignado) {
        return
      }

      setSettings((prev) => {
        const index = prev.templates.findIndex((item) => item.id === template.id)
        const templates =
          index === -1
            ? [template, ...prev.templates].slice(0, 24)
            : prev.templates.map((item, idx) => (idx === index ? template : item))
        void persistPreferences({ templates })
        return { ...prev, templates }
      })
    },
    [persistPreferences],
  )

  const deleteTemplate = useCallback(
    (id: string) => {
      setSettings((prev) => {
        const templates = prev.templates.filter((item) => item.id !== id)
        void persistPreferences({ templates })
        return { ...prev, templates }
      })
    },
    [persistPreferences],
  )

  const saveFilter = useCallback(
    (payload: Omit<SavedExpedienteFilter, 'id'> & { id?: string }) => {
      const filter: SavedExpedienteFilter = {
        id: payload.id ?? crypto.randomUUID(),
        name: normalizeWhitespace(payload.name).slice(0, 80),
        search: payload.search.trim().slice(0, 120),
        estado: payload.estado || 'Todos',
        visitador: payload.visitador || 'Todos',
        fecha: payload.fecha,
        dateFrom: normalizeDateOnly(payload.dateFrom || '') ?? '',
        dateTo: normalizeDateOnly(payload.dateTo || '') ?? '',
        staleOnly: Boolean(payload.staleOnly),
        withoutNextAction: Boolean(payload.withoutNextAction),
      }

      if (!filter.name) return

      setSettings((prev) => {
        const index = prev.savedFilters.findIndex((item) => item.id === filter.id)
        const savedFilters =
          index === -1
            ? [filter, ...prev.savedFilters].slice(0, 20)
            : prev.savedFilters.map((item, idx) => (idx === index ? filter : item))
        void persistPreferences({ savedFilters })
        return { ...prev, savedFilters }
      })
    },
    [persistPreferences],
  )

  const deleteFilter = useCallback(
    (id: string) => {
      setSettings((prev) => {
        const savedFilters = prev.savedFilters.filter((item) => item.id !== id)
        void persistPreferences({ savedFilters })
        return { ...prev, savedFilters }
      })
    },
    [persistPreferences],
  )

  const saveDraft = useCallback(
    (key: string, values: Record<string, string>) => {
      if (!key) return
      setSettings((prev) => {
        const drafts = {
          ...prev.drafts,
          [key]: {
            values,
            updatedAt: new Date().toISOString(),
          },
        }
        void persistPreferences({ drafts })
        return { ...prev, drafts }
      })
    },
    [persistPreferences],
  )

  const getDraft = useCallback((key: string) => {
    if (!key) return null
    return settings.drafts[key] ?? null
  }, [settings.drafts])

  const clearDraft = useCallback(
    (key: string) => {
      setSettings((prev) => {
        if (!prev.drafts[key]) return prev
        const drafts = { ...prev.drafts }
        delete drafts[key]
        void persistPreferences({ drafts })
        return { ...prev, drafts }
      })
    },
    [persistPreferences],
  )

  const setProfile = useCallback(
    (profile: ProfileSettings) => {
      const clean: ProfileSettings = {
        fullName: normalizeWhitespace(profile.fullName).slice(0, 120) || DEFAULT_PROFILE.fullName,
        position: normalizeWhitespace(profile.position).slice(0, 120) || DEFAULT_PROFILE.position,
      }
      setSettings((prev) => ({ ...prev, profile: clean }))
      void persistPreferences({ profile: clean })
    },
    [persistPreferences],
  )

  const setNotificationPrefs = useCallback(
    (items: TogglePreference[]) => {
      const clean = parseToggleArray(items, DEFAULT_NOTIFICATION_PREFS)
      setSettings((prev) => ({ ...prev, notificationPrefs: clean }))
      void persistPreferences({ notificationPrefs: clean })
    },
    [persistPreferences],
  )

  const setSystemPrefs = useCallback(
    (items: TogglePreference[]) => {
      const clean = parseToggleArray(items, DEFAULT_SYSTEM_PREFS)
      setSettings((prev) => ({ ...prev, systemPrefs: clean }))
      void persistPreferences({ systemPrefs: clean })
    },
    [persistPreferences],
  )

  const setVisitadoresCatalog = useCallback(
    (items: string[]) => {
      const clean = parseStringArray(items, VISITADORES)
      setSettings((prev) => ({ ...prev, visitadoresCatalog: clean }))
      void persistPreferences({ visitadoresCatalog: clean })
    },
    [persistPreferences],
  )

  const value = useMemo(
    () => ({
      loading,
      nextActions,
      templates: settings.templates,
      savedFilters: settings.savedFilters,
      profile: settings.profile,
      notificationPrefs: settings.notificationPrefs,
      systemPrefs: settings.systemPrefs,
      visitadoresCatalog: settings.visitadoresCatalog,
      getNextAction,
      setNextAction,
      toggleNextActionCompleted,
      removeNextAction,
      saveTemplate,
      deleteTemplate,
      saveFilter,
      deleteFilter,
      saveDraft,
      getDraft,
      clearDraft,
      setProfile,
      setNotificationPrefs,
      setSystemPrefs,
      setVisitadoresCatalog,
      refresh,
    }),
    [
      loading,
      nextActions,
      settings.templates,
      settings.savedFilters,
      settings.profile,
      settings.notificationPrefs,
      settings.systemPrefs,
      settings.visitadoresCatalog,
      getNextAction,
      setNextAction,
      toggleNextActionCompleted,
      removeNextAction,
      saveTemplate,
      deleteTemplate,
      saveFilter,
      deleteFilter,
      saveDraft,
      getDraft,
      clearDraft,
      setProfile,
      setNotificationPrefs,
      setSystemPrefs,
      setVisitadoresCatalog,
      refresh,
    ],
  )

  return <ProductivityContext.Provider value={value}>{children}</ProductivityContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProductivity() {
  const ctx = useContext(ProductivityContext)
  if (!ctx) throw new Error('useProductivity debe usarse dentro de ProductivityProvider')
  return ctx
}
