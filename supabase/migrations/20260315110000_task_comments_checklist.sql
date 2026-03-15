-- ============================================
-- Commentaires et sous-tâches pour les missions
-- ============================================

-- Table des commentaires sur les tâches
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- Tout utilisateur impliqué (assigné ou admin) peut voir les commentaires
CREATE POLICY "Users can view task comments" ON public.task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_comments.task_id
        AND (t.assigned_to = auth.uid() OR t.assigned_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Tout utilisateur connecté peut commenter une tâche qui le concerne
CREATE POLICY "Users can create task comments" ON public.task_comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_comments.task_id
          AND (t.assigned_to = auth.uid() OR t.assigned_by = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
      )
    )
  );

-- Admins peuvent supprimer les commentaires
CREATE POLICY "Admins can delete task comments" ON public.task_comments
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Index sur task_comments
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments (task_id);

-- Table des sous-tâches (checklist)
CREATE TABLE IF NOT EXISTS public.task_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_checklist ENABLE ROW LEVEL SECURITY;

-- Mêmes politiques que les tâches parentes
CREATE POLICY "Users can view task checklist" ON public.task_checklist
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_checklist.task_id
        AND (t.assigned_to = auth.uid() OR t.assigned_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can update task checklist" ON public.task_checklist
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_checklist.task_id AND t.assigned_to = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can manage task checklist" ON public.task_checklist
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE INDEX IF NOT EXISTS idx_task_checklist_task_id ON public.task_checklist (task_id, sort_order);
