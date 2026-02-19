import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

function readRequiredEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) throw new Error(`Falta variable de entorno requerida: ${name}`)
  return value
}

function isLocalDevHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function validateSupabaseUrl(rawUrl: string) {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw new Error('VITE_SUPABASE_URL no es una URL valida')
  }

  const isHttps = parsedUrl.protocol === 'https:'
  const isSupabaseCloud = parsedUrl.hostname.endsWith('.supabase.co')
  const allowLocal =
    import.meta.env.DEV && parsedUrl.protocol === 'http:' && isLocalDevHost(parsedUrl.hostname)

  if (!(isHttps || allowLocal) || !(isSupabaseCloud || allowLocal)) {
    throw new Error(
      'VITE_SUPABASE_URL invalida: use URL HTTPS de Supabase Cloud o URL local HTTP solo en desarrollo',
    )
  }
}

function validateSupabaseAnonKey(key: string) {
  // Supabase anon key is expected to be a JWT-like token with 3 segments.
  if (key.split('.').length !== 3) {
    throw new Error('VITE_SUPABASE_ANON_KEY invalida: formato inesperado')
  }
}

const supabaseUrl = readRequiredEnv('VITE_SUPABASE_URL')
const supabaseAnonKey = readRequiredEnv('VITE_SUPABASE_ANON_KEY')

validateSupabaseUrl(supabaseUrl)
validateSupabaseAnonKey(supabaseAnonKey)

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'cedhbc_auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
