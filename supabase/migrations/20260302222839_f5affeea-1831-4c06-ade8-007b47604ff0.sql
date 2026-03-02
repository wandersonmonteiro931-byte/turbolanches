
-- Add sort_order to products for admin ordering control
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Create storage bucket for uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for uploads bucket
CREATE POLICY "Public can view uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'uploads');

CREATE POLICY "Admins can upload files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'uploads' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update uploads"
ON storage.objects FOR UPDATE
USING (bucket_id = 'uploads' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete uploads"
ON storage.objects FOR DELETE
USING (bucket_id = 'uploads' AND has_role(auth.uid(), 'admin'::app_role));

-- Banners table for admin-controlled banners
CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active banners"
ON public.banners FOR SELECT
USING (active = true);

CREATE POLICY "Admins can manage banners"
ON public.banners FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Site content table for admin-controlled text/image content
CREATE TABLE public.site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'text',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view site content"
ON public.site_content FOR SELECT
USING (true);

CREATE POLICY "Admins can manage site content"
ON public.site_content FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default site content
INSERT INTO public.site_content (key, value, content_type) VALUES
  ('home_greeting_prefix', 'Olá', 'text'),
  ('home_promo_badge', '🔥 PROMOÇÃO DO DIA', 'text'),
  ('home_promo_text', 'Turbo Smash por R$ 32,90', 'text'),
  ('whatsapp_number', '5562994753582', 'text'),
  ('whatsapp_message', 'Olá! Gostaria de fazer um pedido.', 'text');
