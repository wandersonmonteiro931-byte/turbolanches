import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChefHat, Truck, Package, Clock, Inbox, ThumbsUp, XCircle, PartyPopper, MessageCircle, Gift, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatTimeBR } from "@/lib/brasiliaTime";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import ReviewModal from "@/components/ReviewModal";

interface OrderData {
  id: string;
  order_number: number;
  status: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  payment_method: string;
  delivery_type: string;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  created_at: string;
  observations: string | null;
  cancellation_reason: string | null;
  paid_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivering_at: string | null;
  delivered_at: string | null;
  updated_at: string;
  coupon_code: string | null;
}

function formatTime(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return formatTimeBR(dateStr);
}

interface OrderItemData {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  observations: string | null;
  addons_json: any;
}

// Visual steps mapped to real statuses
const statusSteps = [
  { key: "received", label: "Pedido Recebido", icon: Inbox, emoji: "📩" },
  { key: "accepted", label: "Pedido Aceito", icon: ThumbsUp, emoji: "✅" },
  { key: "preparing", label: "Em Preparo", icon: ChefHat, emoji: "👨‍🍳" },
  { key: "ready", label: "Pronto", icon: Package, emoji: "📦" },
  { key: "delivering", label: "Saiu para Entrega", icon: Truck, emoji: "🏍️" },
  { key: "delivered", label: "Entregue", icon: Check, emoji: "🎉" },
];

const pickupStatusSteps = [
  { key: "received", label: "Pedido Recebido", icon: Inbox, emoji: "📩" },
  { key: "accepted", label: "Pedido Aceito", icon: ThumbsUp, emoji: "✅" },
  { key: "preparing", label: "Em Preparo", icon: ChefHat, emoji: "👨‍🍳" },
  { key: "ready", label: "Pronto para Retirada", icon: PartyPopper, emoji: "🎉" },
  { key: "delivered", label: "Retirado", icon: Check, emoji: "✅" },
];

// Map real DB status to visual step index
function getVisualStepIndex(status: string): number {
  switch (status) {
    case "pending":
    case "paid":
      return 0; // Pedido Recebido
    case "preparing":
      return 2; // Em Preparo (accepted is also completed)
    case "ready":
      return 3;
    case "delivering":
      return 4;
    case "delivered":
      return 5;
    default:
      return -1;
  }
}

const statusMessages: Record<string, { title: string; subtitle: string; animation: string }> = {
  pending: { title: "Pedido Recebido!", subtitle: "Aguardando a loja aceitar seu pedido...", animation: "📩" },
  paid: { title: "Pagamento Confirmado!", subtitle: "Aguardando a loja aceitar seu pedido...", animation: "💰" },
  preparing: { title: "Mãos na massa!", subtitle: "A loja aceitou e está preparando tudo com carinho 🔥", animation: "🍳" },
  ready: { title: "Tudo pronto!", subtitle: "Seu pedido está prontinho e quentinho!", animation: "✨" },
  delivering: { title: "A caminho!", subtitle: "Nosso entregador já saiu com seu pedido!", animation: "🏍️" },
  delivered: { title: "Bom apetite!", subtitle: "Esperamos que goste! Obrigado pela preferência ❤️", animation: "🎉" },
  cancelled: { title: "Pedido Recusado", subtitle: "Infelizmente a loja não pôde aceitar seu pedido.", animation: "😔" },
};

