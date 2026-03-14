
CREATE TABLE public.receipt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type text NOT NULL UNIQUE,
  store_name text NOT NULL DEFAULT 'TURBO LANCHES',
  label text NOT NULL DEFAULT '',
  custom_message text NOT NULL DEFAULT '',
  footer_message text NOT NULL DEFAULT '',
  show_customer_code boolean NOT NULL DEFAULT true,
  show_max_delivery_time boolean NOT NULL DEFAULT true,
  show_driver_field boolean NOT NULL DEFAULT true,
  show_troco boolean NOT NULL DEFAULT true,
  show_obs boolean NOT NULL DEFAULT true,
  show_payment_info boolean NOT NULL DEFAULT true,
  show_totals_detail boolean NOT NULL DEFAULT true,
  items_font_size integer NOT NULL DEFAULT 14,
  label_font_size integer NOT NULL DEFAULT 24,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.receipt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage receipt templates" ON public.receipt_templates
  FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view receipt templates" ON public.receipt_templates
  FOR SELECT TO public USING (true);

INSERT INTO public.receipt_templates (template_type, label, custom_message, footer_message, show_driver_field) VALUES
  ('cozinha', 'COZINHA', '', '', false),
  ('entrega', 'ENTREGA', '', '', true),
  ('cliente', 'OBRIGADO!', '[NOME], seu pedido foi preparado com muito carinho e higiene!', 'Agradecemos a preferência!', false);
