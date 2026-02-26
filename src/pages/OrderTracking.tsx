import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChefHat, Truck, Package, Clock, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

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
}

interface OrderItemData {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  observations: string | null;
  addons_json: any;
}

const statusSteps = [
  { key: "pending", label: "Pedido confirmado", icon: Check, emoji: "✅" },
  { key: "preparing", label: "Em preparo", icon: ChefHat, emoji: "👨‍🍳" },
  { key: "ready", label: "Pronto", icon: Package, emoji: "📦" },
  { key: "delivering", label: "Saiu para entrega", icon: Truck, emoji: "🏍️" },
  { key: "delivered", label: "Entregue", icon: Check, emoji: "🎉" },
];

const statusOrder = ["awaiting_payment", "pending", "preparing", "ready", "delivering", "delivered"];

const statusMessages: Record<string, { title: string; subtitle: string; animation: string }> = {
  pending: { title: "Recebemos seu pedido!", subtitle: "Estamos confirmando com a cozinha...", animation: "🔔" },
  preparing: { title: "Mãos na massa!", subtitle: "Nossa equipe está preparando tudo com carinho 🔥", animation: "🍳" },
  ready: { title: "Tudo pronto!", subtitle: "Seu pedido está prontinho e quentinho!", animation: "✨" },
  delivering: { title: "A caminho!", subtitle: "Nosso entregador já saiu com seu pedido!", animation: "🏍️" },
  delivered: { title: "Bom apetite!", subtitle: "Esperamos que goste! Obrigado pela preferência ❤️", animation: "🎉" },
  awaiting_payment: { title: "Aguardando pagamento", subtitle: "Complete o pagamento para confirmar", animation: "💳" },
  cancelled: { title: "Pedido cancelado", subtitle: "Este pedido foi cancelado", animation: "❌" },
};

