import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, CreditCard, Banknote, MessageSquare, Truck, Store, Clock, QrCode } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { useStore } from "@/contexts/StoreContext";
import PixPaymentModal from "@/components/PixPaymentModal";

interface Profile {
  full_name: string;
  phone: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  quadra: string;
  lote: string;
  city: string;
  state: string;
}

interface DeliveryZone {
  neighborhood: string;
  delivery_fee: number;
  distance_km: number | null;
  temp_free_delivery: boolean;
}

interface DeliveryConfig {
  free_delivery_min_order: number;
  free_delivery_max_km: number;
  temp_free_delivery_all: boolean;
  max_serving_km: number | null;
  max_serving_km_active: boolean;
  prep_time_minutes: number;
  delivery_time_minutes: number;
  pickup_time_minutes: number;
  store_address_full: string;
}

const paymentMethods = [
  { id: "pix", label: "PIX", icon: QrCode, description: "Pagamento instantâneo via QR Code" },
  { id: "dinheiro", label: "Dinheiro", icon: Banknote, description: "Pague na entrega/retirada" },
  { id: "cartao", label: "Cartão", icon: CreditCard, description: "Débito/Crédito na entrega/retirada" },
];

const Checkout = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOpen: storeIsOpen } = useStoreStatus();
  const { storeId } = useStore();
  const { items, totalPrice, clearCart, appliedCoupon, couponDiscount } = useCart();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig | null>(null);
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">("delivery");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [changeFor, setChangeFor] = useState("");
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);




  // PIX modal state
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixData, setPixData] = useState<{
    orderId: string;
    qrcode: string;
    qrcodeImage: string;
    expiracao: number;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/auth", { state: { from: "/checkout" } });
      return;
    }
    Promise.all([
      supabase.from("profiles").select("full_name, phone, street, number, complement, neighborhood, quadra, lote, city, state").eq("user_id", user.id).single(),
      supabase.from("delivery_zones").select("neighborhood, delivery_fee, distance_km, temp_free_delivery"),
      supabase.from("store_settings").select("free_delivery_min_order, free_delivery_max_km, temp_free_delivery_all, max_serving_km, max_serving_km_active, prep_time_minutes, delivery_time_minutes, pickup_time_minutes, store_address_full").limit(1).single(),
    ]).then(([profileRes, zonesRes, configRes]) => {
      if (profileRes.data) {
        const p = profileRes.data;
        if (!p.full_name || !p.phone || !p.street || !p.neighborhood || !p.complement) {
          toast.error("Complete seu perfil (rua, complemento e WhatsApp são obrigatórios)");
          navigate("/completar-perfil");
          return;
        }
        setProfile(p);
      } else {
        toast.error("Complete seu perfil antes de finalizar o pedido");
        navigate("/completar-perfil");
        return;
      }
      if (zonesRes.data) setDeliveryZones(zonesRes.data as DeliveryZone[]);
      if (configRes.data) {
        const d = configRes.data as any;
        setDeliveryConfig({
          free_delivery_min_order: d.free_delivery_min_order || 0,
          free_delivery_max_km: d.free_delivery_max_km || 0,
          temp_free_delivery_all: d.temp_free_delivery_all || false,
          max_serving_km: d.max_serving_km ?? null,
          max_serving_km_active: d.max_serving_km_active || false,
          prep_time_minutes: d.prep_time_minutes || 25,
          delivery_time_minutes: d.delivery_time_minutes || 30,
          pickup_time_minutes: d.pickup_time_minutes || 20,
          store_address_full: d.store_address_full || "",
        });
      }
      setProfileLoading(false);
    });
  }, [user]);

  const handlePixConfirmed = useCallback(() => {
    toast.success("Pagamento PIX confirmado! 🎉");
    clearCart();
    if (pixData) {
      setTimeout(() => navigate(`/pedido/${pixData.orderId}`), 2000);
    }
  }, [pixData, clearCart, navigate]);

  const handlePixCancelled = useCallback(() => {
    setShowPixModal(false);
    setPixData(null);
    // Cart stays intact - user goes back to checkout
  }, []);




  if (!user) {
    navigate("/auth");
    return null;
  }

  if (items.length === 0 && !loading && !showPixModal) {
    navigate("/carrinho");
    return null;
  }

  const matchedZone = deliveryZones.find(
    (z) => z.neighborhood.toLowerCase() === profile?.neighborhood?.toLowerCase()
  );

  const isNeighborhoodNotServed = deliveryType === "delivery" && !matchedZone;

  const isNeighborhoodTooFar = deliveryType === "delivery" &&
    deliveryConfig?.max_serving_km_active &&
    matchedZone?.distance_km !== null && matchedZone?.distance_km !== undefined &&
    matchedZone.distance_km >= 0 &&
    deliveryConfig.max_serving_km !== null &&
    matchedZone.distance_km > deliveryConfig.max_serving_km;

  const isNeighborhoodBlocked = isNeighborhoodNotServed || isNeighborhoodTooFar;

  // Delivery fee only applies for delivery type
  const rawFee = matchedZone ? Number(matchedZone.delivery_fee) : 5.99;
  const isTempFree = Boolean(matchedZone?.temp_free_delivery || deliveryConfig?.temp_free_delivery_all);
  const isKmFree = Boolean(
    deliveryConfig &&
    deliveryConfig.free_delivery_max_km > 0 &&
    matchedZone?.distance_km !== null &&
    matchedZone?.distance_km !== undefined &&
    matchedZone.distance_km >= 0 &&
    matchedZone.distance_km <= deliveryConfig.free_delivery_max_km,
  );
  const isMinOrderFree = Boolean(
    deliveryConfig &&
    deliveryConfig.free_delivery_min_order > 0 &&
    totalPrice >= deliveryConfig.free_delivery_min_order,
  );

  const deliveryFee = deliveryType === "pickup" ? 0 : ((isTempFree || isKmFree || isMinOrderFree) ? 0 : rawFee);




  const grandTotal = totalPrice + deliveryFee - couponDiscount;

  // Estimated time
  const estimatedTime = deliveryType === "pickup"
    ? (deliveryConfig?.pickup_time_minutes || 20)
    : ((deliveryConfig?.prep_time_minutes || 25) + (deliveryConfig?.delivery_time_minutes || 30));

  const createOrderAndItems = async () => {
    if (!user || !profile) throw new Error("Missing user/profile");

    const orderData: any = {
      user_id: user.id,
      subtotal: totalPrice,
      delivery_fee: deliveryFee,
      discount: couponDiscount,
      coupon_code: appliedCoupon?.code || null,
      total: grandTotal,
      status: "pending",
      delivery_type: deliveryType === "pickup" ? "retirada" : "delivery",
      payment_method: paymentMethod,
      observations: observations || null,
      change_for: paymentMethod === "dinheiro" && changeFor ? Number(changeFor) : null,
    };

    if (deliveryType === "delivery") {
      const quadraLote = [profile.quadra ? `Qd. ${profile.quadra}` : "", profile.lote ? `Lt. ${profile.lote}` : ""].filter(Boolean).join(", ");
      orderData.address_street = profile.street;
      orderData.address_number = [profile.number, quadraLote].filter(Boolean).join(" - ");
      orderData.address_complement = profile.complement;
      orderData.address_neighborhood = profile.neighborhood;
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderData)
      .select("id")
      .single();

    if (orderError) throw orderError;

    const orderItems = items.map((item) => ({
      order_id: order.id,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: item.product.price + item.selectedAddons.reduce((s, a) => s + a.price * (a.quantity || 1), 0),
      observations: item.observations || null,
      addons_json: item.selectedAddons.length > 0 ? JSON.parse(JSON.stringify(item.selectedAddons)) : null,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) throw itemsError;

    return order;
  };

  const handlePlaceOrder = async () => {
    if (!user || !profile) return;
    if (!storeIsOpen) {
      toast.error("A loja está fechada no momento");
      return;
    }
    setLoading(true);

    try {
      const order = await createOrderAndItems();

      if (paymentMethod === "pix") {
        // Generate PIX charge via edge function
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sessão expirada");

        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/pix-efi/create-charge`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              order_id: order.id,
              amount: grandTotal,
              descricao: `Pedido Turbo Lanches #${order.id.slice(0, 8)}`,
            }),
          }
        );

        if (!resp.ok) {
          const errData = await resp.json();
          throw new Error(errData.error || "Erro ao gerar cobrança PIX");
        }

        const pixResult = await resp.json();
        setPixData({
          orderId: order.id,
          qrcode: pixResult.qrcode,
          qrcodeImage: pixResult.qrcode_image,
          expiracao: pixResult.expiracao || 3600,
        });
        setShowPixModal(true);
      } else {
        // Non-PIX: complete immediately
        toast.success("Pedido enviado com sucesso! 🔥");
        clearCart();
        navigate(`/pedido/${order.id}`);
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar pedido");
    } finally {
      setLoading(false);
    }
  };


  const buildWhatsAppMessage = (orderId?: string) => {
    const itemsList = items
      .map((i) => {
        let line = `${i.quantity}x ${i.product.name}`;
        if (i.selectedAddons.length > 0) {
          const addonLines = i.selectedAddons
            .map((a) => {
              const baseQty = a.quantity || 1;
              const displayQty = i.product.isCombo ? baseQty * i.quantity : baseQty;
              return `   + ${a.name}${displayQty > 1 ? ` x${displayQty}` : ""}`;
            })
            .join("\n");
          line += "\n" + addonLines;
        }
        if (i.observations) line += `\n   📝 ${i.observations}`;
        const addonsTotal = i.selectedAddons.reduce((s, a) => s + a.price * (a.quantity || 1), 0);
        const lineTotal = (i.product.price + addonsTotal) * i.quantity;
        line += `\n   R$ ${lineTotal.toFixed(2).replace(".", ",")}`;
        return line;
      })
      .join("\n\n");

    const typeLabel = deliveryType === "pickup" ? "RETIRADA" : "ENTREGA";
    const payLabel = paymentMethod === "pix" ? "PIX" : paymentMethod === "dinheiro" ? "DINHEIRO" : "CARTÃO";

    let msg = `🍔 *PEDIDO - TURBO LANCHES*\n\n`;
    if (orderId) msg += `Pedido #${orderId.slice(0, 6)}\n`;
    msg += `Tipo: ${typeLabel}\n`;
    msg += `Cliente: ${profile?.full_name}\n`;
    msg += `Telefone: ${profile?.phone}\n`;
    if (deliveryType === "delivery") {
      msg += `Endereço: ${profile?.street}, ${profile?.number} - ${profile?.neighborhood}\n`;
    } else {
      msg += `Retirada na loja\n`;
    }
    msg += `\n📋 *ITENS:*\n${itemsList}\n\n`;
    msg += `Subtotal: R$ ${totalPrice.toFixed(2).replace(".", ",")}\n`;
    if (deliveryType === "delivery") {
      msg += `Taxa entrega: ${deliveryFee === 0 ? "GRÁTIS 🎉" : `R$ ${deliveryFee.toFixed(2).replace(".", ",")}`}\n`;
    }
    msg += `*Total: R$ ${grandTotal.toFixed(2).replace(".", ",")}*\n`;
    msg += `Pagamento: ${payLabel}`;
    if (paymentMethod === "dinheiro" && changeFor) {
      msg += ` (troco p/ R$ ${changeFor})`;
    }
    if (observations) msg += `\n\nObs: ${observations}`;

    return msg;
  };

  const sendWhatsAppNotification = (orderId: string) => {
    const message = encodeURIComponent(buildWhatsAppMessage(orderId));
    window.open(`https://wa.me/5562994753582?text=${message}`, "_blank");
  };

  if (profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-36">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/90 px-4 py-4 backdrop-blur-md">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h1 className="text-2xl text-fire-gradient">CONFIRMAR PEDIDO</h1>
      </header>

      <div className="mx-auto max-w-md px-4 space-y-4">
        {/* Delivery Type Toggle */}
        <div className="rounded-xl bg-card p-4">
          <h2 className="font-bold text-foreground text-sm mb-3">Como deseja receber?</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDeliveryType("delivery")}
              className={`flex flex-col items-center gap-2 rounded-lg p-3 transition-all ${
                deliveryType === "delivery"
                  ? "bg-fire-gradient-soft border border-primary/30"
                  : "bg-background border border-transparent"
              }`}
            >
              <Truck size={22} className={deliveryType === "delivery" ? "text-primary" : "text-muted-foreground"} />
              <span className={`text-sm font-semibold ${deliveryType === "delivery" ? "text-primary" : "text-foreground"}`}>Entrega</span>
              <span className="text-[11px] text-muted-foreground">~{(deliveryConfig?.prep_time_minutes || 25) + (deliveryConfig?.delivery_time_minutes || 30)} min</span>
            </button>
            <button
              onClick={() => setDeliveryType("pickup")}
              className={`flex flex-col items-center gap-2 rounded-lg p-3 transition-all ${
                deliveryType === "pickup"
                  ? "bg-fire-gradient-soft border border-primary/30"
                  : "bg-background border border-transparent"
              }`}
            >
              <Store size={22} className={deliveryType === "pickup" ? "text-primary" : "text-muted-foreground"} />
              <span className={`text-sm font-semibold ${deliveryType === "pickup" ? "text-primary" : "text-foreground"}`}>Retirar na Loja</span>
              <span className="text-[11px] text-muted-foreground">~{deliveryConfig?.pickup_time_minutes || 20} min</span>
            </button>
          </div>
        </div>

        {/* Blocked Neighborhood Warning (delivery only) */}
        {isNeighborhoodBlocked && deliveryType === "delivery" && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-5 text-center space-y-2">
            <Truck size={32} className="mx-auto text-destructive" />
            <h2 className="text-base font-bold text-destructive">Região não atendida</h2>
            <p className="text-sm text-muted-foreground">
              Pedimos desculpas, mas hoje não estamos atendendo sua região.
            </p>
            <button onClick={() => navigate("/completar-perfil")} className="mt-2 text-sm font-semibold text-primary underline">
              Alterar endereço
            </button>
          </div>
        )}

        {/* Address / Store Info */}
        {deliveryType === "delivery" ? (
          <div className="rounded-xl bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={18} className="text-primary" />
              <h2 className="font-bold text-foreground text-sm">Endereço de entrega</h2>
            </div>
            <p className="text-sm text-foreground">
              {profile?.street}, {profile?.number}
              {profile?.complement ? ` - ${profile.complement}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{profile?.neighborhood} - {profile?.city}/{profile?.state}</p>
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Clock size={12} />
              <span>Tempo estimado: ~{estimatedTime} min</span>
            </div>
            <button
              onClick={() => navigate("/completar-perfil")}
              className="mt-2 text-xs font-semibold text-primary"
            >
              Alterar endereço
            </button>
          </div>
        ) : (
          <div className="rounded-xl bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Store size={18} className="text-primary" />
              <h2 className="font-bold text-foreground text-sm">Retirar na loja</h2>
            </div>
            <p className="text-sm text-foreground">
              {deliveryConfig?.store_address_full || "Endereço da loja"}
            </p>
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Clock size={12} />
              <span>Pronto em ~{deliveryConfig?.pickup_time_minutes || 20} min</span>
            </div>
            <p className="mt-2 text-[11px] text-green-600 font-medium">🎉 Sem taxa de entrega!</p>
          </div>
        )}

        {!isNeighborhoodBlocked && (
          <>
            {/* Order Items */}
            <div className="rounded-xl bg-card p-4">
              <h2 className="font-bold text-foreground text-sm mb-2">Itens do pedido</h2>
              <div className="space-y-2">
                {items.map((item, index) => {
                  const addonsTotal = item.selectedAddons.reduce((s, a) => s + a.price * (a.quantity || 1), 0);
                  const lineTotal = (item.product.price + addonsTotal) * item.quantity;
                  return (
                    <div key={index} className="space-y-0.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-foreground min-w-0 truncate flex-1">
                          {item.quantity}x {item.product.name}
                        </span>
                        <span className="text-muted-foreground whitespace-nowrap shrink-0">
                          R$ {lineTotal.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                      {item.selectedAddons.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          + {item.selectedAddons.map((a) => {
                            const baseQty = a.quantity || 1;
                            const displayQty = item.product.isCombo ? baseQty * item.quantity : baseQty;
                            return `${a.name}${displayQty > 1 ? ` x${displayQty}` : ""}`;
                          }).join(", ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment Method */}
            <div className="rounded-xl bg-card p-4">
              <h2 className="font-bold text-foreground text-sm mb-3">Forma de pagamento</h2>
              <div className="space-y-2">
                {paymentMethods.map((pm) => (
                  <button
                    key={pm.id}
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`flex w-full items-center gap-3 rounded-lg p-3 transition-all ${
                      paymentMethod === pm.id
                        ? "bg-fire-gradient-soft border border-primary/30"
                        : "bg-background"
                    }`}
                  >
                    <pm.icon size={20} className={paymentMethod === pm.id ? "text-primary" : "text-muted-foreground"} />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">{pm.label}</p>
                      <p className="text-xs text-muted-foreground">{pm.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              {paymentMethod === "dinheiro" && (
                <div className="mt-3">
                  <label className="text-xs text-muted-foreground">Troco para quanto?</label>
                  <input
                    type="number"
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value)}
                    placeholder="Ex: 100"
                    className="mt-1 w-full rounded-lg bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>

            {/* Observations */}
            <div className="rounded-xl bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={16} className="text-primary" />
                <h2 className="font-bold text-foreground text-sm">Observações</h2>
              </div>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder={deliveryType === "delivery" ? "Ex: portão azul, interfone 302..." : "Ex: sem cebola, bem passado..."}
                maxLength={200}
                className="w-full rounded-lg bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                rows={2}
              />
            </div>




            {/* Summary */}
            <div className="rounded-xl bg-card p-4 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
              </div>
              {deliveryType === "delivery" && (
                <>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground truncate min-w-0">Taxa de entrega ({profile?.neighborhood})</span>
                    {deliveryFee === 0 ? (
                      <span className="text-green-600 font-bold">GRÁTIS 🎉</span>
                    ) : (
                      <span className="text-muted-foreground">R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>
                    )}
                  </div>
                  {(isTempFree || isKmFree || isMinOrderFree) && rawFee > 0 && (
                    <p className="text-[11px] text-green-600 font-medium">
                      {isTempFree
                        ? "🎁 Frete grátis por bairros selecionados!"
                        : isKmFree
                          ? `📍 Frete grátis por distância (até ${deliveryConfig?.free_delivery_max_km} km)`
                          : `🎉 Frete grátis em pedidos acima de R$ ${deliveryConfig?.free_delivery_min_order}`}
                    </p>
                  )}
                </>
              )}
              {deliveryType === "pickup" && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxa de entrega</span>
                  <span className="text-green-600 font-bold">RETIRADA 🏪</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Desconto ({appliedCoupon?.code})</span>
                  <span className="text-green-600 font-bold">- R$ {couponDiscount.toFixed(2).replace(".", ",")}</span>
                </div>
              )}
              <div className="border-t border-border pt-2 flex justify-between text-lg font-bold">
                <span className="text-foreground">Total</span>
                <span className="text-primary">R$ {grandTotal.toFixed(2).replace(".", ",")}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom buttons */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card p-4 safe-bottom">
        <div className="mx-auto max-w-md space-y-2">
          {(isNeighborhoodBlocked) ? (
            <button
              onClick={() => navigate("/")}
              className="w-full rounded-xl bg-muted py-4 text-center font-bold text-muted-foreground"
            >
              Voltar ao Cardápio
            </button>
          ) : (
            <>
              <button
                onClick={handlePlaceOrder}
                disabled={loading}
                className="w-full rounded-xl bg-fire-gradient py-4 text-center font-bold text-primary-foreground shadow-fire-lg transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? "Enviando..." : `Fazer Pedido • R$ ${grandTotal.toFixed(2).replace(".", ",")}`}
              </button>
              <button
                onClick={() => {
                  const message = encodeURIComponent(buildWhatsAppMessage());
                  window.open(`https://wa.me/5562994753582?text=${message}`, "_blank");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 py-3 text-sm font-semibold text-green-600 transition-all active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Pedir pelo WhatsApp
              </button>
            </>
          )}
        </div>
      </div>

      {/* PIX Payment Modal */}
      {showPixModal && pixData && (
        <PixPaymentModal
          orderId={pixData.orderId}
          qrcode={pixData.qrcode}
          qrcodeImage={pixData.qrcodeImage}
          total={grandTotal}
          expiracao={pixData.expiracao}
          onConfirmed={handlePixConfirmed}
          onCancelled={handlePixCancelled}
        />
      )}
    </div>
  );
};

export default Checkout;
