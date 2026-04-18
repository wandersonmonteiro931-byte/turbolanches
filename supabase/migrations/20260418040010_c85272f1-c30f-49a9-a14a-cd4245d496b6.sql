ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS gross_cash numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_pix numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_card numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS declared_gross_cash numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS declared_gross_pix numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS declared_gross_card numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_cash numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_pix numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_card numeric NOT NULL DEFAULT 0;