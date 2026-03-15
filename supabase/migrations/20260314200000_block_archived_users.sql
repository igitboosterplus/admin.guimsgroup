-- ============================================================
-- Migration: Bloquer l'accès aux utilisateurs archivés via RLS
-- ============================================================

-- Fonction helper: vérifie si l'utilisateur courant est archivé
CREATE OR REPLACE FUNCTION public.is_archived(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT archived FROM public.profiles WHERE user_id = _user_id),
    false
  )
$$;

-- ============================================================
-- Profiles: empêcher les utilisateurs archivés de modifier leur profil
-- ============================================================
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = user_id
    AND NOT public.is_archived(auth.uid())
  );

-- ============================================================
-- Attendance: empêcher les utilisateurs archivés de pointer
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own attendance" ON public.attendance;
CREATE POLICY "Users can insert own attendance" ON public.attendance
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_archived(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own attendance" ON public.attendance;
CREATE POLICY "Users can update own attendance" ON public.attendance
  FOR UPDATE USING (
    auth.uid() = user_id
    AND NOT public.is_archived(auth.uid())
  );

-- ============================================================
-- Employee documents: empêcher les archivés d'ajouter des documents
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own documents" ON public.employee_documents;
CREATE POLICY "Users can insert own documents" ON public.employee_documents
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_archived(auth.uid())
  );

-- ============================================================
-- Leave requests: empêcher les archivés de créer des demandes
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own leave requests" ON public.leave_requests;
CREATE POLICY "Users can insert own leave requests" ON public.leave_requests
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_archived(auth.uid())
  );

-- ============================================================
-- Tasks: empêcher les archivés de modifier des tâches
-- ============================================================
DROP POLICY IF EXISTS "Assignees can update own tasks" ON public.tasks;
CREATE POLICY "Assignees can update own tasks" ON public.tasks
  FOR UPDATE USING (
    auth.uid() = assigned_to
    AND NOT public.is_archived(auth.uid())
  );
