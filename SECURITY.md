# Security Checklist - CEDHBC

Este proyecto incluye hardening en frontend y headers de despliegue, pero la seguridad final depende de la configuracion operativa.

## Antes de publicar
- Ejecutar `npm run check:release`.
- Confirmar que `.env` no este en repositorio.
- Verificar que solo se usa `VITE_SUPABASE_ANON_KEY` en frontend (nunca `service_role`).
- Configurar dominio HTTPS en Netlify.

## Supabase (obligatorio)
- Ejecutar `supabase/migration.sql` en el proyecto de produccion.
- Activar CAPTCHA / Bot Protection en `Authentication`.
- Usar contrasena admin fuerte (>=16 caracteres, mayusculas, numeros y simbolos).
- Revisar periodicamente politicas RLS si se agregan nuevos roles/usuarios.

## Operacion
- Rotar credenciales ante sospecha de filtracion.
- Monitorear logs de autenticacion y errores de API.
- Mantener dependencias actualizadas y ejecutar `npm audit --omit=dev` en cada release.
