-- ============================================
-- Enhanced profiles: more fields + archive system + employee documents
-- ============================================

-- New personal info columns on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS national_id TEXT;

-- Archive columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- Employee documents table
CREATE TABLE IF NOT EXISTS public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('photo', 'cv', 'cni', 'diplome', 'autre')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

-- Documents policies
CREATE POLICY "Users can view own documents" ON public.employee_documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents" ON public.employee_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON public.employee_documents
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins managers can view all documents" ON public.employee_documents
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Admins can manage all documents" ON public.employee_documents
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for employee documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-documents',
  'employee-documents',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies: users upload to their own folder
CREATE POLICY "Users upload own files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'employee-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users view own files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'employee-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'employee-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Admins managers view all employee files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'employee-documents' AND
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "Admins manage all employee files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'employee-documents' AND
    public.has_role(auth.uid(), 'admin')
  );

-- Update handle_new_user trigger to include new metadata fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, phone, date_of_birth, address, emergency_contact_name, emergency_contact_phone, national_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    CASE WHEN NEW.raw_user_meta_data->>'date_of_birth' IS NOT NULL
         THEN (NEW.raw_user_meta_data->>'date_of_birth')::date
         ELSE NULL END,
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'emergency_contact_name',
    NEW.raw_user_meta_data->>'emergency_contact_phone',
    NEW.raw_user_meta_data->>'national_id'
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'bureau');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
