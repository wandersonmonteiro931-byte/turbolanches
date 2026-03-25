CREATE TABLE public.storage_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '',
  default_temp text NOT NULL DEFAULT '',
  default_phrase text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storage_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage storage configs" ON public.storage_configs
  FOR ALL TO authenticated
  USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

CREATE POLICY "Anyone can view storage configs" ON public.storage_configs
  FOR SELECT TO public
  USING (true);