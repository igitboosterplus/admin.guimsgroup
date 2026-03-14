-- ============================================================
-- Seed : création de 3 comptes administrateurs GUIMS GROUP
-- Mot de passe par défaut : Admin@2026!
-- ⚠️ Changez les mots de passe après la première connexion
-- ============================================================

-- Extension nécessaire pour le hachage bcrypt (déjà active dans Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- S'assurer que les colonnes d'approbation existent
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rules_accepted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- Mettre à jour le trigger pour inclure ces colonnes
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

DO $$
DECLARE
  _password TEXT := 'Admin@2026!';
  _hash     TEXT;
  _uid1     UUID := gen_random_uuid();
  _uid2     UUID := gen_random_uuid();
  _uid3     UUID := gen_random_uuid();
BEGIN
  _hash := crypt(_password, gen_salt('bf'));

  -- ── Admin 1 : Directeur Général ──────────────────────────
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    _uid1, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'admin@guimsgroup.com', _hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Administrateur Principal"}'::jsonb,
    now(), now()
  );

  -- ── Admin 2 : DRH ────────────────────────────────────────
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    _uid2, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'drh@guimsgroup.com', _hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Directeur RH"}'::jsonb,
    now(), now()
  );

  -- ── Admin 3 : Manager IT ─────────────────────────────────
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    _uid3, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'it@guimsgroup.com', _hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Responsable IT"}'::jsonb,
    now(), now()
  );

  -- Le trigger handle_new_user() crée automatiquement les profils
  -- et assigne le rôle 'bureau'. On met à jour vers 'admin' :

  UPDATE public.user_roles SET role = 'admin' WHERE user_id IN (_uid1, _uid2, _uid3);

  -- Approuver les comptes et accepter le règlement
  UPDATE public.profiles
     SET is_approved = true,
         rules_accepted = true,
         department = CASE user_id
           WHEN _uid1 THEN 'Direction Générale'
           WHEN _uid2 THEN 'Ressources Humaines'
           WHEN _uid3 THEN 'Informatique'
         END,
         position = CASE user_id
           WHEN _uid1 THEN 'Directeur Général'
           WHEN _uid2 THEN 'Directeur des Ressources Humaines'
           WHEN _uid3 THEN 'Responsable IT'
         END,
         base_salary = CASE user_id
           WHEN _uid1 THEN 500000
           WHEN _uid2 THEN 400000
           WHEN _uid3 THEN 350000
         END
   WHERE user_id IN (_uid1, _uid2, _uid3);

  -- Identités Supabase Auth (nécessaire pour le login email/password)
  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES
    (gen_random_uuid(), _uid1::text, _uid1,
     jsonb_build_object('sub', _uid1::text, 'email', 'admin@guimsgroup.com'),
     'email', now(), now(), now()),
    (gen_random_uuid(), _uid2::text, _uid2,
     jsonb_build_object('sub', _uid2::text, 'email', 'drh@guimsgroup.com'),
     'email', now(), now(), now()),
    (gen_random_uuid(), _uid3::text, _uid3,
     jsonb_build_object('sub', _uid3::text, 'email', 'it@guimsgroup.com'),
     'email', now(), now(), now());

  RAISE NOTICE '✅ 3 comptes admin créés avec succès';
END;
$$;
