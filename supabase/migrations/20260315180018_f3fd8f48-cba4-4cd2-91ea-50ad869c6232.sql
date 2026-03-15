
-- Add WhatsApp and branding columns to store_settings
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS whatsapp_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS store_logo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS store_display_name text NOT NULL DEFAULT 'Turbo Lanches';

-- Create stores table for multi-tenant foundation
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  slug text NOT NULL UNIQUE DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  whatsapp_number text NOT NULL DEFAULT '',
  whatsapp_name text NOT NULL DEFAULT '',
  owner_user_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage stores" ON public.stores
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active stores" ON public.stores
  FOR SELECT TO public
  USING (active = true);
