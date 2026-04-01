
-- Create couriers table
CREATE TABLE public.couriers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id),
  name TEXT NOT NULL,
  fixed_fee NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage couriers"
ON public.couriers FOR ALL
USING (admin_owns_store_row(store_id))
WITH CHECK (admin_owns_store_row(store_id));

CREATE POLICY "Anyone can view active couriers"
ON public.couriers FOR SELECT
USING (active = true);

-- Add courier_id to orders
ALTER TABLE public.orders ADD COLUMN courier_id UUID REFERENCES public.couriers(id);

-- Trigger for updated_at
CREATE TRIGGER update_couriers_updated_at
BEFORE UPDATE ON public.couriers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
