ALTER TABLE public.product_addons ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
ALTER TABLE public.product_addons REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.store_schedule;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;