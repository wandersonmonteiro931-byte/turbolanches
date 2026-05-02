import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, RefreshCw, Search, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { formatDateTimeBR } from "@/lib/brasiliaTime";
import { normalizeSearch } from "@/lib/searchNormalize";

interface FiadoOrder {
  id: string;
  order_number: number;
  user_id: string;
  total: number;
  payment_method: string;
  payment_confirmed: boolean;
  delivery_type: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  table_code: string | null;
  observations: string | null;
  trashed_at: string | null;
}

const getTableCode = (order: Pick<FiadoOrder, "delivery_type" | "table_code" | "observations">) => {
  if (order.delivery_type !== "mesa") return null;
  const fromColumn = order.table_code?.trim();
  if (fromColumn) return fromColumn;
  const fromObs = order.observations?.match(/#?MESA\d+/i)?.[0];
  return fromObs ? (fromObs.startsWith("#") ? fromObs.toUpperCase() : `#${fromObs.toUpperCase()}`) : "MESA";
};

const AdminFiados = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [orders, setOrders] = useState<FiadoOrder[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string; phone: string; customer_code: number }>>({});
  const [search, setSearch] = useState("");
  const [showReceived, setShowReceived] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchFiados = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("orders")
      .select("id, order_number, user_id, total, payment_method, payment_confirmed, delivery_type, status, created_at, paid_at, table_code, observations, trashed_at")
      .eq("payment_method", "fiado")
      .neq("status", "cancelled")
      .is("trashed_at", null)
      .order("created_at", { ascending: false });

    if (storeId) query = query.eq("store_id", storeId);

    const { data, error } = await query;
    setLoading(false);

    if (error) {
      toast({ title: "Erro ao carregar fiados", variant: "destructive" });
      return;
    }

    const rows = (data || []) as FiadoOrder[];
    setOrders(rows);

    const userIds = [...new Set(rows.map((order) => order.user_id).filter(Boolean))];
    if (userIds.length === 0) {
      setProfiles({});
      return;
    }

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone, customer_code")
      .in("user_id", userIds);

    const map: Record<string, { full_name: string; phone: string; customer_code: number }> = {};
    profileRows?.forEach((profile) => { map[profile.user_id] = profile; });
    setProfiles(map);
  }, [storeId, toast]);

  useEffect(() => { void fetchFiados(); }, [fetchFiados]);

  const markReceived = async (orderId: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ payment_confirmed: true, paid_at: new Date().toISOString() })
      .eq("id", orderId);

    if (error) {
      toast({ title: "Erro ao receber fiado", variant: "destructive" });
      return;
    }

    toast({ title: "✅ Fiado recebido!" });
    await fetchFiados();
  };

  const filteredOrders = useMemo(() => {
    const term = normalizeSearch(search);
    return orders
      .filter((order) => showReceived ? order.payment_confirmed : !order.payment_confirmed)
      .filter((order) => {
        if (!term) return true;
        const profile = profiles[order.user_id];
        const tableCode = normalizeSearch(getTableCode(order)) || "";
        return String(order.order_number).includes(term)
          || tableCode.includes(term)
          || normalizeSearch(profile?.full_name || "").includes(term)
          || (profile?.phone || "").includes(term);
      });
  }, [orders, profiles, search, showReceived]);

  const pendingTotal = useMemo(() => orders.filter((order) => !order.payment_confirmed).reduce((sum, order) => sum + Number(order.total || 0), 0), [orders]);
  const receivedTotal = useMemo(() => orders.filter((order) => order.payment_confirmed).reduce((sum, order) => sum + Number(order.total || 0), 0), [orders]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-foreground"><WalletCards size={20} /> Fiados</h1>
          <p className="text-xs text-muted-foreground">Controle permanente de valores a receber.</p>
        </div>
        <button onClick={fetchFiados} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground hover:bg-muted">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button onClick={() => setShowReceived(false)} className={`rounded-xl border p-4 text-left ${!showReceived ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
          <p className="text-xs font-bold uppercase text-muted-foreground">Pendente a receber</p>
          <p className="text-2xl font-black text-foreground">R$ {pendingTotal.toFixed(2).replace(".", ",")}</p>
        </button>
        <button onClick={() => setShowReceived(true)} className={`rounded-xl border p-4 text-left ${showReceived ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
          <p className="text-xs font-bold uppercase text-muted-foreground">Já recebido</p>
          <p className="text-2xl font-black text-foreground">R$ {receivedTotal.toFixed(2).replace(".", ",")}</p>
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
        <Search size={16} className="shrink-0 text-muted-foreground" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por pedido, mesa, cliente ou telefone..." className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
      </div>

      {filteredOrders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">Nenhum fiado nesta lista</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filteredOrders.map((order) => {
            const profile = profiles[order.user_id];
            const tableCode = getTableCode(order);
            return (
              <div key={order.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black text-foreground">{tableCode || `#${String(order.order_number).padStart(5, "0")}`}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{order.delivery_type === "mesa" ? "MESA" : order.delivery_type.toUpperCase()}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTimeBR(order.created_at)}</p>
                    {profile && <p className="mt-1 text-sm font-semibold text-foreground">{profile.full_name || "Cliente"}{profile.phone ? ` · ${profile.phone}` : ""}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-foreground">R$ {Number(order.total).toFixed(2).replace(".", ",")}</p>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">{order.payment_confirmed ? "Recebido" : "Pendente"}</p>
                  </div>
                </div>
                {!order.payment_confirmed && (
                  <button onClick={() => markReceived(order.id)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90">
                    <CheckCircle size={16} /> Marcar como recebido
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminFiados;