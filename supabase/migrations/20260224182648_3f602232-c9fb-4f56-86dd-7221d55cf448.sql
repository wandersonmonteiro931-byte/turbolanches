
-- Add payment_confirmed flag to orders (for manual PIX confirmation and fiado)
ALTER TABLE public.orders ADD COLUMN payment_confirmed boolean NOT NULL DEFAULT false;
