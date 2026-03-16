
CREATE OR REPLACE FUNCTION public.increment_coupon_used_count(_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.coupons
  SET used_count = used_count + 1, updated_at = now()
  WHERE code = _code;
END;
$$;
