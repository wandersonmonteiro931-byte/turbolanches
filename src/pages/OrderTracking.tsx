import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChefHat, Truck, Package, Clock, QrCode, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface OrderData {
  id: string;
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
  { key: "pending", label: "Pedido confirmado", icon: Check },
  { key: "preparing", label: "Em preparo", icon: ChefHat },
  { key: "ready", label: "Pronto", icon: Package },
  { key: "delivering", label: "Saiu para entrega", icon: Truck },
  { key: "delivered", label: "Entregue", icon: Check },
];

const statusOrder = ["awaiting_payment", "pending", "preparing", "ready", "delivering", "delivered"];

const OrderTracking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [items, setItems] = useState<OrderItemData[]>([]);
  const [loading, setLoading] = useState(true);

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

    // Subscribe to realtime updates
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
        if (newStatus === "preparing") toast.info("🍳 Seu pedido está sendo preparado!");
        if (newStatus === "delivering") toast.info("🏍️ Seu pedido saiu para entrega!");
        if (newStatus === "delivered") toast.success("✅ Pedido entregue!");
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando pedido...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <span className="text-6xl">😕</span>
        <h2 className="mt-4 text-xl text-foreground">Pedido não encontrado</h2>
        <button onClick={() => navigate("/pedidos")} className="mt-4 rounded-xl bg-fire-gradient px-6 py-3 font-bold text-primary-foreground">
          Ver meus pedidos
        </button>
      </div>
    );
  }

  const currentStepIndex = statusOrder.indexOf(order.status);
  const isAwaitingPayment = order.status === "awaiting_payment";
  const isCancelled = order.status === "cancelled";

  return (
    <div className="min-h-screen bg-background pb-8">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/90 px-4 py-4 backdrop-blur-md">
        <button onClick={() => navigate("/pedidos")}>
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h1 className="text-2xl text-fire-gradient">PEDIDO #{order.id.slice(0, 6)}</h1>
      </header>

      <div className="mx-auto max-w-md px-4 space-y-4">
        {/* Awaiting Payment */}
        {isAwaitingPayment && (
          <div className="rounded-xl bg-card p-6 text-center space-y-3">
            <QrCode size={48} className="mx-auto text-primary" />
            <h2 className="text-lg font-bold text-foreground">Aguardando Pagamento PIX</h2>
            <p className="text-sm text-muted-foreground">
              Quando a integração PIX Efí estiver configurada, o QR Code aparecerá aqui automaticamente.
            </p>
            <div className="rounded-lg bg-background p-4">
              <p className="text-xs text-muted-foreground mb-1">Valor a pagar:</p>
              <p className="text-2xl font-bold text-primary">
                R$ {Number(order.total).toFixed(2).replace(".", ",")}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              O status será atualizado automaticamente após a confirmação do pagamento.
            </p>
          </div>
        )}

        {/* Cancelled */}
        {isCancelled && (
          <div className="rounded-xl bg-destructive/10 p-4 text-center">
            <span className="text-4xl">❌</span>
            <h2 className="mt-2 text-lg font-bold text-destructive">Pedido Cancelado</h2>
          </div>
        )}

        {/* Progress Steps */}
        {!isAwaitingPayment && !isCancelled && (
          <div className="rounded-xl bg-card p-4">
            <h2 className="font-bold text-foreground text-sm mb-4">Acompanhe seu pedido</h2>
            <div className="space-y-0">
              {statusSteps.map((step, index) => {
                const stepIndex = statusOrder.indexOf(step.key);
                const isCompleted = currentStepIndex >= stepIndex;
                const isCurrent = currentStepIndex === stepIndex;
                const StepIcon = step.icon;

                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                          isCompleted
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground"
                        } ${isCurrent ? "ring-2 ring-primary/30 ring-offset-2 ring-offset-card" : ""}`}
                      >
                        <StepIcon size={14} />
                      </div>
                      {index < statusSteps.length - 1 && (
                        <div className={`h-8 w-0.5 ${isCompleted ? "bg-primary" : "bg-border"}`} />
                      )}
                    </div>
                    <div className="pt-1">
                      <p className={`text-sm font-semibold ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order Items */}
        <div className="rounded-xl bg-card p-4">
          <h2 className="font-bold text-foreground text-sm mb-2">Itens</h2>
          <div className="space-y-1.5">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-foreground">{item.quantity}x {item.product_name}</span>
                <span className="text-muted-foreground">
                  R$ {(Number(item.unit_price) * item.quantity).toFixed(2).replace(".", ",")}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-border pt-2 space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>R$ {Number(order.subtotal).toFixed(2).replace(".", ",")}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Taxa de entrega</span>
              <span>R$ {Number(order.delivery_fee).toFixed(2).replace(".", ",")}</span>
            </div>
            <div className="flex justify-between font-bold text-foreground">
              <span>Total</span>
              <span className="text-primary">R$ {Number(order.total).toFixed(2).replace(".", ",")}</span>
            </div>
          </div>
        </div>

        {/* Delivery Info */}
        {order.address_street && (
          <div className="rounded-xl bg-card p-4">
            <h2 className="font-bold text-foreground text-sm mb-1">Entrega</h2>
            <p className="text-sm text-muted-foreground">
              {order.address_street}, {order.address_number} - {order.address_neighborhood}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderTracking;
