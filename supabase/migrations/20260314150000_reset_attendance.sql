-- ============================================
-- Remise à zéro des compteurs de présence
-- Suppression de tous les enregistrements attendance
-- Les enregistrements redémarrent à partir du lundi 16 mars 2026
-- ============================================

DELETE FROM public.attendance;
