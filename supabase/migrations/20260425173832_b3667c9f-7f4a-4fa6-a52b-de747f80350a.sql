CREATE TABLE public.tv_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID,
  title TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 8,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tv_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active tv ads"
  ON public.tv_ads FOR SELECT
  USING (active = true);

CREATE POLICY "Admins can manage tv ads"
  ON public.tv_ads FOR ALL
  TO authenticated
  USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

CREATE TRIGGER tv_ads_set_store_id
  BEFORE INSERT ON public.tv_ads
  FOR EACH ROW EXECUTE FUNCTION public.set_default_store_id();

CREATE TRIGGER tv_ads_updated_at
  BEFORE UPDATE ON public.tv_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_ads;