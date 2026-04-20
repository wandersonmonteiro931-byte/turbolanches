-- 1. Add column (nullable initially for backfill)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code integer;

-- 2. Backfill: assign 100-blocks per category by category sort_order, products by sort_order then name
WITH cat_ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, name) AS cat_rank
  FROM public.categories
),
prod_ranked AS (
  SELECT p.id,
         cr.cat_rank,
         ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.sort_order, p.name, p.created_at) AS prod_rank
  FROM public.products p
  JOIN cat_ranked cr ON cr.id = p.category_id
)
UPDATE public.products p
SET product_code = (pr.cat_rank * 100) + (pr.prod_rank - 1)
FROM prod_ranked pr
WHERE pr.id = p.id AND p.product_code IS NULL;

-- Products with no category: assign sequentially from 9000
WITH orphans AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.products WHERE product_code IS NULL
)
UPDATE public.products p
SET product_code = 9000 + (o.rn - 1)
FROM orphans o WHERE o.id = p.id;

-- 3. Constraints
ALTER TABLE public.products ALTER COLUMN product_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_unique ON public.products(product_code);

-- 4. Function to compute next code for a category
CREATE OR REPLACE FUNCTION public.next_product_code(_category_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat_rank int;
  base int;
  candidate int;
  block_start int;
BEGIN
  -- Determine category rank by sort_order
  IF _category_id IS NULL THEN
    -- Orphans use 9000+ block
    SELECT COALESCE(MAX(product_code), 8999) + 1 INTO candidate
    FROM public.products WHERE product_code >= 9000;
    RETURN candidate;
  END IF;

  SELECT rnk INTO cat_rank FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, name) AS rnk
    FROM public.categories
  ) s WHERE s.id = _category_id;

  base := cat_rank * 100;

  -- Try the category's natural block first
  SELECT COALESCE(MAX(product_code), base - 1) + 1 INTO candidate
  FROM public.products
  WHERE product_code BETWEEN base AND base + 99;

  IF candidate <= base + 99 THEN
    RETURN candidate;
  END IF;

  -- Block full: find next free 100-block (skipping reserved category blocks)
  block_start := base + 100;
  LOOP
    -- Skip blocks owned by other categories
    IF EXISTS (
      SELECT 1 FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY sort_order, name) AS rnk FROM public.categories
      ) s WHERE s.rnk * 100 = block_start
    ) THEN
      block_start := block_start + 100;
      CONTINUE;
    END IF;
    -- Check if block has any product
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE product_code BETWEEN block_start AND block_start + 99
    ) THEN
      RETURN block_start;
    END IF;
    -- Try next free slot inside this block
    SELECT COALESCE(MAX(product_code), block_start - 1) + 1 INTO candidate
    FROM public.products WHERE product_code BETWEEN block_start AND block_start + 99;
    IF candidate <= block_start + 99 THEN
      RETURN candidate;
    END IF;
    block_start := block_start + 100;
    IF block_start > 99000 THEN
      RAISE EXCEPTION 'No free product_code slot available';
    END IF;
  END LOOP;
END;
$$;

-- 5. Trigger to auto-assign on INSERT if not provided
CREATE OR REPLACE FUNCTION public.set_product_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_code IS NULL THEN
    NEW.product_code := public.next_product_code(NEW.category_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_product_code ON public.products;
CREATE TRIGGER trg_set_product_code
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_product_code();