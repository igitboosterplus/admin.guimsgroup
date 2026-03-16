-- ============================================================
-- Migration: Overtime approval system
-- Employees who stay past scheduled end need admin approval for overtime pay
-- ============================================================

-- 1. Add overtime tracking columns to attendance
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS overtime_minutes integer DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS overtime_approved boolean DEFAULT null;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS overtime_reviewed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS overtime_reviewed_at timestamptz;
