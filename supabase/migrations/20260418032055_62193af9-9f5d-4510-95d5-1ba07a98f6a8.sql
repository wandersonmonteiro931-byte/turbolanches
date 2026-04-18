-- Métodos de pagamento por categoria de gasto (default 'cash' para compatibilidade)
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS expense_employees_method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS expense_couriers_method  text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS expense_purchases_method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS expense_gasoline_method  text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS expense_ads_method       text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS expense_other_method     text NOT NULL DEFAULT 'cash';

-- Abertura PIX (cash e card já existem)
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS opening_pix numeric NOT NULL DEFAULT 0;

-- Esperado / Declarado / Diferença por tipo
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS expected_cash   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_pix    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_card   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS declared_cash   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS declared_pix    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS declared_card   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difference_cash numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difference_pix  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difference_card numeric NOT NULL DEFAULT 0;

-- Totais consolidados
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS total_sales    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_expenses numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_profit   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_profit     numeric NOT NULL DEFAULT 0;

-- Validação de payment_method por trigger (CHECK seria suficiente, mas evitamos por flexibilidade)
CREATE OR REPLACE FUNCTION public.validate_cash_register_payment_methods()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expense_employees_method NOT IN ('cash','pix','card') OR
     NEW.expense_couriers_method  NOT IN ('cash','pix','card') OR
     NEW.expense_purchases_method NOT IN ('cash','pix','card') OR
     NEW.expense_gasoline_method  NOT IN ('cash','pix','card') OR
     NEW.expense_ads_method       NOT IN ('cash','pix','card') OR
     NEW.expense_other_method     NOT IN ('cash','pix','card') THEN
    RAISE EXCEPTION 'payment_method inválido: use cash, pix ou card';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_cash_register_payment_methods_trg ON public.cash_registers;
CREATE TRIGGER validate_cash_register_payment_methods_trg
BEFORE INSERT OR UPDATE ON public.cash_registers
FOR EACH ROW EXECUTE FUNCTION public.validate_cash_register_payment_methods();