
-- Add unique login code to couriers
ALTER TABLE public.couriers ADD COLUMN code text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_couriers_code ON public.couriers (code) WHERE code != '';

-- Create courier daily fees table
CREATE TABLE public.courier_daily_fees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id),
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  fixed_fee numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(courier_id, day_of_week)
);

ALTER TABLE public.courier_daily_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage courier daily fees"
ON public.courier_daily_fees FOR ALL
USING (admin_owns_store_row(store_id))
WITH CHECK (admin_owns_store_row(store_id));

CREATE POLICY "Anyone can view courier daily fees"
ON public.courier_daily_fees FOR SELECT
USING (true);
