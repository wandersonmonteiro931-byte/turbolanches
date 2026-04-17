DO $$
DECLARE v_store uuid;
BEGIN
  SELECT id INTO v_store FROM public.stores ORDER BY created_at LIMIT 1;
  IF v_store IS NULL THEN RETURN; END IF;

  UPDATE public.categories SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.products SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.product_addons SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.addon_product_links SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.product_ingredients SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.ingredients SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.product_combo_items SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.banners SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.delivery_zones SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.coupons SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.couriers SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.courier_daily_fees SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.scratch_prizes SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.scratch_settings SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.scratch_wins SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.site_content SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.store_schedule SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.store_settings SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.receipt_templates SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.push_templates SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.storage_configs SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.brands SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.extra_costs SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.report_expenses SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.daily_reports SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.orders SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.reviews SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.cash_registers SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.cash_register_events SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.restock_lists SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.restock_items SET store_id = v_store WHERE store_id IS NULL;
  UPDATE public.saved_labels SET store_id = v_store WHERE store_id IS NULL;
END $$;