
-- Tabela de Ingredientes
CREATE TABLE public.ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unidade',
  cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ingredients" ON public.ingredients
  FOR ALL USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

CREATE POLICY "Admins can view ingredients" ON public.ingredients
  FOR SELECT USING (admin_owns_store_row(store_id));

CREATE TRIGGER update_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de Custos Extras
CREATE TABLE public.extra_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id),
  name TEXT NOT NULL,
  cost_type TEXT NOT NULL DEFAULT 'fixed',
  value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.extra_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage extra costs" ON public.extra_costs
  FOR ALL USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

CREATE POLICY "Admins can view extra costs" ON public.extra_costs
  FOR SELECT USING (admin_owns_store_row(store_id));

CREATE TRIGGER update_extra_costs_updated_at
  BEFORE UPDATE ON public.extra_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ficha Técnica (ingredientes por produto)
CREATE TABLE public.product_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 1,
  store_id UUID REFERENCES public.stores(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage product ingredients" ON public.product_ingredients
  FOR ALL USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

CREATE POLICY "Admins can view product ingredients" ON public.product_ingredients
  FOR SELECT USING (admin_owns_store_row(store_id));
