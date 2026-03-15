
-- Add missing columns to coupons table
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS starts_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS first_purchase_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Admin full CRUD policy on coupons
CREATE POLICY "Admins can manage coupons"
  ON public.coupons
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