const OrderTracking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [items, setItems] = useState<OrderItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeAddress, setStoreAddress] = useState("");
  const [scratchEligible, setScratchEligible] = useState(false);
  const [alreadyScratched, setAlreadyScratched] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const fetchOrder = async () => {
    if (!id) return;
    const [orderRes, itemsRes, settingsRes] = await Promise.all([
      supabase.from("orders").select("*").eq("id", id).single(),
      supabase.from("order_items").select("*").eq("order_id", id),
      supabase.from("store_settings").select("store_address_full").limit(1).single(),
    ]);
    if (orderRes.data) {
      setOrder(orderRes.data);
      // Check scratch eligibility
      checkScratchEligibility(orderRes.data);
    }
    if (itemsRes.data) setItems(itemsRes.data);
    if (settingsRes.data) setStoreAddress(settingsRes.data.store_address_full || "");
    setLoading(false);
  };

  const checkScratchEligibility = async (orderData: any) => {
    if (!user) return;
    if (orderData.coupon_code) return; // Orders with coupons are not eligible
    const { data: settings } = await supabase
      .from("scratch_settings")
      .select("is_enabled, min_order_value")
      .limit(1)
      .maybeSingle();
    if (!settings || !(settings as any).is_enabled) return;
    if (Number(orderData.subtotal) < (settings as any).min_order_value) return;
    // Check if already scratched
    const { data: existing } = await supabase
      .from("scratch_wins")
      .select("id")
      .eq("order_id", orderData.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) setAlreadyScratched(true);
    // Check active prizes exist
    const { data: prizes } = await supabase
      .from("scratch_prizes")
      .select("id")
      .eq("is_active", true)
      .limit(1);
    if (prizes && prizes.length > 0) setScratchEligible(true);
  };

  // Check if already reviewed
  const checkReviewStatus = async () => {
    if (!user || !id) return;
    const { data } = await supabase
      .from("reviews")
      .select("id")
      .eq("order_id", id)
      .eq("user_id", user.id)
      .limit(1);
    if (data && data.length > 0) setAlreadyReviewed(true);
  };

  useEffect(() => {
    fetchOrder();
    checkReviewStatus();

    const channel = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `id=eq.${id}`,
      }, (payload) => {
        setOrder((prev) => prev ? { ...prev, ...payload.new } : null);
        const newStatus = (payload.new as any).status;
        if (newStatus === "preparing") toast.info("✅ Pedido aceito! Estão preparando...");
        if (newStatus === "ready") toast.info("📦 Seu pedido está pronto!");
        if (newStatus === "delivering") toast.info("🏍️ Seu pedido saiu para entrega!");
        if (newStatus === "delivered") {
          toast.success("🎉 Pedido entregue! Bom apetite!");
          // Auto-open review after 2s
          setTimeout(() => setShowReview(true), 2000);
        }
        if (newStatus === "cancelled") toast.error("😔 Pedido recusado pela loja.");
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          className="text-5xl"
        >
          🍔
        </motion.div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className="text-7xl"
        >
          😕
        </motion.span>
        <h2 className="mt-4 text-xl text-foreground font-bold">Pedido não encontrado</h2>
        <p className="text-sm text-muted-foreground mt-1">Verifique o link e tente novamente</p>
        <button onClick={() => navigate("/")} className="mt-6 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">
          Ir para o cardápio
        </button>
      </div>
    );
  }

  const isCancelled = order.status === "cancelled";
  const isDelivery = order.delivery_type === "delivery";
  const isPickup = !isDelivery;
  const currentVisualIndex = getVisualStepIndex(order.status);
  
  // For pickup, override "ready" status message
  const pickupReadyMsg = isPickup && (order.status === "ready" || order.status === "delivering")
    ? { title: "Prontinho! 🎉", subtitle: "Seu pedido está pronto pra ser retirado na nossa loja!", animation: "🥳" }
    : null;
  const msg = pickupReadyMsg || statusMessages[order.status] || statusMessages.pending;

  const visibleSteps = isPickup ? pickupStatusSteps : statusSteps;

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/90 px-4 py-4 backdrop-blur-md border-b border-border">
        <button onClick={() => navigate("/")}>
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-extrabold text-foreground">
            PEDIDO <span className="text-primary">#{String(order.order_number).padStart(5, '0')}</span>
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {new Date(order.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}{" "}
            às {formatTime(order.created_at)}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
        {/* Scratch card teaser - TOP of page */}
        {scratchEligible && order.status !== "cancelled" && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/8 via-card to-fire-orange/8 p-5 shadow-fire"
          >
            <motion.div
              className="pointer-events-none absolute -left-6 -top-6 h-20 w-20 rounded-full bg-primary/15 blur-3xl"
              animate={{ x: [0, 14, -8, 0], y: [0, -10, 6, 0], scale: [1, 1.15, 0.9, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="pointer-events-none absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-fire-orange/15 blur-3xl"
              animate={{ x: [0, -12, 6, 0], y: [0, 8, -8, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-primary to-transparent"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative flex items-center gap-3">
              <motion.div
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-fire-orange text-primary-foreground shadow-fire"
                animate={{ rotate: [0, -8, 8, -4, 4, 0], scale: [1, 1.12, 1, 1.06, 1], y: [0, -3, 0, -1, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <Gift size={24} />
              </motion.div>
              <div className="flex-1">
                {alreadyScratched ? (
                  <>
                    <p className="text-sm font-extrabold text-foreground">🎉 Você ganhou uma raspadinha nesse pedido!</p>
                    <p className="text-xs text-muted-foreground">Confira o resultado na seção <span className="font-semibold text-primary">Presentes</span>.</p>
                  </>
                ) : order.status === "delivered" ? (
                  <>
                    <motion.p className="text-sm font-extrabold text-foreground" animate={{ scale: [1, 1.02, 1] }} transition={{ duration: 2, repeat: Infinity }}>🎉 Raspadinha Liberada!</motion.p>
                    <p className="text-xs text-muted-foreground">Seu pedido foi entregue! Vá até <span className="font-semibold text-primary">Presentes</span> e raspe agora!</p>
                  </>
                ) : (
                  <>
                    <motion.p className="text-sm font-extrabold text-foreground" animate={{ scale: [1, 1.02, 1] }} transition={{ duration: 2, repeat: Infinity }}>🎁 Raspadinha Premiada!</motion.p>
                    <p className="text-xs text-muted-foreground">Ao finalizar este pedido, você ganhará uma raspadinha na seção <span className="font-semibold text-primary">Presentes</span>!</p>
                  </>
                )}
              </div>
              <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }}>
                <Sparkles size={18} className="text-fire-orange" />
              </motion.div>
            </div>
            <motion.button
              onClick={() => navigate("/presentes")}
              className="mt-3 w-full rounded-xl bg-primary/10 border border-primary/20 py-2.5 text-sm font-bold text-primary"
              whileTap={{ scale: 0.97 }}
              animate={order.status === "delivered" && !alreadyScratched ? { scale: [1, 1.03, 1] } : {}}
              transition={order.status === "delivered" && !alreadyScratched ? { duration: 1.5, repeat: Infinity } : {}}
            >
              {alreadyScratched ? "Ver Presentes" : order.status === "delivered" ? "🎁 Raspar Agora!" : "Ver Presentes"}
            </motion.button>
          </motion.div>
        )}

        {/* Status Hero */}
        <motion.div
          key={order.status}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.4 }}
          className={`rounded-2xl p-6 text-center shadow-sm ${
            isCancelled ? "bg-destructive/10" : "bg-card"
          }`}
        >
          <motion.div
            key={`emoji-${order.status}`}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.6, delay: 0.1 }}
            className="text-6xl mb-3"
          >
            {msg.animation}
          </motion.div>
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={`text-xl font-extrabold ${isCancelled ? "text-destructive" : "text-foreground"}`}
          >
            {msg.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm text-muted-foreground mt-1"
          >
            {msg.subtitle}
          </motion.p>

          {/* Pulse indicator for active statuses */}
          {!isCancelled && order.status !== "delivered" && (
            <motion.div
              className="mt-4 flex items-center justify-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <motion.div
                className="h-2.5 w-2.5 rounded-full bg-primary"
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
              <span className="text-xs font-medium text-muted-foreground">Atualização em tempo real</span>
            </motion.div>
          )}
        </motion.div>

        {/* Pickup Ready - Store Address + WhatsApp */}
        {isPickup && (order.status === "ready" || order.status === "delivering") && storeAddress && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0.4, delay: 0.2 }}
            className="rounded-2xl bg-card p-5 shadow-sm space-y-3"
          >
            <div className="flex items-center gap-2">
              <PartyPopper size={18} className="text-primary" />
              <h2 className="font-bold text-foreground text-sm">Retire na loja</h2>
            </div>
            <p className="text-sm text-foreground">{storeAddress}</p>
            <a
              href="https://wa.me/5562994753582"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-green-600 py-3 font-semibold text-white transition-all hover:bg-green-700"
            >
              <MessageCircle size={18} />
              Falar com a loja no WhatsApp
            </a>
          </motion.div>
        )}

        {/* Progress Steps */}
        {!isCancelled && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl bg-card p-5 shadow-sm"
          >
            <h2 className="font-bold text-foreground text-sm mb-4">Acompanhe seu pedido</h2>
            <div className="space-y-0">
              {visibleSteps.map((step, index) => {
                // Use key-based completion logic instead of index-based
                const stepKeyOrder: Record<string, number> = {
                  received: 0, accepted: 1, preparing: 2, ready: 3, delivering: 4, delivered: 5,
                };
                const stepOrder = stepKeyOrder[step.key] ?? 99;
                const isCompleted = stepOrder <= currentVisualIndex ||
                  (step.key === "accepted" && currentVisualIndex >= 2);
                const isCurrent =
                  (step.key === "received" && currentVisualIndex === 0) ||
                  (step.key === "accepted" && currentVisualIndex === 1) ||
                  (step.key === "preparing" && currentVisualIndex === 2) ||
                  (step.key === "ready" && (currentVisualIndex === 3 || (isPickup && currentVisualIndex === 4))) ||
                  (step.key === "delivering" && currentVisualIndex === 4) ||
                  (step.key === "delivered" && currentVisualIndex === 5);
                const StepIcon = step.icon;

                // Get timestamp for this step
                const stepTime = (() => {
                  switch (step.key) {
                    case "received": return formatTime(order.created_at);
                    case "accepted": return formatTime(order.preparing_at);
                    case "preparing": return formatTime(order.preparing_at);
                    case "ready": return formatTime(order.ready_at);
                    case "delivering": return formatTime(order.delivering_at);
                    case "delivered": return formatTime(order.delivered_at);
                    default: return null;
                  }
                })();

                return (
                  <motion.div
                    key={step.key}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.08 }}
                    className="flex gap-3"
                  >
                    <div className="flex flex-col items-center">
                      <motion.div
                        animate={isCurrent ? { scale: [1, 1.15, 1] } : {}}
                        transition={isCurrent ? { repeat: Infinity, duration: 2 } : {}}
                        className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                          isCompleted
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground"
                        } ${isCurrent ? "ring-3 ring-primary/20 ring-offset-2 ring-offset-card" : ""}`}
                      >
                        {isCompleted && !isCurrent ? <Check size={16} /> : <StepIcon size={16} />}
                      </motion.div>
                      {index < visibleSteps.length - 1 && (
                        <motion.div
                          initial={{ scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{ delay: 0.4 + index * 0.08 }}
                          className={`h-8 w-0.5 origin-top ${isCompleted ? "bg-primary" : "bg-border"}`}
                        />
                      )}
                    </div>
                    <div className="pt-1.5">
                      <p className={`text-sm font-semibold ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.label}
                      </p>
                      {isCompleted && stepTime && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {stepTime}
                        </p>
                      )}
                      {isCurrent && !stepTime && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="text-xs text-primary font-medium mt-0.5"
                        >
                          Agora
                        </motion.p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Cancelled / Refused */}
        {isCancelled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-card p-5 shadow-sm"
          >
            <div className="space-y-0">
              {/* Step 1: Received - always completed */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check size={16} />
                  </div>
                  <div className="h-8 w-0.5 bg-primary" />
                </div>
                <div className="pt-1.5">
                  <p className="text-sm font-semibold text-foreground">Pedido Recebido</p>
                </div>
              </div>
              {/* Step 2: Refused */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                    <XCircle size={16} />
                  </div>
                </div>
                <div className="pt-1.5">
                  <p className="text-sm font-semibold text-destructive">Pedido Recusado</p>
                   <p className="text-xs text-muted-foreground mt-0.5">A loja não pôde aceitar este pedido</p>
                   {order.cancellation_reason && (
                     <div className="mt-2 rounded-lg bg-destructive/10 p-2">
                       <p className="text-xs font-semibold text-destructive">Motivo:</p>
                       <p className="text-xs text-foreground">{order.cancellation_reason}</p>
                     </div>
                   )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Order Details */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl bg-card p-5 shadow-sm space-y-3"
        >
          <h2 className="font-bold text-foreground text-sm">📋 Itens do pedido</h2>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="text-foreground break-words">{item.quantity}x {item.product_name}</span>
                  {item.addons_json && Array.isArray(item.addons_json) && item.addons_json.length > 0 && (
                    <div className="ml-4">
                      {item.addons_json.map((addon: any, i: number) => (
                        <p key={i} className="text-[11px] text-muted-foreground">+ {addon.name}{(addon.quantity || 1) > 1 ? ` x${addon.quantity}` : ""}</p>
                      ))}
                    </div>
                  )}
                  {item.observations && (
                    <p className="text-[11px] text-amber-600 ml-4">📝 {item.observations}</p>
                  )}
                </div>
                <span className="text-muted-foreground whitespace-nowrap">
                  R$ {(Number(item.unit_price) * item.quantity).toFixed(2).replace(".", ",")}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-2 space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>R$ {Number(order.subtotal).toFixed(2).replace(".", ",")}</span>
            </div>
            {Number(order.delivery_fee) > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Entrega</span>
                <span>R$ {Number(order.delivery_fee).toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-foreground pt-1">
              <span>Total</span>
              <span className="text-primary">R$ {Number(order.total).toFixed(2).replace(".", ",")}</span>
            </div>
          </div>
        </motion.div>

        {/* Delivery Info */}
        {order.address_street && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-2xl bg-card p-5 shadow-sm"
          >
            <h2 className="font-bold text-foreground text-sm mb-2">📍 Endereço de entrega</h2>
            <p className="text-sm text-foreground">
              {order.address_street}, {order.address_number}
            </p>
            <p className="text-xs text-muted-foreground">{order.address_neighborhood}</p>
          </motion.div>
        )}

        {/* Observations */}
        {order.observations && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="rounded-2xl bg-card p-5 shadow-sm"
          >
            <h2 className="font-bold text-foreground text-sm mb-2">💬 Observações</h2>
            <p className="text-sm text-muted-foreground">{order.observations}</p>
          </motion.div>
        )}

        {/* WhatsApp Contact */}
        {!isCancelled && order.status !== "delivered" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
            className="rounded-2xl bg-card p-5 shadow-sm"
          >
            <h2 className="font-bold text-foreground text-sm mb-2">💬 Precisa de ajuda?</h2>
            <a
              href="https://wa.me/5562994753582"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-green-600 py-3 font-semibold text-white transition-all hover:bg-green-700"
            >
              <MessageCircle size={18} />
              Falar com a loja no WhatsApp
            </a>
          </motion.div>
        )}



        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center pt-2 pb-4"
        >
          <button
            onClick={() => navigate("/")}
            className="rounded-xl bg-secondary px-6 py-3 text-sm font-bold text-foreground"
          >
            Voltar ao cardápio
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default OrderTracking;
