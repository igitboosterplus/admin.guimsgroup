-- ============================================================
-- Migration: Comptes gérés & améliorations tâches par poste
-- ============================================================

-- -----------------------------------------------------------
-- 1. Table: managed_accounts (pages sociales, comptes clients)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.managed_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'autre'
    CHECK (platform IN ('facebook','instagram','tiktok','linkedin','twitter','youtube','website','autre')),
  url TEXT,
  description TEXT,
  assigned_to UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_accounts_assigned ON public.managed_accounts (assigned_to);
CREATE INDEX IF NOT EXISTS idx_managed_accounts_platform ON public.managed_accounts (platform);

ALTER TABLE public.managed_accounts ENABLE ROW LEVEL SECURITY;

-- Employees can view their own accounts
CREATE POLICY "Users can view own accounts" ON public.managed_accounts
  FOR SELECT USING (assigned_to = auth.uid());

-- Admins / managers full access
CREATE POLICY "Admins managers select all accounts" ON public.managed_accounts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','manager'))
  );

CREATE POLICY "Admins managers insert accounts" ON public.managed_accounts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','manager'))
  );

CREATE POLICY "Admins managers update accounts" ON public.managed_accounts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','manager'))
  );

CREATE POLICY "Admins can delete accounts" ON public.managed_accounts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- -----------------------------------------------------------
-- 2. Table: task_templates (modèles par poste)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  position TEXT NOT NULL,
  default_priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (default_priority IN ('low','medium','high','urgent')),
  default_category TEXT,
  daily_target INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_templates_position ON public.task_templates (position);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone approved can view templates" ON public.task_templates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_approved = true)
  );

CREATE POLICY "Admins managers manage templates" ON public.task_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','manager'))
  );

-- -----------------------------------------------------------
-- 3. Extend tasks table
-- -----------------------------------------------------------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.managed_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daily_target INTEGER,
  ADD COLUMN IF NOT EXISTS daily_achieved INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence TEXT CHECK (recurrence IS NULL OR recurrence IN ('daily','weekly','monthly'));

CREATE INDEX IF NOT EXISTS idx_tasks_account ON public.tasks (account_id);
CREATE INDEX IF NOT EXISTS idx_tasks_recurring ON public.tasks (is_recurring) WHERE is_recurring = true;

-- -----------------------------------------------------------
-- 4. Seed default task templates per position
-- -----------------------------------------------------------
INSERT INTO public.task_templates (title, description, position, default_priority, default_category, daily_target, created_by)
SELECT t.title, t.description, t.position, t.default_priority, t.default_category, t.daily_target,
  (SELECT id FROM auth.users LIMIT 1)
FROM (VALUES
  -- Community manager
  ('Publications quotidiennes', 'Publier le contenu prévu sur la page assignée', 'Community manager', 'high', 'Community Management', 4),
  ('Réponse aux messages et commentaires', 'Traiter les messages privés et commentaires des abonnés', 'Community manager', 'high', 'Community Management', NULL),
  ('Création de contenu', 'Concevoir les visuels et rédiger les légendes', 'Community manager', 'medium', 'Community Management', 3),
  ('Veille concurrentielle', 'Analyser les tendances et la concurrence', 'Community manager', 'low', 'Community Management', NULL),
  ('Rapport d''engagement', 'Compiler les statistiques d''engagement hebdomadaires', 'Community manager', 'medium', 'Reporting', NULL),
  -- Développeur web
  ('Développement de fonctionnalités', 'Implémenter les nouvelles fonctionnalités du sprint', 'Développeur web', 'high', 'Développement', NULL),
  ('Correction de bugs', 'Résoudre les bugs signalés', 'Développeur web', 'high', 'Développement', NULL),
  ('Code review', 'Réviser le code des collègues', 'Développeur web', 'medium', 'Développement', 2),
  ('Tests unitaires', 'Écrire et maintenir les tests', 'Développeur web', 'medium', 'Développement', NULL),
  -- Designer graphique
  ('Création de visuels', 'Créer les visuels pour les réseaux sociaux et supports', 'Designer graphique', 'high', 'Design', 3),
  ('Maquettes et prototypes', 'Concevoir les maquettes UI/UX', 'Designer graphique', 'medium', 'Design', NULL),
  ('Charte graphique', 'Maintenir et faire évoluer la charte graphique', 'Designer graphique', 'low', 'Design', NULL),
  -- Rédacteur web
  ('Rédaction d''articles', 'Rédiger les articles de blog et contenus web', 'Rédacteur web', 'high', 'Rédaction', 2),
  ('Optimisation SEO', 'Optimiser le référencement des contenus existants', 'Rédacteur web', 'medium', 'Rédaction', NULL),
  -- Chef de projet digital
  ('Suivi de projet', 'Mettre à jour l''avancement des projets en cours', 'Chef de projet digital', 'high', 'Gestion de projet', NULL),
  ('Réunion d''équipe', 'Organiser et animer les réunions d''équipe', 'Chef de projet digital', 'medium', 'Gestion de projet', NULL),
  -- Formateur
  ('Préparation de cours', 'Préparer le matériel pédagogique', 'Formateur', 'high', 'Formation', NULL),
  ('Session de formation', 'Animer les sessions de formation prévues', 'Formateur', 'high', 'Formation', NULL),
  -- Comptable principal
  ('Saisie comptable', 'Enregistrer les écritures comptables du jour', 'Comptable principal', 'high', 'Comptabilité', NULL),
  ('Rapprochement bancaire', 'Vérifier les relevés bancaires', 'Comptable principal', 'medium', 'Comptabilité', NULL),
  -- Enseignant
  ('Préparation de cours', 'Préparer les leçons et exercices', 'Enseignant', 'high', 'Enseignement', NULL),
  ('Correction des devoirs', 'Corriger et noter les travaux des élèves', 'Enseignant', 'medium', 'Enseignement', NULL)
) AS t(title, description, position, default_priority, default_category, daily_target)
ON CONFLICT DO NOTHING;
