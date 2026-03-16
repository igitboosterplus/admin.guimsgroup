-- ============================================================
-- Migration: Corrections critiques RLS + admin attendance
-- ============================================================

-- 1. Permettre aux admins/managers de modifier les pointages (correction départs)
CREATE POLICY "Admins managers can update attendance"
  ON public.attendance FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- 2. Permettre aux admins d'INSERER un pointage pour un autre employé
CREATE POLICY "Admins managers can insert attendance"
  ON public.attendance FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- 3. Permettre aux admins/managers de SUPPRIMER un pointage
CREATE POLICY "Admins managers can delete attendance"
  ON public.attendance FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- 4. Ajouter colonne 'added_by' pour tracer qui a ajouté manuellement un pointage
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES auth.users(id);

-- 5. Ajouter colonne 'notes' pour les commentaires admin
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS notes text;

-- 6. Protéger les clés API : restreindre la lecture de certaines settings
-- Créer une vue sécurisée pour les settings non-sensibles
CREATE OR REPLACE VIEW public.safe_app_settings AS
  SELECT id, key, value, updated_at
  FROM public.app_settings
  WHERE key NOT IN ('ai_api_key', 'ai_base_url');

-- 7. Politique pour bloquer les comptes pausés au niveau RLS
-- (Les comptes pausés ne peuvent plus lire les données)
CREATE OR REPLACE FUNCTION public.is_user_active()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT NOT (archived OR is_paused) FROM public.profiles WHERE user_id = auth.uid()),
    false
  );
$$;
