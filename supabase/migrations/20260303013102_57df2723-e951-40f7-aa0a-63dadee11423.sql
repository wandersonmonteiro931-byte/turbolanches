
DROP POLICY "Anyone can view active products" ON public.products;

CREATE POLICY "Anyone can view all products"
ON public.products
FOR SELECT
USING (true);
