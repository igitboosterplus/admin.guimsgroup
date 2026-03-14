-- ============================================
-- Add hire_date, matricule columns + stagiaire role
-- ============================================

-- Date de prise de fonction
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hire_date DATE;

-- Matricule (auto-generated employee ID)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS matricule TEXT UNIQUE;

-- Counters reset timestamp (used by admin to reset attendance counters)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS counters_reset_at TIMESTAMPTZ;

-- Pause system (admin can pause an employee to stop counting absences)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- Add 'stagiaire' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'stagiaire';

-- Function to auto-generate matricule on profile creation
CREATE OR REPLACE FUNCTION public.generate_matricule()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  new_matricule TEXT;
BEGIN
  IF NEW.matricule IS NULL THEN
    SELECT COALESCE(MAX(
      CASE
        WHEN matricule ~ '^GG-[0-9]+$'
        THEN CAST(SUBSTRING(matricule FROM 4) AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO next_num
    FROM public.profiles;

    new_matricule := 'GG-' || LPAD(next_num::TEXT, 4, '0');
    NEW.matricule := new_matricule;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-assign matricule
DROP TRIGGER IF EXISTS trigger_generate_matricule ON public.profiles;
CREATE TRIGGER trigger_generate_matricule
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_matricule();

-- Backfill existing profiles that don't have a matricule
DO $$
DECLARE
  rec RECORD;
  counter INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT id FROM public.profiles
    WHERE matricule IS NULL
    ORDER BY created_at ASC
  LOOP
    counter := counter + 1;
    UPDATE public.profiles
    SET matricule = 'GG-' || LPAD(counter::TEXT, 4, '0')
    WHERE id = rec.id;
  END LOOP;
END;
$$;
