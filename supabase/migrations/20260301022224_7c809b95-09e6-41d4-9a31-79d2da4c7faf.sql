
-- Allow authenticated users to view all delivery zones (active and inactive) for autocomplete
CREATE POLICY "Authenticated users can view all delivery zones"
  ON public.delivery_zones FOR SELECT TO authenticated
  USING (true);
