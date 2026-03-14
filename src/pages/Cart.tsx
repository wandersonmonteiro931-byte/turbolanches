import { useEffect, useState } from "react";
import { ArrowLeft, Minus, Plus, Trash2, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const Cart = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, updateQuantity, removeItem, clearCart, totalPrice } = useCart();
  const [deliveryFee, setDeliveryFee] = useState(5.99);
  const [freeDeliveryMin, setFreeDeliveryMin] = useState(0);
  const [feeLoaded, setFeeLoaded] = useState(false);

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
            .select("delivery_fee, temp_free_delivery")
            .ilike("neighborhood", profile.neighborhood)
            .single();

          if (zone) {
            const isTempFree = zone.temp_free_delivery || config?.temp_free_delivery_all;
            const isAutoFree = config && config.free_delivery_min_order > 0 && totalPrice >= config.free_delivery_min_order;
            setDeliveryFee((isTempFree || isAutoFree) ? 0 : Number(zone.delivery_fee));
          }
        }
      }
      setFeeLoaded(true);
    };
    fetchDeliveryInfo();
  }, [user, totalPrice]);

  const grandTotal = totalPrice + deliveryFee;

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
          // addon.quantity already includes combo multiplier
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

                  {/* Base price */}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.quantity}x {fmt(item.product.price)}
                  </p>

                  {/* Addons detail */}
                  {item.selectedAddons.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {item.selectedAddons.map((a, ai) => {
                        const baseQty = a.quantity || 1;
                        const effectiveQty = item.product.isCombo ? baseQty * comboMultiplier : baseQty;
                        return (
                          <p key={ai} className="text-[11px] text-muted-foreground flex items-center justify-between">
                            <span>
                              + {a.name}{effectiveQty > 1 ? ` x${effectiveQty}` : ""}
                              {item.product.isCombo && comboMultiplier > 1 && (
                                <span className="text-accent ml-1">(combo {comboMultiplier}x)</span>
                              )}
                            </span>
                            <span className="text-foreground/70">{fmt(a.price * effectiveQty)}</span>
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

              {/* Quantity + line total */}
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

        {/* Summary Card */}
        <div className="mt-4 rounded-xl bg-card p-4 space-y-2">
          <h3 className="text-sm font-bold text-foreground mb-2">Resumo do pedido</h3>

          {/* Items breakdown */}
          {items.map((item, index) => {
            const comboMultiplier = item.product.isCombo ? (item.product.comboItemCount || 1) : 1;
            const addonsTotal = item.selectedAddons.reduce((s, a) => {
              const baseQty = a.quantity || 1;
              const effectiveQty = item.product.isCombo ? baseQty * comboMultiplier : baseQty;
              return s + a.price * effectiveQty;
            }, 0);
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
