import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a trace in console for support diagnostics.
    console.error('CEDHBC runtime error:', error, info)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" aria-hidden />
            <h1 className="text-lg font-bold">Error inesperado de aplicacion</h1>
          </div>
          <p className="text-sm text-slate-700">
            Ocurrio un error no controlado. Para proteger la sesion y los datos, recargue la aplicacion.
          </p>
          <button
            onClick={this.handleReload}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Recargar sistema
          </button>
        </div>
      </div>
    )
  }
}
