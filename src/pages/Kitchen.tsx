import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoTurbo from "@/assets/logo-turbo.jpeg";
import { useAlarmSound } from "@/hooks/useAlarmSound";

interface KitchenOrder {
  id: string;
  order_number: number;
  status: string;
  preparing_at: string | null;
  observations: string | null;
  delivery_type: string;
  created_at: string;
  priority: boolean;
}

interface KitchenItem {
  id: string;
  product_name: string;
  quantity: number;
  observations: string | null;
  addons_json: any;
}

interface CancelledAlert {
  order: KitchenOrder;
  cancelledAt: number;
}

const Kitchen = () => {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [items, setItems] = useState<Record<string, KitchenItem[]>>({});
  const [now, setNow] = useState(Date.now());
  const [brasiliaTime, setBrasiliaTime] = useState("");
  const [cancelledAlerts, setCancelledAlerts] = useState<CancelledAlert[]>([]);
  const prevOrdersRef = useRef<KitchenOrder[]>([]);

  // Alarm: plays while there are pending orders
  useAlarmSound(pendingCount > 0);

  const fetchOrders = useCallback(async () => {
    // Fetch preparing orders for display
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, status, preparing_at, observations, delivery_type, created_at, priority")
      .eq("status", "preparing")
      .order("preparing_at", { ascending: true });
    if (data) {
      setOrders(data as KitchenOrder[]);
      const ids = data.map((o) => o.id);
      if (ids.length > 0) {
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("id, product_name, quantity, observations, addons_json, order_id")
          .in("order_id", ids);
        if (itemsData) {
          const grouped: Record<string, KitchenItem[]> = {};
          itemsData.forEach((item: any) => {
            if (!grouped[item.order_id]) grouped[item.order_id] = [];
            grouped[item.order_id].push(item);
          });
          setItems(grouped);
        }
      } else {
        setItems({});
      }
    }
    // Check for pending orders (for alarm) — exclude unpaid PIX
    const { data: alarmOrders } = await supabase
      .from("orders")
      .select("id, status, payment_method")
      .in("status", ["pending", "paid"]);
    const visiblePending = (alarmOrders || []).filter(
      (o) => !(o.payment_method === "pix" && o.status === "pending")
    );
    setPendingCount(visiblePending.length);
  }, []);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("kitchen-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if (payload.eventType === "UPDATE" && (payload.new as any).status === "cancelled") {
          const cancelledId = (payload.new as any).id;
          const wasInKitchen = prevOrdersRef.current.find(o => o.id === cancelledId);
          if (wasInKitchen) {
            setCancelledAlerts(prev => [...prev, {
              order: wasInKitchen,
              cancelledAt: Date.now(),
            }]);
          }
        }
        fetchOrders();
      })
      .subscribe();

    const timer = setInterval(() => {
      setNow(Date.now());
      setBrasiliaTime(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    setBrasiliaTime(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }));

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [fetchOrders]);

  useEffect(() => {
    prevOrdersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCancelledAlerts(prev => prev.filter(a => Date.now() - a.cancelledAt < 120000));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Track order count for reference (alarm is handled by useAlarmSound)
  useEffect(() => {
    (window as any).__kitchenCount = orders.length;
  }, [orders.length]);

  const markReady = async (orderId: string) => {
    await supabase.from("orders").update({ status: "ready", ready_at: new Date().toISOString() }).eq("id", orderId);
    await fetchOrders();
  };

  const getElapsed = (order: KitchenOrder) => {
    const ref = order.preparing_at || order.created_at;
    if (!ref) return { minutes: 0, seconds: 0, totalMs: 0 };
    const diff = now - new Date(ref).getTime();
    return { minutes: Math.floor(diff / 60000), seconds: Math.floor((diff % 60000) / 1000), totalMs: diff };
  };

  const getTimerClass = (minutes: number) => {
    if (minutes >= 20) return "kds-timer-late";
    if (minutes >= 15) return "kds-timer-warning";
    return "kds-timer-normal";
  };

  const getDeadline = (order: KitchenOrder) => {
    const ref = order.preparing_at || order.created_at;
    if (!ref) return "";
    const deadline = new Date(new Date(ref).getTime() + 30 * 60000);
    return deadline.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  };

  // Sort: priority first, then most delayed (oldest preparing_at)
  const sortedOrders = [...orders].sort((a, b) => {
    if (a.priority && !b.priority) return -1;
    if (!a.priority && b.priority) return 1;
    const refA = a.preparing_at || a.created_at;
    const refB = b.preparing_at || b.created_at;
    return new Date(refA).getTime() - new Date(refB).getTime();
  });

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #root { height: 100%; background: #e8e8e8; color: #000; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }

        .kds-header {
          background: #ffffff;
          padding: 14px 28px; display: flex; justify-content: space-between; align-items: center;
          border-bottom: 3px solid #000; box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }
        .kds-header-left { display: flex; align-items: center; gap: 14px; }
        .kds-logo { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; }
        .kds-title { font-size: 22px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #000; }
        .kds-subtitle { font-size: 13px; font-weight: 900; color: #EA1D2C; letter-spacing: 1px; text-transform: uppercase; }
        .kds-count { font-size: 18px; color: #000; font-weight: 900; }
        .kds-clock { font-size: 44px; font-weight: 900; color: #000; font-variant-numeric: tabular-nums; letter-spacing: 2px; }
        .kds-clock-label { font-size: 10px; font-weight: 900; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        .kds-deadline { font-size: 13px; font-weight: 900; color: #000; background: #e0f2fe; padding: 4px 12px; border-radius: 6px; margin-top: 4px; display: inline-block; }

        .kds-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px; padding: 16px; height: calc(100vh - 80px); overflow-y: auto;
          align-content: start; grid-auto-rows: min-content;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .kds-grid::-webkit-scrollbar { display: none; }

        .kds-card {
          background: #ffffff; border-radius: 14px; border: 3px solid #000;
          overflow: hidden; display: flex; flex-direction: column;
          transition: border-color 0.3s; box-shadow: 0 3px 10px rgba(0,0,0,0.1);
        }
        .kds-card-priority { border-color: #7c3aed !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.3), 0 3px 10px rgba(0,0,0,0.1); }
        .kds-card-late { border-color: #dc3545 !important; }
        .kds-card-warning { border-color: #f59e0b !important; }

        .kds-priority-banner {
          background: #7c3aed; color: white; text-align: center;
          font-size: 14px; font-weight: 900; padding: 6px;
          letter-spacing: 3px; text-transform: uppercase;
        }

        .kds-card-cancelled {
          border-color: #dc3545 !important;
          background: #fff5f5 !important;
          animation: kds-cancelled-blink 0.6s ease-in-out infinite;
        }
        @keyframes kds-cancelled-blink {
          0%, 100% { background: #fff5f5; border-color: #dc3545; }
          50% { background: #ffe0e0; border-color: #ff4444; }
        }
        .kds-cancelled-banner {
          background: #dc3545; color: white; text-align: center;
          font-size: 28px; font-weight: 900; padding: 16px;
          letter-spacing: 4px; text-transform: uppercase;
          animation: kds-cancelled-text 0.6s ease-in-out infinite;
        }
        @keyframes kds-cancelled-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .kds-card-head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 18px; border-bottom: 2px solid #e5e5e5;
        }
        .kds-order-num { font-size: 24px; font-weight: 900; letter-spacing: 1px; color: #000; }
        .kds-badge {
          font-size: 10px; padding: 3px 10px; border-radius: 6px;
          background: #f0f0f0; color: #000; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .kds-timer {
          font-size: 22px; padding: 5px 14px; border-radius: 8px; font-weight: 900;
          min-width: 90px; text-align: center; font-variant-numeric: tabular-nums;
        }
        .kds-timer-normal { background: #dcfce7; color: #000; }
        .kds-timer-warning { background: #fef3c7; color: #000; animation: kds-pulse 2s ease-in-out infinite; }
        .kds-timer-late { background: #fee2e2; color: #000; animation: kds-blink 0.8s ease-in-out infinite; }

        @keyframes kds-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes kds-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }

        .kds-items { padding: 10px 18px; flex: 1; }
        .kds-item {
          font-size: 18px; font-weight: 900; padding: 5px 0;
          border-bottom: 1px solid #f0f0f0; letter-spacing: 0.3px; color: #000;
        }
        .kds-item:last-child { border-bottom: none; }
        .kds-addon { font-size: 14px; color: #000; padding-left: 18px; font-weight: 900; }
        .kds-item-obs { font-size: 14px; color: #000; padding-left: 18px; font-weight: 900; background: #fef3c7; margin: 2px 0; padding: 4px 18px; border-radius: 4px; }
        .kds-order-obs {
          padding: 8px 18px; font-size: 14px; color: #000; font-weight: 900;
          border-top: 2px dashed #e5e5e5; background: #fffbeb;
        }

        .kds-footer { padding: 12px 18px; }
        .kds-btn {
          width: 100%; padding: 14px; border: none; border-radius: 10px;
          background: #EA1D2C; color: #fff;
          font-size: 16px; font-weight: 900; cursor: pointer;
          text-transform: uppercase; letter-spacing: 2px;
          transition: all 0.15s; font-family: 'Inter', sans-serif;
        }
        .kds-btn:hover { background: #c7101e; }
        .kds-btn:active { transform: scale(0.98); }

        .kds-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: calc(100vh - 80px); color: #000; font-size: 28px; font-weight: 900;
          letter-spacing: 1px;
        }
        .kds-empty span { font-size: 72px; margin-bottom: 20px; }
      `}</style>

      <div className="kds-header">
        <div className="kds-header-left">
          <img src={logoTurbo} alt="Logo" className="kds-logo" />
          <div>
            <div className="kds-title">COZINHA</div>
            <div className="kds-subtitle">EM PREPARO</div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="kds-clock">{brasiliaTime}</div>
          <div className="kds-clock-label">Horário de Brasília</div>
        </div>
        <div className="kds-count">{orders.length} pedido{orders.length !== 1 ? "s" : ""}</div>
      </div>

      {orders.length === 0 && cancelledAlerts.length === 0 ? (
        <div className="kds-empty">
          <span>✅</span>
          Nenhum pedido em preparo
        </div>
      ) : (
        <div className="kds-grid">
          {cancelledAlerts.map((alert) => (
            <div key={`cancelled-${alert.order.id}`} className="kds-card kds-card-cancelled">
              <div className="kds-cancelled-banner">❌ CANCELADO ❌</div>
              <div className="kds-card-head">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="kds-order-num" style={{ color: "#dc3545" }}>
                    #{String(alert.order.order_number).padStart(5, "0")}
                  </span>
                  <span className="kds-badge" style={{ background: "#fee2e2", color: "#991b1b" }}>
                    {alert.order.delivery_type === "delivery" ? "DELIVERY" : "RETIRADA"}
                  </span>
                </div>
              </div>
              {alert.order.observations && (
                <div className="kds-order-obs">📝 {alert.order.observations}</div>
              )}
            </div>
          ))}

          {sortedOrders.map((order) => {
            const { minutes, seconds } = getElapsed(order);
            const timerClass = getTimerClass(minutes);
            const cardClass = order.priority
              ? " kds-card-priority"
              : minutes >= 20 ? " kds-card-late" : minutes >= 15 ? " kds-card-warning" : "";
            const orderItems = items[order.id] || [];

            return (
              <div key={order.id} className={`kds-card${cardClass}`}>
                {order.priority && (
                  <div className="kds-priority-banner">⚡ PRIORIDADE ⚡</div>
                )}
                <div className="kds-card-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="kds-order-num">#{String(order.order_number).padStart(5, "0")}</span>
                    <span className="kds-badge">
                      {order.delivery_type === "delivery" ? "DELIVERY" : order.delivery_type.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div className={`kds-timer ${timerClass}`}>
                      {minutes}:{String(seconds).padStart(2, "0")}
                    </div>
                    <span className="kds-deadline">🕐 Até {getDeadline(order)}</span>
                  </div>
                </div>

                <div className="kds-items">
                  {orderItems.map((item) => {
                    const addons = item.addons_json as any[] | null;
                    return (
                      <div key={item.id}>
                        <div className="kds-item">
                          {item.quantity}x {item.product_name}
                        </div>
                        {addons && addons.length > 0 && addons.map((a: any, i: number) => (
                          <div key={i} className="kds-addon">+ {a.name}{(a.quantity || 1) > 1 ? ` x${a.quantity}` : ""}</div>
                        ))}
                        {item.observations && (
                          <div className="kds-item-obs">⚠ {item.observations}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {order.observations && (
                  <div className="kds-order-obs">📝 {order.observations}</div>
                )}

                <div className="kds-footer">
                  <button className="kds-btn" onClick={() => markReady(order.id)}>
                    ✅ MARCAR PRONTO
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default Kitchen;
