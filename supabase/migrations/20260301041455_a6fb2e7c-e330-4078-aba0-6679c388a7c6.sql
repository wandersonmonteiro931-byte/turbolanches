INSERT INTO public.push_templates (trigger_status, title, body, active)
SELECT 'pending', '📋 Pedido Recebido!', 'Olá {nome}! Seu pedido #{pedido} foi recebido e está aguardando confirmação.', true
WHERE NOT EXISTS (SELECT 1 FROM public.push_templates WHERE trigger_status = 'pending');

INSERT INTO public.push_templates (trigger_status, title, body, active)
SELECT 'paid', '✅ Pagamento Confirmado!', 'Olá {nome}! O pagamento do pedido #{pedido} foi confirmado com sucesso!', true
WHERE NOT EXISTS (SELECT 1 FROM public.push_templates WHERE trigger_status = 'paid');