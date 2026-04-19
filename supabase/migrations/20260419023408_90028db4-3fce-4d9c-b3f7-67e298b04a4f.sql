ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS expense_employees_paid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expense_couriers_paid  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expense_purchases_paid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expense_gasoline_paid  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expense_ads_paid       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expense_other_paid     boolean NOT NULL DEFAULT true;