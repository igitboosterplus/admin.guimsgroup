-- ============================================
-- Emplois du temps personnalisés par employé
-- ============================================

CREATE TABLE IF NOT EXISTS public.employee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  schedule JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- schedule format:
-- {
--   "lundi":    { "start": "08:00", "end": "17:00" },
--   "mardi":    { "start": "08:00", "end": "17:00" },
--   "mercredi": { "start": "08:00", "end": "17:00" },
--   "jeudi":    { "start": "07:00", "end": "20:00" },
--   "vendredi": { "start": "08:00", "end": "17:00" },
--   "samedi":   null,
--   "dimanche": null
-- }
-- null = jour de repos

ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;

-- Employees can view their own schedule
CREATE POLICY "Users can view own schedule" ON public.employee_schedules
  FOR SELECT USING (auth.uid() = user_id);

-- Admins and managers can view all schedules
CREATE POLICY "Admins managers can view all schedules" ON public.employee_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Admins and managers can insert schedules
CREATE POLICY "Admins managers can insert schedules" ON public.employee_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Admins and managers can update schedules
CREATE POLICY "Admins managers can update schedules" ON public.employee_schedules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Admins can delete schedules
CREATE POLICY "Admins can delete schedules" ON public.employee_schedules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
