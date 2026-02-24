
-- Create delivery zones table for neighborhood-based fees
CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood text NOT NULL UNIQUE,
  delivery_fee numeric NOT NULL DEFAULT 5.99,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active delivery zones"
ON public.delivery_zones FOR SELECT
USING (active = true);

CREATE POLICY "Admins can manage delivery zones"
ON public.delivery_zones FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert some default neighborhoods
INSERT INTO public.delivery_zones (neighborhood, delivery_fee) VALUES
  ('Centro', 3.99),
  ('Jardim América', 5.99),
  ('Vila Nova', 4.99),
  ('São José', 6.99),
  ('Boa Vista', 7.99);
