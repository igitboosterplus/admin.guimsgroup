-- ============================================================
-- Daily Reports & Smart Task Suggestions
-- ============================================================

-- 1. Daily employee reports table
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Structured content
  tasks_done TEXT NOT NULL DEFAULT '',          -- What was accomplished
  tasks_in_progress TEXT DEFAULT '',            -- What is still ongoing
  blockers TEXT DEFAULT '',                     -- Any blockers/problems
  plans_tomorrow TEXT DEFAULT '',               -- Plans for tomorrow
  mood TEXT CHECK (mood IN ('great', 'good', 'neutral', 'bad', 'terrible')) DEFAULT 'good',
  hours_worked NUMERIC(4,1) DEFAULT NULL,       -- Self-reported hours
  -- Admin feedback
  admin_note TEXT DEFAULT NULL,
  reviewed_by UUID REFERENCES auth.users(id) DEFAULT NULL,
  reviewed_at TIMESTAMPTZ DEFAULT NULL,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- One report per employee per day
  UNIQUE(user_id, report_date)
);

-- RLS
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily reports"
  ON daily_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all daily reports"
  ON daily_reports FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "Users can insert own daily reports"
  ON daily_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily reports"
  ON daily_reports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can update daily reports (feedback)"
  ON daily_reports FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- 2. Smart task suggestions table (admin-curated per department/position)
CREATE TABLE IF NOT EXISTS task_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  position TEXT DEFAULT NULL,                    -- NULL = applies to all positions in dept
  title TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  category TEXT DEFAULT NULL,
  is_recurring_suggestion BOOLEAN DEFAULT false,
  recurrence TEXT CHECK (recurrence IN ('daily', 'weekly', 'monthly')) DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE task_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view suggestions"
  ON task_suggestions FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage suggestions"
  ON task_suggestions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- 3. Seed smart suggestions per department
INSERT INTO task_suggestions (department, position, title, description, priority, category, is_recurring_suggestion, recurrence) VALUES

-- === DIGITBOOSTER+ ===
('Digitbooster+', 'Community manager', 'Publier du contenu sur les réseaux sociaux', 'Créer et publier des posts quotidiens engageants sur toutes les plateformes gérées', 'high', 'Community Management', true, 'daily'),
('Digitbooster+', 'Community manager', 'Répondre aux messages et commentaires', 'Traiter tous les messages et commentaires en attente dans les 2h', 'high', 'Community Management', true, 'daily'),
('Digitbooster+', 'Community manager', 'Rapport d''engagement hebdomadaire', 'Analyser les KPIs (portée, engagement, nouveaux abonnés) et rédiger un rapport', 'medium', 'Reporting', true, 'weekly'),
('Digitbooster+', 'Community manager', 'Planifier le calendrier éditorial', 'Préparer le planning de contenu pour la semaine à venir', 'high', 'Stratégie', true, 'weekly'),
('Digitbooster+', 'Community manager', 'Veille concurrentielle et tendances', 'Surveiller les concurrents et identifier les tendances du moment', 'low', 'Veille', true, 'weekly'),

('Digitbooster+', 'Développeur web', 'Développer de nouvelles fonctionnalités', 'Implémenter les fonctionnalités priorisées dans le backlog', 'high', 'Développement', true, 'daily'),
('Digitbooster+', 'Développeur web', 'Corriger les bugs signalés', 'Résoudre les bugs prioritaires remontés par les utilisateurs', 'high', 'Maintenance', true, 'daily'),
('Digitbooster+', 'Développeur web', 'Optimiser les performances du site', 'Améliorer la vitesse de chargement et l''expérience utilisateur', 'medium', 'Optimisation', false, NULL),
('Digitbooster+', 'Développeur web', 'Mettre à jour la documentation technique', 'Documenter les nouvelles fonctionnalités et les APIs', 'low', 'Documentation', true, 'weekly'),
('Digitbooster+', 'Développeur web', 'Review de code et tests', 'Relire le code des collègues et écrire des tests unitaires', 'medium', 'Qualité', true, 'daily'),

