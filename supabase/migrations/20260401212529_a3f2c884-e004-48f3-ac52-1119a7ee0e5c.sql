-- Allow courier portal (anon) to read orders assigned to a courier
CREATE POLICY "Anon couriers can view assigned orders"
ON public.orders
FOR SELECT
TO anon
USING (courier_id IS NOT NULL AND status IN ('delivering', 'delivered'));

-- Allow courier portal (anon) to update delivering orders
CREATE POLICY "Anon couriers can update delivering orders"
ON public.orders
FOR UPDATE
TO anon
USING (courier_id IS NOT NULL AND status = 'delivering')
WITH CHECK (status IN ('delivered', 'ready'));