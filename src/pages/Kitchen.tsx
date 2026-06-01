import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStoreLogo } from "@/hooks/useStoreLogo";
import { useStore } from "@/contexts/StoreContext";
import logoTurboFallback from "@/assets/logo-turbo.jpeg";

interface KitchenOrder {
  id: string;
  order_number: number;
  status: string;
  preparing_at: string | null;
  observations: string | null;
  delivery_type: string;
  table_code: string | null;
  created_at: string;
  priority: boolean;
  updated_at: string;
}

interface KitchenItem {
  id: string;
  product_name: string;
  product_code: number | null;
  quantity: number;
  observations: string | null;
  addons_json: any;
}

interface CancelledAlert {
  order: KitchenOrder;
  cancelledAt: number;
}

const Kitchen = () => {
  const storeLogo = useStoreLogo(logoTurboFallback);
  const { storeId } = useStore();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [items, setItems] = useState<Record<string, KitchenItem[]>>({});
  const [now, setNow] = useState(Date.now());
  const [brasiliaTime, setBrasiliaTime] = useState("");
  const [cancelledAlerts, setCancelledAlerts] = useState<CancelledAlert[]>([]);
  const [editedOrderIds, setEditedOrderIds] = useState<Set<string>>(new Set());
  const prevOrdersRef = useRef<KitchenOrder[]>([]);

  const getDisplayCode = (order: KitchenOrder) => {
    if (order.delivery_type !== "mesa") return `#${String(order.order_number).padStart(5, "0")}`;
    const fromColumn = order.table_code?.trim();
    if (fromColumn) return fromColumn;
    const fromObs = order.observations?.match(/#?MESA\d+/i)?.[0];
    return fromObs ? (fromObs.startsWith("#") ? fromObs.toUpperCase() : `#${fromObs.toUpperCase()}`) : "#MESA--";
  };

  const fetchOrders = useCallback(async () => {
    // Fetch preparing orders for display (filtered by Turbo Lanches store)
    let query = supabase
      .from("orders")
      .select(
        "id, order_number, status, preparing_at, observations, delivery_type, table_code, created_at, priority, updated_at",
      )
      .eq("status", "preparing")
      .order("preparing_at", { ascending: true });
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) {
      console.error("[Kitchen] Error fetching orders:", error.message);
    }
    const rows = data ?? [];

    // Detect orders that were actually cancelled (not just moved to ready/delivering)
    const currentIds = new Set(rows.map((o) => o.id));
    const disappeared = prevOrdersRef.current.filter((o) => !currentIds.has(o.id));
    if (disappeared.length > 0) {
      // Check actual status of disappeared orders
      const { data: statusCheck } = await supabase
        .from("orders")
        .select("id, status")
        .in(
          "id",
          disappeared.map((o) => o.id),
        );
      const cancelledIds = new Set((statusCheck || []).filter((o) => o.status === "cancelled").map((o) => o.id));
      if (cancelledIds.size > 0) {
        setCancelledAlerts((prev) => {
          const existingIds = new Set(prev.map((a) => a.order.id));
          const newAlerts = disappeared
            .filter((o) => cancelledIds.has(o.id) && !existingIds.has(o.id))
            .map((order) => ({ order, cancelledAt: Date.now() }));
          return [...prev, ...newAlerts];
        });
      }
    }

    // Detect edited orders (updated_at changed while still preparing)
    const prevMap = new Map(prevOrdersRef.current.map((o) => [o.id, o.updated_at]));
    const newlyEdited = (rows as KitchenOrder[])
      .filter((o) => {
        const prev = prevMap.get(o.id);
        return prev && prev !== o.updated_at;
      })
      .map((o) => o.id);
    if (newlyEdited.length > 0) {
      setEditedOrderIds((prev) => {
        const next = new Set(prev);
        newlyEdited.forEach((id) => next.add(id));
        return next;
      });
      // Auto-clear flash after 30 seconds
      setTimeout(() => {
        setEditedOrderIds((prev) => {
          const next = new Set(prev);
          newlyEdited.forEach((id) => next.delete(id));
          return next;
        });
      }, 30000);
    }

    setOrders(rows as KitchenOrder[]);
    const ids = rows.map((o) => o.id);
    if (ids.length > 0) {
      const { data: itemsData } = await supabase
        .from("order_items")
        .select("id, product_name, product_code, quantity, observations, addons_json, order_id")
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
    // Check for pending orders (for alarm) — exclude unpaid PIX, filter by store
    let alarmQuery = supabase
      .from("orders")
      .select("id, status, payment_method, store_id")
      .in("status", ["pending", "paid"]);
    if (storeId) alarmQuery = alarmQuery.eq("store_id", storeId);
    const { data: alarmOrders } = await alarmQuery;
    const visiblePending = (alarmOrders || []).filter((o) => !(o.payment_method === "pix" && o.status === "pending"));
    setPendingCount(visiblePending.length);
  }, [storeId]);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("kitchen-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        console.log("[Kitchen] Realtime event:", payload.eventType, (payload.new as any)?.status);
        if (payload.eventType === "UPDATE" && (payload.new as any).status === "cancelled") {
          const cancelledId = (payload.new as any).id;
          const wasInKitchen = prevOrdersRef.current.find((o) => o.id === cancelledId);
          if (wasInKitchen) {
            setCancelledAlerts((prev) => [
              ...prev,
              {
                order: wasInKitchen,
                cancelledAt: Date.now(),
              },
            ]);
          }
        }
        fetchOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        fetchOrders();
      })
      .subscribe((status) => {
        console.log("[Kitchen] Realtime subscription status:", status);
      });

    // Polling fallback every 5s to guarantee preparing orders always appear
    const poll = setInterval(() => {
      fetchOrders();
    }, 5000);

    const timer = setInterval(() => {
      setNow(Date.now());
      setBrasiliaTime(
        new Date().toLocaleTimeString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    }, 1000);
    setBrasiliaTime(
      new Date().toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    );

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(timer);
    };
  }, [fetchOrders]);

  useEffect(() => {
    prevOrdersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCancelledAlerts((prev) => prev.filter((a) => Date.now() - a.cancelledAt < 60000));
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

        html, body, #root {
          min-height: 100%;
          background:
            radial-gradient(circle at top left, rgba(234,29,44,0.10), transparent 30%),
            linear-gradient(135deg, #f8fafc 0%, #eef2f7 45%, #e2e8f0 100%);
          color: #0f172a;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
          overflow: hidden;
        }

        .kds-header {
          height: 104px;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(18px);
          padding: 18px 32px;
          display: grid;
          grid-template-columns: minmax(240px, 1fr) auto minmax(240px, 1fr);
          align-items: center;
          gap: 24px;
          border-bottom: 1px solid rgba(15,23,42,0.10);
          box-shadow: 0 18px 45px rgba(15,23,42,0.10);
          position: sticky;
          top: 0;
          z-index: 5;
        }

        .kds-header-left {
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 0;
        }

        .kds-logo {
          width: 58px;
          height: 58px;
          border-radius: 18px;
          object-fit: cover;
          box-shadow: 0 12px 28px rgba(0,0,0,0.18);
          border: 2px solid rgba(255,255,255,0.75);
          background: #111827;
        }

        .kds-title {
          font-size: 30px;
          font-weight: 950;
          letter-spacing: 5px;
          line-height: 1;
          text-transform: uppercase;
          color: #0f172a;
        }

        .kds-subtitle {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 950;
          color: #dc2626;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        .kds-subtitle::before {
          content: "";
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #dc2626;
          box-shadow: 0 0 0 6px rgba(220,38,38,0.12);
        }

        .kds-clock {
          font-size: clamp(40px, 5vw, 64px);
          font-weight: 950;
          color: #0f172a;
          font-variant-numeric: tabular-nums;
          letter-spacing: 3px;
          line-height: 0.95;
          text-shadow: 0 10px 28px rgba(15,23,42,0.12);
        }

        .kds-clock-label {
          margin-top: 8px;
          font-size: 12px;
          font-weight: 950;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 2px;
        }

        .kds-count {
          justify-self: end;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 148px;
          padding: 14px 18px;
          border-radius: 22px;
          background: #0f172a;
          color: white;
          font-size: 20px;
          font-weight: 950;
          box-shadow: 0 16px 36px rgba(15,23,42,0.22);
        }

        .kds-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 22px;
          padding: 24px;
          height: calc(100vh - 104px);
          overflow-y: auto;
          align-content: start;
          grid-auto-rows: min-content;
          scrollbar-width: thin;
          scrollbar-color: rgba(15,23,42,0.25) transparent;
        }

        .kds-grid::-webkit-scrollbar { width: 10px; }
        .kds-grid::-webkit-scrollbar-thumb {
          background: rgba(15,23,42,0.20);
          border-radius: 999px;
        }

        .kds-card {
          background: rgba(255,255,255,0.96);
          border-radius: 26px;
          border: 1px solid rgba(15,23,42,0.10);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
          box-shadow: 0 18px 40px rgba(15,23,42,0.12);
          min-height: 260px;
        }

        .kds-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 24px 55px rgba(15,23,42,0.16);
        }

        .kds-card-priority {
          border-color: #7c3aed !important;
          box-shadow: 0 0 0 5px rgba(124,58,237,0.16), 0 22px 50px rgba(15,23,42,0.14);
        }

        .kds-card-late {
          border-color: #dc2626 !important;
          box-shadow: 0 0 0 5px rgba(220,38,38,0.13), 0 22px 50px rgba(15,23,42,0.14);
        }

        .kds-card-warning {
          border-color: #f59e0b !important;
          box-shadow: 0 0 0 5px rgba(245,158,11,0.13), 0 22px 50px rgba(15,23,42,0.14);
        }

        .kds-priority-banner {
          background: linear-gradient(90deg, #7c3aed, #a855f7);
          color: white;
          text-align: center;
          font-size: 15px;
          font-weight: 950;
          padding: 10px;
          letter-spacing: 3px;
          text-transform: uppercase;
        }

        .kds-card-edited {
          border-color: #2563eb !important;
          animation: kds-edited-blink 0.85s ease-in-out infinite;
          box-shadow: 0 0 0 5px rgba(37,99,235,0.18), 0 22px 50px rgba(15,23,42,0.14);
        }

        @keyframes kds-edited-blink {
          0%, 100% { background: rgba(255,255,255,0.98); }
          50% { background: #dbeafe; }
        }

        .kds-edited-banner {
          background: linear-gradient(90deg, #1d4ed8, #3b82f6);
          color: white;
          text-align: center;
          font-size: 16px;
          font-weight: 950;
          padding: 11px;
          letter-spacing: 3px;
          text-transform: uppercase;
        }

        .kds-card-cancelled {
          border-color: #dc2626 !important;
          background: #fff1f2 !important;
          animation: kds-cancelled-blink 0.75s ease-in-out infinite;
        }

        @keyframes kds-cancelled-blink {
          0%, 100% { background: #fff1f2; }
          50% { background: #ffe4e6; }
        }

        .kds-cancelled-banner {
          background: linear-gradient(90deg, #b91c1c, #ef4444);
          color: white;
          text-align: center;
          font-size: 28px;
          font-weight: 950;
          padding: 18px;
          letter-spacing: 4px;
          text-transform: uppercase;
        }

        .kds-card-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          padding: 18px 20px;
          border-bottom: 1px solid rgba(15,23,42,0.08);
          background: linear-gradient(180deg, #ffffff, #f8fafc);
        }

        .kds-order-num {
          font-size: 32px;
          font-weight: 950;
          letter-spacing: 1px;
          color: #0f172a;
          line-height: 1;
        }

        .kds-badge {
          display: inline-flex;
          align-items: center;
          height: 26px;
          font-size: 11px;
          padding: 0 11px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #334155;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.7px;
          border: 1px solid rgba(15,23,42,0.08);
        }

        .kds-timer {
          font-size: 26px;
          padding: 8px 14px;
          border-radius: 16px;
          font-weight: 950;
          min-width: 106px;
          text-align: center;
          font-variant-numeric: tabular-nums;
          border: 1px solid rgba(15,23,42,0.10);
          box-shadow: inset 0 -2px 0 rgba(15,23,42,0.06);
        }

        .kds-timer-normal { background: #dcfce7; color: #166534; }
        .kds-timer-warning { background: #fef3c7; color: #92400e; animation: kds-pulse 1.7s ease-in-out infinite; }
        .kds-timer-late { background: #fee2e2; color: #991b1b; animation: kds-blink 0.85s ease-in-out infinite; }

        @keyframes kds-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.48; } }
        @keyframes kds-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }

        .kds-deadline {
          font-size: 12px;
          font-weight: 950;
          color: #0369a1;
          background: #e0f2fe;
          border: 1px solid #bae6fd;
          padding: 5px 10px;
          border-radius: 999px;
          margin-top: 4px;
          display: inline-block;
        }

        .kds-items {
          padding: 14px 20px;
          flex: 1;
        }

        .kds-item {
          font-size: 22px;
          font-weight: 950;
          padding: 10px 0;
          border-bottom: 1px solid rgba(15,23,42,0.08);
          letter-spacing: 0.1px;
          color: #0f172a;
          line-height: 1.15;
        }

        .kds-item:last-child { border-bottom: none; }

        .kds-addon {
          margin-top: 2px;
          margin-left: 10px;
          font-size: 16px;
          color: #475569;
          padding-left: 16px;
          font-weight: 800;
          border-left: 4px solid #cbd5e1;
        }

        .kds-item-obs {
          margin: 8px 0 4px 10px;
          font-size: 15px;
          color: #92400e;
          padding: 8px 12px;
          font-weight: 900;
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 12px;
        }

        .kds-order-obs {
          margin: 0 20px 14px;
          padding: 12px 14px;
          font-size: 16px;
          color: #78350f;
          font-weight: 950;
          border: 1px dashed #f59e0b;
          background: #fffbeb;
          border-radius: 14px;
        }

        .kds-footer {
          padding: 16px 20px 20px;
          background: #f8fafc;
          border-top: 1px solid rgba(15,23,42,0.08);
        }

        .kds-btn {
          width: 100%;
          padding: 18px;
          border: none;
          border-radius: 18px;
          background: linear-gradient(135deg, #16a34a, #22c55e);
          color: #fff;
          font-size: 18px;
          font-weight: 950;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          transition: transform 0.12s ease, filter 0.12s ease;
          font-family: 'Inter', sans-serif;
          box-shadow: 0 14px 28px rgba(22,163,74,0.26);
        }

        .kds-btn:hover { filter: brightness(1.04); }
        .kds-btn:active { transform: scale(0.985); }

        .kds-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: calc(100vh - 104px);
          color: #0f172a;
          font-size: 30px;
          font-weight: 950;
          letter-spacing: 0.3px;
          text-align: center;
        }

        .kds-empty span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 110px;
          height: 110px;
          border-radius: 32px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
          font-size: 70px;
          margin-bottom: 24px;
          box-shadow: 0 24px 55px rgba(22,163,74,0.28);
          border: 6px solid white;
        }

        @media (max-width: 900px) {
          .kds-header {
            height: auto;
            grid-template-columns: 1fr;
            text-align: center;
            padding: 16px;
          }

          .kds-header-left {
            justify-content: center;
          }

          .kds-count {
            justify-self: center;
          }

          .kds-grid {
            height: calc(100vh - 210px);
            grid-template-columns: 1fr;
            padding: 16px;
          }
        }
      `}</style>

      <div className="kds-header">
        <div className="kds-header-left">
          <img src={storeLogo || logoTurboFallback} alt="Logo" className="kds-logo" />
          <div>
            <div className="kds-title">COZINHA</div>
            <div className="kds-subtitle">EM PREPARO</div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="kds-clock">{brasiliaTime}</div>
          <div className="kds-clock-label">Horário de Brasília</div>
        </div>
        <div className="kds-count">
          {orders.length} pedido{orders.length !== 1 ? "s" : ""}
        </div>
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
                    {getDisplayCode(alert.order)}
                  </span>
                  <span className="kds-badge" style={{ background: "#fee2e2", color: "#991b1b" }}>
                    {alert.order.delivery_type === "delivery" ? "DELIVERY" : "RETIRADA"}
                  </span>
                </div>
              </div>
              {alert.order.observations && <div className="kds-order-obs">📝 {alert.order.observations}</div>}
            </div>
          ))}

          {sortedOrders.map((order) => {
            const { minutes, seconds } = getElapsed(order);
            const timerClass = getTimerClass(minutes);
            const isEdited = editedOrderIds.has(order.id);
            const cardClass = isEdited
              ? " kds-card-edited"
              : order.priority
                ? " kds-card-priority"
                : minutes >= 20
                  ? " kds-card-late"
                  : minutes >= 15
                    ? " kds-card-warning"
                    : "";
            const orderItems = items[order.id] || [];

            return (
              <div key={order.id} className={`kds-card${cardClass}`}>
                {isEdited && <div className="kds-edited-banner">✏️ PEDIDO ALTERADO ✏️</div>}
                {order.priority && !isEdited && <div className="kds-priority-banner">⚡ PRIORIDADE ⚡</div>}
                <div className="kds-card-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="kds-order-num">{getDisplayCode(order)}</span>
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
                          {item.quantity}x {item.product_code != null ? `[${item.product_code}] ` : ""}
                          {item.product_name}
                        </div>
                        {addons &&
                          addons.length > 0 &&
                          addons.map((a: any, i: number) => (
                            <div key={i} className="kds-addon">
                              + {a.name}
                              {(a.quantity || 1) > 1 ? ` x${a.quantity}` : ""}
                            </div>
                          ))}
                        {item.observations && <div className="kds-item-obs">⚠ {item.observations}</div>}
                      </div>
                    );
                  })}
                </div>

                {order.observations && <div className="kds-order-obs">📝 {order.observations}</div>}

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
