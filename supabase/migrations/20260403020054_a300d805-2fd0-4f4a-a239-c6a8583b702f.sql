
CREATE TABLE public.report_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id),
  category TEXT NOT NULL DEFAULT 'outros',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.report_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage report expenses"
ON public.report_expenses
FOR ALL
USING (admin_owns_store_row(store_id))
WITH CHECK (admin_owns_store_row(store_id));

CREATE POLICY "Anyone can view report expenses"
ON public.report_expenses
FOR SELECT
USING (true);

CREATE TRIGGER update_report_expenses_updated_at
BEFORE UPDATE ON public.report_expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
