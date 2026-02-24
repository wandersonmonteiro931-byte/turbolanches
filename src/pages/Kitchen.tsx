import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface KitchenOrder {
  id: string;
  order_number: number;
  status: string;
  preparing_at: string | null;
  observations: string | null;
  delivery_type: string;
  created_at: string;
}

interface KitchenItem {
  id: string;
  product_name: string;
  quantity: number;
  observations: string | null;
  addons_json: any;
}

const Kitchen = () => {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [items, setItems] = useState<Record<string, KitchenItem[]>>({});
  const [now, setNow] = useState(Date.now());

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, status, preparing_at, observations, delivery_type, created_at")
      .eq("status", "preparing")
      .order("preparing_at", { ascending: true });
    if (data) {
      setOrders(data);
      // Fetch items for all orders
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
      }
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("kitchen-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .subscribe();

    // Timer tick every 10s
    const timer = setInterval(() => setNow(Date.now()), 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [fetchOrders]);

  // Play sound on new order
  useEffect(() => {
    const prevCount = (window as any).__kitchenCount || 0;
    if (orders.length > prevCount && prevCount > 0) {
      try {
        const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==");
        audio.play().catch(() => {});
      } catch {}
    }
    (window as any).__kitchenCount = orders.length;
  }, [orders.length]);

  const markReady = async (orderId: string) => {
    await supabase.from("orders").update({ status: "ready", ready_at: new Date().toISOString() }).eq("id", orderId);
  };

  const getElapsedMinutes = (preparingAt: string | null) => {
    if (!preparingAt) return 0;
    return Math.floor((now - new Date(preparingAt).getTime()) / 60000);
  };

  const getTimerClass = (minutes: number) => {
    if (minutes >= 25) return "timer-late";
    if (minutes >= 15) return "timer-warning";
    return "timer-normal";
  };

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #root { height: 100%; background: #111; color: #fff; font-family: Arial, sans-serif; }
        .kitchen-header {
          background: #000; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center;
          border-bottom: 2px solid #333;
        }
        .kitchen-header h1 { font-size: 24px; font-weight: 900; letter-spacing: 2px; }
        .kitchen-header .count { font-size: 18px; color: #aaa; }
        .kitchen-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px; padding: 16px; height: calc(100vh - 60px); overflow-y: auto;
          align-content: start;
        }
        .kitchen-card {
          background: #1a1a1a; border-radius: 12px; border: 2px solid #333;
          overflow: hidden; display: flex; flex-direction: column;
        }
        .kitchen-card-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 16px; font-weight: 900;
        }
        .kitchen-card-header .order-num { font-size: 22px; }
        .kitchen-card-header .timer {
          font-size: 22px; padding: 4px 12px; border-radius: 8px; font-weight: 900;
          min-width: 80px; text-align: center;
        }
        .timer-normal { background: #1e7e34; color: #fff; }
        .timer-warning { background: #ffc107; color: #000; }
        .timer-late { background: #dc3545; color: #fff; animation: piscar 1s infinite; }
        @keyframes piscar { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .kitchen-card-items { padding: 8px 16px; flex: 1; }
        .kitchen-item {
          font-size: 18px; font-weight: 900; padding: 4px 0;
          border-bottom: 1px solid #2a2a2a;
        }
        .kitchen-item:last-child { border-bottom: none; }
        .kitchen-item-addons { font-size: 14px; color: #aaa; padding-left: 16px; }
        .kitchen-item-obs { font-size: 14px; color: #ffc107; padding-left: 16px; font-style: italic; }
        .kitchen-order-obs {
          padding: 8px 16px; font-size: 14px; color: #ffc107; font-weight: 700;
          border-top: 1px dashed #333;
        }
        .kitchen-card-footer { padding: 12px 16px; }
        .btn-ready {
          width: 100%; padding: 14px; border: none; border-radius: 8px;
          background: #1e7e34; color: #fff; font-size: 18px; font-weight: 900;
          cursor: pointer; text-transform: uppercase; letter-spacing: 1px;
          transition: background 0.2s;
        }
        .btn-ready:hover { background: #28a745; }
        .btn-ready:active { transform: scale(0.98); }
        .delivery-badge {
          font-size: 11px; padding: 2px 8px; border-radius: 4px;
          background: #333; color: #ccc; font-weight: 700; text-transform: uppercase;
        }
        .empty-state {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: calc(100vh - 60px); color: #555; font-size: 24px; font-weight: 700;
        }
        .empty-state span { font-size: 64px; margin-bottom: 16px; }
      `}</style>

      <div className="kitchen-header">
        <h1>🍳 COZINHA</h1>
        <div className="count">{orders.length} pedido{orders.length !== 1 ? "s" : ""} em preparo</div>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <span>✅</span>
          Nenhum pedido em preparo
        </div>
      ) : (
        <div className="kitchen-grid">
          {orders.map((order) => {
            const elapsed = getElapsedMinutes(order.preparing_at);
            const orderItems = items[order.id] || [];

            return (
              <div key={order.id} className="kitchen-card">
                <div className="kitchen-card-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="order-num">#{String(order.order_number).padStart(5, "0")}</span>
                    <span className="delivery-badge">
                      {order.delivery_type === "delivery" ? "DELIVERY" : "RETIRADA"}
                    </span>
                  </div>
                  <div className={`timer ${getTimerClass(elapsed)}`}>
                    {elapsed} MIN
                  </div>
                </div>

                <div className="kitchen-card-items">
                  {orderItems.map((item) => {
                    const addons = item.addons_json as any[] | null;
                    return (
                      <div key={item.id}>
                        <div className="kitchen-item">
                          {item.quantity}x {item.product_name}
                        </div>
                        {addons && addons.length > 0 && addons.map((a: any, i: number) => (
                          <div key={i} className="kitchen-item-addons">+ {a.name}</div>
                        ))}
                        {item.observations && (
                          <div className="kitchen-item-obs">⚠ {item.observations}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {order.observations && (
                  <div className="kitchen-order-obs">
                    📝 {order.observations}
                  </div>
                )}

                <div className="kitchen-card-footer">
                  <button className="btn-ready" onClick={() => markReady(order.id)}>
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
