CREATE TABLE public.store_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time time WITHOUT TIME ZONE,
  close_time time WITHOUT TIME ZONE,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (day_of_week)
);

ALTER TABLE public.store_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view store schedule"
  ON public.store_schedule FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage store schedule"
  ON public.store_schedule FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.store_schedule (day_of_week, open_time, close_time, is_closed) VALUES
  (0, '18:00', '23:00', false),
  (1, '18:00', '23:00', false),
  (2, '18:00', '23:00', false),
  (3, '18:00', '23:00', false),
  (4, '18:00', '23:00', false),
  (5, '18:00', '23:00', false),
  (6, '18:00', '23:00', false);

ALTER PUBLICATION supabase_realtime ADD TABLE public.store_schedule;