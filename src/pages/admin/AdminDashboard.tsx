import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag, DollarSign, Clock, CheckCircle, ChefHat, Package,
  Truck, X, Check, Printer, Store, StoreIcon, Power, Settings,
  FileText, AlertTriangle, Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Order {
  id: string;
  user_id: string;
  order_number: number;
  status: string;
  total: number;
  delivery_fee: number;
  discount: number;
  subtotal: number;
  payment_method: string;
  delivery_type: string;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_complement: string | null;
  created_at: string;
  observations: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  payment_confirmed: boolean;
  change_for: number | null;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  observations: string | null;
  addons_json: any;
}

interface StoreSettings {
  id: string;
  is_open: boolean;
  opened_at: string | null;
  closed_at: string | null;
  scheduled_open: string | null;
  scheduled_close: string | null;
  use_schedule: boolean;
}

const tabs = [
  { key: "pending", label: "Pendentes", icon: Clock, color: "bg-amber-500", statuses: ["pending", "awaiting_payment"] },
  { key: "preparing", label: "Em Preparo", icon: ChefHat, color: "bg-purple-500", statuses: ["preparing"] },
  { key: "ready", label: "Aguardando", icon: Package, color: "bg-emerald-500", statuses: ["ready"] },
  { key: "delivering", label: "Entregando", icon: Truck, color: "bg-cyan-500", statuses: ["delivering"] },
  { key: "delivered", label: "Finalizados", icon: Check, color: "bg-green-600", statuses: ["delivered"] },
  { key: "cancelled", label: "Recusados", icon: X, color: "bg-red-500", statuses: ["cancelled"] },
];

const nextStatus: Record<string, string> = {
  pending: "preparing",
  preparing: "ready",
  ready: "delivering",
  delivering: "delivered",
};

