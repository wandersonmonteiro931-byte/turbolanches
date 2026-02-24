
-- Store settings table (single row)
CREATE TABLE public.store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_open boolean NOT NULL DEFAULT false,
  opened_at timestamp with time zone,
  closed_at timestamp with time zone,
  scheduled_open time,
  scheduled_close time,
  use_schedule boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view store settings"
ON public.store_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can update store settings"
ON public.store_settings FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert store settings"
ON public.store_settings FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow anon to view store status (for menu visibility)
CREATE POLICY "Public can view store settings"
ON public.store_settings FOR SELECT
TO anon
USING (true);

-- Insert default row
INSERT INTO public.store_settings (is_open, use_schedule) VALUES (false, false);

-- Daily reports table
CREATE TABLE public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  total_orders integer NOT NULL DEFAULT 0,
  total_bruto numeric NOT NULL DEFAULT 0,
  total_delivery_fees numeric NOT NULL DEFAULT 0,
  total_gastos numeric NOT NULL DEFAULT 0,
  total_liquido numeric NOT NULL DEFAULT 0,
  opened_at timestamp with time zone,
  closed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage daily reports"
ON public.daily_reports FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for store_settings
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_settings;
