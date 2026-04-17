
CREATE TABLE public.cash_registers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  business_day DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),

  -- Opening
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_by UUID NOT NULL,
  opening_cash NUMERIC NOT NULL DEFAULT 0,
  opening_card NUMERIC NOT NULL DEFAULT 0,
  opening_change_reserve NUMERIC NOT NULL DEFAULT 0,

  -- Closing
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  expense_employees NUMERIC NOT NULL DEFAULT 0,
  expense_couriers NUMERIC NOT NULL DEFAULT 0,
  expense_purchases NUMERIC NOT NULL DEFAULT 0,
  expense_gasoline NUMERIC NOT NULL DEFAULT 0,
  expense_other NUMERIC NOT NULL DEFAULT 0,
  closing_pix NUMERIC NOT NULL DEFAULT 0,
  closing_card NUMERIC NOT NULL DEFAULT 0,
  closing_cash NUMERIC NOT NULL DEFAULT 0,

  -- Reopen tracking
  reopen_count INTEGER NOT NULL DEFAULT 0,
  last_reopened_at TIMESTAMPTZ,

  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(store_id, business_day)
);

CREATE INDEX idx_cash_registers_store_day ON public.cash_registers(store_id, business_day DESC);
CREATE INDEX idx_cash_registers_status ON public.cash_registers(status);

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cash registers"
ON public.cash_registers
FOR ALL
TO authenticated
USING (admin_owns_store_row(store_id))
WITH CHECK (admin_owns_store_row(store_id));

CREATE TRIGGER update_cash_registers_updated_at
BEFORE UPDATE ON public.cash_registers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log for reopens
CREATE TABLE public.cash_register_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_register_id UUID NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('open','close','reopen')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by UUID NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_cash_register_events_register ON public.cash_register_events(cash_register_id, event_at DESC);

ALTER TABLE public.cash_register_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cash register events"
ON public.cash_register_events
FOR ALL
TO authenticated
USING (admin_owns_store_row(store_id))
WITH CHECK (admin_owns_store_row(store_id));
