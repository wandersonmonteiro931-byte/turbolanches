
CREATE TABLE public.saved_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'manual',
  manufactured_on TEXT NOT NULL DEFAULT '',
  valid_until TEXT NOT NULL DEFAULT '',
  validity_mode TEXT NOT NULL DEFAULT 'manual',
  shelf_life_days INTEGER NOT NULL DEFAULT 1,
  responsible TEXT NOT NULL DEFAULT '',
  copies INTEGER NOT NULL DEFAULT 1,
  width_mm INTEGER NOT NULL DEFAULT 80,
  height_mm INTEGER NOT NULL DEFAULT 30,
  storage_type TEXT NOT NULL DEFAULT '',
  storage_temp TEXT NOT NULL DEFAULT '',
  storage_phrase TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage saved labels" ON public.saved_labels
  FOR ALL TO authenticated
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));
