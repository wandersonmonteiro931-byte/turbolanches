ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_combo boolean NOT NULL DEFAULT false;

UPDATE public.products p
SET is_combo = true
FROM public.categories c
WHERE p.category_id = c.id
  AND c.name ILIKE '%combo%';