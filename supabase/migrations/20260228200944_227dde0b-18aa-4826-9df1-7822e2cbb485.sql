ALTER TABLE public.store_settings 
  ADD COLUMN IF NOT EXISTS prep_time_minutes integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS delivery_time_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS pickup_time_minutes integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS store_address_full text NOT NULL DEFAULT 'Rua Exemplo, 123 - Centro';