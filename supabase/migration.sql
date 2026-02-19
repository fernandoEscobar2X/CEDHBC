-- =====================================================
-- CEDHBC - Database schema (Supabase)
-- Run in: Supabase Dashboard > SQL Editor
-- =====================================================

-- UUID generation for primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Main table.
CREATE TABLE IF NOT EXISTS public.expedientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT NOT NULL UNIQUE,
  fecha_presentacion DATE NOT NULL,
  tipo_derecho TEXT NOT NULL,
  autoridad_responsable TEXT NOT NULL,
  visitador_asignado TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'Admitida'
    CHECK (
      estado IN (
        'Admitida',
        'En integracion',
        'En integración',
        'En conciliacion',
        'En conciliación',
        'Resuelta',
        'Archivada'
      )
    ),
  fecha_ultimo_movimiento DATE NOT NULL DEFAULT CURRENT_DATE,
  notas_seguimiento TEXT DEFAULT '',
  mes_registro TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes.
CREATE INDEX IF NOT EXISTS idx_expedientes_estado ON public.expedientes (estado);
CREATE INDEX IF NOT EXISTS idx_expedientes_visitador ON public.expedientes (visitador_asignado);
CREATE INDEX IF NOT EXISTS idx_expedientes_folio ON public.expedientes (folio);
CREATE INDEX IF NOT EXISTS idx_expedientes_created_at ON public.expedientes (created_at DESC);

-- Case-insensitive folio uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_expedientes_folio_upper_unique ON public.expedientes ((upper(folio)));

-- updated_at trigger.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.expedientes;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.expedientes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Extra data integrity constraints (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_expedientes_folio_format'
      AND conrelid = 'public.expedientes'::regclass
  ) THEN
    ALTER TABLE public.expedientes
      ADD CONSTRAINT ck_expedientes_folio_format
      CHECK (folio ~* '^CEDHBC[-/][0-9]{4}[-/][0-9]{3,6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_expedientes_date_rules'
      AND conrelid = 'public.expedientes'::regclass
  ) THEN
    ALTER TABLE public.expedientes
      ADD CONSTRAINT ck_expedientes_date_rules
      CHECK (
        fecha_presentacion <= CURRENT_DATE
        AND fecha_ultimo_movimiento <= CURRENT_DATE
        AND fecha_ultimo_movimiento >= fecha_presentacion
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_expedientes_required_text'
      AND conrelid = 'public.expedientes'::regclass
  ) THEN
    ALTER TABLE public.expedientes
      ADD CONSTRAINT ck_expedientes_required_text
      CHECK (
        length(trim(folio)) > 0
        AND length(trim(tipo_derecho)) > 0
        AND length(trim(autoridad_responsable)) > 0
        AND length(trim(visitador_asignado)) > 0
        AND length(trim(mes_registro)) > 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_expedientes_length_limits'
      AND conrelid = 'public.expedientes'::regclass
  ) THEN
    ALTER TABLE public.expedientes
      ADD CONSTRAINT ck_expedientes_length_limits
      CHECK (
        char_length(folio) <= 32
        AND char_length(tipo_derecho) <= 120
        AND char_length(autoridad_responsable) <= 160
        AND char_length(visitador_asignado) <= 120
        AND char_length(coalesce(notas_seguimiento, '')) <= 2500
        AND char_length(mes_registro) <= 60
      );
  END IF;
END $$;

-- RLS: authenticated users only.
ALTER TABLE public.expedientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_users_all ON public.expedientes;
CREATE POLICY auth_users_all
  ON public.expedientes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Storage bucket for expediente documents (private bucket).
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'expedientes-documentos',
  'expedientes-documentos',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS docs_auth_select ON storage.objects;
CREATE POLICY docs_auth_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'expedientes-documentos');

DROP POLICY IF EXISTS docs_auth_insert ON storage.objects;
CREATE POLICY docs_auth_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'expedientes-documentos');

DROP POLICY IF EXISTS docs_auth_update ON storage.objects;
CREATE POLICY docs_auth_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'expedientes-documentos')
  WITH CHECK (bucket_id = 'expedientes-documentos');

DROP POLICY IF EXISTS docs_auth_delete ON storage.objects;
CREATE POLICY docs_auth_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'expedientes-documentos');

-- Optional seed (do not use in production).
-- INSERT INTO public.expedientes (
--   folio,
--   fecha_presentacion,
--   tipo_derecho,
--   autoridad_responsable,
--   visitador_asignado,
--   estado,
--   fecha_ultimo_movimiento,
--   notas_seguimiento,
--   mes_registro
-- ) VALUES (
--   'CEDHBC-2026-001',
--   '2026-01-15',
--   'Derecho a la Salud',
--   'Secretaria de Salud BC',
--   'Visitador General I',
--   'En integración',
--   '2026-01-15',
--   'Caso de ejemplo',
--   'enero 2026'
-- );
