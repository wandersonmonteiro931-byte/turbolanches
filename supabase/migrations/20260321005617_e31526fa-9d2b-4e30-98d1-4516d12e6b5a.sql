ALTER TABLE public.ingredients
ADD COLUMN IF NOT EXISTS calculation_mode text NOT NULL DEFAULT 'unidade';

ALTER TABLE public.ingredients
ADD COLUMN IF NOT EXISTS calculation_config jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.ingredients
SET unit = 'fatias'
WHERE unit = 'fatia';

UPDATE public.ingredients
SET
  calculation_mode = CASE
    WHEN unit IN ('pacote', 'kg', 'fatias', 'unidade', 'g', 'ml', 'litro', 'sachê') THEN unit
    ELSE 'unidade'
  END,
  calculation_config = jsonb_build_object(
    'mode', CASE
      WHEN unit IN ('pacote', 'kg', 'fatias', 'unidade', 'g', 'ml', 'litro', 'sachê') THEN unit
      ELSE 'unidade'
    END,
    'reference_price', cost_per_unit::text,
    'purchase_quantity', '',
    'purchase_unit', CASE
      WHEN unit IN ('pacote', 'kg', 'fatias', 'unidade', 'g', 'ml', 'litro', 'sachê') THEN unit
      ELSE 'unidade'
    END,
    'package_quantity', '',
    'package_price', '',
    'units_per_package', ''
  )
WHERE calculation_config = '{}'::jsonb;