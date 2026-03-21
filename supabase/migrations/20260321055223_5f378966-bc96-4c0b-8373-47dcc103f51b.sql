CREATE TABLE public.product_combo_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  store_id UUID NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT product_combo_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT product_combo_items_not_self CHECK (product_id <> component_product_id),
  CONSTRAINT product_combo_items_unique_component UNIQUE (product_id, component_product_id)
);

ALTER TABLE public.product_combo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage combo components"
ON public.product_combo_items
FOR ALL
TO public
USING (admin_owns_store_row(store_id))
WITH CHECK (admin_owns_store_row(store_id));

CREATE INDEX idx_product_combo_items_product_id
ON public.product_combo_items(product_id);

CREATE INDEX idx_product_combo_items_component_product_id
ON public.product_combo_items(component_product_id);

CREATE INDEX idx_product_combo_items_store_id
ON public.product_combo_items(store_id);