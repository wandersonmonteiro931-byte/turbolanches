-- Turbo Lanches - Conta financeira interna por loja
-- Um único PIX Efí da plataforma recebe os pagamentos.
-- Cada pagamento confirmado gera um crédito contábil para a loja correta.
-- O saldo exibido é um saldo a receber, não uma conta bancária ou conta de pagamento.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- Atribui a administração da plataforma ao proprietário da primeira loja existente.
-- Novas lojas não recebem esse privilégio automaticamente.
INSERT INTO public.platform_admins (user_id)
SELECT owner_user_id
FROM public.stores
WHERE owner_user_id IS NOT NULL
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;

DROP POLICY IF EXISTS "Platform admins can view platform admins" ON public.platform_admins;
CREATE POLICY "Platform admins can view platform admins"
ON public.platform_admins FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.platform_finance_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  platform_fee_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK (platform_fee_percent >= 0 AND platform_fee_percent < 100),
  settlement_delay_hours integer NOT NULL DEFAULT 24 CHECK (settlement_delay_hours >= 0 AND settlement_delay_hours <= 2160),
  minimum_withdrawal numeric(12,2) NOT NULL DEFAULT 20 CHECK (minimum_withdrawal >= 0),
  automatic_payout_enabled boolean NOT NULL DEFAULT false,
  automatic_payout_frequency text NOT NULL DEFAULT 'daily' CHECK (automatic_payout_frequency IN ('daily','weekly')),
  payout_description text NOT NULL DEFAULT 'REPASSE TURBO LANCHES',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.platform_finance_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_finance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store admins can view finance settings" ON public.platform_finance_settings;
