-- ============================================================
-- Migration: Activer Supabase Realtime sur les tables clés
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
