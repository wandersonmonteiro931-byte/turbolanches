
-- Update RLS policies to filter by store_id for multi-tenant isolation

-- Helper: check if admin belongs to the store
CREATE OR REPLACE FUNCTION public.admin_owns_store_row(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND (store_id = _store_id OR _store_id IS NULL)
  )
$$;

-- PRODUCTS: update admin policies to filter by store_id
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;

CREATE POLICY "Admins can insert products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.admin_owns_store_row(store_id));
CREATE POLICY "Admins can update products" ON public.products FOR UPDATE TO authenticated
  USING (public.admin_owns_store_row(store_id));
CREATE POLICY "Admins can delete products" ON public.products FOR DELETE TO authenticated
  USING (public.admin_owns_store_row(store_id));

-- CATEGORIES
DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;

CREATE POLICY "Admins can insert categories" ON public.categories FOR INSERT TO authenticated
  WITH CHECK (public.admin_owns_store_row(store_id));
CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE TO authenticated
  USING (public.admin_owns_store_row(store_id));
CREATE POLICY "Admins can delete categories" ON public.categories FOR DELETE TO authenticated
  USING (public.admin_owns_store_row(store_id));

-- BANNERS
DROP POLICY IF EXISTS "Admins can manage banners" ON public.banners;
CREATE POLICY "Admins can manage banners" ON public.banners FOR ALL TO authenticated
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));

-- ORDERS: admin policies filter by store_id
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON public.orders;

CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT
  USING (public.admin_owns_store_row(store_id));
CREATE POLICY "Admins can update all orders" ON public.orders FOR UPDATE
  USING (public.admin_owns_store_row(store_id));

-- ORDER_ITEMS: keep existing policies (they reference orders table)

-- DELIVERY_ZONES
DROP POLICY IF EXISTS "Admins can manage delivery zones" ON public.delivery_zones;
CREATE POLICY "Admins can manage delivery zones" ON public.delivery_zones FOR ALL
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));

-- COUPONS
DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
CREATE POLICY "Admins can manage coupons" ON public.coupons FOR ALL TO authenticated
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));

-- PRODUCT_ADDONS
DROP POLICY IF EXISTS "Admins can manage addons" ON public.product_addons;
CREATE POLICY "Admins can manage addons" ON public.product_addons FOR ALL
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));

-- ADDON_PRODUCT_LINKS
DROP POLICY IF EXISTS "Admins can manage addon links" ON public.addon_product_links;
CREATE POLICY "Admins can manage addon links" ON public.addon_product_links FOR ALL
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));

-- STORE_SETTINGS
DROP POLICY IF EXISTS "Admins can update store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins can insert store settings" ON public.store_settings;

CREATE POLICY "Admins can update store settings" ON public.store_settings FOR UPDATE
  USING (public.admin_owns_store_row(store_id));
CREATE POLICY "Admins can insert store settings" ON public.store_settings FOR INSERT
  WITH CHECK (public.admin_owns_store_row(store_id));

-- STORE_SCHEDULE
DROP POLICY IF EXISTS "Admins can manage store schedule" ON public.store_schedule;
CREATE POLICY "Admins can manage store schedule" ON public.store_schedule FOR ALL TO authenticated
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));

-- SITE_CONTENT
DROP POLICY IF EXISTS "Admins can manage site content" ON public.site_content;
CREATE POLICY "Admins can manage site content" ON public.site_content FOR ALL
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));

-- RECEIPT_TEMPLATES
DROP POLICY IF EXISTS "Admins can manage receipt templates" ON public.receipt_templates;
CREATE POLICY "Admins can manage receipt templates" ON public.receipt_templates FOR ALL
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));

-- DAILY_REPORTS
DROP POLICY IF EXISTS "Admins can manage daily reports" ON public.daily_reports;
CREATE POLICY "Admins can manage daily reports" ON public.daily_reports FOR ALL
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));

-- PUSH_TEMPLATES
DROP POLICY IF EXISTS "Admin full access on push_templates" ON public.push_templates;
CREATE POLICY "Admin full access on push_templates" ON public.push_templates FOR ALL
  USING (public.admin_owns_store_row(store_id))
  WITH CHECK (public.admin_owns_store_row(store_id));

-- PUSH_NOTIFICATIONS (no store_id, keep as is)
-- PUSH_SUBSCRIPTIONS (no store_id, keep as is)
-- PUSH_VAPID_KEYS (no store_id, keep as is)
-- PROFILES (no store_id, keep as is)
-- CUSTOMER_ADDRESSES (no store_id, keep as is)
-- REVIEWS (no store_id, keep as is)
-- USER_ROLES (keep as is - managed by super admin)
-- STORES (keep as is)
