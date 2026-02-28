import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, Truck, Clock, ChefHat, Package, Printer, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAlarmSound } from "@/hooks/useAlarmSound";

interface Order {
  id: string;
  user_id: string;
  status: string;
  total: number;
  delivery_fee: number;
  payment_method: string;
  payment_confirmed: boolean;
  delivery_type: string;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  created_at: string;
  observations: string | null;
  priority: boolean;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  observations: string | null;
  addons_json: any;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Novo", color: "bg-amber-100 text-amber-800", icon: Clock },
  paid: { label: "Novo (Pago)", color: "bg-green-100 text-green-800", icon: Check },
  accepted: { label: "Aceito", color: "bg-blue-100 text-blue-800", icon: Check },
  preparing: { label: "Preparando", color: "bg-purple-100 text-purple-800", icon: ChefHat },
  ready: { label: "Pronto", color: "bg-emerald-100 text-emerald-800", icon: Package },
  delivering: { label: "Saiu p/ entrega", color: "bg-cyan-100 text-cyan-800", icon: Truck },
  delivered: { label: "Entregue", color: "bg-green-100 text-green-800", icon: Check },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-800", icon: X },
};

const nextStatus: Record<string, string> = {
  pending: "preparing",
  paid: "preparing",
  preparing: "ready",
  ready: "delivering",
  delivering: "delivered",
};

const AdminOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [profiles, setProfiles] = useState<Record<string, { customer_code: number; full_name: string }>>({});
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Alarm: plays while there are pending orders
  const hasPendingOrders = orders.some((o) => o.status === "pending" || o.status === "paid");
  useAlarmSound(hasPendingOrders);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setOrders(data);
      const userIds = [...new Set(data.map(o => o.user_id))];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, customer_code, full_name")
          .in("user_id", userIds);
        if (profilesData) {
          const map: Record<string, { customer_code: number; full_name: string }> = {};
          profilesData.forEach(p => { map[p.user_id] = p; });
          setProfiles(map);
        }
      }
    }
  };

  const fetchItems = async (orderId: string) => {
    if (items[orderId]) return;
    const { data } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);
    if (data) setItems((prev) => ({ ...prev, [orderId]: data }));
  };

  useEffect(() => {
    fetchOrders();

    // Polling every 1 second to ensure no order is missed
    const interval = setInterval(fetchOrders, 1000);

    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if (payload.eventType === "INSERT") {
          toast({ title: "🔔 Novo pedido!", description: "Um novo pedido acaba de chegar." });
        }
        fetchOrders();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const updateStatus = async (orderId: string, newStatus: string) => {
    const updateData: any = { status: newStatus };
    const now = new Date().toISOString();
    if (newStatus === "preparing") updateData.preparing_at = now;
    if (newStatus === "ready") updateData.ready_at = now;
    if (newStatus === "delivering") updateData.delivering_at = now;
    if (newStatus === "delivered") updateData.delivered_at = now;
    
    const { error: updateErr } = await supabase.from("orders").update(updateData).eq("id", orderId);
    if (updateErr) {
      toast({ title: "Erro ao atualizar pedido", variant: "destructive" });
      return;
    }
    await fetchOrders();
    setExpandedOrder(orderId);
    toast({ title: `Pedido atualizado para: ${statusConfig[newStatus]?.label}` });

    // Impressão automática por status — com retry garantido
    if (newStatus === "preparing") {
      safePrint(`/admin/imprimir/${orderId}?tipo=cozinha`);
    } else if (newStatus === "delivering") {
      safePrint(`/admin/imprimir/${orderId}?tipo=entrega_cliente`);
    }
  };

  // Abre janela de impressão — apenas 1 tentativa, avisa se bloqueado
  const safePrint = (url: string) => {
    const win = window.open(url, "_blank", "width=300,height=600");
    if (!win || win.closed) {
      toast({ title: "❌ Popup bloqueado! Permita popups neste site para impressão automática.", variant: "destructive" });
    }
  };

  const printReceipt = (orderId: string, tipo: "cozinha" | "entrega" | "cliente", delayMs?: number) => {
    const delayParam = typeof delayMs === "number" ? `&delay_ms=${delayMs}` : "";
    safePrint(`/admin/imprimir/${orderId}?tipo=${tipo}${delayParam}`);
  };

  const printEntregaCliente = (orderId: string) => {
    safePrint(`/admin/imprimir/${orderId}?tipo=entrega_cliente`);
  };

  const toggleExpand = (orderId: string) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
    } else {
      setExpandedOrder(orderId);
      fetchItems(orderId);
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => {
            fetchOrders();
            toast({ title: "✅ Pedidos atualizados" });
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
        {Object.entries(statusConfig).map(([key, val]) => {
          const count = orders.filter((o) => o.status === key).length;
          if (count === 0) return null;
          return (
            <span key={key} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${val.color}`}>
              {val.label} ({count})
            </span>
          );
        })}
      </div>

      {orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Package size={48} className="mb-3 opacity-50" />
          <p className="text-sm">Nenhum pedido ainda</p>
        </div>
      )}

      {orders.map((order) => {
        const status = statusConfig[order.status] || statusConfig.pending;
        const StatusIcon = status.icon;
        const next = nextStatus[order.status];

        return (
          <div key={order.id} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <button
              onClick={() => toggleExpand(order.id)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${status.color}`}>
                <StatusIcon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-foreground">#{String((order as any).order_number).padStart(5, '0')}</span>
                  {(() => {
                    const profile = profiles[order.user_id];
                    const code = profile?.customer_code ? `T${String(profile.customer_code).padStart(5, '0')}` : "";
                    return code ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        CLIENTE: {code}
                      </span>
                    ) : null;
                  })()}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
                    {status.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatTime(order.created_at)} · {order.delivery_type === "delivery" ? "Entrega" : "Retirada"} · {order.payment_method.toUpperCase()}
                  {profiles[order.user_id]?.full_name ? ` · ${profiles[order.user_id].full_name}` : ""}
                </p>
              </div>
              <span className="text-sm font-bold text-foreground">R$ {Number(order.total).toFixed(2)}</span>
            </button>

            {expandedOrder === order.id && (
              <div className="border-t border-border px-4 pb-4 pt-3">
                {order.address_street && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    📍 {order.address_street}, {order.address_number} - {order.address_neighborhood}
                  </p>
                )}
                {order.observations && (
                  <p className="mb-2 text-xs text-muted-foreground">💬 {order.observations}</p>
                )}

                <div className="space-y-1.5 mb-3">
                  {(items[order.id] || []).map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">
                        {item.quantity}x {item.product_name}
                      </span>
                      <span className="text-muted-foreground">
                        R$ {(Number(item.unit_price) * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => printReceipt(order.id, "cozinha")}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    <Printer size={14} /> Cozinha
                  </button>
                  <button
                    onClick={() => printEntregaCliente(order.id)}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    <Printer size={14} /> Entrega+Cliente
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  {order.status === "preparing" && (
                    <button
                      onClick={async () => {
                        await supabase.from("orders").update({ priority: !order.priority }).eq("id", order.id);
                        toast({ title: order.priority ? "Prioridade removida" : "⚡ Pedido marcado como PRIORIDADE" });
                        fetchOrders();
                      }}
                      className={`rounded-lg border px-4 py-2 text-sm font-bold ${
                        order.priority
                          ? "border-purple-500 bg-purple-50 text-purple-700"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      ⚡ {order.priority ? "Remover Prioridade" : "Marcar Prioridade"}
                    </button>
                  )}
                  {order.payment_method !== "fiado" && order.status !== "cancelled" && (
                    <button
                      onClick={async () => {
                        await supabase.from("orders").update({ payment_method: "fiado", payment_confirmed: false }).eq("id", order.id);
                        toast({ title: "📝 Pedido marcado como Fiado" });
                        fetchOrders();
                      }}
                      className="rounded-lg border border-amber-500 px-4 py-2 text-sm font-bold text-amber-600"
                    >
                      📝 Marcar Fiado
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  {next && (
                    <button
                      onClick={() => updateStatus(order.id, next)}
                      className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
                    >
                      {next === "preparing" ? "✅ Aceitar" : `Avançar → ${statusConfig[next]?.label}`}
                    </button>
                  )}
                  {order.status !== "cancelled" && (
                    <button
                      onClick={() => updateStatus(order.id, "cancelled")}
                      className="rounded-lg border border-destructive px-4 py-2.5 text-sm font-bold text-destructive"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AdminOrders;
