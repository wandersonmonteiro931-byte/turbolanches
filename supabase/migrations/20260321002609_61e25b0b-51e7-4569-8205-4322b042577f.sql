-- Seção de reposição no painel administrativo
CREATE TABLE public.restock_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Reposição',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.restock_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage restock lists"
ON public.restock_lists
FOR ALL
TO authenticated
USING (public.admin_owns_store_row(store_id))
WITH CHECK (public.admin_owns_store_row(store_id));

CREATE INDEX idx_restock_lists_store_status
ON public.restock_lists(store_id, status, created_at DESC);

CREATE TRIGGER update_restock_lists_updated_at
BEFORE UPDATE ON public.restock_lists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.restock_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restock_list_id UUID NOT NULL REFERENCES public.restock_lists(id) ON DELETE CASCADE,
  store_id UUID NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  ingredient_id UUID NULL REFERENCES public.ingredients(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'unidade',
  quantity NUMERIC NOT NULL DEFAULT 1,
  last_price NUMERIC NOT NULL DEFAULT 0,
  estimated_total NUMERIC GENERATED ALWAYS AS (quantity * last_price) STORED,
  checked BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.restock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage restock items"
ON public.restock_items
FOR ALL
TO authenticated
USING (public.admin_owns_store_row(store_id))
WITH CHECK (public.admin_owns_store_row(store_id));

CREATE INDEX idx_restock_items_list_sort
ON public.restock_items(restock_list_id, sort_order, created_at);

CREATE INDEX idx_restock_items_store_ingredient
ON public.restock_items(store_id, ingredient_id);