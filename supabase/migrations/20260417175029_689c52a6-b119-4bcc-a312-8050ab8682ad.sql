ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_orders_trashed_at ON public.orders(trashed_at);