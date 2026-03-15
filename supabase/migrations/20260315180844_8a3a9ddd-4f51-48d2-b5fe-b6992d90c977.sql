
-- Add store_id to all data tables for multi-tenant isolation
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.store_schedule ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.site_content ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.receipt_templates ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.product_addons ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.addon_product_links ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.push_templates ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- Helper function: get the store_id for an admin user
CREATE OR REPLACE FUNCTION public.get_admin_store_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.user_roles
  WHERE user_id = _user_id AND role = 'admin'
  LIMIT 1
$$;

-- Create indexes for store_id on frequently queried tables
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON public.categories(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_banners_store_id ON public.banners(store_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_store_id ON public.delivery_zones(store_id);
CREATE INDEX IF NOT EXISTS idx_store_settings_store_id ON public.store_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_coupons_store_id ON public.coupons(store_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_store_id ON public.user_roles(store_id);

-- Enable realtime for stores table
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
