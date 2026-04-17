CREATE POLICY "Users can cancel their own pending orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND status IN ('pending', 'paid', 'awaiting_payment')
)
WITH CHECK (
  auth.uid() = user_id
  AND status = 'cancelled'
);