('Digitbooster+', 'Designer graphique', 'Créer des visuels pour les réseaux sociaux', 'Produire les visuels, bannières et stories pour les publications', 'high', 'Design', true, 'daily'),
('Digitbooster+', 'Designer graphique', 'Mettre à jour la charte graphique', 'S''assurer de la cohérence visuelle sur tous les supports', 'medium', 'Branding', false, NULL),
('Digitbooster+', 'Designer graphique', 'Créer des maquettes UI/UX', 'Designer les interfaces pour les nouveaux projets web/mobile', 'high', 'UI/UX', false, NULL),

('Digitbooster+', 'Rédacteur web', 'Rédiger des articles de blog', 'Écrire des articles SEO-optimisés pour le site web', 'high', 'Rédaction', true, 'weekly'),
('Digitbooster+', 'Rédacteur web', 'Optimiser le référencement SEO', 'Auditer et améliorer le positionnement Google des pages', 'medium', 'SEO', true, 'weekly'),

('Digitbooster+', 'Chef de projet digital', 'Suivre l''avancement des projets', 'Vérifier le statut de chaque projet et identifier les blocages', 'high', 'Gestion de projet', true, 'daily'),
('Digitbooster+', 'Chef de projet digital', 'Organiser les réunions d''équipe', 'Planifier et animer les stand-ups et rétrospectives', 'medium', 'Management', true, 'weekly'),
('Digitbooster+', 'Chef de projet digital', 'Proposer des améliorations de processus', 'Identifier les inefficacités et proposer des solutions', 'medium', 'Amélioration', true, 'monthly'),

-- === GUIMS EDUC ===
('Guims Educ', 'Enseignant', 'Préparer les cours de la semaine', 'Élaborer les supports pédagogiques et les exercices', 'high', 'Pédagogie', true, 'weekly'),
('Guims Educ', 'Enseignant', 'Corriger les devoirs et évaluations', 'Évaluer les travaux des étudiants et donner un retour', 'high', 'Évaluation', true, 'weekly'),
('Guims Educ', 'Enseignant', 'Suivre la progression des élèves', 'Analyser les résultats et adapter l''enseignement', 'medium', 'Suivi', true, 'monthly'),
('Guims Educ', 'Coordinateur pédagogique', 'Harmoniser les programmes', 'S''assurer de la cohérence entre les différents cours', 'high', 'Coordination', true, 'monthly'),
('Guims Educ', 'Conseiller éducatif', 'Accompagner les étudiants en difficulté', 'Identifier les élèves en difficulté et proposer un soutien adapté', 'high', 'Accompagnement', true, 'weekly'),

-- === GUIMS ACADEMY ===
('Guims Academy', 'Formateur', 'Préparer la session de formation', 'Concevoir le contenu et les exercices pratiques', 'high', 'Formation', true, 'weekly'),
('Guims Academy', 'Formateur', 'Animer les sessions de formation', 'Dispenser les cours selon le planning établi', 'high', 'Formation', true, 'daily'),
('Guims Academy', 'Formateur', 'Évaluer les apprenants', 'Réaliser les évaluations de fin de module', 'medium', 'Évaluation', true, 'monthly'),
('Guims Academy', 'Responsable e-learning', 'Mettre à jour la plateforme e-learning', 'Ajouter de nouveaux contenus et maintenir la plateforme', 'high', 'E-learning', true, 'weekly'),
('Guims Academy', 'Coordinateur de formation', 'Planifier le calendrier de formations', 'Organiser les sessions et gérer les inscriptions', 'high', 'Planification', true, 'monthly'),

-- === GUIMS LINGUISTIC CENTER ===
('Guims Linguistic Center', 'Professeur d''anglais', 'Donner les cours d''anglais', 'Animer les séances selon le programme pédagogique', 'high', 'Enseignement', true, 'daily'),
('Guims Linguistic Center', 'Professeur d''anglais', 'Préparer les supports de cours', 'Élaborer les exercices et supports audio/vidéo', 'medium', 'Préparation', true, 'weekly'),
('Guims Linguistic Center', 'Professeur de français', 'Donner les cours de français', 'Animer les séances selon le programme pédagogique', 'high', 'Enseignement', true, 'daily'),
('Guims Linguistic Center', 'Traducteur / Interprète', 'Traiter les demandes de traduction', 'Traduire les documents et correspondances', 'high', 'Traduction', true, 'daily'),
('Guims Linguistic Center', NULL, 'Organiser des événements linguistiques', 'Préparer des ateliers conversation, concours, etc.', 'medium', 'Événementiel', true, 'monthly'),

