ALTER TABLE public.restock_items
ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

ALTER TABLE public.restock_lists
ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_restock_lists_store_status_updated_at
ON public.restock_lists (store_id, status, updated_at DESC);