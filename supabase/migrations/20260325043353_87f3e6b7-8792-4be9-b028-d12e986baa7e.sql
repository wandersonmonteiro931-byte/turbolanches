CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  store_id uuid REFERENCES public.stores(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage brands" ON public.brands
  FOR ALL TO authenticated
  USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

CREATE POLICY "Admins can view brands" ON public.brands
  FOR SELECT TO public
  USING (admin_owns_store_row(store_id));