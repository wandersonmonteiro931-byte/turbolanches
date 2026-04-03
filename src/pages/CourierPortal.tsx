import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Truck, Clock, CheckCircle, XCircle, History, LogOut, MapPin, DollarSign, Package, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getBusinessDayRange, getTodayBusinessDay } from "@/lib/businessDay";
import { formatDateTimeBR } from "@/lib/brasiliaTime";

interface CourierInfo {
  id: string;
  name: string;
  fixed_fee: number;
  code: string;
  store_id: string | null;
}

interface DeliveryOrder {
  id: string;
  order_number: number;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_complement: string | null;
  delivery_fee: number;
  status: string;
  delivering_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface DailyFee {
  day_of_week: number;
  fixed_fee: number;
}

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function LoginScreen({ onLogin }: { onLogin: (c: CourierInfo) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("couriers")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("active", true)
      .maybeSingle();
    setLoading(false);
    if (err || !data) {
      setError("Código inválido ou entregador inativo.");
      return;
    }
    const courier: CourierInfo = {
      id: data.id,
      name: data.name,
      fixed_fee: Number(data.fixed_fee),
      code: data.code,
      store_id: data.store_id,
    };
    localStorage.setItem("courier_session", JSON.stringify(courier));
    onLogin(courier);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg space-y-6">
        <div className="text-center space-y-2">
          <Truck className="mx-auto text-primary" size={48} />
          <h1 className="text-xl font-bold text-foreground">Portal do Entregador</h1>
          <p className="text-sm text-muted-foreground">Digite seu código de acesso</p>
        </div>
        <input
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          placeholder="EX: ENT001"
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-lg font-bold tracking-widest text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
          autoFocus
        />
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <button
          onClick={handleLogin}
          disabled={loading || !code.trim()}
          className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Verificando..." : "Entrar"}
        </button>
      </div>
    </div>
  );
}

function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const calc = () => {
      const diff = Math.max(0, Date.now() - new Date(since).getTime());
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    calc();
    const i = setInterval(calc, 1000);
    return () => clearInterval(i);
  }, [since]);
  return <span className="font-mono text-sm font-bold text-primary">{elapsed}</span>;
}

