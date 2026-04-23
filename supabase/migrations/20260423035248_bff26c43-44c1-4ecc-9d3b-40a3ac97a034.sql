CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NULL,
  table_number integer NOT NULL,
  name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_tables_table_number_positive CHECK (table_number > 0),
  CONSTRAINT restaurant_tables_store_table_number_unique UNIQUE (store_id, table_number)
);

ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active restaurant tables" ON public.restaurant_tables;
CREATE POLICY "Anyone can view active restaurant tables"
ON public.restaurant_tables
FOR SELECT
USING (active = true);

DROP POLICY IF EXISTS "Admins can manage restaurant tables" ON public.restaurant_tables;
CREATE POLICY "Admins can manage restaurant tables"
ON public.restaurant_tables
FOR ALL
USING (admin_owns_store_row(store_id))
WITH CHECK (admin_owns_store_row(store_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'restaurant_table_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN restaurant_table_id uuid NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'table_code'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN table_code text NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'table_stage'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN table_stage text NOT NULL DEFAULT 'none';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'charged_at'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN charged_at timestamp with time zone NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'sent_to_kitchen'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN sent_to_kitchen boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'sent_to_kitchen_at'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN sent_to_kitchen_at timestamp with time zone NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_restaurant_table_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_restaurant_table_id_fkey
      FOREIGN KEY (restaurant_table_id) REFERENCES public.restaurant_tables(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_open_per_table
ON public.orders (restaurant_table_id)
WHERE restaurant_table_id IS NOT NULL
  AND delivery_type = 'mesa'
  AND status NOT IN ('delivered', 'cancelled')
  AND trashed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_store_sort
ON public.restaurant_tables (store_id, sort_order, table_number);

CREATE INDEX IF NOT EXISTS idx_order_items_kitchen_status
ON public.order_items (order_id, sent_to_kitchen);

CREATE OR REPLACE FUNCTION public.set_restaurant_tables_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_restaurant_tables_updated_at ON public.restaurant_tables;
CREATE TRIGGER update_restaurant_tables_updated_at
BEFORE UPDATE ON public.restaurant_tables
FOR EACH ROW
EXECUTE FUNCTION public.set_restaurant_tables_updated_at();