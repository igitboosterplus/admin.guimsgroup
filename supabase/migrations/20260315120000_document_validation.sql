-- ============================================================
-- Migration: Validation / rejet des documents employés
-- ============================================================

-- Ajouter les colonnes de validation
ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Index sur le statut pour les requêtes de filtrage admin
CREATE INDEX IF NOT EXISTS idx_employee_documents_status ON public.employee_documents (status);

-- Index sur user_id pour les requêtes employé
CREATE INDEX IF NOT EXISTS idx_employee_documents_user_id ON public.employee_documents (user_id);

-- Policy: Admins / managers peuvent mettre à jour les documents (validation)
CREATE POLICY "Admins managers can update documents" ON public.employee_documents
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
  );
