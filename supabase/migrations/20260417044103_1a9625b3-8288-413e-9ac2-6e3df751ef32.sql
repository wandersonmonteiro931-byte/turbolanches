INSERT INTO public.store_settings (store_id, is_open, store_display_name)
SELECT s.id, false, s.name
FROM public.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_settings ss WHERE ss.store_id = s.id
);