CREATE POLICY "Store admins can view finance settings"
ON public.platform_finance_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can update finance settings" ON public.platform_finance_settings;
CREATE POLICY "Platform admins can update finance settings"
ON public.platform_finance_settings FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.store_financial_accounts (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_setup' CHECK (status IN ('pending_setup','active','suspended')),
  payout_pix_key_type text CHECK (payout_pix_key_type IS NULL OR payout_pix_key_type IN ('cpf','cnpj','email','phone','random')),
  payout_pix_key text,
  payout_holder_name text,
  payout_holder_document text,
  auto_payout_enabled boolean NOT NULL DEFAULT false,
  auto_payout_frequency text NOT NULL DEFAULT 'manual' CHECK (auto_payout_frequency IN ('manual','daily','weekly')),
  auto_payout_minimum numeric(12,2) NOT NULL DEFAULT 20 CHECK (auto_payout_minimum >= 0),
  last_payout_at timestamptz,
  terms_accepted_at timestamptz,
  terms_accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_financial_accounts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ensure_store_financial_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_financial_accounts (store_id)
  VALUES (NEW.id)
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_store_financial_account_trigger ON public.stores;
CREATE TRIGGER ensure_store_financial_account_trigger
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.ensure_store_financial_account();

INSERT INTO public.store_financial_accounts (store_id)
SELECT id FROM public.stores
ON CONFLICT (store_id) DO NOTHING;

DROP POLICY IF EXISTS "Store admins can view own financial account" ON public.store_financial_accounts;
CREATE POLICY "Store admins can view own financial account"
ON public.store_financial_accounts FOR SELECT TO authenticated
USING (public.admin_owns_store_row(store_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Store admins can update payout settings" ON public.store_financial_accounts;
DROP POLICY IF EXISTS "Platform admins can update financial accounts" ON public.store_financial_accounts;
CREATE POLICY "Platform admins can update financial accounts"
ON public.store_financial_accounts FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

-- Administradores de loja alteram apenas os dados permitidos por esta função.
-- Isso impede reativar uma conta suspensa ou alterar campos de controle financeiro.
CREATE OR REPLACE FUNCTION public.update_store_payout_settings(
  _store_id uuid,
  _pix_key_type text,
  _pix_key text,
  _holder_name text,
  _holder_document text,
  _auto_payout_enabled boolean DEFAULT false,
  _auto_payout_frequency text DEFAULT 'manual',
  _auto_payout_minimum numeric DEFAULT 20,
  _accept_terms boolean DEFAULT false
)
RETURNS public.store_financial_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.store_financial_accounts%ROWTYPE;
  v_document text := regexp_replace(COALESCE(_holder_document, ''), '[^0-9]', '', 'g');
  v_key text := btrim(COALESCE(_pix_key, ''));
  v_holder text := upper(btrim(COALESCE(_holder_name, '')));
  v_frequency text := lower(COALESCE(_auto_payout_frequency, 'manual'));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para configurar os recebimentos'; END IF;
  IF NOT public.admin_owns_store_row(_store_id) AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Você não administra esta loja';
  END IF;
  IF _pix_key_type NOT IN ('cpf','cnpj','email','phone','random') THEN RAISE EXCEPTION 'Tipo de chave PIX inválido'; END IF;
  IF v_key = '' OR length(v_key) > 200 THEN RAISE EXCEPTION 'Chave PIX inválida'; END IF;
  IF v_holder = '' OR length(v_holder) > 200 THEN RAISE EXCEPTION 'Nome do titular inválido'; END IF;
  IF length(v_document) NOT IN (11,14) THEN RAISE EXCEPTION 'Informe CPF ou CNPJ válido do titular'; END IF;
  IF v_frequency NOT IN ('manual','daily','weekly') THEN RAISE EXCEPTION 'Frequência de repasse inválida'; END IF;
  IF NOT COALESCE(_accept_terms, false) THEN RAISE EXCEPTION 'É necessário aceitar os termos de repasse'; END IF;

  SELECT * INTO v_account
  FROM public.store_financial_accounts
  WHERE store_id = _store_id
  FOR UPDATE;

  IF FOUND AND v_account.status = 'suspended' AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'A conta financeira está suspensa. Entre em contato com a plataforma';
  END IF;

  INSERT INTO public.store_financial_accounts (
    store_id, status, payout_pix_key_type, payout_pix_key, payout_holder_name,
    payout_holder_document, auto_payout_enabled, auto_payout_frequency,
    auto_payout_minimum, terms_accepted_at, terms_accepted_by
  ) VALUES (
    _store_id, 'active', _pix_key_type, v_key, v_holder, v_document,
    COALESCE(_auto_payout_enabled, false),
    CASE WHEN COALESCE(_auto_payout_enabled, false) THEN v_frequency ELSE 'manual' END,
    greatest(COALESCE(_auto_payout_minimum, 0), 0), now(), auth.uid()
  )
  ON CONFLICT (store_id) DO UPDATE SET
    status = CASE WHEN store_financial_accounts.status = 'suspended' THEN 'suspended' ELSE 'active' END,
    payout_pix_key_type = EXCLUDED.payout_pix_key_type,
    payout_pix_key = EXCLUDED.payout_pix_key,
    payout_holder_name = EXCLUDED.payout_holder_name,
    payout_holder_document = EXCLUDED.payout_holder_document,
    auto_payout_enabled = EXCLUDED.auto_payout_enabled,
    auto_payout_frequency = EXCLUDED.auto_payout_frequency,
    auto_payout_minimum = EXCLUDED.auto_payout_minimum,
    terms_accepted_at = COALESCE(store_financial_accounts.terms_accepted_at, EXCLUDED.terms_accepted_at),
    terms_accepted_by = COALESCE(store_financial_accounts.terms_accepted_by, EXCLUDED.terms_accepted_by),
    updated_at = now()
  RETURNING * INTO v_account;

  RETURN v_account;
END;
$$;

REVOKE ALL ON FUNCTION public.update_store_payout_settings(uuid,text,text,text,text,boolean,text,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_store_payout_settings(uuid,text,text,text,text,boolean,text,numeric,boolean) TO authenticated;

CREATE TABLE IF NOT EXISTS public.wallet_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  fee_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount numeric(12,2) NOT NULL CHECK (net_amount > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','paid','failed','cancelled')),
  payout_pix_key_type text NOT NULL CHECK (payout_pix_key_type IN ('cpf','cnpj','email','phone','random')),
  payout_pix_key text NOT NULL,
  payout_holder_name text NOT NULL,
  payout_holder_document text NOT NULL,
  id_envio text NOT NULL UNIQUE,
  efi_e2e_id text,
  efi_status text,
  error_message text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processing_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_withdrawals_store_date
ON public.wallet_withdrawal_requests(store_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_withdrawals_status
ON public.wallet_withdrawal_requests(status, requested_at ASC);

ALTER TABLE public.wallet_withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store admins can view own withdrawals" ON public.wallet_withdrawal_requests;
CREATE POLICY "Store admins can view own withdrawals"
ON public.wallet_withdrawal_requests FOR SELECT TO authenticated
USING (public.admin_owns_store_row(store_id) OR public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.store_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  withdrawal_id uuid REFERENCES public.wallet_withdrawal_requests(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('sale_credit','withdrawal_reserve','withdrawal_release','refund_debit','adjustment')),
  amount numeric(12,2) NOT NULL CHECK (amount <> 0),
  gross_amount numeric(12,2),
  fee_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  description text NOT NULL DEFAULT '',
  available_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_store_available
ON public.store_wallet_transactions(store_id, available_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_order
ON public.store_wallet_transactions(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_sale_credit_per_order
ON public.store_wallet_transactions(order_id)
WHERE entry_type = 'sale_credit' AND order_id IS NOT NULL;

ALTER TABLE public.store_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store admins can view own wallet transactions" ON public.store_wallet_transactions;
CREATE POLICY "Store admins can view own wallet transactions"
ON public.store_wallet_transactions FOR SELECT TO authenticated
USING (public.admin_owns_store_row(store_id) OR public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.efi_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  txid text,
  end_to_end_id text,
  amount numeric(12,2),
  event_type text NOT NULL DEFAULT 'pix_received',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.efi_payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view Efí events" ON public.efi_payment_events;
CREATE POLICY "Platform admins can view Efí events"
ON public.efi_payment_events FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE VIEW public.store_wallet_summary
WITH (security_invoker = true)
AS
SELECT
  a.store_id,
  a.status AS account_status,
  a.payout_pix_key_type,
  CASE
    WHEN a.payout_pix_key IS NULL OR length(a.payout_pix_key) <= 4 THEN a.payout_pix_key
    ELSE repeat('*', greatest(length(a.payout_pix_key) - 4, 4)) || right(a.payout_pix_key, 4)
  END AS payout_pix_key_masked,
  a.payout_holder_name,
  a.auto_payout_enabled,
  a.auto_payout_frequency,
  a.auto_payout_minimum,
  a.last_payout_at,
  COALESCE(SUM(t.gross_amount) FILTER (WHERE t.entry_type = 'sale_credit'), 0)::numeric(12,2) AS gross_received,
  COALESCE(SUM(t.fee_amount) FILTER (WHERE t.entry_type = 'sale_credit'), 0)::numeric(12,2) AS platform_fees,
  COALESCE(SUM(t.amount) FILTER (WHERE t.entry_type = 'sale_credit' AND t.available_at > now()), 0)::numeric(12,2) AS pending_balance,
  COALESCE(SUM(t.amount) FILTER (WHERE t.available_at <= now()), 0)::numeric(12,2) AS available_balance,
  COALESCE(SUM(t.amount), 0)::numeric(12,2) AS total_balance,
  COALESCE((
    SELECT SUM(w.amount) FROM public.wallet_withdrawal_requests w
    WHERE w.store_id = a.store_id AND w.status = 'paid'
  ), 0)::numeric(12,2) AS paid_out_total,
  COALESCE((
    SELECT SUM(w.amount) FROM public.wallet_withdrawal_requests w
    WHERE w.store_id = a.store_id AND w.status IN ('requested','processing')
  ), 0)::numeric(12,2) AS reserved_for_withdrawal
FROM public.store_financial_accounts a
LEFT JOIN public.store_wallet_transactions t ON t.store_id = a.store_id
GROUP BY a.store_id, a.status, a.payout_pix_key_type, a.payout_pix_key,
  a.payout_holder_name, a.auto_payout_enabled, a.auto_payout_frequency,
  a.auto_payout_minimum, a.last_payout_at;

GRANT SELECT ON public.store_wallet_summary TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_pix_order_and_credit_wallet(
  _order_id uuid,
  _txid text,
  _end_to_end_id text,
  _paid_amount numeric,
  _paid_at timestamptz DEFAULT now(),
  _raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_settings public.platform_finance_settings%ROWTYPE;
  v_fee numeric(12,2);
  v_net numeric(12,2);
  v_event_key text;
  v_transaction_id uuid;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF v_order.store_id IS NULL THEN
    RAISE EXCEPTION 'Pedido sem loja vinculada';
  END IF;

  IF NULLIF(btrim(COALESCE(_txid, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Pagamento PIX sem txid';
  END IF;

  IF v_order.pix_txid IS NOT NULL AND v_order.pix_txid <> _txid THEN
    RAISE EXCEPTION 'txid não pertence ao pedido informado';
  END IF;

  IF abs(COALESCE(_paid_amount, 0) - v_order.total) > 0.01 THEN
    RAISE EXCEPTION 'Valor pago (%) diferente do total do pedido (%)', _paid_amount, v_order.total;
  END IF;

  SELECT * INTO v_settings FROM public.platform_finance_settings WHERE id = 1;
  v_fee := round(v_order.total * COALESCE(v_settings.platform_fee_percent, 0) / 100, 2);
  v_net := v_order.total - v_fee;
  v_event_key := 'pix_received:' || COALESCE(NULLIF(_end_to_end_id, ''), NULLIF(_txid, ''), _order_id::text);

  INSERT INTO public.efi_payment_events (
    event_key, order_id, store_id, txid, end_to_end_id, amount, raw_payload
  ) VALUES (
    v_event_key, v_order.id, v_order.store_id, _txid, _end_to_end_id, _paid_amount, COALESCE(_raw_payload, '{}'::jsonb)
  )
  ON CONFLICT (event_key) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public.efi_payment_events
    WHERE event_key = v_event_key
      AND (order_id IS DISTINCT FROM v_order.id OR store_id IS DISTINCT FROM v_order.store_id)
  ) THEN
    RAISE EXCEPTION 'Evento PIX já associado a outro pedido';
  END IF;

  -- O bloqueio do pedido acima serializa confirmações concorrentes. Mesmo que a
  -- consulta e o webhook cheguem juntos (ou tragam chaves de evento diferentes),
  -- um pedido só pode gerar um crédito de venda no ledger.
  SELECT id INTO v_transaction_id
  FROM public.store_wallet_transactions
  WHERE order_id = v_order.id AND entry_type = 'sale_credit'
  LIMIT 1;

  IF v_transaction_id IS NOT NULL THEN
    UPDATE public.orders
    SET
      payment_confirmed = true,
      paid_at = COALESCE(paid_at, _paid_at, now()),
      status = CASE WHEN status IN ('pending','awaiting_payment','cancelled') THEN 'paid' ELSE status END,
      updated_at = now()
    WHERE id = v_order.id;
    RETURN v_transaction_id;
  END IF;

  INSERT INTO public.store_wallet_transactions (
    store_id, order_id, entry_type, amount, gross_amount, fee_amount,
    description, available_at, idempotency_key, metadata
  ) VALUES (
    v_order.store_id,
    v_order.id,
    'sale_credit',
    v_net,
    v_order.total,
    v_fee,
    'Pagamento PIX do pedido #' || COALESCE(v_order.order_number::text, left(v_order.id::text, 8)),
    COALESCE(_paid_at, now()) + make_interval(hours => COALESCE(v_settings.settlement_delay_hours, 24)),
    v_event_key,
    jsonb_build_object('txid', _txid, 'end_to_end_id', _end_to_end_id)
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_transaction_id;

  IF v_transaction_id IS NULL THEN
    SELECT id INTO v_transaction_id
    FROM public.store_wallet_transactions
    WHERE idempotency_key = v_event_key
      AND order_id = v_order.id
      AND store_id = v_order.store_id;

    IF v_transaction_id IS NULL THEN
      RAISE EXCEPTION 'Movimentação PIX já associada a outro pedido';
    END IF;
  END IF;

  UPDATE public.orders
  SET
    payment_confirmed = true,
    paid_at = COALESCE(paid_at, _paid_at, now()),
    status = CASE WHEN status IN ('pending','awaiting_payment','cancelled') THEN 'paid' ELSE status END,
    updated_at = now()
  WHERE id = v_order.id;

  RETURN v_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pix_order_and_credit_wallet(uuid,text,text,numeric,timestamptz,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_pix_order_and_credit_wallet(uuid,text,text,numeric,timestamptz,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.request_store_withdrawal(_amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_account public.store_financial_accounts%ROWTYPE;
  v_settings public.platform_finance_settings%ROWTYPE;
  v_available numeric(12,2);
  v_minimum numeric(12,2);
  v_withdrawal_id uuid;
  v_id_envio text;
BEGIN
  v_store_id := public.get_admin_store_id(auth.uid());
  IF v_store_id IS NULL OR NOT public.admin_owns_store_row(v_store_id) THEN
    RAISE EXCEPTION 'Administrador sem loja vinculada';
  END IF;

  SELECT * INTO v_account
  FROM public.store_financial_accounts
  WHERE store_id = v_store_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Conta financeira não encontrada'; END IF;
  IF v_account.status <> 'active' THEN RAISE EXCEPTION 'Complete e ative os dados de recebimento'; END IF;
  IF COALESCE(v_account.payout_pix_key, '') = '' THEN RAISE EXCEPTION 'Cadastre a chave PIX para saque'; END IF;
  IF COALESCE(v_account.payout_holder_document, '') = '' THEN RAISE EXCEPTION 'Cadastre o CPF/CNPJ do titular'; END IF;
  IF v_account.terms_accepted_at IS NULL THEN RAISE EXCEPTION 'Aceite os termos de repasse'; END IF;

  SELECT * INTO v_settings FROM public.platform_finance_settings WHERE id = 1;
  v_minimum := greatest(COALESCE(v_settings.minimum_withdrawal, 0), COALESCE(v_account.auto_payout_minimum, 0));

  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Valor de saque inválido'; END IF;
  IF _amount < v_minimum THEN RAISE EXCEPTION 'O saque mínimo é R$ %', to_char(v_minimum, 'FM999999990D00'); END IF;

  SELECT COALESCE(SUM(amount), 0)::numeric(12,2)
  INTO v_available
  FROM public.store_wallet_transactions
  WHERE store_id = v_store_id AND available_at <= now();

  IF _amount > v_available THEN
    RAISE EXCEPTION 'Saldo disponível insuficiente';
  END IF;

  v_withdrawal_id := gen_random_uuid();
  v_id_envio := replace(v_withdrawal_id::text, '-', '');

  INSERT INTO public.wallet_withdrawal_requests (
    id, store_id, amount, fee_amount, net_amount, payout_pix_key_type,
    payout_pix_key, payout_holder_name, payout_holder_document,
    id_envio, requested_by
  ) VALUES (
    v_withdrawal_id, v_store_id, round(_amount, 2), 0, round(_amount, 2),
    v_account.payout_pix_key_type, v_account.payout_pix_key,
    v_account.payout_holder_name, v_account.payout_holder_document,
    v_id_envio, auth.uid()
  );

  INSERT INTO public.store_wallet_transactions (
    store_id, withdrawal_id, entry_type, amount, description,
    available_at, idempotency_key
  ) VALUES (
    v_store_id, v_withdrawal_id, 'withdrawal_reserve', -round(_amount, 2),
    'Reserva para saque solicitado', now(), 'withdrawal_reserve:' || v_withdrawal_id::text
  );

  RETURN v_withdrawal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_store_withdrawal(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_store_withdrawal(numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_automatic_withdrawal(_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.store_financial_accounts%ROWTYPE;
  v_settings public.platform_finance_settings%ROWTYPE;
  v_available numeric(12,2);
  v_minimum numeric(12,2);
  v_id uuid;
  v_id_envio text;
BEGIN
  SELECT * INTO v_settings FROM public.platform_finance_settings WHERE id = 1;
  IF NOT COALESCE(v_settings.automatic_payout_enabled, false) THEN RETURN NULL; END IF;

  SELECT * INTO v_account FROM public.store_financial_accounts
  WHERE store_id = _store_id FOR UPDATE;

  IF NOT FOUND OR v_account.status <> 'active' OR NOT v_account.auto_payout_enabled THEN RETURN NULL; END IF;
  IF v_account.auto_payout_frequency = 'manual' THEN RETURN NULL; END IF;
  IF v_account.payout_pix_key IS NULL OR v_account.payout_holder_document IS NULL OR v_account.terms_accepted_at IS NULL THEN RETURN NULL; END IF;

  -- A frequência global funciona como limite máximo: se a plataforma definiu
  -- semanal, nenhuma loja recebe repasse automático diário.
  IF v_settings.automatic_payout_frequency = 'weekly'
     AND v_account.last_payout_at IS NOT NULL
     AND v_account.last_payout_at > now() - interval '7 days' THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallet_withdrawal_requests
    WHERE store_id = _store_id AND status IN ('requested','processing')
  ) THEN RETURN NULL; END IF;

  IF v_account.auto_payout_frequency = 'daily' AND v_account.last_payout_at::date = current_date THEN RETURN NULL; END IF;
  IF v_account.auto_payout_frequency = 'weekly' AND v_account.last_payout_at > now() - interval '7 days' THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(amount), 0)::numeric(12,2) INTO v_available
  FROM public.store_wallet_transactions
  WHERE store_id = _store_id AND available_at <= now();

  v_minimum := greatest(COALESCE(v_settings.minimum_withdrawal, 0), COALESCE(v_account.auto_payout_minimum, 0));
  IF v_available < v_minimum THEN RETURN NULL; END IF;

  v_id := gen_random_uuid();
  v_id_envio := replace(v_id::text, '-', '');

  INSERT INTO public.wallet_withdrawal_requests (
    id, store_id, amount, fee_amount, net_amount, payout_pix_key_type,
    payout_pix_key, payout_holder_name, payout_holder_document,
    id_envio, requested_by
  ) VALUES (
    v_id, _store_id, v_available, 0, v_available,
    v_account.payout_pix_key_type, v_account.payout_pix_key,
    v_account.payout_holder_name, v_account.payout_holder_document,
    v_id_envio, NULL
  );

  INSERT INTO public.store_wallet_transactions (
    store_id, withdrawal_id, entry_type, amount, description,
    available_at, idempotency_key
  ) VALUES (
    _store_id, v_id, 'withdrawal_reserve', -v_available,
    'Reserva para repasse automático', now(), 'withdrawal_reserve:' || v_id::text
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_automatic_withdrawal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_automatic_withdrawal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_withdrawal_processing(
  _withdrawal_id uuid,
  _efi_e2e_id text DEFAULT NULL,
  _efi_status text DEFAULT 'EM_PROCESSAMENTO'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wallet_withdrawal_requests
  SET status = 'processing', processing_at = COALESCE(processing_at, now()),
      efi_e2e_id = COALESCE(_efi_e2e_id, efi_e2e_id), efi_status = _efi_status,
      error_message = NULL, updated_at = now()
  WHERE id = _withdrawal_id AND status IN ('requested','processing');
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_withdrawal_paid(
  _id_envio text,
  _efi_e2e_id text DEFAULT NULL,
  _efi_status text DEFAULT 'REALIZADO'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  UPDATE public.wallet_withdrawal_requests
  SET status = 'paid', paid_at = COALESCE(paid_at, now()),
      efi_e2e_id = COALESCE(_efi_e2e_id, efi_e2e_id), efi_status = _efi_status,
      error_message = NULL, updated_at = now()
  WHERE id_envio = _id_envio AND status IN ('requested','processing')
  RETURNING store_id INTO v_store_id;

  IF v_store_id IS NOT NULL THEN
    UPDATE public.store_financial_accounts
    SET last_payout_at = now(), updated_at = now()
    WHERE store_id = v_store_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_withdrawal_failed(
  _withdrawal_id uuid,
  _error_message text,
  _efi_status text DEFAULT 'FALHOU'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.wallet_withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM public.wallet_withdrawal_requests
  WHERE id = _withdrawal_id FOR UPDATE;

  IF NOT FOUND OR v_request.status IN ('paid','failed','cancelled') THEN RETURN; END IF;

  UPDATE public.wallet_withdrawal_requests
  SET status = 'failed', failed_at = now(), error_message = left(_error_message, 1000),
      efi_status = _efi_status, updated_at = now()
  WHERE id = _withdrawal_id;

  INSERT INTO public.store_wallet_transactions (
    store_id, withdrawal_id, entry_type, amount, description,
    available_at, idempotency_key
  ) VALUES (
    v_request.store_id, v_request.id, 'withdrawal_release', v_request.amount,
    'Saldo devolvido após falha no saque', now(), 'withdrawal_release:' || v_request.id::text
  ) ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_withdrawal_processing(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_withdrawal_paid(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_withdrawal_failed(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_withdrawal_processing(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_withdrawal_paid(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_withdrawal_failed(uuid,text,text) TO service_role;

-- Atualização automática de timestamps
DROP TRIGGER IF EXISTS store_financial_accounts_updated_at ON public.store_financial_accounts;
CREATE TRIGGER store_financial_accounts_updated_at
BEFORE UPDATE ON public.store_financial_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS wallet_withdrawal_requests_updated_at ON public.wallet_withdrawal_requests;
CREATE TRIGGER wallet_withdrawal_requests_updated_at
BEFORE UPDATE ON public.wallet_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS platform_finance_settings_updated_at ON public.platform_finance_settings;
CREATE TRIGGER platform_finance_settings_updated_at
BEFORE UPDATE ON public.platform_finance_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atualizações do saldo e dos saques aparecem em tempo real no painel.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.store_wallet_transactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_withdrawal_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Mantém pedidos PIX cancelados para conciliação de pagamentos tardios.
DROP POLICY IF EXISTS "Users can cancel own unpaid Pix orders" ON public.orders;
CREATE POLICY "Users can cancel own unpaid Pix orders"
ON public.orders FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  AND payment_method = 'pix'
  AND payment_confirmed = false
  AND status IN ('pending','awaiting_payment','cancelled')
)
WITH CHECK (
  auth.uid() = user_id
  AND payment_method = 'pix'
  AND payment_confirmed = false
  AND status = 'cancelled'
);
