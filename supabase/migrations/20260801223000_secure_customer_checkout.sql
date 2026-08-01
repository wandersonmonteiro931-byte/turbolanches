-- Turbo Lanches - Checkout seguro para pedidos de clientes
-- O navegador informa apenas IDs e quantidades. Preços, adicionais, cupom,
-- entrega e total são recalculados dentro do banco antes da criação do pedido.

CREATE OR REPLACE FUNCTION public.create_secure_customer_order(
  _store_id uuid,
  _items jsonb,
  _delivery_type text,
  _payment_method text,
  _coupon_code text DEFAULT NULL,
  _observations text DEFAULT NULL,
  _change_for numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_store public.stores%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_settings public.store_settings%ROWTYPE;
  v_zone public.delivery_zones%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_addon public.product_addons%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_addon_input jsonb;
  v_computed_items jsonb := '[]'::jsonb;
  v_addons_json jsonb;
  v_quantity integer;
  v_addon_quantity integer;
  v_addon_total numeric(12,2);
  v_unit_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_coupon_code text := NULLIF(upper(btrim(COALESCE(_coupon_code, ''))), '');
  v_delivery_db text;
  v_payment_db text;
  v_order_count integer;
  v_customer_coupon_uses integer;
  v_scratch_redeemed_at timestamptz;
  v_is_scratch boolean := false;
  v_quadra_lote text;
  v_change_for numeric(12,2) := greatest(COALESCE(_change_for, 0), 0);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Faça login para finalizar o pedido';
  END IF;

  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'Loja não identificada';
  END IF;

  SELECT * INTO v_store
  FROM public.stores
  WHERE id = _store_id AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loja não encontrada ou indisponível';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF NOT FOUND OR btrim(COALESCE(v_profile.full_name, '')) = '' OR btrim(COALESCE(v_profile.phone, '')) = '' THEN
    RAISE EXCEPTION 'Complete seu nome e telefone antes de finalizar o pedido';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'O carrinho está vazio';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Quantidade de itens acima do permitido';
  END IF;

  v_delivery_db := CASE lower(COALESCE(_delivery_type, ''))
    WHEN 'delivery' THEN 'delivery'
    WHEN 'pickup' THEN 'retirada'
    WHEN 'retirada' THEN 'retirada'
    ELSE NULL
  END;
  IF v_delivery_db IS NULL THEN RAISE EXCEPTION 'Tipo de entrega inválido'; END IF;

  v_payment_db := CASE lower(COALESCE(_payment_method, ''))
    WHEN 'pix' THEN 'pix'
    WHEN 'dinheiro' THEN 'dinheiro'
    WHEN 'cash' THEN 'dinheiro'
    WHEN 'cartao' THEN 'cartao'
    WHEN 'card' THEN 'cartao'
    ELSE NULL
  END;
  IF v_payment_db IS NULL THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    BEGIN
      v_quantity := (v_item->>'quantity')::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Quantidade de produto inválida';
    END;

    IF v_quantity < 1 OR v_quantity > 50 THEN
      RAISE EXCEPTION 'A quantidade de cada produto deve estar entre 1 e 50';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
      AND store_id = _store_id
      AND active = true
      AND price >= 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Um produto do carrinho não está mais disponível';
    END IF;

    v_addons_json := '[]'::jsonb;
    v_addon_total := 0;

    IF jsonb_typeof(COALESCE(v_item->'addons', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'Lista de adicionais inválida';
    END IF;

    FOR v_addon_input IN SELECT value FROM jsonb_array_elements(COALESCE(v_item->'addons', '[]'::jsonb))
    LOOP
      BEGIN
        v_addon_quantity := COALESCE((v_addon_input->>'quantity')::integer, 1);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Quantidade de adicional inválida';
      END;

      IF v_addon_quantity < 1 OR v_addon_quantity > 20 THEN
        RAISE EXCEPTION 'A quantidade de cada adicional deve estar entre 1 e 20';
      END IF;

      SELECT * INTO v_addon
      FROM public.product_addons a
      WHERE a.id = (v_addon_input->>'id')::uuid
        AND a.store_id = _store_id
        AND a.active = true
        AND a.price >= 0
        AND COALESCE(a.is_internal, false) = false
        AND (
          COALESCE(a.apply_to_all, false) = true
          OR a.product_id = v_product.id
          OR EXISTS (
            SELECT 1
            FROM public.addon_product_links l
            WHERE l.addon_id = a.id
              AND l.product_id = v_product.id
              AND (l.store_id IS NULL OR l.store_id = _store_id)
          )
        );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um adicional do carrinho não está disponível para este produto';
      END IF;

      v_addon_total := v_addon_total + round(v_addon.price * v_addon_quantity, 2);
      v_addons_json := v_addons_json || jsonb_build_array(jsonb_build_object(
        'id', v_addon.id,
        'name', v_addon.name,
        'price', v_addon.price,
        'quantity', v_addon_quantity
      ));
    END LOOP;

    v_unit_price := round(v_product.price + v_addon_total, 2);
    v_subtotal := v_subtotal + round(v_unit_price * v_quantity, 2);

    v_computed_items := v_computed_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'product_code', v_product.product_code,
      'quantity', v_quantity,
      'unit_price', v_unit_price,
      'observations', NULLIF(left(btrim(COALESCE(v_item->>'observations', '')), 1000), ''),
      'addons_json', v_addons_json
    ));
  END LOOP;

  v_subtotal := round(v_subtotal, 2);
  IF v_subtotal <= 0 THEN RAISE EXCEPTION 'Total do carrinho inválido'; END IF;

  SELECT * INTO v_settings
  FROM public.store_settings
  WHERE store_id = _store_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_delivery_db = 'delivery' THEN
    IF btrim(COALESCE(v_profile.street, '')) = ''
       OR btrim(COALESCE(v_profile.number, '')) = ''
       OR btrim(COALESCE(v_profile.neighborhood, '')) = '' THEN
      RAISE EXCEPTION 'Complete o endereço antes de pedir entrega';
    END IF;

    SELECT * INTO v_zone
    FROM public.delivery_zones
    WHERE store_id = _store_id
      AND active = true
      AND lower(btrim(neighborhood)) = lower(btrim(v_profile.neighborhood))
    ORDER BY created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A loja não entrega no seu bairro';
    END IF;

    IF COALESCE(v_settings.max_serving_km_active, false)
       AND v_settings.max_serving_km IS NOT NULL
       AND v_zone.distance_km IS NOT NULL
       AND v_zone.distance_km > v_settings.max_serving_km THEN
      RAISE EXCEPTION 'Seu endereço está fora da área máxima de entrega';
    END IF;

    IF COALESCE(v_zone.temp_free_delivery, false)
       OR COALESCE(v_settings.temp_free_delivery_all, false)
       OR (COALESCE(v_settings.free_delivery_max_km, 0) > 0
           AND v_zone.distance_km IS NOT NULL
           AND v_zone.distance_km <= v_settings.free_delivery_max_km)
       OR (COALESCE(v_settings.free_delivery_min_order, 0) > 0
           AND v_subtotal >= v_settings.free_delivery_min_order) THEN
      v_delivery_fee := 0;
    ELSE
      v_delivery_fee := round(COALESCE(v_zone.delivery_fee, 0), 2);
    END IF;
  END IF;

  IF v_coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE store_id = _store_id
      AND upper(btrim(code)) = v_coupon_code
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Cupom não encontrado'; END IF;
    IF NOT v_coupon.active THEN RAISE EXCEPTION 'Este cupom está inativo'; END IF;
    IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now() THEN RAISE EXCEPTION 'Este cupom ainda não está válido'; END IF;
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN RAISE EXCEPTION 'Este cupom expirou'; END IF;
    IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN RAISE EXCEPTION 'Cupom esgotado'; END IF;
    IF COALESCE(v_coupon.min_order, 0) > v_subtotal THEN RAISE EXCEPTION 'O pedido não atingiu o valor mínimo do cupom'; END IF;

    SELECT count(*) INTO v_order_count
    FROM public.orders
    WHERE user_id = v_user_id
      AND store_id = _store_id
      AND status <> 'cancelled';

    IF COALESCE(v_coupon.first_purchase_only, false) AND v_order_count > 0 THEN
      RAISE EXCEPTION 'Cupom válido apenas para a primeira compra';
    END IF;

    SELECT sw.redeemed_at INTO v_scratch_redeemed_at
    FROM public.scratch_wins sw
    WHERE sw.user_id = v_user_id
      AND sw.store_id = _store_id
      AND upper(btrim(sw.coupon_code)) = v_coupon_code
    ORDER BY sw.found_at DESC NULLS LAST, sw.created_at DESC NULLS LAST
    LIMIT 1;

    v_is_scratch := FOUND;
    IF v_is_scratch AND v_scratch_redeemed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Este cupom da raspadinha já foi utilizado';
    END IF;

    SELECT count(*) INTO v_customer_coupon_uses
    FROM public.orders
    WHERE user_id = v_user_id
      AND store_id = _store_id
      AND upper(COALESCE(coupon_code, '')) = v_coupon_code
      AND status <> 'cancelled';

    IF v_is_scratch AND v_customer_coupon_uses >= 1 THEN
      RAISE EXCEPTION 'Este cupom da raspadinha já foi utilizado';
    END IF;

    IF NOT v_is_scratch
       AND v_coupon.max_uses_per_customer IS NOT NULL
       AND v_customer_coupon_uses >= v_coupon.max_uses_per_customer THEN
      RAISE EXCEPTION 'Você atingiu o limite de uso deste cupom';
    END IF;

    IF v_coupon.type = 'percentage' THEN
      v_discount := round(v_subtotal * v_coupon.value / 100, 2);
    ELSE
      v_discount := round(v_coupon.value, 2);
    END IF;
    v_discount := least(greatest(v_discount, 0), v_subtotal);
  END IF;

  v_total := round(greatest(v_subtotal - v_discount, 0) + v_delivery_fee, 2);
  IF v_total <= 0 THEN RAISE EXCEPTION 'O total final do pedido é inválido'; END IF;

  v_quadra_lote := concat_ws(', ',
    NULLIF(CASE WHEN btrim(COALESCE(v_profile.quadra, '')) <> '' THEN 'Qd. ' || btrim(v_profile.quadra) END, ''),
    NULLIF(CASE WHEN btrim(COALESCE(v_profile.lote, '')) <> '' THEN 'Lt. ' || btrim(v_profile.lote) END, '')
  );

  INSERT INTO public.orders (
    user_id, store_id, subtotal, delivery_fee, discount, coupon_code, total,
    status, delivery_type, payment_method, observations, change_for,
    address_street, address_number, address_complement, address_neighborhood,
    change_given_cash, change_given_pix, change_given_card
  ) VALUES (
    v_user_id, _store_id, v_subtotal, v_delivery_fee, v_discount, v_coupon_code, v_total,
    'pending', v_delivery_db, v_payment_db,
    NULLIF(left(btrim(COALESCE(_observations, '')), 2000), ''),
    CASE WHEN v_payment_db = 'dinheiro' AND v_change_for > 0 THEN v_change_for ELSE NULL END,
    CASE WHEN v_delivery_db = 'delivery' THEN v_profile.street ELSE NULL END,
    CASE WHEN v_delivery_db = 'delivery' THEN concat_ws(' - ', NULLIF(v_profile.number, ''), NULLIF(v_quadra_lote, '')) ELSE NULL END,
    CASE WHEN v_delivery_db = 'delivery' THEN v_profile.complement ELSE NULL END,
    CASE WHEN v_delivery_db = 'delivery' THEN v_profile.neighborhood ELSE NULL END,
    CASE WHEN v_payment_db = 'dinheiro' AND v_change_for > v_total THEN v_change_for - v_total ELSE 0 END,
    0,
    0
  )
  RETURNING * INTO v_order;

  IF v_payment_db = 'dinheiro' AND v_change_for > v_total THEN
    UPDATE public.orders
    SET amount_paid_cash = v_change_for
    WHERE id = v_order.id;
  END IF;

  INSERT INTO public.order_items (
    order_id, product_id, product_name, product_code, quantity,
    unit_price, observations, addons_json
  )
  SELECT
    v_order.id,
    (item->>'product_id')::uuid,
    item->>'product_name',
    NULLIF(item->>'product_code', '')::integer,
    (item->>'quantity')::integer,
    (item->>'unit_price')::numeric,
    item->>'observations',
    item->'addons_json'
  FROM jsonb_array_elements(v_computed_items) item;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'subtotal', v_subtotal,
    'delivery_fee', v_delivery_fee,
    'discount', v_discount,
    'total', v_total,
    'coupon_code', v_coupon_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_secure_customer_order(uuid,jsonb,text,text,text,text,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_secure_customer_order(uuid,jsonb,text,text,text,text,numeric) TO authenticated;

-- Clientes não criam mais pedidos/itens diretamente. O checkout seguro acima usa
-- SECURITY DEFINER e mantém as políticas administrativas já existentes.
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create order items for their orders" ON public.order_items;

-- Cancelamento seguro: clientes não atualizam colunas financeiras diretamente.
CREATE OR REPLACE FUNCTION public.cancel_unpaid_pix_order(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = _order_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF v_order.payment_method <> 'pix' THEN RAISE EXCEPTION 'Este pedido não utiliza PIX'; END IF;
  IF v_order.payment_confirmed THEN RAISE EXCEPTION 'O pagamento já foi confirmado'; END IF;
  IF v_order.status NOT IN ('pending','awaiting_payment') THEN
    RAISE EXCEPTION 'O pedido não pode ser cancelado neste status';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled', updated_at = now()
  WHERE id = v_order.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_unpaid_pix_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_unpaid_pix_order(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can cancel their own pending orders" ON public.orders;
DROP POLICY IF EXISTS "Users can cancel own unpaid Pix orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete their own pending orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete their own order items for pending orders" ON public.order_items;
