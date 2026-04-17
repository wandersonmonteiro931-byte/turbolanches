UPDATE public.orders SET store_id = '47e963de-851f-4cc3-ac8a-15f902a7570b' WHERE store_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_default_store_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  store_count int;
  only_store uuid;
BEGIN
  IF NEW.store_id IS NULL THEN
    SELECT COUNT(*), MIN(id) INTO store_count, only_store FROM public.stores;
    IF store_count = 1 THEN
      NEW.store_id := only_store;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_default_store_id ON public.orders;
CREATE TRIGGER orders_set_default_store_id
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_default_store_id();