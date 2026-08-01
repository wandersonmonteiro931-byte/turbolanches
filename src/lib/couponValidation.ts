import { supabase } from "@/integrations/supabase/client";
import { nowBrasilia } from "@/lib/brasiliaTime";

interface CouponRecord {
  active: boolean;
  code: string;
  expires_at: string | null;
  first_purchase_only: boolean;
  max_uses: number | null;
  max_uses_per_customer: number | null;
  min_order: number | null;
  starts_at: string | null;
  type: string;
  used_count: number;
  value: number;
}

interface ScratchCouponRecord {
  redeemed_at: string | null;
}

export interface CouponValidationResult {
  coupon?: CouponRecord;
  error?: string;
  isScratchCoupon: boolean;
  valid: boolean;
}

export async function validateCouponForOrder({
  couponCode,
  totalPrice,
  userId,
  storeId,
}: {
  couponCode: string;
  totalPrice: number;
  userId?: string;
  storeId?: string | null;
}): Promise<CouponValidationResult> {
  const normalizedCode = couponCode.trim().toUpperCase();

  if (!normalizedCode) {
    return { error: "Cupom não encontrado", isScratchCoupon: false, valid: false };
  }

  let couponQuery = supabase
    .from("coupons")
    .select("code, type, value, active, used_count, max_uses, max_uses_per_customer, min_order, expires_at, starts_at, first_purchase_only")
    .eq("code", normalizedCode);
  if (storeId) couponQuery = couponQuery.eq("store_id", storeId);
  const { data: coupon, error } = await couponQuery.maybeSingle();

  if (error || !coupon) {
    return { error: "Cupom não encontrado", isScratchCoupon: false, valid: false };
  }

  const typedCoupon = coupon as CouponRecord;
  const now = nowBrasilia();

  if (!typedCoupon.active) {
    return { coupon: typedCoupon, error: "Este cupom está inativo", isScratchCoupon: false, valid: false };
  }

  if (typedCoupon.starts_at && new Date(typedCoupon.starts_at) > now) {
    return { coupon: typedCoupon, error: "Este cupom ainda não está válido", isScratchCoupon: false, valid: false };
  }

  if (typedCoupon.expires_at && new Date(typedCoupon.expires_at) < now) {
    return { coupon: typedCoupon, error: "Este cupom expirou", isScratchCoupon: false, valid: false };
  }

  if (typedCoupon.max_uses && typedCoupon.used_count >= typedCoupon.max_uses) {
    return { coupon: typedCoupon, error: "Cupom esgotado", isScratchCoupon: false, valid: false };
  }

  if (typedCoupon.min_order && totalPrice < typedCoupon.min_order) {
    return {
      coupon: typedCoupon,
      error: `Pedido mínimo de R$ ${Number(typedCoupon.min_order).toFixed(2).replace(".", ",")}`,
      isScratchCoupon: false,
      valid: false,
    };
  }

  if (!userId) {
    return { coupon: typedCoupon, isScratchCoupon: false, valid: true };
  }

  let scratchCoupon: ScratchCouponRecord | null = null;

  let scratchQuery = supabase
    .from("scratch_wins")
    .select("redeemed_at")
    .eq("coupon_code", normalizedCode)
    .eq("user_id", userId);
  if (storeId) scratchQuery = scratchQuery.eq("store_id", storeId);
  const { data: scratchWin } = await scratchQuery.maybeSingle();

  scratchCoupon = (scratchWin as ScratchCouponRecord | null) ?? null;

  if (typedCoupon.first_purchase_only) {
    let firstOrderQuery = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("status", "cancelled");
    if (storeId) firstOrderQuery = firstOrderQuery.eq("store_id", storeId);
    const { count } = await firstOrderQuery;

    if (count && count > 0) {
      return { coupon: typedCoupon, error: "Cupom válido apenas para primeira compra", isScratchCoupon: Boolean(scratchCoupon), valid: false };
    }
  }

  if (scratchCoupon?.redeemed_at) {
    return { coupon: typedCoupon, error: "Este cupom da raspadinha já foi utilizado", isScratchCoupon: true, valid: false };
  }

  const maxPerCustomer = scratchCoupon ? 1 : typedCoupon.max_uses_per_customer;

  if (maxPerCustomer) {
    let couponUseQuery = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("coupon_code", normalizedCode)
      .neq("status", "cancelled");
    if (storeId) couponUseQuery = couponUseQuery.eq("store_id", storeId);
    const { count } = await couponUseQuery;

    if (count !== null && count >= maxPerCustomer) {
      return {
        coupon: typedCoupon,
        error: scratchCoupon
          ? "Este cupom da raspadinha já foi utilizado"
          : `Você já usou este cupom ${count}x (limite: ${maxPerCustomer}x)`,
        isScratchCoupon: Boolean(scratchCoupon),
        valid: false,
      };
    }
  }

  return {
    coupon: typedCoupon,
    isScratchCoupon: Boolean(scratchCoupon),
    valid: true,
  };
}