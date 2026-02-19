import { FormEvent, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Lock, Mail, Scale } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'

const MAX_FAILED_ATTEMPTS = 5
const LOCK_TIME_MS = 60_000
const FAIL_STORAGE_KEY = 'cedhbc_login_fail_count'
const LOCK_STORAGE_KEY = 'cedhbc_login_lock_until'

function readSessionNumber(key: string): number {
  if (typeof window === 'undefined') return 0
  const value = Number(window.sessionStorage.getItem(key) ?? '0')
  return Number.isFinite(value) ? value : 0
}

function writeSessionNumber(key: string, value: number) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(key, String(value))
}

export function LoginPage() {
  const { signIn, session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedAttempts, setFailedAttempts] = useState(() => readSessionNumber(FAIL_STORAGE_KEY))
  const [lockUntil, setLockUntil] = useState(() => readSessionNumber(LOCK_STORAGE_KEY))
  const [now, setNow] = useState(Date.now())

  const fromPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'
  const targetPath = useMemo(() => {
    if (!fromPath.startsWith('/') || fromPath.startsWith('/login')) return '/'
    return fromPath
  }, [fromPath])

  useEffect(() => {
    if (!authLoading && session) {
      navigate(targetPath, { replace: true })
    }
  }, [authLoading, session, navigate, targetPath])

  const isLocked = lockUntil > now
  const lockSeconds = Math.max(0, Math.ceil((lockUntil - now) / 1000))

  useEffect(() => {
    if (!isLocked) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isLocked])

  useEffect(() => {
    if (isLocked || lockUntil === 0) return
    setLockUntil(0)
    writeSessionNumber(LOCK_STORAGE_KEY, 0)
  }, [isLocked, lockUntil])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = password.trim()

    if (isLocked) {
      setError(`Demasiados intentos. Espere ${lockSeconds}s e intente nuevamente.`)
      return
    }

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Ingrese un correo electronico valido.')
      return
    }

    if (cleanPassword.length < 8 || cleanPassword.length > 128) {
      setError('La contrasena debe tener entre 8 y 128 caracteres.')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const { error: signInError } = await signIn(cleanEmail, cleanPassword)

      if (signInError) {
        const nextAttempts = failedAttempts + 1
        setFailedAttempts(nextAttempts)
        writeSessionNumber(FAIL_STORAGE_KEY, nextAttempts)

        if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
          const nextLockUntil = Date.now() + LOCK_TIME_MS
          setLockUntil(nextLockUntil)
          setNow(Date.now())
          writeSessionNumber(LOCK_STORAGE_KEY, nextLockUntil)
          setFailedAttempts(0)
          writeSessionNumber(FAIL_STORAGE_KEY, 0)
          setError('Demasiados intentos fallidos. Espere 60s antes de reintentar.')
          return
        }

        setError('Correo o contrasena incorrectos. Verifique sus credenciales.')
        return
      }

      setFailedAttempts(0)
      setLockUntil(0)
      writeSessionNumber(FAIL_STORAGE_KEY, 0)
      writeSessionNumber(LOCK_STORAGE_KEY, 0)
      navigate(targetPath, { replace: true })
    } catch {
      setError('No fue posible iniciar sesion. Intente nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-950 p-4">
      <div className="absolute inset-0 opacity-10" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative flex min-h-screen items-center justify-center">
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3 }}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-white shadow-2xl"
        >
          <div className="bg-slate-900 p-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-white/20 bg-white/10 backdrop-blur-sm">
              <Scale className="h-10 w-10 text-white" aria-hidden />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white">CEDHBC</h1>
            <p className="text-sm text-slate-300">Sistema de Gestion de Expedientes</p>
          </div>

          <div className="p-8">
            <h2 className="mb-6 text-center text-xl font-bold text-slate-900">Iniciar Sesion</h2>

            {error && (
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
                role="alert"
                aria-live="assertive"
                className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
                <span>{error}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                  Usuario
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    maxLength={120}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ingresa tu correo"
                    className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 text-slate-900 transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                  Contrasena
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ingresa tu contrasena"
                    className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-12 text-slate-900 transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors duration-200 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || isLocked || authLoading}
                aria-describedby={isLocked ? 'lock-hint' : undefined}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 font-medium text-white transition-all duration-300',
                  'hover:bg-blue-800 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {loading ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
                    <span>Verificando...</span>
                  </>
                ) : isLocked ? (
                  `Bloqueado (${lockSeconds}s)`
                ) : (
                  'Ingresar al Sistema'
                )}
              </button>

              {isLocked && (
                <p id="lock-hint" className="text-center text-xs text-amber-700" aria-live="polite">
                  Por seguridad, espere {lockSeconds}s antes de volver a intentar.
                </p>
              )}
            </form>

          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-8 py-4">
            <p className="text-center text-xs text-slate-600">Comision Estatal de Derechos Humanos de Baja California</p>
            <p className="mt-1 text-center text-xs text-slate-500">
              (c) {new Date().getFullYear()} CEDHBC - Todos los derechos reservados
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
