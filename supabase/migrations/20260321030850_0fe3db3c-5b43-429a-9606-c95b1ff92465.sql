ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS manual_cost numeric NOT NULL DEFAULT 0;