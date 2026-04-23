ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS store_only boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_store_only ON public.products (store_only);