import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, CreditCard, Banknote, MessageSquare, Truck } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStoreStatus } from "@/hooks/useStoreStatus";

interface Profile {
  full_name: string;
  phone: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
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
}

const paymentMethods = [
  { id: "dinheiro", label: "Dinheiro", icon: Banknote, description: "Pague na entrega" },
  { id: "cartao", label: "Cartão", icon: CreditCard, description: "Débito/Crédito na entrega" },
];

const Checkout = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOpen: storeIsOpen } = useStoreStatus();
  const { items, totalPrice, clearCart } = useCart();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("dinheiro");
  const [changeFor, setChangeFor] = useState("");
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/auth", { state: { from: "/checkout" } });
      return;
    }
    // Fetch profile, delivery zones, and delivery config in parallel
    Promise.all([
      supabase.from("profiles").select("full_name, phone, street, number, complement, neighborhood, city, state").eq("user_id", user.id).single(),
      supabase.from("delivery_zones").select("neighborhood, delivery_fee, distance_km, temp_free_delivery"),
      supabase.from("store_settings").select("free_delivery_min_order, free_delivery_max_km, temp_free_delivery_all, max_serving_km, max_serving_km_active").limit(1).single(),
    ]).then(([profileRes, zonesRes, configRes]) => {
      if (profileRes.data) {
        const p = profileRes.data;
        if (!p.full_name || !p.phone || !p.street || !p.neighborhood) {
          toast.error("Complete seu perfil antes de finalizar o pedido");
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
        });
      }
      setProfileLoading(false);
    });
  }, [user]);

  if (!user) {
    navigate("/auth");
    return null;
  }

  if (items.length === 0 && !loading) {
    navigate("/carrinho");
    return null;
  }

  const matchedZone = deliveryZones.find(
    (z) => z.neighborhood.toLowerCase() === profile?.neighborhood?.toLowerCase()
  );

  // Check if neighborhood is blocked (max serving km)
  const isNeighborhoodBlocked = deliveryConfig?.max_serving_km_active &&
    matchedZone?.distance_km !== null && matchedZone?.distance_km !== undefined &&
    matchedZone.distance_km >= 0 &&
    deliveryConfig.max_serving_km !== null &&
    matchedZone.distance_km > deliveryConfig.max_serving_km;

  // Calculate delivery fee considering free delivery rules
  const rawFee = matchedZone ? Number(matchedZone.delivery_fee) : 5.99;
  const isTempFree = matchedZone?.temp_free_delivery || deliveryConfig?.temp_free_delivery_all;
  const isAutoFree = deliveryConfig &&
    deliveryConfig.free_delivery_min_order > 0 &&
    totalPrice >= deliveryConfig.free_delivery_min_order &&
    (deliveryConfig.free_delivery_max_km === 0 ||
      (matchedZone?.distance_km !== null && matchedZone?.distance_km !== undefined && matchedZone.distance_km <= deliveryConfig.free_delivery_max_km));

  const deliveryFee = (isTempFree || isAutoFree) ? 0 : rawFee;
  const grandTotal = totalPrice + deliveryFee;

  const handlePlaceOrder = async () => {
    if (!user || !profile) return;
    if (!storeIsOpen) {
      toast.error("A loja está fechada no momento");
      return;
    }
    setLoading(true);

    try {
      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          subtotal: totalPrice,
          delivery_fee: deliveryFee,
          total: grandTotal,
          status: "pending",
          delivery_type: "delivery",
          payment_method: paymentMethod,
          address_street: profile.street,
          address_number: profile.number,
          address_complement: profile.complement,
          address_neighborhood: profile.neighborhood,
          observations: observations || null,
          change_for: paymentMethod === "dinheiro" && changeFor ? Number(changeFor) : null,
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price + item.selectedAddons.reduce((s, a) => s + a.price, 0),
        observations: item.observations || null,
        addons_json: item.selectedAddons.length > 0 ? JSON.parse(JSON.stringify(item.selectedAddons)) : null,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      clearCart();
      toast.success("Pedido enviado com sucesso! 🔥");
      sendWhatsAppNotification(order.id, profile, grandTotal, paymentMethod);
      navigate(`/pedido/${order.id}`);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar pedido");
    } finally {
      setLoading(false);
    }
  };

  const sendWhatsAppNotification = (orderId: string, profile: Profile, total: number, payment: string) => {
    const itemsList = items
      .map((i) => `${i.quantity}x ${i.product.name}`)
      .join("\n");
    const message = encodeURIComponent(
      `🍔 *NOVO PEDIDO - TURBO LANCHES*\n\n` +
      `Pedido #${orderId.slice(0, 6)}\n` +
      `Cliente: ${profile.full_name}\n` +
      `Telefone: ${profile.phone}\n` +
      `Endereço: ${profile.street}, ${profile.number} - ${profile.neighborhood}\n\n` +
      `${itemsList}\n\n` +
      `Total: R$ ${total.toFixed(2).replace(".", ",")}\n` +
      `Pagamento: ${payment.toUpperCase()}`
    );
    // Open WhatsApp in new tab - store owner's number
    window.open(`https://wa.me/5500000000000?text=${message}`, "_blank");
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
        {/* Blocked Neighborhood Warning */}
        {isNeighborhoodBlocked && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-5 text-center space-y-2">
            <Truck size={32} className="mx-auto text-destructive" />
            <h2 className="text-base font-bold text-destructive">Região fora da área de entrega</h2>
            <p className="text-sm text-muted-foreground">
              Infelizmente hoje não estamos fazendo entrega na sua região. Obrigado pela preferência! 🙏
            </p>
            <button onClick={() => navigate("/completar-perfil")} className="mt-2 text-sm font-semibold text-primary underline">
              Alterar endereço
            </button>
          </div>
        )}

        {/* Delivery Address */}
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
          <button
            onClick={() => navigate("/completar-perfil")}
            className="mt-2 text-xs font-semibold text-primary"
          >
            Alterar endereço
          </button>
        </div>

        {!isNeighborhoodBlocked && (
          <>
            {/* Order Items */}
            <div className="rounded-xl bg-card p-4">
              <h2 className="font-bold text-foreground text-sm mb-2">Itens do pedido</h2>
              <div className="space-y-2">
                {items.map((item, index) => {
                  const addonsTotal = item.selectedAddons.reduce((s, a) => s + a.price, 0);
                  const lineTotal = (item.product.price + addonsTotal) * item.quantity;
                  return (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-foreground">
                        {item.quantity}x {item.product.name}
                      </span>
                      <span className="text-muted-foreground">
                        R$ {lineTotal.toFixed(2).replace(".", ",")}
                      </span>
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
                placeholder="Ex: portão azul, interfone 302..."
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
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Taxa de entrega ({profile?.neighborhood})</span>
                {deliveryFee === 0 ? (
                  <span className="text-green-600 font-bold">GRÁTIS 🎉</span>
                ) : (
                  <span className="text-muted-foreground">R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>
                )}
              </div>
              {(isTempFree || isAutoFree) && rawFee > 0 && (
                <p className="text-[11px] text-green-600 font-medium">
                  {isTempFree ? "🎁 Frete grátis temporário ativo!" : `🎉 Frete grátis em pedidos acima de R$ ${deliveryConfig?.free_delivery_min_order}`}
                </p>
              )}
              <div className="border-t border-border pt-2 flex justify-between text-lg font-bold">
                <span className="text-foreground">Total</span>
                <span className="text-primary">R$ {grandTotal.toFixed(2).replace(".", ",")}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card p-4 safe-bottom">
        <div className="mx-auto max-w-md">
          {isNeighborhoodBlocked ? (
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
    </div>
  );
};

export default Checkout;
