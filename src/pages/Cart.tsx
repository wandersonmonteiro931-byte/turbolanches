import { useEffect, useState } from "react";
import { ArrowLeft, Minus, Plus, Trash2, Truck, Tag, X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { nowBrasilia } from "@/lib/brasiliaTime";

const Cart = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, updateQuantity, removeItem, totalPrice, appliedCoupon, setAppliedCoupon, couponDiscount } = useCart();
  const [deliveryFee, setDeliveryFee] = useState(5.99);
  const [freeDeliveryMin, setFreeDeliveryMin] = useState(0);
  const [feeLoaded, setFeeLoaded] = useState(false);

  // Coupon local UI state
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  useEffect(() => {
    const fetchDeliveryInfo = async () => {
      const { data: config } = await supabase
        .from("store_settings")
        .select("free_delivery_min_order, free_delivery_max_km, temp_free_delivery_all")
        .limit(1)
        .single();

      if (config) {
        setFreeDeliveryMin(config.free_delivery_min_order || 0);
      }

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("neighborhood")
          .eq("user_id", user.id)
          .single();

        if (profile?.neighborhood) {
          const { data: zone } = await supabase
            .from("delivery_zones")
            .select("delivery_fee, temp_free_delivery, distance_km")
            .ilike("neighborhood", profile.neighborhood)
            .single();

          if (zone) {
            const isTempFree = Boolean(zone.temp_free_delivery || config?.temp_free_delivery_all);
            const isKmFree = Boolean(
              config &&
              config.free_delivery_max_km > 0 &&
              zone.distance_km !== null &&
              Number(zone.distance_km) >= 0 &&
              Number(zone.distance_km) <= config.free_delivery_max_km,
            );
            const isMinOrderFree = Boolean(
              config && config.free_delivery_min_order > 0 && totalPrice >= config.free_delivery_min_order,
            );
            setDeliveryFee((isTempFree || isKmFree || isMinOrderFree) ? 0 : Number(zone.delivery_fee));
          }
        }
      }
      setFeeLoaded(true);
    };
    fetchDeliveryInfo();
  }, [user, totalPrice]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const { data: coupon, error } = await supabase
        .from("coupons")
        .select("*")
        .ilike("code", couponCode.trim())
        .single();

      if (error || !coupon) { setCouponError("Cupom não encontrado"); return; }
      if (!coupon.active) { setCouponError("Este cupom está inativo"); return; }
      const now = nowBrasilia();
      if (coupon.starts_at && new Date(coupon.starts_at) > now) { setCouponError("Este cupom ainda não está válido"); return; }
      if (coupon.expires_at && new Date(coupon.expires_at) < now) { setCouponError("Este cupom expirou"); return; }
      if (coupon.max_uses && coupon.used_count >= coupon.max_uses) { setCouponError("Cupom esgotado"); return; }
      if (coupon.min_order && totalPrice < coupon.min_order) {
        setCouponError(`Pedido mínimo de R$ ${Number(coupon.min_order).toFixed(2).replace(".", ",")}`);
        return;
      }
      if (coupon.first_purchase_only && user) {
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (count && count > 0) { setCouponError("Cupom válido apenas para primeira compra"); return; }
      }
      // Check per-customer usage limit
      const maxPerCustomer = (coupon as any).max_uses_per_customer;
      if (maxPerCustomer && user) {
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("coupon_code", coupon.code)
          .neq("status", "cancelled");
        if (count !== null && count >= maxPerCustomer) {
          setCouponError(`Você já usou este cupom ${count}x (limite: ${maxPerCustomer}x)`);
          return;
        }
      }
      setAppliedCoupon({ code: coupon.code, type: coupon.type, value: coupon.value });
      toast.success(`Cupom ${coupon.code} aplicado! 🎉`);
    } catch {
      setCouponError("Erro ao validar cupom");
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  const grandTotal = totalPrice + deliveryFee - couponDiscount;

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <span className="text-6xl">🛒</span>
        <h2 className="mt-4 text-2xl text-fire-gradient">CARRINHO VAZIO</h2>
        <p className="mt-2 text-sm text-muted-foreground">Adicione itens deliciosos do cardápio!</p>
        <button onClick={() => navigate("/")} className="mt-6 rounded-xl bg-fire-gradient px-8 py-3 font-bold text-primary-foreground shadow-fire">
          Ver Cardápio
        </button>
      </div>
    );
  }

  const fmt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

  return (
    <div className="min-h-screen bg-background pb-36">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/90 px-4 py-4 backdrop-blur-md">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h1 className="text-2xl text-fire-gradient">CARRINHO</h1>
        <span className="ml-auto text-sm text-muted-foreground">{items.length} {items.length === 1 ? "item" : "itens"}</span>
      </header>

      <div className="mx-auto max-w-md px-4 space-y-3">
        {items.map((item, index) => {
          const addonsTotal = item.selectedAddons.reduce((s, a) => s + a.price * (a.quantity || 1), 0);
          const unitTotal = item.product.price + addonsTotal;
          const lineTotal = unitTotal * item.quantity;

          return (
            <div key={index} className="rounded-xl bg-card p-4">
              <div className="flex gap-3">
                <img src={item.product.image} alt={item.product.name} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-foreground text-sm truncate">{item.product.name}</h3>
                    <button onClick={() => removeItem(index)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.quantity}x {fmt(item.product.price)}
                  </p>
                  {item.selectedAddons.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {item.selectedAddons.map((a, ai) => {
                        const qty = a.quantity || 1;
                        return (
                          <p key={ai} className="text-[11px] text-muted-foreground flex items-center justify-between">
                            <span>+ {a.name}{qty > 1 ? ` x${qty}` : ""}</span>
                            <span className="text-foreground/70">{fmt(a.price * qty)}</span>
                          </p>
                        );
                      })}
                    </div>
                  )}
                  {item.observations && (
                    <p className="text-[11px] text-muted-foreground italic mt-1">📝 {item.observations}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm font-bold text-primary">{fmt(lineTotal)}</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => updateQuantity(index, item.quantity - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-primary text-primary">
                    <Minus size={14} />
                  </button>
                  <span className="min-w-[20px] text-center font-bold text-foreground">{item.quantity}</span>
                  <button onClick={() => updateQuantity(index, item.quantity + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Coupon */}
        <div className="rounded-xl bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag size={16} className="text-primary" />
            <h2 className="font-bold text-foreground text-sm">Cupom de desconto</h2>
          </div>
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5">
              <div>
                <span className="text-sm font-bold text-primary">{appliedCoupon.code}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {appliedCoupon.type === "percentage"
                    ? `${appliedCoupon.value}% off`
                    : `- R$ ${appliedCoupon.value.toFixed(2).replace(".", ",")}`}
                </span>
              </div>
              <button onClick={removeCoupon} className="text-muted-foreground hover:text-destructive">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                  placeholder="Digite o cupom"
                  className="flex-1 rounded-lg bg-background px-3 py-2.5 text-sm text-foreground uppercase placeholder:text-muted-foreground placeholder:normal-case focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleApplyCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 transition-all active:scale-95"
                >
                  {couponLoading ? <Loader2 size={16} className="animate-spin" /> : "Aplicar"}
                </button>
              </div>
              {couponError && (
                <p className="mt-1.5 text-xs text-destructive">{couponError}</p>
              )}
            </div>
          )}
        </div>

        {/* Summary Card */}
        <div className="mt-4 rounded-xl bg-card p-4 space-y-2">
          <h3 className="text-sm font-bold text-foreground mb-2">Resumo do pedido</h3>

          {items.map((item, index) => {
            const addonsTotal = item.selectedAddons.reduce((s, a) => s + a.price * (a.quantity || 1), 0);
            const lineTotal = (item.product.price + addonsTotal) * item.quantity;
            return (
              <div key={index} className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate mr-2">{item.quantity}x {item.product.name}</span>
                <span className="shrink-0 text-foreground">{fmt(lineTotal)}</span>
              </div>
            );
          })}

          <div className="border-t border-border my-2" />

          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span className="text-foreground">{fmt(totalPrice)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Truck size={14} /> Taxa de entrega
            </span>
            <span className={deliveryFee === 0 ? "font-semibold text-green-500" : "text-foreground"}>
              {deliveryFee === 0 ? "Grátis 🎉" : fmt(deliveryFee)}
            </span>
          </div>

          {freeDeliveryMin > 0 && totalPrice < freeDeliveryMin && deliveryFee > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Faltam {fmt(freeDeliveryMin - totalPrice)} para frete grátis
            </p>
          )}

          {couponDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Desconto ({appliedCoupon?.code})</span>
              <span className="text-green-600 font-bold">- {fmt(couponDiscount)}</span>
            </div>
          )}

          <div className="border-t border-border pt-2 flex justify-between text-lg font-bold">
            <span className="text-foreground">Total</span>
            <span className="text-primary">{fmt(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card p-4 safe-bottom">
        <div className="mx-auto max-w-md">
          <button onClick={() => navigate("/checkout")}
            className="w-full rounded-xl bg-fire-gradient py-4 text-center font-bold text-primary-foreground shadow-fire-lg transition-all active:scale-[0.98]">
            Finalizar Pedido • {fmt(grandTotal)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;
