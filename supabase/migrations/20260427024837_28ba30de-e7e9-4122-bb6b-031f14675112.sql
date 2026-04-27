DELETE FROM public.store_settings WHERE id = 'fc4ed1c1-0cc5-4b23-9aed-9e6ee4d8f1d3';

CREATE UNIQUE INDEX IF NOT EXISTS store_settings_store_id_unique ON public.store_settings(store_id);