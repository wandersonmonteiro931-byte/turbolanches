import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, Truck, Clock, ChefHat, Package, Printer, RefreshCw, Search, Filter, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getBusinessDayRange } from "@/lib/businessDay";
import { formatDateTimeBR, formatTimeBR } from "@/lib/brasiliaTime";

interface Order {
  id: string;
  order_number: number;
  user_id: string;
  status: string;
  subtotal: number;
  total: number;
  delivery_fee: number;
  discount: number;
  payment_method: string;
  payment_confirmed: boolean;
  delivery_type: string;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  created_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  delivering_at: string | null;
  delivered_at: string | null;
  observations: string | null;
  priority: boolean;
  change_for: number | null;
  cancellation_reason: string | null;
  courier_id: string | null;
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

const paymentLabels: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao: "Cartão",
  credito: "Crédito",
  debito: "Débito",
  fiado: "Fiado",
};

const deliveryLabels: Record<string, string> = {
  delivery: "Delivery",
  retirada: "Retirada",
  mesa: "Mesa",
  viagem: "Viagem",
  consumo: "Consumo",
};

const getPaymentDisplay = (paymentMethod: string, paymentConfirmed: boolean): string => {
  if (paymentMethod === "pix") return paymentConfirmed ? "PIX PAGO" : "PIX ENTREGA";
  if (paymentMethod === "fiado") return "FIADO";
  return paymentLabels[paymentMethod] || paymentMethod;
};

