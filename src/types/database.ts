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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
