-- ============================================================
-- Migration: Paramètres GPS pour géolocalisation du bureau
-- ============================================================

-- Ajouter les clés GPS dans app_settings
INSERT INTO public.app_settings (key, value)
VALUES
  ('office_lat', '""'),
  ('office_lng', '""'),
  ('office_radius', '"100"')
ON CONFLICT (key) DO NOTHING;
