ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS free_delivery_min_order numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_max_km numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS temp_free_delivery_all boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_serving_km numeric NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_serving_km_active boolean NOT NULL DEFAULT false;

ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS temp_free_delivery boolean NOT NULL DEFAULT false;