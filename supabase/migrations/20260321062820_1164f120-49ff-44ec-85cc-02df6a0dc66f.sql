ALTER TABLE public.extra_costs
ADD COLUMN IF NOT EXISTS preset_key text,
ADD COLUMN IF NOT EXISTS division_mode text NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS days_duration numeric,
ADD COLUMN IF NOT EXISTS items_per_day numeric,
ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_extra_costs_store_preset_key
ON public.extra_costs (store_id, preset_key);

CREATE INDEX IF NOT EXISTS idx_extra_costs_store_sort_name
ON public.extra_costs (store_id, sort_order, name);