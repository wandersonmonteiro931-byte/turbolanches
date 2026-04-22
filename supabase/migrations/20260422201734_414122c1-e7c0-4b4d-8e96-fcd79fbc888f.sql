CREATE OR REPLACE FUNCTION public.set_default_store_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  store_count int;
  only_store uuid;
BEGIN
  IF NEW.store_id IS NULL THEN
    SELECT COUNT(*), (array_agg(id))[1]
    INTO store_count, only_store
    FROM public.stores;

    IF store_count = 1 THEN
      NEW.store_id := only_store;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;