
CREATE OR REPLACE FUNCTION public.create_scratch_coupon(
  _code text,
  _type text,
  _value numeric,
  _expires_at timestamptz,
  _store_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.coupons (code, type, value, active, max_uses, max_uses_per_customer, starts_at, expires_at, first_purchase_only, store_id)
  VALUES (_code, _type, _value, true, 1, 1, now(), _expires_at, false, _store_id);
END;
$$;
