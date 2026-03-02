
-- Add sort_order and apply_to_all to product_addons
ALTER TABLE public.product_addons ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.product_addons ADD COLUMN IF NOT EXISTS apply_to_all boolean NOT NULL DEFAULT false;

-- Make product_id nullable (for global addons)
ALTER TABLE public.product_addons ALTER COLUMN product_id DROP NOT NULL;

-- Create junction table for linking addons to specific products
CREATE TABLE public.addon_product_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id uuid NOT NULL REFERENCES public.product_addons(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  UNIQUE(addon_id, product_id)
);

ALTER TABLE public.addon_product_links ENABLE ROW LEVEL SECURITY;

-- RLS for addon_product_links
CREATE POLICY "Anyone can view addon links"
ON public.addon_product_links FOR SELECT
USING (true);

CREATE POLICY "Admins can manage addon links"
ON public.addon_product_links FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins full CRUD on product_addons
CREATE POLICY "Admins can manage addons"
ON public.product_addons FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update the SELECT policy to also show global addons (apply_to_all)
DROP POLICY IF EXISTS "Anyone can view active addons" ON public.product_addons;
CREATE POLICY "Anyone can view active addons"
ON public.product_addons FOR SELECT
USING (active = true);
