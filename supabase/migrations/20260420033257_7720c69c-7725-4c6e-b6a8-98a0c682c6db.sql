ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_code integer;

UPDATE public.order_items oi
SET product_code = p.product_code
FROM public.products p
WHERE oi.product_id = p.id AND oi.product_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_product_code ON public.products(product_code);