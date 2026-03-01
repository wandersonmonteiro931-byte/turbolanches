
CREATE TABLE public.push_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_status TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.push_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on push_templates" ON public.push_templates FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can read push_templates" ON public.push_templates FOR SELECT USING (true);

-- Default templates
INSERT INTO public.push_templates (trigger_status, title, body) VALUES
  ('accepted', '✅ Pedido Aceito!', '{nome}, seu pedido #{pedido} foi aceito e logo será preparado!'),
  ('preparing', '👨‍🍳 Em Preparo!', '{nome}, seu pedido #{pedido} está sendo preparado com carinho!'),
  ('ready', '🎉 Pedido Pronto!', '{nome}, seu pedido #{pedido} está prontinho!'),
  ('delivering', '🛵 Saiu para Entrega!', '{nome}, seu pedido #{pedido} saiu para entrega! Fique atento!'),
  ('delivered', '📦 Entregue!', '{nome}, seu pedido #{pedido} foi entregue. Bom apetite!'),
  ('cancelled', '❌ Pedido Cancelado', '{nome}, infelizmente seu pedido #{pedido} foi cancelado.');
