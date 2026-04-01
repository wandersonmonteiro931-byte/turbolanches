-- Drop and recreate the anon SELECT policy to include all terminal statuses
DROP POLICY IF EXISTS "Anon couriers can view assigned orders" ON public.orders;

CREATE POLICY "Anon couriers can view assigned orders"
ON public.orders
FOR SELECT
TO anon
USING (courier_id IS NOT NULL AND status IN ('delivering', 'delivered', 'cancelled'));