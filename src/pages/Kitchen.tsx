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
            radial-gradient(circle at 18% 12%, rgba(14,165,233,0.18), transparent 28%),
            radial-gradient(circle at 88% 16%, rgba(239,68,68,0.14), transparent 24%),
            radial-gradient(circle at 50% 100%, rgba(22,163,74,0.14), transparent 28%),
            linear-gradient(135deg, #06111f 0%, #0f172a 42%, #172033 100%);
          color: #e5eefb;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
          overflow: hidden;
        }

        body::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: 0.14;
          background-image:
            linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: linear-gradient(to bottom, black, transparent 85%);
        }

        .kds-header {
          height: 108px;
          background: rgba(7, 14, 28, 0.78);
          backdrop-filter: blur(24px);
          padding: 18px 32px;
          display: grid;
          grid-template-columns: minmax(260px, 1fr) auto minmax(260px, 1fr);
          align-items: center;
          gap: 24px;
          border-bottom: 1px solid rgba(148,163,184,0.18);
          box-shadow: 0 18px 60px rgba(0,0,0,0.35);
          position: sticky;
          top: 0;
          z-index: 5;
          animation: kds-slide-down 0.55s cubic-bezier(.2,.9,.2,1) both;
        }

        @keyframes kds-slide-down {
          from { opacity: 0; transform: translateY(-18px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .kds-header-left {
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 0;
        }

        .kds-logo {
          width: 60px;
          height: 60px;
          border-radius: 20px;
          object-fit: cover;
          box-shadow: 0 18px 38px rgba(0,0,0,0.38);
          border: 1px solid rgba(255,255,255,0.18);
          background: #020617;
          animation: kds-logo-glow 3.8s ease-in-out infinite;
        }

        @keyframes kds-logo-glow {
          0%, 100% { box-shadow: 0 18px 38px rgba(0,0,0,0.38), 0 0 0 rgba(239,68,68,0); }
          50% { box-shadow: 0 18px 38px rgba(0,0,0,0.38), 0 0 26px rgba(239,68,68,0.25); }
        }

        .kds-title {
          font-size: 31px;
          font-weight: 950;
          letter-spacing: 5px;
          line-height: 1;
          text-transform: uppercase;
          color: #ffffff;
        }

        .kds-subtitle {
          margin-top: 9px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          font-weight: 950;
          color: #fca5a5;
          letter-spacing: 2.6px;
          text-transform: uppercase;
        }

        .kds-subtitle::before {
          content: "";
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #ef4444;
          box-shadow: 0 0 0 7px rgba(239,68,68,0.14);
          animation: kds-live-dot 1.55s ease-in-out infinite;
        }

        @keyframes kds-live-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: .72; }
        }

        .kds-clock {
          position: relative;
          font-size: clamp(42px, 5.3vw, 68px);
          font-weight: 950;
          color: #ffffff;
          font-variant-numeric: tabular-nums;
          letter-spacing: 4px;
          line-height: .95;
          text-shadow: 0 16px 36px rgba(0,0,0,0.35);
        }

        .kds-clock::after {
          content: "";
          display: block;
          width: 68%;
          height: 4px;
          margin: 12px auto 0;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, #38bdf8, transparent);
          opacity: .8;
          animation: kds-line-flow 2.6s linear infinite;
        }

        @keyframes kds-line-flow {
          0% { transform: scaleX(.45); opacity: .45; }
          50% { transform: scaleX(1); opacity: .95; }
          100% { transform: scaleX(.45); opacity: .45; }
        }

        .kds-clock-label {
          margin-top: 8px;
          font-size: 11px;
          font-weight: 950;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 2.4px;
        }

        .kds-count {
          justify-self: end;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 160px;
          padding: 15px 20px;
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.92));
          color: #ffffff;
          font-size: 21px;
          font-weight: 950;
          border: 1px solid rgba(148,163,184,0.22);
          box-shadow: 0 18px 44px rgba(0,0,0,0.30);
        }

        .kds-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 24px;
          padding: 26px;
          height: calc(100vh - 108px);
          overflow-y: auto;
          align-content: start;
          grid-auto-rows: min-content;
          scrollbar-width: thin;
          scrollbar-color: rgba(148,163,184,0.35) transparent;
        }

        .kds-grid::-webkit-scrollbar { width: 10px; }
        .kds-grid::-webkit-scrollbar-thumb {
          background: rgba(148,163,184,0.35);
          border-radius: 999px;
        }

        .kds-card {
          position: relative;
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.98));
          color: #0f172a;
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,0.60);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: 278px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.28);
          animation: kds-card-in 0.5s cubic-bezier(.2,.9,.2,1) both;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }

        .kds-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 6px;
          background: linear-gradient(90deg, #38bdf8, #22c55e);
          opacity: .95;
        }

        .kds-card:hover {
          transform: translateY(-4px) scale(1.006);
          box-shadow: 0 30px 75px rgba(0,0,0,0.34);
        }

        @keyframes kds-card-in {
          from { opacity: 0; transform: translateY(18px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .kds-card-priority {
          border-color: rgba(168,85,247,0.9) !important;
          box-shadow: 0 0 0 5px rgba(168,85,247,0.18), 0 24px 60px rgba(0,0,0,0.28);
        }

        .kds-card-priority::before {
          background: linear-gradient(90deg, #7c3aed, #d946ef, #7c3aed);
          background-size: 180% 100%;
          animation: kds-gradient-flow 2.2s linear infinite;
        }

        .kds-card-late {
          border-color: rgba(239,68,68,0.9) !important;
          box-shadow: 0 0 0 5px rgba(239,68,68,0.18), 0 24px 60px rgba(0,0,0,0.28);
        }

        .kds-card-late::before {
          background: linear-gradient(90deg, #991b1b, #ef4444, #991b1b);
          background-size: 180% 100%;
          animation: kds-gradient-flow 1.25s linear infinite;
        }

        .kds-card-warning {
          border-color: rgba(245,158,11,0.9) !important;
          box-shadow: 0 0 0 5px rgba(245,158,11,0.18), 0 24px 60px rgba(0,0,0,0.28);
        }

        .kds-card-warning::before {
          background: linear-gradient(90deg, #f59e0b, #facc15, #f59e0b);
          background-size: 180% 100%;
          animation: kds-gradient-flow 1.8s linear infinite;
        }

        @keyframes kds-gradient-flow {
          from { background-position: 0% 50%; }
          to { background-position: 180% 50%; }
        }

        .kds-priority-banner,
        .kds-edited-banner,
        .kds-cancelled-banner {
          text-align: center;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 3px;
        }

        .kds-priority-banner {
          background: linear-gradient(90deg, #6d28d9, #9333ea, #c026d3);
          color: white;
          font-size: 15px;
          padding: 12px;
          animation: kds-soft-shine 2.4s linear infinite;
          background-size: 180% 100%;
        }

        .kds-card-edited {
          border-color: rgba(37,99,235,0.92) !important;
          animation: kds-card-in .5s cubic-bezier(.2,.9,.2,1) both, kds-edited-glow 1.1s ease-in-out infinite;
        }

        @keyframes kds-edited-glow {
          0%, 100% { box-shadow: 0 0 0 5px rgba(37,99,235,.18), 0 24px 60px rgba(0,0,0,.28); }
          50% { box-shadow: 0 0 0 9px rgba(37,99,235,.25), 0 30px 75px rgba(0,0,0,.34); }
        }

        .kds-card-edited::before {
          background: linear-gradient(90deg, #1d4ed8, #38bdf8, #1d4ed8);
          background-size: 180% 100%;
          animation: kds-gradient-flow 1.5s linear infinite;
        }

        .kds-edited-banner {
          background: linear-gradient(90deg, #1d4ed8, #2563eb, #38bdf8);
          color: white;
          font-size: 16px;
          padding: 12px;
          background-size: 180% 100%;
          animation: kds-soft-shine 1.6s linear infinite;
        }

        @keyframes kds-soft-shine {
          from { background-position: 0% 50%; }
          to { background-position: 180% 50%; }
        }

        .kds-card-cancelled {
          border-color: rgba(239,68,68,0.95) !important;
          background: #fff1f2 !important;
          animation: kds-card-in .45s cubic-bezier(.2,.9,.2,1) both, kds-cancelled-pulse .85s ease-in-out infinite;
        }

        @keyframes kds-cancelled-pulse {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.06); }
        }

        .kds-cancelled-banner {
          background: linear-gradient(90deg, #7f1d1d, #dc2626, #ef4444);
          color: white;
          font-size: 24px;
          padding: 18px;
          background-size: 180% 100%;
          animation: kds-soft-shine 1.2s linear infinite;
        }

        .kds-card-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          padding: 22px 22px 18px;
          border-bottom: 1px solid rgba(15,23,42,0.08);
          background:
            radial-gradient(circle at 15% 0%, rgba(56,189,248,0.13), transparent 32%),
            linear-gradient(180deg, #ffffff, #f8fafc);
        }

        .kds-order-num {
          font-size: 34px;
          font-weight: 950;
          letter-spacing: .5px;
          color: #0f172a;
          line-height: 1;
        }

        .kds-badge {
          display: inline-flex;
          align-items: center;
          height: 28px;
          font-size: 11px;
          padding: 0 12px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #334155;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: .8px;
          border: 1px solid rgba(15,23,42,0.08);
        }

        .kds-timer {
          position: relative;
          overflow: hidden;
          font-size: 27px;
          padding: 9px 15px;
          border-radius: 18px;
          font-weight: 950;
          min-width: 112px;
          text-align: center;
          font-variant-numeric: tabular-nums;
          border: 1px solid rgba(15,23,42,0.10);
          box-shadow: inset 0 -2px 0 rgba(15,23,42,0.06);
        }

        .kds-timer::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-110%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);
          animation: kds-sweep 2.2s ease-in-out infinite;
        }

        @keyframes kds-sweep {
          0% { transform: translateX(-110%); }
          45%, 100% { transform: translateX(110%); }
        }

        .kds-timer-normal { background: #dcfce7; color: #166534; }
        .kds-timer-warning { background: #fef3c7; color: #92400e; animation: kds-timer-warning 1.4s ease-in-out infinite; }
        .kds-timer-late { background: #fee2e2; color: #991b1b; animation: kds-timer-late .72s ease-in-out infinite; }

        @keyframes kds-timer-warning {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.045); }
        }

        @keyframes kds-timer-late {
          0%,100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.06); filter: brightness(1.08); }
        }

        .kds-deadline {
          font-size: 12px;
          font-weight: 950;
          color: #0369a1;
          background: #e0f2fe;
          border: 1px solid #bae6fd;
          padding: 6px 11px;
          border-radius: 999px;
          margin-top: 5px;
          display: inline-block;
        }

        .kds-items {
          padding: 15px 22px;
          flex: 1;
        }

        .kds-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 23px;
          font-weight: 950;
          padding: 11px 0;
          border-bottom: 1px solid rgba(15,23,42,0.08);
          letter-spacing: .1px;
          color: #0f172a;
          line-height: 1.15;
        }

        .kds-item::before {
          content: "";
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #22c55e;
          margin-top: 8px;
          box-shadow: 0 0 0 5px rgba(34,197,94,.13);
          flex: 0 0 auto;
        }

        .kds-item:last-child { border-bottom: none; }

        .kds-addon {
          margin: 2px 0 4px 22px;
          font-size: 16px;
          color: #475569;
          padding-left: 15px;
          font-weight: 850;
          border-left: 4px solid #cbd5e1;
        }

        .kds-item-obs {
          margin: 8px 0 4px 22px;
          font-size: 15px;
          color: #92400e;
          padding: 9px 12px;
          font-weight: 900;
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 14px;
        }

        .kds-order-obs {
          margin: 0 22px 15px;
          padding: 12px 14px;
          font-size: 16px;
          color: #78350f;
          font-weight: 950;
          border: 1px dashed #f59e0b;
          background: #fffbeb;
          border-radius: 16px;
        }

        .kds-footer {
          padding: 17px 22px 22px;
          background: linear-gradient(180deg, #f8fafc, #eef2f7);
          border-top: 1px solid rgba(15,23,42,0.08);
        }

        .kds-btn {
          position: relative;
          overflow: hidden;
          width: 100%;
          padding: 19px;
          border: none;
          border-radius: 20px;
          background: linear-gradient(135deg, #16a34a, #22c55e, #86efac);
          background-size: 180% 100%;
          color: #fff;
          font-size: 18px;
          font-weight: 950;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 1.7px;
          transition: transform .13s ease, filter .13s ease;
          font-family: 'Inter', sans-serif;
          box-shadow: 0 18px 34px rgba(22,163,74,0.28);
          animation: kds-btn-flow 3s linear infinite;
        }

        .kds-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-110%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.34), transparent);
          animation: kds-sweep 2.7s ease-in-out infinite;
        }

        @keyframes kds-btn-flow {
          from { background-position: 0% 50%; }
          to { background-position: 180% 50%; }
        }

        .kds-btn:hover { filter: brightness(1.05); }
        .kds-btn:active { transform: scale(.985); }

        .kds-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: calc(100vh - 108px);
          color: #e5eefb;
          font-size: 31px;
          font-weight: 950;
          letter-spacing: .3px;
          text-align: center;
          animation: kds-empty-in .65s cubic-bezier(.2,.9,.2,1) both;
        }

        @keyframes kds-empty-in {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .kds-empty-icon {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 118px;
          height: 118px;
          border-radius: 36px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          margin-bottom: 26px;
          box-shadow: 0 28px 65px rgba(22,163,74,.32);
          border: 6px solid rgba(255,255,255,.92);
          animation: kds-empty-float 3s ease-in-out infinite;
        }

        .kds-empty-icon::before {
          content: "";
          width: 46px;
          height: 24px;
          border-left: 10px solid #ffffff;
          border-bottom: 10px solid #ffffff;
          transform: rotate(-45deg) translate(2px, -3px);
          border-radius: 3px;
        }

        .kds-empty-icon::after {
          content: "";
          position: absolute;
          inset: -16px;
          border-radius: 46px;
          border: 2px solid rgba(34,197,94,.28);
          animation: kds-ring 2s ease-out infinite;
        }

        @keyframes kds-empty-float {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        @keyframes kds-ring {
          0% { transform: scale(.86); opacity: .8; }
          100% { transform: scale(1.18); opacity: 0; }
        }

        @media (max-width: 900px) {
          .kds-header {
            height: auto;
            grid-template-columns: 1fr;
            text-align: center;
            padding: 18px;
          }

          .kds-header-left {
            justify-content: center;
          }

          .kds-count {
            justify-self: center;
          }

          .kds-grid {
            height: calc(100vh - 230px);
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
          <span className="kds-empty-icon"></span>
          Nenhum pedido em preparo
        </div>
      ) : (
        <div className="kds-grid">
          {cancelledAlerts.map((alert) => (
            <div key={`cancelled-${alert.order.id}`} className="kds-card kds-card-cancelled">
              <div className="kds-cancelled-banner">PEDIDO CANCELADO</div>
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
              {alert.order.observations && <div className="kds-order-obs">OBS: {alert.order.observations}</div>}
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
                {isEdited && <div className="kds-edited-banner">PEDIDO ALTERADO</div>}
                {order.priority && !isEdited && <div className="kds-priority-banner">PRIORIDADE</div>}
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
                    <span className="kds-deadline">Até {getDeadline(order)}</span>
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
                        {item.observations && <div className="kds-item-obs">OBS: {item.observations}</div>}
                      </div>
                    );
                  })}
                </div>

                {order.observations && <div className="kds-order-obs">OBS: {order.observations}</div>}

                <div className="kds-footer">
                  <button className="kds-btn" onClick={() => markReady(order.id)}>
                    MARCAR PRONTO
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