const AdminDashboard = () => {
  const [profiles, setProfiles] = useState<Record<string, { customer_code: number; full_name: string; phone: string }>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [activeTab, setActiveTab] = useState("pending");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState("");
  const [scheduleClose, setScheduleClose] = useState("");
  const [showCloseDay, setShowCloseDay] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchOrders = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select("*")
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: false });
    if (data) {
      setOrders(data as Order[]);
      // Fetch profiles for customer codes
      const userIds = [...new Set(data.map(o => o.user_id))];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, customer_code, full_name, phone")
          .in("user_id", userIds);
        if (profilesData) {
          const map: Record<string, { customer_code: number; full_name: string; phone: string }> = {};
          profilesData.forEach(p => { map[p.user_id] = p; });
          setProfiles(map);
        }
      }
    }
  }, []);

  const fetchStoreSettings = useCallback(async () => {
    const { data } = await supabase.from("store_settings").select("*").limit(1).single();
    if (data) {
      setStoreSettings(data as StoreSettings);
      setScheduleOpen(data.scheduled_open || "");
      setScheduleClose(data.scheduled_close || "");
    }
  }, []);

  const fetchItems = async (orderId: string) => {
    if (items[orderId]) return;
    const { data } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    if (data) setItems((prev) => ({ ...prev, [orderId]: data }));
  };

  useEffect(() => {
    fetchOrders();
    fetchStoreSettings();

    const ordersChannel = supabase
      .channel("admin-dashboard-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if (payload.eventType === "INSERT") {
          try {
            const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==");
            audio.play().catch(() => {});
          } catch {}
          toast({ title: "🔔 Novo pedido!", description: "Um novo pedido acaba de chegar." });
        }
        fetchOrders();
      })
      .subscribe();

    const storeChannel = supabase
      .channel("store-settings-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "store_settings" }, () => {
        fetchStoreSettings();
      })
      .subscribe();

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(storeChannel);
      clearInterval(timer);
    };
  }, [fetchOrders, fetchStoreSettings]);

  const toggleStore = async () => {
    if (!storeSettings) return;
    const newOpen = !storeSettings.is_open;
    await supabase.from("store_settings").update({
      is_open: newOpen,
      ...(newOpen ? { opened_at: new Date().toISOString() } : { closed_at: new Date().toISOString() }),
    }).eq("id", storeSettings.id);
    toast({ title: newOpen ? "🟢 Loja aberta!" : "🔴 Loja fechada!" });
  };

  const saveSchedule = async () => {
    if (!storeSettings) return;
    await supabase.from("store_settings").update({
      use_schedule: true,
      scheduled_open: scheduleOpen || null,
      scheduled_close: scheduleClose || null,
    }).eq("id", storeSettings.id);
    setShowSchedule(false);
    toast({ title: "⏰ Horários salvos!" });
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    const updateData: any = { status: newStatus };
    if (newStatus === "preparing") updateData.preparing_at = new Date().toISOString();
    if (newStatus === "ready") updateData.ready_at = new Date().toISOString();

    const { error } = await supabase.from("orders").update(updateData).eq("id", orderId);
    if (error) {
      toast({ title: "Erro ao atualizar pedido", variant: "destructive" });
      return;
    }
    toast({ title: `Pedido atualizado!` });

    if (newStatus === "preparing") {
      printReceipt(orderId, "cozinha");
    } else if (newStatus === "delivering") {
      printReceipt(orderId, "entrega");
      setTimeout(() => printReceipt(orderId, "cliente"), 2000);
    }
  };

  const confirmPayment = async (orderId: string) => {
    await supabase.from("orders").update({ payment_confirmed: true }).eq("id", orderId);
    toast({ title: "💰 Pagamento confirmado manualmente!" });
    fetchOrders();
  };

  const markAsFiado = async (orderId: string) => {
    await supabase.from("orders").update({ payment_confirmed: true, payment_method: "fiado" }).eq("id", orderId);
    toast({ title: "📝 Pedido marcado como fiado!" });
    fetchOrders();
  };

  const printReceipt = (orderId: string, tipo: string) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-10000px;left:-10000px;width:0;height:0;border:none;";
    iframe.src = `/admin/imprimir/${orderId}?tipo=${tipo}`;
    document.body.appendChild(iframe);
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 10000);
  };

  const handleCloseDay = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = orders.filter(o => o.status === "delivered");
    const totalBruto = todayOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalDelivery = todayOrders.reduce((s, o) => s + Number(o.delivery_fee), 0);
    const totalGastos = totalDelivery; // Can be extended
    const totalLiquido = totalBruto - totalGastos;

    await supabase.from("daily_reports").upsert({
      report_date: today.toISOString().split("T")[0],
      total_orders: todayOrders.length,
      total_bruto: totalBruto,
      total_delivery_fees: totalDelivery,
      total_gastos: totalGastos,
      total_liquido: totalLiquido,
      opened_at: storeSettings?.opened_at,
      closed_at: new Date().toISOString(),
    }, { onConflict: "report_date" });

    // Close store
    if (storeSettings) {
      await supabase.from("store_settings").update({
        is_open: false,
        closed_at: new Date().toISOString(),
      }).eq("id", storeSettings.id);
    }

    // Print report
    printDailyReport(todayOrders, totalBruto, totalDelivery, totalGastos, totalLiquido);

    setShowCloseDay(false);
    toast({ title: "📊 Dia finalizado! Relatório impresso." });
  };

  const printDailyReport = (todayOrders: Order[], bruto: number, delivery: number, gastos: number, liquido: number) => {
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    const date = new Date().toLocaleDateString("pt-BR");
    w.document.write(`
      <html><head><style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Inter',sans-serif; width:72mm; padding:2mm; font-size:10px; }
        .center { text-align:center; }
        .sep { border-top:1px dashed #000; margin:3px 0; }
        .row { display:flex; justify-content:space-between; padding:2px 0; font-weight:700; }
        .big { font-size:14px; font-weight:900; }
        h1 { font-size:14px; font-weight:900; text-align:center; margin:4px 0; }
        h2 { font-size:11px; font-weight:900; text-align:center; margin:2px 0; }
        @page { size:72mm auto; margin:0; }
      </style></head><body>
        <h1>TURBO DELIVERY LANCHES</h1>
        <h2>RELATÓRIO DIÁRIO</h2>
        <div class="center">${date}</div>
        <div class="sep"></div>
        <div class="row"><span>Total de Pedidos:</span><span>${todayOrders.length}</span></div>
        <div class="sep"></div>
        <div class="row big"><span>TOTAL BRUTO:</span><span>R$ ${bruto.toFixed(2).replace(".",",")}</span></div>
        <div class="row"><span>Total Entregadores:</span><span>R$ ${delivery.toFixed(2).replace(".",",")}</span></div>
        <div class="row"><span>Total Gastos:</span><span>R$ ${gastos.toFixed(2).replace(".",",")}</span></div>
        <div class="sep"></div>
        <div class="row big"><span>TOTAL LÍQUIDO:</span><span>R$ ${liquido.toFixed(2).replace(".",",")}</span></div>
        <div class="sep"></div>
        <div class="center" style="margin-top:8px;font-size:8px;">Relatório gerado automaticamente</div>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); setTimeout(() => w.close(), 1000); }, 500);
  };

  const activeTabConfig = tabs.find(t => t.key === activeTab);
  const filteredOrders = orders.filter(o => activeTabConfig?.statuses.includes(o.status));

  const getElapsed = (preparingAt: string | null) => {
    if (!preparingAt) return null;
    const diff = now - new Date(preparingAt).getTime();
    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    return { min, sec };
  };

  const stats = {
    pending: orders.filter(o => o.status === "pending" || o.status === "awaiting_payment").length,
    preparing: orders.filter(o => o.status === "preparing").length,
    ready: orders.filter(o => o.status === "ready").length,
    delivering: orders.filter(o => o.status === "delivering").length,
    delivered: orders.filter(o => o.status === "delivered").length,
    cancelled: orders.filter(o => o.status === "cancelled").length,
  };

  const todayRevenue = orders.filter(o => o.status === "delivered").reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="space-y-4">
      {/* Store Control Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <button
          onClick={toggleStore}
          className={`flex items-center gap-2 rounded-lg px-5 py-3 font-bold text-sm transition-all ${
            storeSettings?.is_open
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}
        >
          <Power size={18} />
          {storeSettings?.is_open ? "LOJA ABERTA" : "ABRIR LOJA"}
        </button>

        <button
          onClick={() => navigate("/admin/novo-pedido")}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={16} />
          Novo Pedido
        </button>

        <button
          onClick={() => setShowSchedule(!showSchedule)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Settings size={16} />
          Horários
        </button>

        <button
          onClick={() => setShowCloseDay(true)}
          disabled={!storeSettings?.is_open}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40"
        >
          <FileText size={16} />
          Finalizar Dia
        </button>

        <div className="ml-auto flex items-center gap-4 text-sm">
          <div className="text-muted-foreground">
            <span className="font-bold text-foreground">{orders.length}</span> pedidos hoje
          </div>
          <div className="text-muted-foreground">
            Faturamento: <span className="font-bold text-green-600">R$ {todayRevenue.toFixed(2).replace(".",",")}</span>
          </div>
        </div>
      </div>

      {/* Schedule Modal */}
      {showSchedule && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-bold text-foreground text-sm">⏰ Horários Programados</h3>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Abertura</label>
              <input type="time" value={scheduleOpen} onChange={e => setScheduleOpen(e.target.value)}
                className="block rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fechamento</label>
              <input type="time" value={scheduleClose} onChange={e => setScheduleClose(e.target.value)}
                className="block rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <button onClick={saveSchedule} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
              Salvar
            </button>
          </div>
          {storeSettings?.use_schedule && storeSettings.scheduled_open && (
            <p className="text-xs text-muted-foreground">
              Ativo: {storeSettings.scheduled_open} às {storeSettings.scheduled_close}
            </p>
          )}
        </div>
      )}

      {/* Close Day Confirmation */}
      {showCloseDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-card p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={24} className="text-amber-500" />
              <h3 className="text-lg font-bold text-foreground">Finalizar o Dia?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              A loja será fechada e o relatório diário será impresso automaticamente.
            </p>
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span>Pedidos entregues:</span><span className="font-bold">{stats.delivered}</span></div>
              <div className="flex justify-between"><span>Faturamento bruto:</span><span className="font-bold text-green-600">R$ {todayRevenue.toFixed(2).replace(".",",")}</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCloseDay(false)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground">
                Cancelar
              </button>
              <button onClick={handleCloseDay} className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white">
                Confirmar e Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {tabs.map(tab => {
          const count = stats[tab.key as keyof typeof stats] || 0;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                isActive
                  ? `${tab.color} text-white`
                  : "bg-card border border-border text-foreground hover:bg-muted"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {count > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  isActive ? "bg-white/20 text-white" : "bg-muted text-foreground"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package size={40} className="mb-3 opacity-40" />
          <p className="text-sm">Nenhum pedido nesta categoria</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const next = order.status === "awaiting_payment" ? null : nextStatus[order.status];
            const elapsed = order.status === "preparing" ? getElapsed(order.preparing_at) : null;
            const profile = profiles[order.user_id];
            const customerCode = profile?.customer_code ? `T${String(profile.customer_code).padStart(5, '0')}` : "";

            return (
              <div key={order.id} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <button
                  onClick={() => {
                    if (expandedOrder === order.id) setExpandedOrder(null);
                    else { setExpandedOrder(order.id); fetchItems(order.id); }
                  }}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-foreground">
                        #{String(order.order_number).padStart(5, "0")}
                      </span>
                      {customerCode && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          CLIENTE: {customerCode}
                        </span>
                      )}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {order.delivery_type === "delivery" ? "DELIVERY" : order.delivery_type === "mesa" ? "MESA" : order.delivery_type === "viagem" ? "VIAGEM" : order.delivery_type === "consumo" ? "CONSUMO" : "RETIRADA"}
                      </span>
                      {order.status === "awaiting_payment" && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-800">
                          AG. PIX
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}{order.payment_method.toUpperCase()}
                      {profile?.full_name ? ` · ${profile.full_name}` : ""}
                    </p>
                  </div>

                  {elapsed && (
                    <div className={`rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums ${
                      elapsed.min >= 20 ? "bg-red-600 text-white animate-pulse" :
                      elapsed.min >= 15 ? "bg-amber-500 text-white" :
                      "bg-green-600 text-white"
                    }`}>
                      {elapsed.min}:{String(elapsed.sec).padStart(2, "0")}
                    </div>
                  )}

                  <span className="text-sm font-bold text-foreground">
                    R$ {Number(order.total).toFixed(2).replace(".",",")}
                  </span>
                </button>

                {expandedOrder === order.id && (
                  <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                    {order.address_street && (
                      <p className="text-xs text-muted-foreground">
                        📍 {order.address_street}, {order.address_number}
                        {order.address_complement ? ` - ${order.address_complement}` : ""}
                        {order.address_neighborhood ? ` - ${order.address_neighborhood}` : ""}
                      </p>
                    )}
                    {order.observations && (
                      <p className="text-xs text-amber-600 font-medium">💬 {order.observations}</p>
                    )}

                    <div className="space-y-1">
                      {(items[order.id] || []).map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-foreground">{item.quantity}x {item.product_name}</span>
                          <span className="text-muted-foreground">R$ {(Number(item.unit_price) * item.quantity).toFixed(2).replace(".",",")}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => printReceipt(order.id, "cozinha")}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                        <Printer size={14} /> Cozinha
                      </button>
                      <button onClick={() => { printReceipt(order.id, "entrega"); setTimeout(() => printReceipt(order.id, "cliente"), 2000); }}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                        <Printer size={14} /> Entrega+Cliente
                      </button>
                    </div>

                    {/* Payment actions */}
                    <div className="flex flex-wrap gap-2">
                      {order.status === "awaiting_payment" && (
                        <button onClick={async () => {
                          await supabase.from("orders").update({ payment_confirmed: true, status: "preparing", preparing_at: new Date().toISOString() }).eq("id", order.id);
                          toast({ title: "✅ PIX confirmado! Pedido em preparo." });
                          await fetchOrders();
                          printReceipt(order.id, "cozinha");
                        }}
                          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white">
                          <DollarSign size={14} /> Confirmar PIX
                        </button>
                      )}
                      {order.payment_method !== "fiado" && order.status !== "cancelled" && (
                        <button onClick={() => markAsFiado(order.id)}
                          className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">
                          📝 Marcar Fiado
                        </button>
                      )}
                      {order.payment_confirmed && order.status !== "awaiting_payment" && (
                        <span className="flex items-center gap-1 rounded-lg bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700">
                          ✅ {order.payment_method === "fiado" ? "FIADO" : "PAGO"}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {next && (
                        <button
                          onClick={() => updateStatus(order.id, next)}
                          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
                        >
                          {next === "preparing" ? "✅ Aceitar Pedido" : `Avançar → ${tabs.find(t => t.key === next)?.label}`}
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
      )}
    </div>
  );
};

export default AdminDashboard;
