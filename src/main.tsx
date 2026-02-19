import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/theme.css'
import App from './App'
import { AppErrorBoundary } from './components/system/AppErrorBoundary'

const root = document.getElementById('root')
if (!root) throw new Error('No se encontro el elemento #root')

createRoot(root).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
)
