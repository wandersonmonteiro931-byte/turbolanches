import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoTurbo from "@/assets/logo-turbo.jpeg";

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
  }, []);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("kitchen-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .subscribe();

    // Tick every second for accurate timer
    const timer = setInterval(() => setNow(Date.now()), 1000);

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

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #root { height: 100%; background: #0a0a0a; color: #f0f0f0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }

        .kds-header {
          background: linear-gradient(180deg, #111 0%, #0a0a0a 100%);
          padding: 14px 28px; display: flex; justify-content: space-between; align-items: center;
          border-bottom: 1px solid #222;
        }
        .kds-header-left { display: flex; align-items: center; gap: 14px; }
        .kds-logo { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; }
        .kds-title { font-size: 22px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; }
        .kds-subtitle { font-size: 13px; font-weight: 500; color: #4ade80; letter-spacing: 1px; text-transform: uppercase; }
        .kds-count { font-size: 16px; color: #888; font-weight: 700; }

        .kds-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 20px; padding: 20px; height: calc(100vh - 76px); overflow-y: auto;
          align-content: start;
        }

        .kds-card {
          background: #151515; border-radius: 16px; border: 1px solid #2a2a2a;
          overflow: hidden; display: flex; flex-direction: column;
          transition: border-color 0.3s;
        }
        .kds-card-late { border-color: #dc3545; }
        .kds-card-warning { border-color: #ffc107; }

        .kds-card-head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 20px; border-bottom: 1px solid #222;
        }
        .kds-order-num { font-size: 26px; font-weight: 900; letter-spacing: 1px; }
        .kds-badge {
          font-size: 10px; padding: 3px 10px; border-radius: 6px;
          background: #222; color: #aaa; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .kds-timer {
          font-size: 24px; padding: 6px 16px; border-radius: 10px; font-weight: 900;
          min-width: 100px; text-align: center; font-variant-numeric: tabular-nums;
        }
        .kds-timer-normal { background: #166534; color: #4ade80; }
        .kds-timer-warning { background: #854d0e; color: #fbbf24; animation: kds-pulse 2s ease-in-out infinite; }
        .kds-timer-late { background: #991b1b; color: #fca5a5; animation: kds-blink 0.8s ease-in-out infinite; }

        @keyframes kds-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes kds-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }

        .kds-items { padding: 12px 20px; flex: 1; }
        .kds-item {
          font-size: 20px; font-weight: 700; padding: 6px 0;
          border-bottom: 1px solid #1e1e1e; letter-spacing: 0.3px;
        }
        .kds-item:last-child { border-bottom: none; }
        .kds-addon { font-size: 15px; color: #888; padding-left: 20px; font-weight: 500; }
        .kds-item-obs { font-size: 15px; color: #fbbf24; padding-left: 20px; font-weight: 600; }
        .kds-order-obs {
          padding: 10px 20px; font-size: 15px; color: #fbbf24; font-weight: 700;
          border-top: 1px dashed #2a2a2a; background: #1a1500;
        }

        .kds-footer { padding: 14px 20px; }
        .kds-btn {
          width: 100%; padding: 16px; border: none; border-radius: 12px;
          background: linear-gradient(135deg, #166534, #15803d); color: #fff;
          font-size: 18px; font-weight: 900; cursor: pointer;
          text-transform: uppercase; letter-spacing: 2px;
          transition: all 0.15s; font-family: 'Inter', sans-serif;
        }
        .kds-btn:hover { background: linear-gradient(135deg, #15803d, #22c55e); }
        .kds-btn:active { transform: scale(0.98); }

        .kds-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: calc(100vh - 76px); color: #333; font-size: 28px; font-weight: 700;
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
        <div className="kds-count">{orders.length} pedido{orders.length !== 1 ? "s" : ""}</div>
      </div>

      {orders.length === 0 ? (
        <div className="kds-empty">
          <span>✅</span>
          Nenhum pedido em preparo
        </div>
      ) : (
        <div className="kds-grid">
          {orders.map((order) => {
            const { minutes, seconds } = getElapsed(order);
            const timerClass = getTimerClass(minutes);
            const cardBorder = minutes >= 20 ? " kds-card-late" : minutes >= 15 ? " kds-card-warning" : "";
            const orderItems = items[order.id] || [];

            return (
              <div key={order.id} className={`kds-card${cardBorder}`}>
                <div className="kds-card-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="kds-order-num">#{String(order.order_number).padStart(5, "0")}</span>
                    <span className="kds-badge">
                      {order.delivery_type === "delivery" ? "DELIVERY" : "RETIRADA"}
                    </span>
                  </div>
                  <div className={`kds-timer ${timerClass}`}>
                    {minutes}:{String(seconds).padStart(2, "0")}
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
                          <div key={i} className="kds-addon">+ {a.name}</div>
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
