-- 1) Allow 'unpaid' as a valid payment method on cash_registers
CREATE OR REPLACE FUNCTION public.validate_cash_register_payment_methods()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.expense_employees_method NOT IN ('cash','pix','card','unpaid') OR
     NEW.expense_couriers_method  NOT IN ('cash','pix','card','unpaid') OR
     NEW.expense_purchases_method NOT IN ('cash','pix','card','unpaid') OR
     NEW.expense_gasoline_method  NOT IN ('cash','pix','card','unpaid') OR
     NEW.expense_ads_method       NOT IN ('cash','pix','card','unpaid') OR
     NEW.expense_other_method     NOT IN ('cash','pix','card','unpaid') THEN
    RAISE EXCEPTION 'payment_method inválido';
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Create the unpaid_expenses table
CREATE TABLE IF NOT EXISTS public.unpaid_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID,
  category TEXT NOT NULL DEFAULT 'outros',
  name TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'cash_register' | 'report_expenses'
  source_ref UUID,
  registered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMP WITH TIME ZONE,
  paid_method TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.unpaid_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage unpaid expenses"
ON public.unpaid_expenses
FOR ALL
TO authenticated
USING (admin_owns_store_row(store_id))
WITH CHECK (admin_owns_store_row(store_id));

CREATE TRIGGER unpaid_expenses_set_updated_at
BEFORE UPDATE ON public.unpaid_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER unpaid_expenses_set_default_store_id
BEFORE INSERT ON public.unpaid_expenses
FOR EACH ROW EXECUTE FUNCTION public.set_default_store_id();

CREATE INDEX IF NOT EXISTS idx_unpaid_expenses_store_paid
ON public.unpaid_expenses (store_id, paid, registered_at DESC);