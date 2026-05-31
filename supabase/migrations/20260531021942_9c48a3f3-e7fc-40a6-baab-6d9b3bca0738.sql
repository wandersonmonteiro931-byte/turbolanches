
-- 1) Lock down couriers: only admins; courier portal uses edge function
DROP POLICY IF EXISTS "Anyone can view active couriers" ON public.couriers;

-- 2) Lock down courier_daily_fees: admins only
DROP POLICY IF EXISTS "Anyone can view courier daily fees" ON public.courier_daily_fees;

-- 3) Lock down receipt_templates: admins only
DROP POLICY IF EXISTS "Anyone can view receipt templates" ON public.receipt_templates;

-- 4) Lock down report_expenses: admins only
DROP POLICY IF EXISTS "Anyone can view report expenses" ON public.report_expenses;

-- 5) Remove anonymous courier policies on orders; courier portal now uses edge function
DROP POLICY IF EXISTS "Anon couriers can view assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Anon couriers can update delivering orders" ON public.orders;

-- 6) Hide products.manual_cost from public reads via column-level grants
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id, category_id, name, description, price, original_price, image_url,
  active, popular, available_from, available_until, created_at, updated_at,
  sort_order, is_combo, combo_item_count, store_id, product_code, store_only
) ON public.products TO anon;

REVOKE SELECT ON public.products FROM authenticated;
GRANT SELECT (
  id, category_id, name, description, price, original_price, image_url,
  active, popular, available_from, available_until, created_at, updated_at,
  sort_order, is_combo, combo_item_count, store_id, product_code, store_only
) ON public.products TO authenticated;
-- Admins get full access via service role / RPC paths; UPDATE/DELETE policies remain unchanged
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- 7) Fix admin_owns_store_row null bypass: explicitly reject NULL store_id
CREATE OR REPLACE FUNCTION public.admin_owns_store_row(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _store_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND store_id = _store_id
  )
$function$;
