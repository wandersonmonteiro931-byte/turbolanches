
-- Chaves VAPID
CREATE TABLE public.push_vapid_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.push_vapid_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on push_vapid_keys" ON public.push_vapid_keys FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read vapid public key" ON public.push_vapid_keys FOR SELECT TO authenticated USING (true);

-- Subscriptions dos dispositivos
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on push_subscriptions" ON public.push_subscriptions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users manage own push subscriptions" ON public.push_subscriptions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Histórico de envios
CREATE TABLE public.push_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT DEFAULT '',
  target_type TEXT DEFAULT 'all',
  target_ids UUID[] DEFAULT '{}',
  sent_by UUID NOT NULL,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on push_notifications" ON public.push_notifications FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
