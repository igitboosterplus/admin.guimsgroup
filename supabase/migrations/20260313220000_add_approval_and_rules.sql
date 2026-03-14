-- Add rules acceptance and admin approval columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN rules_accepted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT false;

-- Update the handle_new_user trigger to set defaults explicitly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, rules_accepted, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    false,
    false
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'bureau');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