const AdminOrders = () => {
  const { storeId } = useStore();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [profiles, setProfiles] = useState<Record<string, { customer_code: number; full_name: string; phone: string }>>({});
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [obrigadoEnabled, setObrigadoEnabled] = useState(true);
  const [showRouteClosureModal, setShowRouteClosureModal] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterPayment, setFilterPayment] = useState<string[]>([]);
  const [filterDeliveryType, setFilterDeliveryType] = useState<string[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterMinValue, setFilterMinValue] = useState("");
  const [filterMaxValue, setFilterMaxValue] = useState("");
  const [filterPaid, setFilterPaid] = useState<"all" | "paid" | "unpaid">("all");
  const [filterProductName, setFilterProductName] = useState("");

  // Product names for items filter - load all items for filtered orders
  const [allItems, setAllItems] = useState<Record<string, OrderItem[]>>({});



  const fetchOrders = useCallback(async () => {
    let all: Order[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from("orders")
        .select("id, order_number, user_id, status, subtotal, total, delivery_fee, discount, payment_method, payment_confirmed, delivery_type, address_street, address_number, address_complement, address_neighborhood, created_at, preparing_at, ready_at, delivering_at, delivered_at, observations, priority, change_for, cancellation_reason, courier_id")
        .order("order_number", { ascending: false })
        .range(from, from + pageSize - 1);

      if (storeId) {
        query = query.eq("store_id", storeId);
      }

      const { data } = await query;

      if (data && data.length > 0) {
        all = [...all, ...data];
        from += pageSize;
        if (data.length < pageSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    setAllOrders(all);

    const userIds = [...new Set(all.map((o) => o.user_id))];
    if (userIds.length === 0) {
      setProfiles({});
      return;
    }

    const profileMap: Record<string, { customer_code: number; full_name: string; phone: string }> = {};
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, customer_code, full_name, phone")
        .in("user_id", batch);
      if (profilesData) {
        profilesData.forEach((p) => {
          profileMap[p.user_id] = p;
        });
      }
    }
    setProfiles(profileMap);
  }, [storeId]);

  // Fetch items for product name filter
  const fetchAllItemsForFilter = useCallback(async () => {
    if (!filterProductName) return;
    const term = `%${filterProductName}%`;
    const { data } = await supabase
      .from("order_items")
      .select("order_id, product_name, quantity, unit_price")
      .ilike("product_name", term)
      .limit(5000);
    if (data) {
      const map: Record<string, OrderItem[]> = {};
      data.forEach((item: any) => {
        if (!map[item.order_id]) map[item.order_id] = [];
        map[item.order_id].push(item);
      });
      setAllItems(map);
    }
  }, [filterProductName]);

  useEffect(() => {
    if (filterProductName.length >= 2) {
      const t = setTimeout(fetchAllItemsForFilter, 400);
      return () => clearTimeout(t);
    }
    setAllItems({});
  }, [filterProductName, fetchAllItemsForFilter]);

  const fetchItems = async (orderId: string) => {
    if (items[orderId]) return;
    const { data } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);
    if (data) setItems((prev) => ({ ...prev, [orderId]: data }));
  };

  useEffect(() => {
    void fetchOrders();

    // Fetch obrigado setting
    const fetchObrigado = async () => {
      let q = supabase.from("store_settings").select("obrigado_receipt_enabled").limit(1);
      if (storeId) q = q.eq("store_id", storeId);
      const { data } = await q.maybeSingle();
      if (data) setObrigadoEnabled((data as any).obrigado_receipt_enabled !== false);
    };
    fetchObrigado();

    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if (payload.eventType === "INSERT") {
          toast({ title: "🔔 Novo pedido!", description: "Um novo pedido acaba de chegar." });
        }
        void fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, toast, storeId]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let result = allOrders;

    // Show all orders — no filtering

    // Search
    if (searchQuery.length >= 1) {
      const q = searchQuery.toLowerCase();
      const codeMatch = q.match(/^#?(\d+)$/);
      const clientCodeMatch = q.match(/^t?(\d+)$/i);

      result = result.filter((o) => {
        // Match order number
        if (codeMatch && String(o.order_number).includes(codeMatch[1])) return true;
        if (String(o.order_number).padStart(5, "0").includes(q.replace("#", ""))) return true;
        // Match customer code
        const profile = profiles[o.user_id];
        if (clientCodeMatch && profile && String(profile.customer_code) === clientCodeMatch[1]) return true;
        if (profile?.full_name?.toLowerCase().includes(q)) return true;
        if (profile?.phone?.includes(q)) return true;
        // Match address
        if (o.address_street?.toLowerCase().includes(q)) return true;
        if (o.address_neighborhood?.toLowerCase().includes(q)) return true;
        // Match observations
        if (o.observations?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    // Status filter
    if (filterStatus.length > 0) {
      result = result.filter((o) => filterStatus.includes(o.status));
    }

    // Payment filter
    if (filterPayment.length > 0) {
      result = result.filter((o) => filterPayment.includes(o.payment_method));
    }

    // Delivery type filter
    if (filterDeliveryType.length > 0) {
      result = result.filter((o) => filterDeliveryType.includes(o.delivery_type));
    }

    // Date range filter (using business day logic: 03:00 to 02:59:59 next day)
    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom + "T00:00:00");
      const { start } = getBusinessDayRange(fromDate);
      result = result.filter((o) => new Date(o.created_at) >= new Date(start));
    }
    if (filterDateTo) {
      const toDate = new Date(filterDateTo + "T00:00:00");
      const { end } = getBusinessDayRange(toDate);
      result = result.filter((o) => new Date(o.created_at) <= new Date(end));
    }

    // Value range filter
    if (filterMinValue) {
      const min = parseFloat(filterMinValue);
      if (!isNaN(min)) result = result.filter((o) => o.total >= min);
    }
    if (filterMaxValue) {
      const max = parseFloat(filterMaxValue);
      if (!isNaN(max)) result = result.filter((o) => o.total <= max);
    }

    // Paid filter
    if (filterPaid === "paid") {
      result = result.filter((o) => o.payment_confirmed);
    } else if (filterPaid === "unpaid") {
      result = result.filter((o) => !o.payment_confirmed);
    }

    // Product name filter
    if (filterProductName.length >= 2 && Object.keys(allItems).length > 0) {
      const matchingOrderIds = new Set(Object.keys(allItems));
      result = result.filter((o) => matchingOrderIds.has(o.id));
    }

    return result;
  }, [allOrders, searchQuery, filterStatus, filterPayment, filterDeliveryType, filterDateFrom, filterDateTo, filterMinValue, filterMaxValue, filterPaid, filterProductName, allItems, profiles]);

  const activeFiltersCount = [
    filterStatus.length > 0,
    filterPayment.length > 0,
    filterDeliveryType.length > 0,
    !!filterDateFrom || !!filterDateTo,
    !!filterMinValue || !!filterMaxValue,
    filterPaid !== "all",
    filterProductName.length >= 2,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterStatus([]);
    setFilterPayment([]);
    setFilterDeliveryType([]);
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterMinValue("");
    setFilterMaxValue("");
    setFilterPaid("all");
    setFilterProductName("");
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    // If moving to delivered, require route closure confirmation
    if (newStatus === "delivered") {
      setShowRouteClosureModal(orderId);
      return;
    }

    const updateData: any = { status: newStatus };
    const now = new Date().toISOString();
    if (newStatus === "preparing") updateData.preparing_at = now;
    if (newStatus === "ready") updateData.ready_at = now;
    if (newStatus === "delivering") updateData.delivering_at = now;

    const { error: updateErr } = await supabase.from("orders").update(updateData).eq("id", orderId);
    if (updateErr) {
      toast({ title: "Erro ao atualizar pedido", variant: "destructive" });
      return;
    }
    await fetchOrders();
    setExpandedOrder(orderId);
    toast({ title: `Pedido atualizado para: ${statusConfig[newStatus]?.label}` });

    if (newStatus === "preparing") {
      safePrint(`/admin/imprimir/${orderId}?tipo=pedido`);
    } else if (newStatus === "delivering") {
      if (obrigadoEnabled) {
        safePrint(`/admin/imprimir/${orderId}?tipo=obrigado`);
      }
    }
  };

  const confirmRouteClosure = async (orderId: string) => {
    const { error } = await supabase.from("orders").update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
    }).eq("id", orderId);
    if (error) {
      toast({ title: "Erro ao finalizar pedido", variant: "destructive" });
      return;
    }
    toast({ title: "✅ Entrega finalizada com Fechamento de Rota!" });
    setShowRouteClosureModal(null);
    await fetchOrders();
  };

  const safePrint = (url: string) => {
    const win = window.open(url, "_blank", "width=300,height=600");
    if (!win || win.closed) {
      toast({ title: "❌ Popup bloqueado! Permita popups neste site para impressão automática.", variant: "destructive" });
    }
  };

  const printReceipt = (orderId: string, tipo: "pedido" | "obrigado", delayMs?: number) => {
    const delayParam = typeof delayMs === "number" ? `&delay_ms=${delayMs}` : "";
    safePrint(`/admin/imprimir/${orderId}?tipo=${tipo}${delayParam}`);
  };
  const toggleExpand = (orderId: string) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
    } else {
      setExpandedOrder(orderId);
      fetchItems(orderId);
    }
  };

  const formatDateTime = (date: string) => {
    return formatDateTimeBR(date, {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const formatTime = (date: string | null) => {
    return formatTimeBR(date);
  };

  const toggleFilter = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  return (
    <div className="space-y-3">
      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-card border border-border px-3 py-2.5">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            placeholder="Buscar por nº pedido, código cliente, nome, telefone ou endereço..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`relative inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
            showFilters || activeFiltersCount > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-foreground hover:bg-muted"
          }`}
        >
          <Filter size={14} />
          Filtros
          {activeFiltersCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeFiltersCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { fetchOrders(); toast({ title: "✅ Pedidos atualizados" }); }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground uppercase">Filtros</h3>
            {activeFiltersCount > 0 && (
              <button onClick={clearFilters} className="text-xs font-medium text-primary hover:underline">
                Limpar todos
              </button>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1 block">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(statusConfig).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => toggleFilter(filterStatus, key, setFilterStatus)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    filterStatus.includes(key) ? val.color + " ring-2 ring-offset-1 ring-primary/30" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1 block">Pagamento</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(paymentLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleFilter(filterPayment, key, setFilterPayment)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    filterPayment.includes(key) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Delivery Type */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1 block">Tipo</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(deliveryLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleFilter(filterDeliveryType, key, setFilterDeliveryType)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    filterDeliveryType.includes(key) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Paid Status */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1 block">Pagamento Confirmado</label>
            <div className="flex gap-1.5">
              {([["all", "Todos"], ["paid", "Pagos"], ["unpaid", "Não pagos"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilterPaid(key)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    filterPaid === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1 block">Data inicial</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1 block">Data final</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
              />
            </div>
          </div>

          {/* Value Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1 block">Valor mínimo (R$)</label>
              <input
                type="number"
                placeholder="0,00"
                value={filterMinValue}
                onChange={(e) => setFilterMinValue(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1 block">Valor máximo (R$)</label>
              <input
                type="number"
                placeholder="999,99"
                value={filterMaxValue}
                onChange={(e) => setFilterMaxValue(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Product Name */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1 block">Item do cardápio</label>
            <input
              placeholder="Ex: X-Bacon, Coca-Cola..."
              value={filterProductName}
              onChange={(e) => setFilterProductName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
      )}

      {/* Status Summary + Results Count */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-muted-foreground">
          {filteredOrders.length} pedido(s)
          {(searchQuery || activeFiltersCount > 0) && ` de ${allOrders.length} total`}
        </span>
        {Object.entries(statusConfig).map(([key, val]) => {
          const count = filteredOrders.filter((o) => o.status === key).length;
          if (count === 0) return null;
          return (
            <span key={key} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${val.color}`}>
              {val.label} ({count})
            </span>
          );
        })}
      </div>

      {filteredOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Package size={48} className="mb-3 opacity-50" />
          <p className="text-sm">{searchQuery || activeFiltersCount > 0 ? "Nenhum pedido encontrado com esses filtros" : "Nenhum pedido ainda"}</p>
        </div>
      )}

      {filteredOrders.map((order) => {
        const status = statusConfig[order.status] || statusConfig.pending;
        const StatusIcon = status.icon;
        const next = nextStatus[order.status];
        const profile = profiles[order.user_id];
        const customerCode = profile?.customer_code ? `T${String(profile.customer_code).padStart(5, "0")}` : "";

        return (
          <div
            key={order.id}
            className={`rounded-xl border bg-card shadow-sm overflow-hidden ${
              order.status === "pending" || order.status === "paid"
                ? "border-amber-400 animate-pulse ring-1 ring-amber-300"
                : (order.status === "ready" && order.courier_id)
                  ? "border-red-500 border-2 animate-pulse"
                  : "border-border"
            }`}
          >
            <button
              onClick={() => toggleExpand(order.id)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${status.color}`}>
                <StatusIcon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-foreground">#{String(order.order_number).padStart(5, "0")}</span>
                  {customerCode && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      {customerCode}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
                    {status.label}
                  </span>
                   {order.priority && (
                     <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">⚡</span>
                   )}
                   {order.status === "ready" && order.courier_id && (
                     <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 animate-pulse">
                       ⚠️ DEVOLVIDO
                     </span>
                   )}
                   {!order.payment_confirmed && order.status !== "cancelled" && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">$ Pendente</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {formatDateTime(order.created_at)} · {deliveryLabels[order.delivery_type] || order.delivery_type} · {getPaymentDisplay(order.payment_method, order.payment_confirmed)}
                  {profile?.full_name ? ` · ${profile.full_name}` : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-bold text-foreground">R$ {Number(order.total).toFixed(2).replace(".", ",")}</span>
              </div>
            </button>

            {expandedOrder === order.id && (
              <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                {/* Timeline */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                  <span>📥 Recebido: {formatTime(order.created_at)}</span>
                  {order.preparing_at && <span>👨‍🍳 Preparo: {formatTime(order.preparing_at)}</span>}
                  {order.ready_at && <span>✅ Pronto: {formatTime(order.ready_at)}</span>}
                  {order.delivering_at && <span>🚀 Saiu: {formatTime(order.delivering_at)}</span>}
                  {order.delivered_at && <span>📦 Entregue: {formatTime(order.delivered_at)}</span>}
                </div>

                {/* Customer Info */}
                {profile && (
                  <div className="text-xs text-muted-foreground">
                    👤 {profile.full_name || "Sem nome"} · {profile.phone || "Sem telefone"} · {customerCode}
                  </div>
                )}

                {/* Address */}
                {order.address_street && (
                  <p className="text-xs text-muted-foreground">
                    📍 {order.address_street}, {order.address_number || "S/N"}
                    {order.address_complement ? ` - ${order.address_complement}` : ""} - {order.address_neighborhood}
                  </p>
                )}

                {/* Observations */}
                {order.observations && (
                  <p className="text-xs text-muted-foreground">💬 {order.observations}</p>
                )}

                {/* Cancellation Reason */}
                {order.cancellation_reason && (
                  <p className="text-xs text-red-600 font-medium">❌ Motivo cancelamento: {order.cancellation_reason}</p>
                )}

                {/* Items */}
                <div className="space-y-1.5">
                  {(items[order.id] || []).map((item) => (
                    <div key={item.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground font-medium">
                          {item.quantity}x {item.product_name}
                        </span>
                        <span className="text-muted-foreground">
                          R$ {(Number(item.unit_price) * item.quantity).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                      {item.addons_json && (item.addons_json as any[]).length > 0 && (item.addons_json as any[]).map((a: any, i: number) => (
                        <div key={i} className="text-[11px] text-muted-foreground pl-4">+ {a.name}{(a.quantity || 1) > 1 ? ` x${a.quantity}` : ""}</div>
                      ))}
                      {item.observations && <div className="text-[11px] text-muted-foreground pl-4">Obs: {item.observations}</div>}
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="rounded-lg bg-muted/50 p-2.5 space-y-0.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="text-foreground">R$ {Number(order.subtotal).toFixed(2).replace(".", ",")}</span></div>
                  {order.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="text-green-600">- R$ {Number(order.discount).toFixed(2).replace(".", ",")}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Entrega</span><span className="text-foreground">R$ {Number(order.delivery_fee).toFixed(2).replace(".", ",")}</span></div>
                  <div className="flex justify-between font-bold text-sm"><span className="text-foreground">Total</span><span className="text-primary">R$ {Number(order.total).toFixed(2).replace(".", ",")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Pagamento</span><span className="text-foreground">{getPaymentDisplay(order.payment_method, order.payment_confirmed)} {order.payment_confirmed ? "✅" : "❌"}</span></div>
                  {order.change_for && order.change_for > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Troco para</span><span className="text-foreground">R$ {Number(order.change_for).toFixed(2).replace(".", ",")}</span></div>
                  )}
                </div>

                {/* Print buttons */}
                <div className="flex gap-2">
                  <button onClick={() => printReceipt(order.id, "pedido")}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                    <Printer size={14} /> Pedido
                  </button>
                  <button onClick={() => printReceipt(order.id, "obrigado")}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                    <Printer size={14} /> Obrigado
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {order.status === "preparing" && (
                    <button
                      onClick={async () => {
                        await supabase.from("orders").update({ priority: !order.priority }).eq("id", order.id);
                        toast({ title: order.priority ? "Prioridade removida" : "⚡ Pedido marcado como PRIORIDADE" });
                        fetchOrders();
                      }}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                        order.priority ? "border-purple-500 bg-purple-50 text-purple-700" : "border-border text-muted-foreground"
                      }`}
                    >
                      ⚡ {order.priority ? "Remover Prioridade" : "Prioridade"}
                    </button>
                  )}
                  {order.payment_method !== "fiado" && order.status !== "cancelled" && (
                    <button
                      onClick={async () => {
                        await supabase.from("orders").update({ payment_method: "fiado", payment_confirmed: false }).eq("id", order.id);
                        toast({ title: "📝 Pedido marcado como Fiado" });
                        fetchOrders();
                      }}
                      className="rounded-lg border border-amber-500 px-3 py-2 text-xs font-bold text-amber-600"
                    >
                      📝 Fiado
                    </button>
                  )}
                </div>

                {/* Status actions */}
                <div className="flex gap-2">
                  {next && (
                    <button
                      onClick={() => updateStatus(order.id, next)}
                      className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
                    >
                      {next === "preparing" ? "✅ Aceitar" : `Avançar → ${statusConfig[next]?.label}`}
                    </button>
                  )}
                  {order.status !== "cancelled" && order.status !== "delivered" && (
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
      {/* Route Closure Confirmation Modal */}
      {showRouteClosureModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 space-y-4 mx-4">
            <h3 className="text-lg font-bold text-foreground">📋 Fechamento de Rota</h3>
            <p className="text-sm text-muted-foreground">
              Foi realizado o <span className="font-bold text-foreground">Fechamento de Rota</span>?
            </p>
            <p className="text-xs text-muted-foreground">
              Confirme que o entregador devolveu a comanda e realize o carimbo de confirmação de pagamento.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRouteClosureModal(null)}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground"
              >
                Não
              </button>
              <button
                onClick={() => confirmRouteClosure(showRouteClosureModal)}
                className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-bold text-white"
              >
                Sim, Finalizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;