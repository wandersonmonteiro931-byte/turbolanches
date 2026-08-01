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
import { validateCouponForOrder } from "@/lib/couponValidation";
import { normalizeSearch } from "@/lib/searchNormalize";

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
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/auth", { state: { from: "/checkout" } });
      return;
    }
    if (!storeId) return;

    Promise.all([
      supabase.from("profiles").select("full_name, phone, street, number, complement, neighborhood, quadra, lote, city, state").eq("user_id", user.id).single(),
      supabase.from("delivery_zones").select("neighborhood, delivery_fee, distance_km, temp_free_delivery").eq("active", true).eq("store_id", storeId),
      supabase.from("store_settings").select("free_delivery_min_order, free_delivery_max_km, temp_free_delivery_all, max_serving_km, max_serving_km_active, prep_time_minutes, delivery_time_minutes, pickup_time_minutes, store_address_full").eq("store_id", storeId).limit(1).single(),
    ]).then(([profileRes, zonesRes, configRes]) => {
      if (profileRes.data) {
        const p = profileRes.data;
        if (!p.full_name || !p.phone || !p.street || !p.number || !p.neighborhood || !p.quadra || !p.lote) {
          toast.error("Complete os campos obrigatórios do cadastro");
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
  }, [navigate, storeId, user]);

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
    (z) => normalizeSearch(z.neighborhood) === normalizeSearch(profile?.neighborhood)
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




  // Coupon discount applies only to subtotal, never to delivery fee
  const safeCouponDiscount = Math.min(couponDiscount, totalPrice);
  const grandTotal = Math.max(0, totalPrice - safeCouponDiscount) + deliveryFee;

  // Estimated time
  const estimatedTime = deliveryType === "pickup"
    ? (deliveryConfig?.pickup_time_minutes || 20)
    : ((deliveryConfig?.prep_time_minutes || 25) + (deliveryConfig?.delivery_time_minutes || 30));

  const createOrderAndItems = async () => {
    if (!user || !profile || !storeId) throw new Error("Usuário, perfil ou loja não identificados");

    const secureItems = items.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
      observations: item.observations || null,
      addons: item.selectedAddons.map((addon) => ({
        id: addon.id,
        quantity: addon.quantity || 1,
      })),
    }));

    const changeForNum = paymentMethod === "dinheiro" && changeFor
      ? Number(changeFor.replace(",", "."))
      : null;

    const { data, error } = await (supabase as any).rpc("create_secure_customer_order", {
      _store_id: storeId,
      _items: secureItems,
      _delivery_type: deliveryType,
      _payment_method: paymentMethod,
      _coupon_code: appliedCoupon?.code || null,
      _observations: observations || null,
      _change_for: changeForNum,
    });

    if (error) throw error;
    if (!data?.id) throw new Error("O pedido não foi criado corretamente");

    return data as {
      id: string;
      order_number: number | null;
      subtotal: number;
      delivery_fee: number;
      discount: number;
      total: number;
    };
  };

  const handlePlaceOrder = async () => {
    if (!user || !profile) return;
    if (!storeIsOpen) {
      toast.error("A loja está fechada no momento");
      return;
    }

    if (appliedCoupon) {
      const validation = await validateCouponForOrder({
        couponCode: appliedCoupon.code,
        totalPrice,
        userId: user.id,
        storeId,
      });

      if (!validation.valid) {
        toast.error(validation.error ?? "Este cupom não pode mais ser utilizado");
        return;
      }
    }

    setLoading(true);

    try {
      const order = await createOrderAndItems();

      if (paymentMethod === "pix") {
        // Generate PIX charge via edge function
        const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sessão expirada");

        const resp = await fetch(
          `${supabaseUrl}/functions/v1/pix-efi/create-charge`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              order_id: order.id,
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
          total: Number(pixResult.amount ?? order.total),
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
              {safeCouponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Desconto ({appliedCoupon?.code})</span>
                  <span className="text-green-600 font-bold">- R$ {safeCouponDiscount.toFixed(2).replace(".", ",")}</span>
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
            <button
              onClick={handlePlaceOrder}
              disabled={loading}
              className="w-full rounded-xl bg-fire-gradient py-4 text-center font-bold text-primary-foreground shadow-fire-lg transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Enviando..." : `Fazer Pedido • R$ ${grandTotal.toFixed(2).replace(".", ",")}`}
            </button>
          )}
        </div>
      </div>

      {/* PIX Payment Modal */}
      {showPixModal && pixData && (
        <PixPaymentModal
          orderId={pixData.orderId}
          qrcode={pixData.qrcode}
          qrcodeImage={pixData.qrcodeImage}
          total={pixData.total}
          expiracao={pixData.expiracao}
          onConfirmed={handlePixConfirmed}
          onCancelled={handlePixCancelled}
        />
      )}
    </div>
  );
};

export default Checkout;
