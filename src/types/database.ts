export type EstadoExpediente =
  | 'Admitida'
  | 'En integraci\u00f3n'
  | 'En conciliaci\u00f3n'
  | 'Resuelta'
  | 'Archivada'

export interface Expediente {
  id: string
  folio: string
  fecha_presentacion: string
  tipo_derecho: string
  autoridad_responsable: string
  visitador_asignado: string
  estado: EstadoExpediente
  fecha_ultimo_movimiento: string
  notas_seguimiento: string
  mes_registro: string
  created_at: string
  updated_at: string
}

export type ExpedienteInsert = Omit<Expediente, 'id' | 'created_at' | 'updated_at'>
export type ExpedienteUpdate = Partial<Omit<Expediente, 'id' | 'created_at'>>

export interface NextActionRow {
  id: string
  user_id: string
  expediente_id: string
  action_text: string
  due_date: string
  completed: boolean
  completed_at: string | null
  updated_at: string
  created_at: string
}

export interface UserPreferencesRow {
  user_id: string
  profile_full_name: string
  profile_position: string
  notifications_prefs: unknown
  system_prefs: unknown
  visitadores_catalog: unknown
  templates: unknown
  saved_filters: unknown
  drafts: unknown
  updated_at: string
  created_at: string
}

export interface UserNotificationRow {
  id: string
  user_id: string
  client_id: string | null
  type: 'success' | 'warning' | 'info' | 'error'
  title: string
  message: string
  read: boolean
  timestamp: string
  updated_at: string
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      expedientes: {
        Row: Expediente
        Insert: {
          id?: string
          folio: string
          fecha_presentacion: string
          tipo_derecho: string
          autoridad_responsable: string
          visitador_asignado: string
          estado?: EstadoExpediente
          fecha_ultimo_movimiento?: string
          notas_seguimiento?: string
          mes_registro: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          folio?: string
          fecha_presentacion?: string
          tipo_derecho?: string
          autoridad_responsable?: string
          visitador_asignado?: string
          estado?: EstadoExpediente
          fecha_ultimo_movimiento?: string
          notas_seguimiento?: string
          mes_registro?: string
          updated_at?: string
        }
        Relationships: []
      }
      expediente_next_actions: {
        Row: NextActionRow
        Insert: {
          id?: string
          user_id: string
          expediente_id: string
          action_text: string
          due_date: string
          completed?: boolean
          completed_at?: string | null
          updated_at?: string
          created_at?: string
        }
        Update: {
          action_text?: string
          due_date?: string
          completed?: boolean
          completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: UserPreferencesRow
        Insert: {
          user_id: string
          profile_full_name?: string
          profile_position?: string
          notifications_prefs?: unknown
          system_prefs?: unknown
          visitadores_catalog?: unknown
          templates?: unknown
          saved_filters?: unknown
          drafts?: unknown
          updated_at?: string
          created_at?: string
        }
        Update: {
          profile_full_name?: string
          profile_position?: string
          notifications_prefs?: unknown
          system_prefs?: unknown
          visitadores_catalog?: unknown
          templates?: unknown
          saved_filters?: unknown
          drafts?: unknown
          updated_at?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: UserNotificationRow
        Insert: {
          id?: string
          user_id: string
          client_id?: string | null
          type: 'success' | 'warning' | 'info' | 'error'
          title: string
          message: string
          read?: boolean
          timestamp?: string
          updated_at?: string
          created_at?: string
        }
        Update: {
          client_id?: string | null
          type?: 'success' | 'warning' | 'info' | 'error'
          title?: string
          message?: string
          read?: boolean
          timestamp?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

