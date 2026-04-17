ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

UPDATE public.ingredients
SET is_internal = true
WHERE is_internal = false
  AND (
    upper(name) LIKE '%EMB%'
    OR upper(name) LIKE '%SACOLA%'
    OR upper(name) LIKE '%SACO %'
    OR upper(name) LIKE 'SACO%'
    OR upper(name) LIKE '%SACHÊ%'
    OR upper(name) LIKE '%SACHE%'
    OR upper(name) LIKE '%BOBINA%'
    OR upper(name) LIKE '%TAMPA%'
  );