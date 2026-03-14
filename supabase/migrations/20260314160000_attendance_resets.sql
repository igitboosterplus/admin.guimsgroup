-- ============================================
-- Table pour stocker les remises à zéro des compteurs
-- Quand un admin reset un employé, on enregistre la date
-- Le rapport ne comptera les jours ouvrables qu'à partir de cette date
-- ============================================

CREATE TABLE IF NOT EXISTS public.attendance_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reset_month TEXT NOT NULL,  -- format 'YYYY-MM'
  reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reset_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, reset_month)
);

ALTER TABLE public.attendance_resets ENABLE ROW LEVEL SECURITY;

-- Admins can do everything on resets
CREATE POLICY "Admins can manage resets" ON public.attendance_resets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Managers can view resets
CREATE POLICY "Managers can view resets" ON public.attendance_resets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager')
  );