-- === GABA ===
('GABA', 'Formateur en agriculture', 'Animer les formations terrain', 'Conduire les sessions de formation pratique agricole', 'high', 'Formation', true, 'daily'),
('GABA', 'Technicien agricole', 'Suivi des parcelles et cultures', 'Inspecter l''état des cultures et recommander des actions', 'high', 'Suivi technique', true, 'daily'),
('GABA', 'Chargé de projet', 'Suivre l''avancement des projets agricoles', 'Coordonner les activités et rédiger les rapports d''avancement', 'high', 'Gestion de projet', true, 'weekly'),
('GABA', NULL, 'Rédiger le rapport mensuel GABA', 'Synthétiser les activités du mois : formations, productions, événements', 'medium', 'Reporting', true, 'monthly'),

-- === GUIMS COMPTA ===
('Guims Compta', 'Comptable principal', 'Saisie des opérations comptables', 'Enregistrer les factures, paiements et encaissements', 'high', 'Comptabilité', true, 'daily'),
('Guims Compta', 'Comptable principal', 'Rapprochement bancaire', 'Vérifier la concordance entre les relevés bancaires et la comptabilité', 'high', 'Comptabilité', true, 'weekly'),
('Guims Compta', 'Auditeur interne', 'Audit des dépenses', 'Vérifier la conformité des dépenses et des justificatifs', 'high', 'Audit', true, 'weekly'),
('Guims Compta', 'Fiscaliste', 'Préparer les déclarations fiscales', 'Calculer et préparer les déclarations TVA et impôts', 'urgent', 'Fiscalité', true, 'monthly'),
('Guims Compta', NULL, 'Rapport financier mensuel', 'Produire le bilan mensuel avec les indicateurs clés', 'high', 'Reporting', true, 'monthly'),

-- === GUIMSELECT ===
('GuimSelect', 'Technicien électricien', 'Effectuer les installations électriques', 'Réaliser les travaux d''installation selon le planning', 'high', 'Installation', true, 'daily'),
('GuimSelect', 'Technicien électricien', 'Maintenance préventive', 'Contrôler les installations existantes et prévenir les pannes', 'medium', 'Maintenance', true, 'weekly'),
('GuimSelect', 'Chef d''équipe', 'Planifier les interventions', 'Organiser le planning des équipes sur les chantiers', 'high', 'Planification', true, 'daily'),
('GuimSelect', 'Chef d''équipe', 'Rapport de chantier', 'Rédiger le compte-rendu des interventions du jour', 'medium', 'Reporting', true, 'daily'),
('GuimSelect', NULL, 'Inventaire du matériel', 'Vérifier l''état et la disponibilité de l''outillage', 'medium', 'Logistique', true, 'monthly'),

-- === DIRECTION GÉNÉRALE ===
('Direction Générale', 'Responsable RH', 'Suivre les absences et retards', 'Analyser les pointages et prendre les mesures nécessaires', 'high', 'RH', true, 'daily'),
('Direction Générale', 'Responsable RH', 'Préparer la paie mensuelle', 'Calculer les salaires en tenant compte des déductions et bonus', 'urgent', 'RH', true, 'monthly'),
('Direction Générale', 'Secrétaire de direction', 'Gérer le courrier et l''agenda', 'Traiter la correspondance et organiser les rendez-vous', 'high', 'Administration', true, 'daily'),
('Direction Générale', 'Directeur Général', 'Réunion de direction', 'Animer la réunion de coordination avec les directeurs de département', 'high', 'Management', true, 'weekly'),
('Direction Générale', NULL, 'Évaluer la performance des départements', 'Analyser les indicateurs de performance et définir les priorités', 'high', 'Stratégie', true, 'monthly');

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_task_suggestions_dept ON task_suggestions(department, position);
