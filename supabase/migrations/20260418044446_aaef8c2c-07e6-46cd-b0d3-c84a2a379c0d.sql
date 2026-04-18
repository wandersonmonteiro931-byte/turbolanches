-- 1. Adicionar campos de pagamento detalhado em orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS amount_paid_cash numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid_pix numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid_card numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_given_cash numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_given_pix numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_given_card numeric NOT NULL DEFAULT 0;

-- 2. Backfill automático: pedidos antigos recebem amount_paid_<método> = total
-- Mapear payment_method para os campos detalhados
UPDATE public.orders
SET amount_paid_cash = total
WHERE amount_paid_cash = 0
  AND amount_paid_pix = 0
  AND amount_paid_card = 0
  AND payment_method IN ('cash', 'dinheiro');

UPDATE public.orders
SET amount_paid_pix = total
WHERE amount_paid_cash = 0
  AND amount_paid_pix = 0
  AND amount_paid_card = 0
  AND payment_method = 'pix';

UPDATE public.orders
SET amount_paid_card = total
WHERE amount_paid_cash = 0
  AND amount_paid_pix = 0
  AND amount_paid_card = 0
  AND payment_method IN ('card', 'cartao', 'credit', 'debit', 'credito', 'debito');

-- Pedidos com payment_method desconhecido: assume dinheiro
UPDATE public.orders
SET amount_paid_cash = total
WHERE amount_paid_cash = 0
  AND amount_paid_pix = 0
  AND amount_paid_card = 0;

-- 3. Backfill do troco antigo: change_for vira change_given_cash (quando aplicável)
UPDATE public.orders
SET change_given_cash = GREATEST(COALESCE(change_for, 0) - total, 0)
WHERE payment_method IN ('cash', 'dinheiro')
  AND change_for IS NOT NULL
  AND change_for > total
  AND change_given_cash = 0;

-- Ajustar amount_paid_cash para refletir o valor entregue (quando há change_for)
UPDATE public.orders
SET amount_paid_cash = change_for
WHERE payment_method IN ('cash', 'dinheiro')
  AND change_for IS NOT NULL
  AND change_for > total
  AND amount_paid_cash = total;

-- 4. Remover campos de troco manual do fechamento de caixa
-- (agora o troco é registrado por pedido, não no fechamento)
ALTER TABLE public.cash_registers
  DROP COLUMN IF EXISTS change_given_amount,
  DROP COLUMN IF EXISTS change_given_method;

-- 5. Atualizar trigger de validação de payment_methods (remover change_given_method)
CREATE OR REPLACE FUNCTION public.validate_cash_register_payment_methods()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.expense_employees_method NOT IN ('cash','pix','card') OR
     NEW.expense_couriers_method  NOT IN ('cash','pix','card') OR
     NEW.expense_purchases_method NOT IN ('cash','pix','card') OR
     NEW.expense_gasoline_method  NOT IN ('cash','pix','card') OR
     NEW.expense_ads_method       NOT IN ('cash','pix','card') OR
     NEW.expense_other_method     NOT IN ('cash','pix','card') THEN
    RAISE EXCEPTION 'payment_method inválido';
  END IF;
  RETURN NEW;
END;
$function$;