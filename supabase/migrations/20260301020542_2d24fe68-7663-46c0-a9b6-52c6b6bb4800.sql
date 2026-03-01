
-- Allow users to delete their own order_items for pending orders
CREATE POLICY "Users can delete their own order items for pending orders"
  ON public.order_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
        AND orders.user_id = auth.uid()
        AND orders.status = 'pending'
    )
  );

-- Allow users to delete their own pending orders
CREATE POLICY "Users can delete their own pending orders"
  ON public.orders FOR DELETE
  USING (
    auth.uid() = user_id
    AND status = 'pending'
  );
