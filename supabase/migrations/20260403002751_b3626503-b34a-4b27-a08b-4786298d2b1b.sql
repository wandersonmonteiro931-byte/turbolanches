
CREATE TABLE public.courier_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  accuracy numeric DEFAULT 0,
  speed numeric DEFAULT 0,
  heading numeric DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_courier_locations_courier_id ON public.courier_locations (courier_id);

ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view courier locations"
ON public.courier_locations
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert courier locations"
ON public.courier_locations
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update courier locations"
ON public.courier_locations
FOR UPDATE
USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_locations;
