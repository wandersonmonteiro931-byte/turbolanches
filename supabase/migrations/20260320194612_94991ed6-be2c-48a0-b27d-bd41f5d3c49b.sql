
-- Add new columns to reviews table
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS visible boolean DEFAULT true;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS admin_response text DEFAULT '';
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id);

-- Allow admins to update reviews (for visibility toggle and responses)
CREATE POLICY "Admins can update reviews"
ON public.reviews
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all reviews
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
CREATE POLICY "Anyone can view visible reviews"
ON public.reviews
FOR SELECT
USING (visible = true);

CREATE POLICY "Admins can view all reviews"
ON public.reviews
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own reviews (even hidden)
CREATE POLICY "Users can view own reviews"
ON public.reviews
FOR SELECT
USING (auth.uid() = user_id);
