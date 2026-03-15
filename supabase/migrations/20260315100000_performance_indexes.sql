-- ============================================================
-- Migration: Indexes de performance & contrainte d'unicité
-- ============================================================

-- Index sur attendance.clock_in pour les requêtes par date
CREATE INDEX IF NOT EXISTS idx_attendance_clock_in ON public.attendance (clock_in);

-- Index sur attendance.user_id pour les jointures FK
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON public.attendance (user_id);

-- Index sur tasks.due_date pour les requêtes de tâches en retard
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks (due_date);

-- Index sur leave_requests pour chevauchement de dates
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON public.leave_requests (start_date, end_date);

-- Index sur profiles actifs (non archivés)
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles (is_approved) WHERE archived = false;

-- Index sur tasks.assigned_to pour les tâches par employé
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks (assigned_to);

-- Index sur leave_requests.user_id
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON public.leave_requests (user_id);

-- Fonction pour empêcher le double pointage le même jour
CREATE OR REPLACE FUNCTION public.check_attendance_unique_per_day()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.attendance
    WHERE user_id = NEW.user_id
      AND DATE(clock_in) = DATE(NEW.clock_in)
      AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Un pointage existe déjà pour cet employé à cette date';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger pour valider l'unicité du pointage par jour
DROP TRIGGER IF EXISTS trg_attendance_unique_per_day ON public.attendance;
CREATE TRIGGER trg_attendance_unique_per_day
  BEFORE INSERT ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.check_attendance_unique_per_day();
