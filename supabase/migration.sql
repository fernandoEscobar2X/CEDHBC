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

-- ==========================================
-- Productivity and user preferences
-- ==========================================

-- Next action per expediente and user.
CREATE TABLE IF NOT EXISTS public.expediente_next_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  expediente_id UUID NOT NULL REFERENCES public.expedientes (id) ON DELETE CASCADE,
  action_text TEXT NOT NULL,
  due_date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, expediente_id)
);

CREATE INDEX IF NOT EXISTS idx_next_actions_user_due
  ON public.expediente_next_actions (user_id, due_date);

DROP TRIGGER IF EXISTS set_updated_at_next_actions ON public.expediente_next_actions;
CREATE TRIGGER set_updated_at_next_actions
  BEFORE UPDATE ON public.expediente_next_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.expediente_next_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS next_actions_auth_select ON public.expediente_next_actions;
CREATE POLICY next_actions_auth_select
  ON public.expediente_next_actions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS next_actions_auth_insert ON public.expediente_next_actions;
CREATE POLICY next_actions_auth_insert
  ON public.expediente_next_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS next_actions_auth_update ON public.expediente_next_actions;
CREATE POLICY next_actions_auth_update
  ON public.expediente_next_actions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS next_actions_auth_delete ON public.expediente_next_actions;
CREATE POLICY next_actions_auth_delete
  ON public.expediente_next_actions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Persistent UI preferences by authenticated user.
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  profile_full_name TEXT NOT NULL DEFAULT 'Administrador CEDHBC',
  profile_position TEXT NOT NULL DEFAULT 'Administrador',
  notifications_prefs JSONB NOT NULL DEFAULT '[]'::jsonb,
  system_prefs JSONB NOT NULL DEFAULT '[]'::jsonb,
  visitadores_catalog JSONB NOT NULL DEFAULT '[]'::jsonb,
  templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  saved_filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  drafts JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_user_preferences ON public.user_preferences;
CREATE TRIGGER set_updated_at_user_preferences
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_preferences_auth_select ON public.user_preferences;
CREATE POLICY user_preferences_auth_select
  ON public.user_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_auth_insert ON public.user_preferences;
CREATE POLICY user_preferences_auth_insert
  ON public.user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_auth_update ON public.user_preferences;
CREATE POLICY user_preferences_auth_update
  ON public.user_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_auth_delete ON public.user_preferences;
CREATE POLICY user_preferences_auth_delete
  ON public.user_preferences
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Persistent notifications center by user.
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('success', 'warning', 'info', 'error')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_timestamp
  ON public.user_notifications (user_id, timestamp DESC);

DROP TRIGGER IF EXISTS set_updated_at_user_notifications ON public.user_notifications;
CREATE TRIGGER set_updated_at_user_notifications
  BEFORE UPDATE ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notifications_auth_select ON public.user_notifications;
CREATE POLICY user_notifications_auth_select
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_notifications_auth_insert ON public.user_notifications;
CREATE POLICY user_notifications_auth_insert
  ON public.user_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_notifications_auth_update ON public.user_notifications;
CREATE POLICY user_notifications_auth_update
  ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_notifications_auth_delete ON public.user_notifications;
CREATE POLICY user_notifications_auth_delete
  ON public.user_notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

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
