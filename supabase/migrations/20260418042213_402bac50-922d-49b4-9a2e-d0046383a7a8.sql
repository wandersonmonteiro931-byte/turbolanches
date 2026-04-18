ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS change_given_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_given_method text NOT NULL DEFAULT 'pix';

CREATE OR REPLACE FUNCTION public.validate_cash_register_payment_methods()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.expense_employees_method NOT IN ('cash','pix','card') OR
     NEW.expense_couriers_method  NOT IN ('cash','pix','card') OR
     NEW.expense_purchases_method NOT IN ('cash','pix','card') OR
     NEW.expense_gasoline_method  NOT IN ('cash','pix','card') OR
     NEW.expense_ads_method       NOT IN ('cash','pix','card') OR
     NEW.expense_other_method     NOT IN ('cash','pix','card') OR
     NEW.change_given_method      NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'payment_method inválido';
  END IF;
  RETURN NEW;
END;
$function$;