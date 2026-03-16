
INSERT INTO public.coupons (code, type, value, active, max_uses, max_uses_per_customer, starts_at, expires_at, first_purchase_only, store_id)
VALUES ('PRESENTE-Y9DRUQ', 'fixed', 15, true, 1, 1, now(), '2026-03-23 03:23:46.291+00'::timestamptz, false, NULL)
ON CONFLICT DO NOTHING;
