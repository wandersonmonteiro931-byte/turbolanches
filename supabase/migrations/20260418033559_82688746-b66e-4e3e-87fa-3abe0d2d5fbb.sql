ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS expense_ads_external numeric NOT NULL DEFAULT 0;