function CourierDashboard({ courier }: { courier: CourierInfo }) {
  const [tab, setTab] = useState<"pending" | "today" | "history">("pending");
  const [pendingOrders, setPendingOrders] = useState<DeliveryOrder[]>([]);
  const [todayOrders, setTodayOrders] = useState<DeliveryOrder[]>([]);
  const [historyOrders, setHistoryOrders] = useState<DeliveryOrder[]>([]);
  const [dailyFees, setDailyFees] = useState<DailyFee[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ orderId: string; action: "delivered" | "not_delivered" } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchDailyFees = useCallback(async () => {
    const { data } = await supabase
      .from("courier_daily_fees")
      .select("day_of_week, fixed_fee")
      .eq("courier_id", courier.id);
    setDailyFees((data as any[] ?? []).map((d: any) => ({ day_of_week: d.day_of_week, fixed_fee: Number(d.fixed_fee) })));
  }, [courier.id]);

  const getTodayFixedFee = useCallback(() => {
    const now = new Date();
    const brasiliaStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const brasilia = new Date(brasiliaStr);
    let dow = brasilia.getDay();
    if (brasilia.getHours() < 6) {
      dow = new Date(brasilia.getTime() - 86400000).getDay();
    }
    const dayFee = dailyFees.find(f => f.day_of_week === dow);
    return dayFee ? dayFee.fixed_fee : courier.fixed_fee;
  }, [dailyFees, courier.fixed_fee]);

  const fetchPending = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, address_street, address_number, address_neighborhood, address_complement, delivery_fee, status, delivering_at, delivered_at, created_at")
      .eq("courier_id", courier.id)
      .eq("status", "delivering")
      .order("delivering_at", { ascending: true });
    setPendingOrders(data ?? []);
  }, [courier.id]);

  const fetchToday = useCallback(async () => {
    const bd = getTodayBusinessDay();
    const { start, end } = getBusinessDayRange(bd);
    // Fetch delivering orders (no date filter - always show active)
    // Plus delivered/cancelled within today's business day by delivered_at
    const { data: activeData } = await supabase
      .from("orders")
      .select("id, order_number, address_street, address_number, address_neighborhood, address_complement, delivery_fee, status, delivering_at, delivered_at, created_at")
      .eq("courier_id", courier.id)
      .eq("status", "delivering");
    const { data: doneData } = await supabase
      .from("orders")
      .select("id, order_number, address_street, address_number, address_neighborhood, address_complement, delivery_fee, status, delivering_at, delivered_at, created_at")
      .eq("courier_id", courier.id)
      .eq("status", "delivered")
      .not("delivered_at", "is", null)
      .gte("delivered_at", start)
      .lte("delivered_at", end)
      .order("delivered_at", { ascending: false });
    const combined = [...(activeData ?? []), ...(doneData ?? [])];
    // Deduplicate by id
    const seen = new Set<string>();
    const unique = combined.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
    setTodayOrders(unique);
  }, [courier.id]);

  const fetchHistory = useCallback(async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, address_street, address_number, address_neighborhood, address_complement, delivery_fee, status, delivering_at, delivered_at, created_at")
      .eq("courier_id", courier.id)
      .eq("status", "delivered")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    setHistoryOrders(data ?? []);
  }, [courier.id]);

  useEffect(() => {
    fetchDailyFees();
    fetchPending();
    fetchToday();
  }, [fetchDailyFees, fetchPending, fetchToday]);

  useEffect(() => {
    if (tab === "history") fetchHistory();
  }, [tab, fetchHistory]);

  // Auto-refresh every 1 second for pending + today
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPending();
      fetchToday();
      fetchDailyFees();
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchPending, fetchToday, fetchDailyFees]);

  // Realtime for order updates + courier daily fees changes
  useEffect(() => {
    const ch = supabase
      .channel("courier-orders-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchPending();
        fetchToday();
        if (tab === "history") fetchHistory();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_daily_fees" }, () => {
        fetchDailyFees();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "couriers" }, () => {
        fetchDailyFees();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchPending, fetchToday, fetchHistory, fetchDailyFees, tab]);

  const handleAction = async () => {
    if (!confirmAction) return;
    const { orderId, action } = confirmAction;
    if (action === "delivered") {
      await supabase.from("orders").update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
      }).eq("id", orderId);
      toast({ title: "✅ Entrega confirmada!" });
    } else {
      await supabase.from("orders").update({
        status: "ready",
        delivering_at: null,
        courier_id: null,
      }).eq("id", orderId);
      toast({ title: "❌ Entrega devolvida para a loja." });
    }
    setConfirmAction(null);
    fetchPending();
    fetchToday();
  };

  const logout = () => {
    localStorage.removeItem("courier_session");
    window.location.reload();
  };

  const deliveredToday = todayOrders.filter(o => o.status === "delivered" && o.delivered_at);
  const totalDeliveryFees = deliveredToday.reduce((sum, o) => sum + o.delivery_fee, 0);
  const todayFixed = getTodayFixedFee();
  const dailyBalance = todayFixed + totalDeliveryFees;

  const renderAddress = (o: DeliveryOrder) => {
    const parts = [o.address_street, o.address_number, o.address_complement, o.address_neighborhood].filter(Boolean);
    return parts.join(", ") || "Sem endereço";
  };

  const renderOrders = (orders: DeliveryOrder[], showActions: boolean) => (
    <div className="space-y-2">
      {orders.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Nenhuma entrega encontrada.</p>}
      {orders.map(o => (
        <div key={o.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-foreground">#{String(o.order_number).padStart(5, "0")}</span>
            {showActions && o.delivering_at && (
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-muted-foreground" />
                <ElapsedTimer since={o.delivering_at} />
              </div>
            )}
            {!showActions && o.delivered_at && (
              <span className="text-xs text-muted-foreground">
                {formatDateTimeBR(o.delivered_at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin size={14} className="mt-0.5 shrink-0" />
            <span>{renderAddress(o)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <DollarSign size={14} className="text-green-600" />
            <span className="font-bold text-green-600">R$ {o.delivery_fee.toFixed(2).replace(".", ",")}</span>
          </div>
          {showActions && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmAction({ orderId: o.id, action: "delivered" })}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2 text-xs font-bold text-white"
              >
                <CheckCircle size={14} /> Entregue
              </button>
              <button
                onClick={() => setConfirmAction({ orderId: o.id, action: "not_delivered" })}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-destructive py-2 text-xs font-bold text-white"
              >
                <XCircle size={14} /> Não Entregue
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck size={20} className="text-primary" />
            <div>
              <p className="text-sm font-bold text-foreground">{courier.name}</p>
              <p className="text-xs text-muted-foreground">Código: {courier.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setRefreshing(true);
                await Promise.all([fetchDailyFees(), fetchPending(), fetchToday(), tab === "history" ? fetchHistory() : Promise.resolve()]);
                setRefreshing(false);
                toast({ title: "✅ Atualizado!" });
              }}
              disabled={refreshing}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button onClick={logout} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Balance Card */}
      <div className="mx-4 mt-4 rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground mb-1">Saldo do dia</p>
        <p className="text-2xl font-bold text-foreground">R$ {dailyBalance.toFixed(2).replace(".", ",")}</p>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span>Fixo: R$ {todayFixed.toFixed(2).replace(".", ",")}</span>
          <span>Taxas ({deliveredToday.length}): R$ {totalDeliveryFees.toFixed(2).replace(".", ",")}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mx-4 mt-4">
        {([
          { key: "pending", label: "Pendentes", icon: Package, count: pendingOrders.length },
          { key: "today", label: "Hoje", icon: Clock, count: deliveredToday.length },
          { key: "history", label: "Histórico", icon: History },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            <t.icon size={14} />
            {t.label}
            {"count" in t && t.count !== undefined && t.count > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === "pending" && renderOrders(pendingOrders, true)}
        {tab === "today" && renderOrders(todayOrders, false)}
        {tab === "history" && renderOrders(historyOrders, false)}
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 space-y-4">
            <p className="text-center text-sm font-bold text-foreground">
              {confirmAction.action === "delivered"
                ? "Confirmar que o pedido foi entregue?"
                : "Confirmar que o pedido NÃO foi entregue? Ele voltará para a loja."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleAction}
                className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white ${
                  confirmAction.action === "delivered" ? "bg-green-600" : "bg-destructive"
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CourierPortal() {
  const [courier, setCourier] = useState<CourierInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const restore = async () => {
      const saved = localStorage.getItem("courier_session");
      if (!saved) { setReady(true); return; }
      try {
        const parsed = JSON.parse(saved) as CourierInfo;
        // Re-validate from DB to get fresh data (name, fixed_fee, active status)
        const { data } = await supabase
          .from("couriers")
          .select("*")
          .eq("id", parsed.id)
          .eq("active", true)
          .maybeSingle();
        if (data) {
          const fresh: CourierInfo = {
            id: data.id,
            name: data.name,
            fixed_fee: Number(data.fixed_fee),
            code: data.code,
            store_id: data.store_id,
          };
          localStorage.setItem("courier_session", JSON.stringify(fresh));
          setCourier(fresh);
        } else {
          // Courier deactivated or deleted
          localStorage.removeItem("courier_session");
        }
      } catch {
        localStorage.removeItem("courier_session");
      }
      setReady(true);
    };
    restore();
  }, []);

  if (!ready) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Carregando...</p>
    </div>
  );
  if (!courier) return <LoginScreen onLogin={setCourier} />;
  return <CourierDashboard courier={courier} />;
}
