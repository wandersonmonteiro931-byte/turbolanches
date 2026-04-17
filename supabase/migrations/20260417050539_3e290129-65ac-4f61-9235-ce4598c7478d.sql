ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS expense_ads numeric NOT NULL DEFAULT 0;