import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ExpedientesProvider } from './context/ExpedientesContext'
import { NotificationsProvider } from './context/NotificationsContext'
import { ProductivityProvider } from './context/ProductivityContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { LoginPage } from './components/auth/LoginPage'
import { AppLayout } from './components/layout/AppLayout'
import { Dashboard } from './components/dashboard/Dashboard'
import { ExpedientesList } from './components/expedientes/ExpedientesList'
import { NuevoExpediente } from './components/expedientes/NuevoExpediente'
import { Reportes } from './components/reportes/Reportes'
import { Configuracion } from './components/configuracion/Configuracion'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationsProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ExpedientesProvider>
                    <ProductivityProvider>
                      <AppLayout />
                    </ProductivityProvider>
                  </ExpedientesProvider>
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="expedientes" element={<ExpedientesList />} />
              <Route path="nuevo" element={<NuevoExpediente />} />
              <Route path="reportes" element={<Reportes />} />
              <Route path="configuracion" element={<Configuracion />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </NotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
