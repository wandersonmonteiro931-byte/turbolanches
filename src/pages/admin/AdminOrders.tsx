import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, Truck, Clock, ChefHat, Package, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  awaiting_payment: { label: "Aguardando Pgto", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  pending: { label: "Novo", color: "bg-amber-100 text-amber-800", icon: Clock },
  accepted: { label: "Aceito", color: "bg-blue-100 text-blue-800", icon: Check },
  preparing: { label: "Preparando", color: "bg-purple-100 text-purple-800", icon: ChefHat },
  ready: { label: "Pronto", color: "bg-emerald-100 text-emerald-800", icon: Package },
  delivering: { label: "Saiu p/ entrega", color: "bg-cyan-100 text-cyan-800", icon: Truck },
  delivered: { label: "Entregue", color: "bg-green-100 text-green-800", icon: Check },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-800", icon: X },
};

const nextStatus: Record<string, string> = {
  pending: "preparing",
  preparing: "ready",
  ready: "delivering",
  delivering: "delivered",
};

const AdminOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setOrders(data);
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

    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if (payload.eventType === "INSERT") {
          // Play notification sound
          try {
            const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==");
            audio.play().catch(() => {});
          } catch {}
          toast({ title: "🔔 Novo pedido!", description: "Um novo pedido acaba de chegar." });
        }
        fetchOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  type PrintTipo = "cozinha" | "entrega" | "cliente";
  type PreparedPrintBatch = { commit: () => void; cancel: () => void };

  const preparePrintBatch = (orderId: string, jobs: { tipo: PrintTipo; delayMs?: number }[]): PreparedPrintBatch | null => {
    const opened = jobs.map(({ tipo, delayMs = 0 }) => ({
      tipo,
      delayMs,
      win: window.open("", `print_${tipo}_${Date.now()}_${Math.random().toString(36).slice(2)}`, "width=400,height=600"),
    }));

    if (opened.some((entry) => !entry.win)) {
      opened.forEach((entry) => entry.win?.close());
      toast({ title: "⚠️ Popup bloqueado! Permita popups para impressão.", variant: "destructive" });
      return null;
    }

    return {
      commit: () => {
        opened.forEach(({ win, tipo, delayMs }) => {
          const goToPrint = () => {
            if (!win || win.closed) return;
            win.location.href = `/admin/imprimir/${orderId}?tipo=${tipo}`;
          };

          if (delayMs > 0) window.setTimeout(goToPrint, delayMs);
          else goToPrint();
        });
      },
      cancel: () => opened.forEach(({ win }) => win?.close()),
    };
  };

  const printReceipt = (orderId: string, tipo: PrintTipo) => {
    const batch = preparePrintBatch(orderId, [{ tipo }]);
    batch?.commit();
  };

  const printDeliveryAndCustomer = (orderId: string) => {
    const batch = preparePrintBatch(orderId, [
      { tipo: "entrega" },
      { tipo: "cliente", delayMs: 1800 },
    ]);
    batch?.commit();
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    const queuedPrint =
      newStatus === "preparing"
        ? preparePrintBatch(orderId, [{ tipo: "cozinha" }])
        : newStatus === "delivering"
          ? preparePrintBatch(orderId, [
              { tipo: "entrega" },
              { tipo: "cliente", delayMs: 1800 },
            ])
          : null;

    const updateData: any = { status: newStatus };
    if (newStatus === "preparing") updateData.preparing_at = new Date().toISOString();
    if (newStatus === "ready") updateData.ready_at = new Date().toISOString();

    const { error: updateErr } = await supabase.from("orders").update(updateData).eq("id", orderId);
    if (updateErr) {
      queuedPrint?.cancel();
      toast({ title: "Erro ao atualizar pedido", variant: "destructive" });
      return;
    }

    await fetchOrders();
    setExpandedOrder(orderId);
    toast({ title: `Pedido atualizado para: ${statusConfig[newStatus]?.label}` });

    queuedPrint?.commit();
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
      <div className="flex flex-wrap gap-2 mb-4">
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
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">#{String((order as any).order_number).padStart(5, '0')}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
                    {status.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatTime(order.created_at)} · {order.delivery_type === "delivery" ? "Entrega" : "Retirada"} · {order.payment_method.toUpperCase()}
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
                    onClick={() => window.open(`/admin/imprimir/${order.id}?tipo=cozinha`, `reprint_cozinha_${Date.now()}`, "width=400,height=600")}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    <Printer size={14} /> Cozinha
                  </button>
                  <button
                    onClick={() => {
                      window.open(`/admin/imprimir/${order.id}?tipo=entrega`, `reprint_entrega_${Date.now()}`, "width=400,height=600");
                      setTimeout(() => window.open(`/admin/imprimir/${order.id}?tipo=cliente`, `reprint_cliente_${Date.now()}`, "width=400,height=600"), 1800);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    <Printer size={14} /> Entrega + Cliente
                  </button>
                  <button
                    onClick={() => window.open(`/admin/imprimir/${order.id}?tipo=entrega`, `reprint_entrega_${Date.now()}`, "width=400,height=600")}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    <Printer size={14} /> Entrega
                  </button>
                  <button
                    onClick={() => window.open(`/admin/imprimir/${order.id}?tipo=cliente`, `reprint_cliente_${Date.now()}`, "width=400,height=600")}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    <Printer size={14} /> Cliente
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  {order.status === "awaiting_payment" && (
                    <button
                      onClick={async () => {
                        const queuedPrint = preparePrintBatch(order.id, [{ tipo: "cozinha" }]);
                        const { error } = await supabase
                          .from("orders")
                          .update({ payment_confirmed: true, status: "preparing", preparing_at: new Date().toISOString() })
                          .eq("id", order.id);

                        if (error) {
                          queuedPrint?.cancel();
                          toast({ title: "Erro ao confirmar PIX", variant: "destructive" });
                          return;
                        }

                        toast({ title: "✅ PIX confirmado! Pedido em preparo." });
                        await fetchOrders();
                        queuedPrint?.commit();
                      }}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
                    >
                      ✅ Confirmar PIX
                    </button>
                  )}
                  {order.payment_method !== "fiado" && order.status !== "cancelled" && (
                    <button
                      onClick={async () => {
                        await supabase.from("orders").update({ payment_method: "fiado", payment_confirmed: true }).eq("id", order.id);
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
                  {order.status === "pending" && (
                    <button
                      onClick={() => updateStatus(order.id, "cancelled")}
                      className="rounded-lg border border-destructive px-4 py-2.5 text-sm font-bold text-destructive"
                    >
                      Recusar
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
