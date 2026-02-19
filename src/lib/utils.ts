import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { EstadoExpediente } from '../types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateLong(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function getMesRegistro(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  }
  return date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
}

export function daysSince(dateStr: string): number {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return 0
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export const FIELD_LIMITS = {
  folio: 32,
  tipoDerecho: 120,
  autoridad: 160,
  visitador: 120,
  notas: 2500,
} as const

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeFolio(value: string): string {
  return normalizeWhitespace(value).toUpperCase().replace(/[\s/]+/g, '-')
}

export function normalizeDateOnly(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isFutureDate(value: string): boolean {
  const normalized = normalizeDateOnly(value)
  if (!normalized) return false

  const target = new Date(`${normalized}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return target.getTime() > today.getTime()
}

export function isValidFolio(value: string): boolean {
  return /^CEDHBC[-/][0-9]{4}[-/][0-9]{3,6}$/i.test(normalizeWhitespace(value))
}

export function truncateText(value: string, maxLength: number): string {
  return normalizeWhitespace(value).slice(0, Math.max(0, maxLength))
}

export function sanitizeSpreadsheetCell(value: string): string {
  const normalized = value
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0)
      return (code <= 31 || code === 127) ? ' ' : char
    })
    .join('')
    .trim()
  if (!normalized) return ''

  // Prevent CSV/Excel formula injection for exported reports.
  if (/^[=+\-@]/.test(normalized)) {
    return `'${normalized}`
  }

  return normalized
}

export const ESTADO_COLORS: Record<EstadoExpediente, { badge: string; dot: string; label: string }> = {
  Admitida: {
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    dot: 'bg-blue-500',
    label: 'Admitida',
  },
  'En integraci\u00f3n': {
    badge: 'bg-violet-50 text-violet-700 border border-violet-200',
    dot: 'bg-violet-500',
    label: 'En integraci\u00f3n',
  },
  'En conciliaci\u00f3n': {
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
    label: 'En conciliaci\u00f3n',
  },
  Resuelta: {
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Resuelta',
  },
  Archivada: {
    badge: 'bg-slate-100 text-slate-600 border border-slate-200',
    dot: 'bg-slate-400',
    label: 'Archivada',
  },
}

export const ESTADOS: EstadoExpediente[] = [
  'Admitida',
  'En integraci\u00f3n',
  'En conciliaci\u00f3n',
  'Resuelta',
  'Archivada',
]

export const DERECHOS = [
  'Derecho a la Salud',
  'Derecho a la Educaci\u00f3n',
  'Derecho a la Seguridad',
  'Derecho a la Vivienda',
  'Derecho al Trabajo',
  'Derecho a la Justicia',
  'Derecho a la Igualdad',
  'Derecho al Medio Ambiente',
  'Otro',
]

export const VISITADORES = [
  'Visitador General I',
  'Visitador General II',
  'Visitador General III',
  'Visitador Adjunto I',
  'Visitador Adjunto II',
]

export function generateFolio(index: number): string {
  const year = new Date().getFullYear()
  return `CEDHBC-${year}-${String(index).padStart(3, '0')}`
}
