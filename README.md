# CEDHBC - Sistema de Expedientes

Sistema de registro y seguimiento de expedientes de la Comision Estatal de Derechos Humanos de Baja California.

## Stack
- React 18 + TypeScript + Vite 6
- TailwindCSS 3
- Supabase (Auth + PostgreSQL)
- React Router
- Framer Motion
- Recharts
- jsPDF + jsPDF-AutoTable + exportacion Excel compatible (.xls)

## Configuracion

### 1. Supabase
1. Crear proyecto en https://app.supabase.com
2. En SQL Editor ejecutar `supabase/migration.sql`
3. En Authentication > Users crear usuario administrador
4. Copiar URL y anon key del proyecto

### 2. Variables de entorno
```bash
cp .env.example .env
# Editar .env con tus valores
```
Opcional para documentos adjuntos:
- `VITE_SUPABASE_DOCUMENTS_BUCKET` (por defecto `expedientes-documentos`)

### 3. Desarrollo local
```bash
npm install
npm run dev
```

### 4. Validacion predeploy
```bash
npm run lint
npm run build
npm audit --omit=dev
# o en una sola corrida:
npm run check:release
```

### 5. Despliegue (Netlify)
1. Conectar repositorio en Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Node version: `20`
5. Agregar variables de entorno en Netlify Dashboard

El archivo `netlify.toml` ya incluye:
- Redirect SPA (`/* -> /index.html`)
- Headers de seguridad (CSP, HSTS, X-Frame-Options, etc.)
- Politica de cache para `index.html` y assets versionados

## Seguridad operativa recomendada
- Usar una contrasena admin fuerte (>=16 chars, simbolos, numeros y mayusculas)
- Activar CAPTCHA y protecciones anti-abuse en Supabase Auth
- Mantener RLS habilitado en todas las tablas sensibles
- No exponer nunca `service_role` en frontend
- Rotar credenciales si se sospecha filtracion

## Funcionalidades principales
- Login con Supabase Auth
- Dashboard con estadisticas reales
- Registro, edicion, filtro y eliminacion de expedientes
- Modal de detalle con timeline, actividad y documentos en Supabase Storage
- Reportes con exportacion PDF y Excel compatible (.xls)
- Panel de notificaciones dinamico y persistente
- Configuracion persistente e import/export de respaldos JSON
