
-- Add customer_code column to profiles
ALTER TABLE public.profiles ADD COLUMN customer_code SERIAL;

-- Create unique index
CREATE UNIQUE INDEX idx_profiles_customer_code ON public.profiles (customer_code);
