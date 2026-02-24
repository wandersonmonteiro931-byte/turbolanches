
-- Add timestamp columns for kitchen tracking
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preparing_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at timestamp with time zone DEFAULT NULL;

-- Allow admins to view profiles (needed for receipts and order management)
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix order stuck in 'accepted' status - move to 'preparing'
UPDATE public.orders SET status = 'preparing' WHERE status = 'accepted';
