
-- Função que sincroniza amount_paid_* com base no payment_method e total.
-- Para pagamentos únicos (pix, cartao, dinheiro), garante que o valor pago
-- corresponda ao total, evitando inconsistências no fechamento de caixa.
-- Pagamentos mistos (payment_method = 'misto') NÃO são tocados.
CREATE OR REPLACE FUNCTION public.sync_order_amount_paid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pm text;
  total_val numeric;
BEGIN
  pm := lower(coalesce(NEW.payment_method, ''));
  total_val := coalesce(NEW.total, 0);

  -- Pagamentos mistos: não interferir
  IF pm = 'misto' THEN
    RETURN NEW;
  END IF;

  -- Pagamentos únicos: zera os outros e seta o correto
  IF pm IN ('pix') THEN
    NEW.amount_paid_pix  := total_val;
    NEW.amount_paid_card := 0;
    NEW.amount_paid_cash := 0;
  ELSIF pm IN ('cartao', 'card', 'credit', 'debit', 'credito', 'debito') THEN
    NEW.amount_paid_card := total_val;
    NEW.amount_paid_pix  := 0;
    NEW.amount_paid_cash := 0;
  ELSIF pm IN ('dinheiro', 'cash') THEN
    NEW.amount_paid_cash := total_val;
    NEW.amount_paid_pix  := 0;
    NEW.amount_paid_card := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_order_amount_paid_trigger ON public.orders;
CREATE TRIGGER sync_order_amount_paid_trigger
BEFORE INSERT OR UPDATE OF payment_method, total ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_amount_paid();

-- Backfill: corrige pedidos existentes que estão dessincronizados
UPDATE public.orders
SET payment_method = payment_method
WHERE lower(coalesce(payment_method,'')) != 'misto';