const OrderTracking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [items, setItems] = useState<OrderItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [prevStatus, setPrevStatus] = useState<string>("");

  const fetchOrder = async () => {
    if (!id) return;
    const [orderRes, itemsRes] = await Promise.all([
      supabase.from("orders").select("*").eq("id", id).single(),
      supabase.from("order_items").select("*").eq("order_id", id),
    ]);
    if (orderRes.data) setOrder(orderRes.data);
    if (itemsRes.data) setItems(itemsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrder();

    const channel = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `id=eq.${id}`,
      }, (payload) => {
        setOrder((prev) => {
          if (prev) setPrevStatus(prev.status);
          return prev ? { ...prev, ...payload.new } : null;
        });
        const newStatus = (payload.new as any).status;
        if (newStatus === "preparing") toast.info("🍳 Seu pedido está sendo preparado!");
        if (newStatus === "delivering") toast.info("🏍️ Seu pedido saiu para entrega!");
        if (newStatus === "delivered") toast.success("✅ Pedido entregue! Bom apetite!");
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
        <button onClick={() => navigate("/")} className="mt-6 rounded-xl bg-fire-gradient px-6 py-3 font-bold text-primary-foreground shadow-fire">
          Ir para o cardápio
        </button>
      </div>
    );
  }

  const currentStepIndex = statusOrder.indexOf(order.status);
  const isAwaitingPayment = order.status === "awaiting_payment";
  const isCancelled = order.status === "cancelled";
  const msg = statusMessages[order.status] || statusMessages.pending;

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/90 px-4 py-4 backdrop-blur-md border-b border-border">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h1 className="text-lg font-extrabold text-foreground">
          PEDIDO <span className="text-primary">#{String(order.order_number).padStart(5, '0')}</span>
        </h1>
      </header>

      <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
        {/* Status Hero */}
        <motion.div
          key={order.status}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.4 }}
          className="rounded-2xl bg-card p-6 text-center shadow-sm"
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
            className="text-xl font-extrabold text-foreground"
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

        {/* Awaiting Payment */}
        {isAwaitingPayment && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-card p-6 text-center space-y-3 shadow-sm"
          >
            <QrCode size={48} className="mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">
              Quando a integração PIX estiver configurada, o QR Code aparecerá aqui.
            </p>
            <div className="rounded-xl bg-background p-4">
              <p className="text-xs text-muted-foreground mb-1">Valor a pagar:</p>
              <p className="text-3xl font-extrabold text-primary">
                R$ {Number(order.total).toFixed(2).replace(".", ",")}
              </p>
            </div>
          </motion.div>
        )}

        {/* Progress Steps */}
        {!isAwaitingPayment && !isCancelled && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl bg-card p-5 shadow-sm"
          >
            <h2 className="font-bold text-foreground text-sm mb-4">Acompanhe seu pedido</h2>
            <div className="space-y-0">
              {statusSteps.map((step, index) => {
                const stepIndex = statusOrder.indexOf(step.key);
                const isCompleted = currentStepIndex >= stepIndex;
                const isCurrent = currentStepIndex === stepIndex;
                const StepIcon = step.icon;

                return (
                  <motion.div
                    key={step.key}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="flex gap-3"
                  >
                    <div className="flex flex-col items-center">
                      <motion.div
                        animate={isCurrent ? { scale: [1, 1.15, 1] } : {}}
                        transition={isCurrent ? { repeat: Infinity, duration: 2 } : {}}
                        className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                          isCompleted
                            ? "bg-primary text-primary-foreground shadow-fire"
                            : "bg-secondary text-muted-foreground"
                        } ${isCurrent ? "ring-3 ring-primary/20 ring-offset-2 ring-offset-card" : ""}`}
                      >
                        <StepIcon size={16} />
                      </motion.div>
                      {index < statusSteps.length - 1 && (
                        <motion.div
                          initial={{ scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{ delay: 0.4 + index * 0.1 }}
                          className={`h-8 w-0.5 origin-top ${isCompleted ? "bg-primary" : "bg-border"}`}
                        />
                      )}
                    </div>
                    <div className="pt-1.5">
                      <p className={`text-sm font-semibold ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.label}
                      </p>
                      {isCurrent && (
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

        {/* Cancelled */}
        {isCancelled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-destructive/10 p-6 text-center"
          >
            <span className="text-5xl">❌</span>
            <h2 className="mt-2 text-lg font-bold text-destructive">Pedido Cancelado</h2>
          </motion.div>
        )}

        {/* Order Items */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl bg-card p-5 shadow-sm"
        >
          <h2 className="font-bold text-foreground text-sm mb-3">🛒 Itens do pedido</h2>
          <div className="space-y-2">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.05 }}
                className="flex justify-between text-sm py-1"
              >
                <span className="text-foreground">
                  <span className="font-semibold text-primary">{item.quantity}x</span> {item.product_name}
                </span>
                <span className="text-muted-foreground font-medium">
                  R$ {(Number(item.unit_price) * item.quantity).toFixed(2).replace(".", ",")}
                </span>
              </motion.div>
            ))}
          </div>
          <div className="mt-3 border-t border-border pt-3 space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>R$ {Number(order.subtotal).toFixed(2).replace(".", ",")}</span>
            </div>
            {Number(order.delivery_fee) > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Taxa de entrega</span>
                <span>R$ {Number(order.delivery_fee).toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-foreground pt-1">
              <span>Total</span>
              <span className="text-primary text-lg">R$ {Number(order.total).toFixed(2).replace(".", ",")}</span>
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
            <h2 className="font-bold text-foreground text-sm mb-1">📍 Entrega</h2>
            <p className="text-sm text-muted-foreground">
              {order.address_street}, {order.address_number} - {order.address_neighborhood}
            </p>
          </motion.div>
        )}

        {/* Payment Method */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="rounded-2xl bg-card p-5 shadow-sm"
        >
          <h2 className="font-bold text-foreground text-sm mb-1">💰 Pagamento</h2>
          <p className="text-sm text-muted-foreground capitalize">
            {order.payment_method === "pix" ? "PIX" : order.payment_method === "credit_card" ? "Cartão de Crédito" : order.payment_method === "debit_card" ? "Cartão de Débito" : order.payment_method === "cash" ? "Dinheiro" : order.payment_method}
          </p>
        </motion.div>

        {/* Order time */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-xs text-muted-foreground pb-4"
        >
          Pedido realizado em {new Date(order.created_at).toLocaleDateString("pt-BR")} às {new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </motion.div>
      </div>
    </div>
  );
};

export default OrderTracking;
