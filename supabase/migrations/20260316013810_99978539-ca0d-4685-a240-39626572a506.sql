
-- Scratch card settings (one row per store)
CREATE TABLE public.scratch_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id),
  is_enabled boolean NOT NULL DEFAULT false,
  min_order_value numeric NOT NULL DEFAULT 30,
  fallback_message text NOT NULL DEFAULT 'Infelizmente os prêmios acabaram! Tente na próxima promoção.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scratch_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view scratch settings" ON public.scratch_settings
  FOR SELECT TO public USING (true);

CREATE POLICY "Admins can manage scratch settings" ON public.scratch_settings
  FOR ALL TO authenticated
  USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

-- Scratch prizes (coupon templates)
CREATE TABLE public.scratch_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id),
  name text NOT NULL,
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  total_quantity integer NOT NULL DEFAULT 0,
  remaining_quantity integer NOT NULL DEFAULT 0,
  validity_days integer NOT NULL DEFAULT 7,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scratch_prizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active prizes" ON public.scratch_prizes
  FOR SELECT TO public USING (true);

CREATE POLICY "Admins can manage prizes" ON public.scratch_prizes
  FOR ALL TO authenticated
  USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

-- Scratch wins (records of user wins)
CREATE TABLE public.scratch_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prize_id uuid REFERENCES public.scratch_prizes(id),
  order_id uuid REFERENCES public.orders(id),
  store_id uuid REFERENCES public.stores(id),
  coupon_code text NOT NULL,
  discount_type text NOT NULL,
  discount_value numeric NOT NULL,
  found_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_order_id uuid REFERENCES public.orders(id),
  no_prize boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scratch_wins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wins" ON public.scratch_wins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wins" ON public.scratch_wins
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all wins" ON public.scratch_wins
  FOR SELECT TO authenticated USING (admin_owns_store_row(store_id));

CREATE POLICY "Admins can update wins" ON public.scratch_wins
  FOR UPDATE TO authenticated USING (admin_owns_store_row(store_id));

-- Update trigger for scratch_settings
CREATE TRIGGER update_scratch_settings_updated_at
  BEFORE UPDATE ON public.scratch_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update trigger for scratch_prizes
CREATE TRIGGER update_scratch_prizes_updated_at
  BEFORE UPDATE ON public.scratch_prizes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
