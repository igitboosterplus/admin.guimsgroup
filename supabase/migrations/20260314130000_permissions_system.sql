-- ============================================================
-- Système de permissions granulaires
-- ============================================================

-- Table des permissions par rôle
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(role, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Tout le monde authentifié peut lire les permissions (nécessaire côté client)
CREATE POLICY "Authenticated can read permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- Seuls les admins avec la permission manage_permissions peuvent modifier
CREATE POLICY "Admins can manage permissions" ON public.role_permissions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Fonction helper pour vérifier une permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT rp.granted
     FROM public.role_permissions rp
     JOIN public.user_roles ur ON ur.role = rp.role
     WHERE ur.user_id = _user_id AND rp.permission = _permission
     LIMIT 1),
    false
  )
$$;

-- ============================================================
-- Permissions par défaut pour chaque rôle
-- ============================================================

-- Format: module.action
-- Modules: employees, reports, attendance, settings, approvals, salaries, roles
-- Actions: view, edit, delete, export, manage

INSERT INTO public.role_permissions (role, permission, granted) VALUES
  -- ── ADMIN : accès total ──
  ('admin', 'employees.view',       true),
  ('admin', 'employees.edit',       true),
  ('admin', 'employees.delete',     true),
  ('admin', 'salaries.view',        true),
  ('admin', 'salaries.edit',        true),
  ('admin', 'roles.manage',         true),
  ('admin', 'reports.view',         true),
  ('admin', 'reports.export',       true),
  ('admin', 'attendance.view_all',  true),
  ('admin', 'attendance.fix',       true),
  ('admin', 'settings.view',        true),
  ('admin', 'settings.edit',        true),
  ('admin', 'approvals.manage',     true),
  ('admin', 'permissions.manage',   true),

  -- ── MANAGER : vue équipe + rapports, pas de suppression/paramètres ──
  ('manager', 'employees.view',      true),
  ('manager', 'employees.edit',      false),
  ('manager', 'employees.delete',    false),
  ('manager', 'salaries.view',       true),
  ('manager', 'salaries.edit',       false),
  ('manager', 'roles.manage',        false),
  ('manager', 'reports.view',        true),
  ('manager', 'reports.export',      true),
  ('manager', 'attendance.view_all', true),
  ('manager', 'attendance.fix',      true),
  ('manager', 'settings.view',       false),
  ('manager', 'settings.edit',       false),
  ('manager', 'approvals.manage',    false),
  ('manager', 'permissions.manage',  false),

  -- ── BUREAU : accès limité ──
  ('bureau', 'employees.view',      false),
  ('bureau', 'employees.edit',      false),
  ('bureau', 'employees.delete',    false),
  ('bureau', 'salaries.view',       false),
  ('bureau', 'salaries.edit',       false),
  ('bureau', 'roles.manage',        false),
  ('bureau', 'reports.view',        false),
  ('bureau', 'reports.export',      false),
  ('bureau', 'attendance.view_all', false),
  ('bureau', 'attendance.fix',      false),
  ('bureau', 'settings.view',       false),
  ('bureau', 'settings.edit',       false),
  ('bureau', 'approvals.manage',    false),
  ('bureau', 'permissions.manage',  false),

  -- ── TERRAIN : accès minimal ──
  ('terrain', 'employees.view',      false),
  ('terrain', 'employees.edit',      false),
  ('terrain', 'employees.delete',    false),
  ('terrain', 'salaries.view',       false),
  ('terrain', 'salaries.edit',       false),
  ('terrain', 'roles.manage',        false),
  ('terrain', 'reports.view',        false),
  ('terrain', 'reports.export',      false),
  ('terrain', 'attendance.view_all', false),
  ('terrain', 'attendance.fix',      false),
  ('terrain', 'settings.view',       false),
  ('terrain', 'settings.edit',       false),
  ('terrain', 'approvals.manage',    false),
  ('terrain', 'permissions.manage',  false)

ON CONFLICT (role, permission) DO NOTHING;
