import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag, DollarSign, Clock, CheckCircle, ChefHat, Package,
  Truck, X, Check, Printer, Store, StoreIcon, Power,
  FileText, AlertTriangle, Plus, Search, CalendarIcon, Edit2, Save, RefreshCw,
  Eye, EyeOff
} from "lucide-react";
import { format, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { supabase } from "@/integrations/supabase/client";
import { formatBusinessDate, getBusinessDayRange, getTodayBusinessDay } from "@/lib/businessDay";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useStore } from "@/contexts/StoreContext";
import { useAdminSectionPassword } from "@/hooks/useAdminSectionPassword";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  coupon_code: string | null;
  courier_id: string | null;
  delivering_at: string | null;
  delivered_at: string | null;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  observations: string | null;
  addons_json: any;
}

interface Courier {
  id: string;
  name: string;
  fixed_fee: number;
}

interface StoreSettings {
  id: string;
  is_open: boolean;
  opened_at: string | null;
  closed_at: string | null;
  scheduled_open: string | null;
  scheduled_close: string | null;
  use_schedule: boolean;
  obrigado_receipt_enabled?: boolean;
}

const tabs = [
  { key: "pending", label: "Pendentes", icon: Clock, color: "bg-amber-500", statuses: ["pending", "paid"] },
  { key: "preparing", label: "Em Preparo", icon: ChefHat, color: "bg-purple-500", statuses: ["preparing"] },
  { key: "ready", label: "Aguardando", icon: Package, color: "bg-emerald-500", statuses: ["ready"] },
  { key: "delivering", label: "Entregando", icon: Truck, color: "bg-cyan-500", statuses: ["delivering"] },
  { key: "delivered", label: "Finalizados", icon: Check, color: "bg-green-600", statuses: ["delivered"] },
  { key: "cancelled", label: "Recusados", icon: X, color: "bg-red-500", statuses: ["cancelled"] },
];

const nextStatus: Record<string, string> = {
  pending: "preparing",
  paid: "preparing",
  preparing: "ready",
  ready: "delivering",
  delivering: "delivered",
};

const getPaymentDisplay = (paymentMethod: string, paymentConfirmed: boolean): string => {
  if (paymentMethod === "pix") return paymentConfirmed ? "PIX PAGO" : "PIX ENTREGA";
  if (paymentMethod === "fiado") return "FIADO";
  return paymentConfirmed ? `${paymentMethod.toUpperCase()} (PAGO)` : paymentMethod.toUpperCase();
};

const AdminDashboard = () => {
  const { storeId, loading: storeLoading } = useStore();
  const { isOpen: customerSeesOpen, nextOpeningText } = useStoreStatus();
  const [profiles, setProfiles] = useState<Record<string, { customer_code: number; full_name: string; phone: string }>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [activeTab, setActiveTab] = useState("pending");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [showCloseDay, setShowCloseDay] = useState(false);
  const [now, setNow] = useState(Date.now());
  const nowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(getTodayBusinessDay());
  const [searchQuery, setSearchQuery] = useState("");
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Order>>({});
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [togglingStore, setTogglingStore] = useState(false);
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);
  const [periodFrom, setPeriodFrom] = useState<Date | undefined>(undefined);
  const [valuesVisible, setValuesVisible] = useState(false);
  const [periodTo, setPeriodTo] = useState<Date | undefined>(undefined);
  const [showPeriodReport, setShowPeriodReport] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { config: pwConfig } = useAdminSectionPassword();
  const [showReportPwModal, setShowReportPwModal] = useState(false);
  const [reportPwInput, setReportPwInput] = useState("");
  const [reportPwError, setReportPwError] = useState(false);
  const [pendingReportAction, setPendingReportAction] = useState<(() => void) | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [courierSelectOrderId, setCourierSelectOrderId] = useState<string | null>(null);
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);
  const [showDeliveryReport, setShowDeliveryReport] = useState(false);
  const [deliveryReportCourierId, setDeliveryReportCourierId] = useState<string>("");

  // Alarm is now global via useAdminAlarm in App.tsx

  // Fetch couriers
  const fetchCouriers = useCallback(async () => {
    let q = supabase.from("couriers" as any).select("id, name, fixed_fee").eq("active", true);
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    setCouriers((data as any[] ?? []).map((c: any) => ({ id: c.id, name: c.name, fixed_fee: Number(c.fixed_fee) })));
  }, [storeId]);

  const todayBD = getTodayBusinessDay();
  const isToday = selectedDate.toDateString() === todayBD.toDateString();

  const requireReportPassword = (action: () => void) => {
    if (pwConfig.password) {
      setPendingReportAction(() => action);
      setReportPwInput("");
      setReportPwError(false);
      setShowReportPwModal(true);
    } else {
      action();
    }
  };

  const handleReportPwSubmit = () => {
    if (reportPwInput === pwConfig.password) {
      setShowReportPwModal(false);
      pendingReportAction?.();
      setPendingReportAction(null);
    } else {
      setReportPwError(true);
    }
  };

  const fetchOrders = useCallback(async () => {
    const { start, end } = getBusinessDayRange(selectedDate);

    let query = supabase
      .from("orders")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });

    if (storeId) {
      query = query.eq("store_id", storeId);
    }

    const { data } = await query;
    if (data) {
      setOrders(data as Order[]);
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
  }, [selectedDate, storeId]);

  const applyStoreSettings = useCallback((data: StoreSettings) => {
    setStoreSettings(data);
  }, []);

  const fetchStoreSettings = useCallback(async () => {
    let query = supabase
      .from("store_settings")
      .select("id, is_open, opened_at, closed_at, scheduled_open, scheduled_close, use_schedule, obrigado_receipt_enabled")
      .limit(1);

    if (storeId) {
      query = query.eq("store_id", storeId);
    }

    const { data } = await query.maybeSingle();

    if (data) {
      const settings = data as StoreSettings;
      applyStoreSettings(settings);
      return settings;
    }

    return null;
  }, [applyStoreSettings, storeId]);

  const requestToggleConfirmation = useCallback(async () => {
    if (togglingStore) return;

    // Already loaded — open modal immediately
    if (storeSettings) {
      setShowToggleConfirm(true);
      return;
    }

    // Fetch settings now (works even without storeId by falling back to first row)
    const fetched = await fetchStoreSettings();
    if (fetched) {
      setShowToggleConfirm(true);
      return;
    }

    toast({ title: "Erro ao carregar configurações. Tente novamente.", variant: "destructive" });
  }, [fetchStoreSettings, storeSettings, togglingStore, toast]);

  const fetchItems = async (orderId: string) => {
    if (items[orderId]) return;
    const { data } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    if (data) setItems((prev) => ({ ...prev, [orderId]: data }));
  };

  const openKitchenWindow = () => {
    // Open on the left monitor (negative X for extended display to the left)
    const w = screen.availWidth;
    const h = screen.availHeight;
    window.open(
      "/cozinha",
      "turbo-kitchen",
      `width=${w},height=${h},left=${-w},top=0,menubar=no,toolbar=no,location=no,status=no`
    );
  };

  // Auto-launch kitchen window once per session
  useEffect(() => {
    const key = "kitchen-auto-launched";
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      openKitchenWindow();
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchStoreSettings();
    fetchCouriers();

    const ordersChannel = supabase
      .channel("admin-dashboard-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if (payload.eventType === "INSERT" && isToday) {
          toast({ title: "🔔 Novo pedido!", description: "Um novo pedido acaba de chegar." });
        }
        if (isToday) fetchOrders();
      })
      .subscribe();

    const storeChannel = supabase
      .channel("store-settings-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "store_settings" }, () => {
        fetchStoreSettings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(storeChannel);
    };
  }, [fetchOrders, fetchStoreSettings, fetchCouriers, isToday]);

  // Only tick the timer when there are preparing orders visible (saves CPU)
  const hasPreparingVisible = activeTab === "preparing" && orders.some(o => o.status === "preparing");
  useEffect(() => {
    if (hasPreparingVisible) {
      nowIntervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    } else {
      if (nowIntervalRef.current) { clearInterval(nowIntervalRef.current); nowIntervalRef.current = null; }
    }
    return () => { if (nowIntervalRef.current) { clearInterval(nowIntervalRef.current); nowIntervalRef.current = null; } };
  }, [hasPreparingVisible]);

  const toggleStore = async () => {
    if (togglingStore || !storeSettings) return;

    const previousSettings = storeSettings;
    // Use the actual visible status (customerSeesOpen) instead of the DB flag
    const currentlyOpen = customerSeesOpen;
    const newOpen = !currentlyOpen;
    const timestamp = new Date().toISOString();
    const nextSettings: StoreSettings = {
      ...previousSettings,
      is_open: newOpen,
      opened_at: newOpen ? timestamp : null,
      closed_at: newOpen ? null : timestamp,
    };

    setTogglingStore(true);
    applyStoreSettings(nextSettings);

    const { error } = await supabase
      .from("store_settings")
      .update({
        is_open: newOpen,
        opened_at: newOpen ? timestamp : null,
        closed_at: newOpen ? null : timestamp,
      })
      .eq("id", previousSettings.id);

    if (error) {
      applyStoreSettings(previousSettings);
      toast({ title: "Erro ao alterar status da loja", variant: "destructive" });
      setTogglingStore(false);
      return;
    }

    toast({ title: newOpen ? "Loja aberta!" : "Loja fechada!" });
    await fetchStoreSettings();
    setTogglingStore(false);
  };


  const updateStatus = async (orderId: string, newStatus: string, courierId?: string) => {
    // If moving to delivering and couriers exist, show courier selector first
    if (newStatus === "delivering" && couriers.length > 0 && !courierId) {
      setCourierSelectOrderId(orderId);
      setSelectedCourierId(null);
      return;
    }

    const updateData: any = { status: newStatus };
    const nowISO = new Date().toISOString();
    if (newStatus === "preparing") updateData.preparing_at = nowISO;
    if (newStatus === "ready") updateData.ready_at = nowISO;
    if (newStatus === "delivering") {
      updateData.delivering_at = nowISO;
      if (courierId) updateData.courier_id = courierId;
    }
    if (newStatus === "delivered") updateData.delivered_at = nowISO;

    const { error } = await supabase.from("orders").update(updateData).eq("id", orderId);
    if (error) {
      toast({ title: "Erro ao atualizar pedido", variant: "destructive" });
      return;
    }
    toast({ title: `Pedido atualizado!` });
    await fetchOrders();

    // Mark coupon as used when order is accepted (preparing)
    if (newStatus === "preparing") {
      const order = orders.find(o => o.id === orderId);
      if (order?.coupon_code) {
        await supabase.rpc("increment_coupon_used_count" as any, { _code: order.coupon_code });
      }
      printReceipt(orderId, "pedido");
    } else if (newStatus === "delivering") {
      if (storeSettings?.obrigado_receipt_enabled !== false) {
        printReceipt(orderId, "obrigado");
      }
    }
  };

  const confirmCourierAndDeliver = async () => {
    if (!courierSelectOrderId || !selectedCourierId) return;
    setCourierSelectOrderId(null);
    await updateStatus(courierSelectOrderId, "delivering", selectedCourierId);
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

  const printReceipt = (orderId: string, tipo: string, delayMs?: number) => {
    const delayParam = typeof delayMs === "number" ? `&delay_ms=${delayMs}` : "";
    const w = window.open(`/admin/imprimir/${orderId}?tipo=${tipo}${delayParam}`, "_blank", "width=300,height=600");
    if (!w) return;
    // AdminPrint.tsx already calls window.print() + window.close() on load
  };
  const acceptAllPending = async () => {
    const toAccept = orders.filter(o => o.status === "pending" || o.status === "paid");
    if (toAccept.length === 0) {
      toast({ title: "Nenhum pedido pendente para aceitar." });
      return;
    }

    const nowISO = new Date().toISOString();
    const { error } = await supabase
      .from("orders")
      .update({ status: "preparing", preparing_at: nowISO })
      .in("id", toAccept.map(o => o.id));

    if (error) {
      toast({ title: "Erro ao aceitar pedidos", variant: "destructive" });
      return;
    }

    // Mark coupons as used for all accepted orders
    const couponOrders = toAccept.filter(o => o.coupon_code);
    for (const order of couponOrders) {
      await supabase.rpc("increment_coupon_used_count" as any, { _code: order.coupon_code });
    }

    // Print receipts with shorter delays (800ms between each)
    toAccept.forEach((order, i) => {
      setTimeout(() => printReceipt(order.id, "pedido"), i * 800);
    });

    toast({ title: `✅ ${toAccept.length} pedido(s) aceito(s) e enviados para cozinha!` });
    fetchOrders();
  };

  // Edit order
  const startEdit = (order: Order) => {
    setEditingOrder(order.id);
    setEditData({
      observations: order.observations || "",
      address_street: order.address_street || "",
      address_number: order.address_number || "",
      address_complement: order.address_complement || "",
      address_neighborhood: order.address_neighborhood || "",
      delivery_type: order.delivery_type,
      payment_method: order.payment_method,
      discount: order.discount,
      delivery_fee: order.delivery_fee,
    });
  };

  const saveEdit = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    const newDeliveryFee = Number(editData.delivery_fee ?? order?.delivery_fee ?? 0);
    const newDiscount = Number(editData.discount || 0);
    const newTotal = Number(order?.subtotal || 0) + newDeliveryFee - newDiscount;

    const { error } = await supabase.from("orders").update({
      ...editData,
      delivery_fee: newDeliveryFee,
      total: newTotal,
    }).eq("id", orderId);

    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
      return;
    }
    setEditingOrder(null);
    toast({ title: "✅ Pedido atualizado!" });
    fetchOrders();
  };

  // Reprint daily report for any date
  const reprintDailyReport = async () => {
    const { start, end } = getBusinessDayRange(selectedDate);
    const PAGE_SIZE = 1000;
    let page = 0;
    let currentDayOrders: Order[] = [];

    while (true) {
      let query = supabase
        .from("orders")
        .select("*")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (storeId) query = query.eq("store_id", storeId);

      const { data, error } = await query;
      if (error) {
        toast({ title: "Erro ao buscar relatório atualizado", variant: "destructive" });
        return;
      }

      const pageData = (data ?? []) as Order[];
      if (pageData.length === 0) break;
      currentDayOrders = currentDayOrders.concat(pageData);
      if (pageData.length < PAGE_SIZE) break;
      page += 1;
    }

    const validOrders = currentDayOrders.filter((o) => o.status !== "cancelled");
    const bruto = validOrders.reduce((s, o) => s + Number(o.total), 0);
    const delivery = validOrders.reduce((s, o) => s + Number(o.delivery_fee), 0);
    const gastos = delivery;
    const liquido = bruto - gastos;

    printDailyReport(currentDayOrders, bruto, delivery, gastos, liquido);
  };



  const reprintPeriodReport = async () => {
    if (!periodFrom || !periodTo) {
      toast({ title: "Selecione as datas de início e fim", variant: "destructive" });
      return;
    }
    toast({ title: "Buscando pedidos do período..." });

    const { start: fromISO } = getBusinessDayRange(periodFrom);
    const { end: toISO } = getBusinessDayRange(periodTo);

    // Fetch ALL orders (paginate to avoid 1000 row limit)
    let allOrders: any[] = [];
    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      let q = supabase
        .from("orders")
        .select("total, delivery_fee, status, created_at")
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .neq("status", "cancelled")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (storeId) q = q.eq("store_id", storeId);
      const { data } = await q;
      if (!data || data.length === 0) break;
      allOrders = allOrders.concat(data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }
    const ordersData = allOrders;

    const toDateKey = (value: string) => formatBusinessDate(new Date(value));

    // Group orders by date
    const ordersByDate = new Map<string, { count: number; bruto: number; delivery: number }>();
    (ordersData ?? []).forEach((o: any) => {
      const d = toDateKey(o.created_at);
      const existing = ordersByDate.get(d) || { count: 0, bruto: 0, delivery: 0 };
      existing.count += 1;
      existing.bruto += Number(o.total) || 0;
      existing.delivery += Number(o.delivery_fee) || 0;
      ordersByDate.set(d, existing);
    });

    // Generate ALL business dates in the range (inclusive)
    const allDates: string[] = eachDayOfInterval({ start: periodFrom, end: periodTo }).map(d => format(d, "yyyy-MM-dd"));

    // Build full rows from current orders only (always up-to-date)
    const fullRows = allDates.map(dateStr => {
      const orderData = ordersByDate.get(dateStr);

      if (orderData && orderData.count > 0) {
        const gastos = orderData.delivery;
        return {
          report_date: dateStr,
          total_orders: orderData.count,
          total_bruto: orderData.bruto,
          total_delivery_fees: orderData.delivery,
          total_gastos: gastos,
          total_liquido: orderData.bruto - gastos,
        };
      }
      return {
        report_date: dateStr,
        total_orders: 0,
        total_bruto: 0,
        total_delivery_fees: 0,
        total_gastos: 0,
        total_liquido: 0,
      };
    });

    const totalBruto = fullRows.reduce((s, r) => s + r.total_bruto, 0);
    const totalDelivery = fullRows.reduce((s, r) => s + r.total_delivery_fees, 0);
    const totalGastos = fullRows.reduce((s, r) => s + r.total_gastos, 0);
    const totalLiquido = fullRows.reduce((s, r) => s + r.total_liquido, 0);
    const totalOrders = fullRows.reduce((s, r) => s + r.total_orders, 0);

    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;

    const periodLabel = `${format(periodFrom, "dd/MM/yyyy")} a ${format(periodTo, "dd/MM/yyyy")}`;

    const reportRows = fullRows.map(r => `
      <div class="row"><span>${format(new Date(r.report_date + "T12:00:00"), "dd/MM")}</span><span>${r.total_orders} ped.</span><span>R$ ${r.total_bruto.toFixed(2).replace(".",",")}</span><span>R$ ${r.total_liquido.toFixed(2).replace(".",",")}</span></div>
    `).join("");

    w.document.write(`
      <html><head><style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Inter',sans-serif; width:72mm; padding:2mm; font-size:10px; }
        .center { text-align:center; }
        .sep { border-top:1px dashed #000; margin:3px 0; }
        .row { display:flex; justify-content:space-between; padding:2px 0; font-weight:700; font-size:9px; }
        .big { font-size:14px; font-weight:900; }
        h1 { font-size:14px; font-weight:900; text-align:center; margin:4px 0; }
        h2 { font-size:11px; font-weight:900; text-align:center; margin:2px 0; }
        @page { size:72mm auto; margin:0; }
      </style></head><body>
        <h1>TURBO LANCHES</h1>
        <h2>RELATÓRIO DE PERÍODO</h2>
        <div class="center">${periodLabel}</div>
        <div class="sep"></div>
        <div class="row" style="font-size:8px;color:#666"><span>Data</span><span>Pedidos</span><span>Bruto</span><span>Líquido</span></div>
        ${reportRows}
        <div class="sep"></div>
        <div class="row"><span>Total Pedidos:</span><span>${totalOrders}</span></div>
        <div class="row big"><span>TOTAL BRUTO:</span><span>R$ ${totalBruto.toFixed(2).replace(".",",")}</span></div>
        <div class="row"><span>Total Entregadores:</span><span>R$ ${totalDelivery.toFixed(2).replace(".",",")}</span></div>
        <div class="row"><span>Total Gastos:</span><span>R$ ${totalGastos.toFixed(2).replace(".",",")}</span></div>
        <div class="sep"></div>
        <div class="row big"><span>TOTAL LÍQUIDO:</span><span>R$ ${totalLiquido.toFixed(2).replace(".",",")}</span></div>
        <div class="sep"></div>
        <div class="center" style="margin-top:8px;font-size:8px;">Relatório de período gerado automaticamente</div>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); setTimeout(() => w.close(), 1000); }, 500);
  };

  const handleCloseDay = async () => {
    // Use business day (orders until 6AM count as previous day)
    const businessDay = getTodayBusinessDay();

    const allOrders = orders.filter(o => o.status !== "cancelled");
    const totalBruto = allOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalDelivery = allOrders.reduce((s, o) => s + Number(o.delivery_fee), 0);
    const totalGastos = totalDelivery;
    const totalLiquido = totalBruto - totalGastos;

    await supabase.from("daily_reports").upsert({
      report_date: format(businessDay, "yyyy-MM-dd"),
      total_orders: allOrders.length,
      total_bruto: totalBruto,
      total_delivery_fees: totalDelivery,
      total_gastos: totalGastos,
      total_liquido: totalLiquido,
      opened_at: storeSettings?.opened_at,
      closed_at: new Date().toISOString(),
      store_id: storeId,
    }, { onConflict: "report_date" });

    if (storeSettings) {
      await supabase.from("store_settings").update({
        is_open: false,
        closed_at: new Date().toISOString(),
      }).eq("id", storeSettings.id);
    }

    printDailyReport(orders, totalBruto, totalDelivery, totalGastos, totalLiquido);
    setShowCloseDay(false);
    toast({ title: "📊 Dia finalizado! Relatório impresso." });
  };

  const printDailyReport = (allOrders: Order[], bruto: number, delivery: number, gastos: number, liquido: number) => {
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    const date = format(selectedDate, "dd/MM/yyyy");

    const statusCounts = {
      pending: allOrders.filter(o => o.status === "pending" || o.status === "paid").length,
      
      preparing: allOrders.filter(o => o.status === "preparing").length,
      ready: allOrders.filter(o => o.status === "ready").length,
      delivering: allOrders.filter(o => o.status === "delivering").length,
      delivered: allOrders.filter(o => o.status === "delivered").length,
      cancelled: allOrders.filter(o => o.status === "cancelled").length,
    };

    const statusLabels: Record<string, string> = {
      pending: "Pendentes",
      awaiting_payment: "Ag. Pagamento",
      preparing: "Em Preparo",
      ready: "Pronto",
      delivering: "Entregando",
      delivered: "Entregues",
      cancelled: "Cancelados",
    };

    const statusRows = Object.entries(statusCounts)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `<div class="row"><span>${statusLabels[key]}:</span><span>${count}</span></div>`)
      .join("");

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
        <h1>TURBO LANCHES</h1>
        <h2>RELATÓRIO DIÁRIO</h2>
        <div class="center">${date}</div>
        <div class="sep"></div>
        <div class="row"><span>Total de Pedidos:</span><span>${allOrders.length}</span></div>
        ${statusRows}
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

  // ── Delivery Report ──
  const printDeliveryReport = async () => {
    if (!deliveryReportCourierId) {
      toast({ title: "Selecione um entregador", variant: "destructive" });
      return;
    }

    const { start, end } = getBusinessDayRange(selectedDate);
    const PAGE_SIZE = 1000;
    let allDeliveryOrders: any[] = [];
    let page = 0;

    while (true) {
      let q = supabase
        .from("orders")
        .select("order_number, address_street, address_neighborhood, delivery_fee, courier_id, delivering_at, delivered_at, created_at, status")
        .gte("created_at", start)
        .lte("created_at", end)
        .eq("delivery_type", "delivery")
        .eq("courier_id", deliveryReportCourierId)
        .in("status", ["delivering", "delivered"])
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (storeId) q = q.eq("store_id", storeId);
      const { data } = await q;
      if (!data || data.length === 0) break;
      allDeliveryOrders = allDeliveryOrders.concat(data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    const courier = couriers.find(c => c.id === deliveryReportCourierId);
    const courierName = courier?.name || "Desconhecido";
    const courierFixedFee = courier?.fixed_fee || 0;
    const totalTaxas = allDeliveryOrders.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
    const totalEntregador = allDeliveryOrders.length * courierFixedFee;
    const date = format(selectedDate, "dd/MM/yyyy");

    const rows = allDeliveryOrders.map(o => `
      <div class="row"><span>${o.address_street || "S/R"}</span><span>${o.address_neighborhood || ""}</span><span>R$ ${Number(o.delivery_fee || 0).toFixed(2).replace(".",",")}</span></div>
    `).join("");

    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;

    w.document.write(`
      <html><head><style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Inter',sans-serif; width:72mm; padding:2mm; font-size:10px; }
        .center { text-align:center; }
        .sep { border-top:1px dashed #000; margin:3px 0; }
        .row { display:flex; justify-content:space-between; padding:2px 0; font-weight:700; font-size:9px; gap:4px; }
        .big { font-size:14px; font-weight:900; }
        h1 { font-size:14px; font-weight:900; text-align:center; margin:4px 0; }
        h2 { font-size:11px; font-weight:900; text-align:center; margin:2px 0; }
        @page { size:72mm auto; margin:0; }
      </style></head><body>
        <h1>TURBO LANCHES</h1>
        <h2>RELATÓRIO DE ENTREGAS</h2>
        <div class="center">${date}</div>
        <div class="center" style="font-weight:900;font-size:12px;margin:4px 0;">🚚 ${courierName}</div>
        <div class="sep"></div>
        <div class="row" style="font-size:8px;color:#666"><span>Rua</span><span>Bairro</span><span>Taxa</span></div>
        ${rows}
        <div class="sep"></div>
        <div class="row"><span>Total de Entregas:</span><span>${allDeliveryOrders.length}</span></div>
        <div class="row"><span>Total Taxas Cobradas:</span><span>R$ ${totalTaxas.toFixed(2).replace(".",",")}</span></div>
        <div class="row"><span>Valor Fixo/Entrega:</span><span>R$ ${courierFixedFee.toFixed(2).replace(".",",")}</span></div>
        <div class="sep"></div>
        <div class="row big"><span>TOTAL ENTREGADOR:</span><span>R$ ${totalEntregador.toFixed(2).replace(".",",")}</span></div>
        <div class="sep"></div>
        <div class="center" style="margin-top:8px;font-size:8px;">Relatório de entregas gerado automaticamente</div>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); setTimeout(() => w.close(), 1000); }, 500);
  };

  const activeTabConfig = tabs.find(t => t.key === activeTab);
  const filteredOrders = orders
    .filter(o => activeTabConfig?.statuses.includes(o.status))
    .filter(o => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const profile = profiles[o.user_id];
      const code = profile?.customer_code ? `t${String(profile.customer_code).padStart(5, '0')}` : "";
      return (
        String(o.order_number).includes(q) ||
        code.includes(q) ||
        (profile?.full_name || "").toLowerCase().includes(q) ||
        (profile?.phone || "").includes(q) ||
        (o.address_street || "").toLowerCase().includes(q) ||
        (o.address_neighborhood || "").toLowerCase().includes(q)
      );
    });

  const getElapsed = (preparingAt: string | null) => {
    if (!preparingAt) return null;
    const diff = now - new Date(preparingAt).getTime();
    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    return { min, sec };
  };

  const stats = useMemo(() => ({
    pending: orders.filter(o => o.status === "pending" || o.status === "paid" || o.status === "awaiting_payment").length,
    preparing: orders.filter(o => o.status === "preparing").length,
    ready: orders.filter(o => o.status === "ready").length,
    delivering: orders.filter(o => o.status === "delivering").length,
    delivered: orders.filter(o => o.status === "delivered").length,
    cancelled: orders.filter(o => o.status === "cancelled").length,
  }), [orders]);

  const todayRevenue = useMemo(() => orders.filter(o => o.status === "delivered").reduce((s, o) => s + Number(o.total), 0), [orders]);

  return (
    <div className="space-y-4">
      {/* Store Control Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        {/* Status indicator - what customers see */}
        <div className={cn(
          "flex items-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-bold",
          customerSeesOpen
            ? "border-green-500 bg-green-500/10 text-green-600"
            : "border-red-500 bg-red-500/10 text-red-600",
        )}>
          <span className={cn(
            "h-3 w-3 rounded-full animate-pulse",
            customerSeesOpen ? "bg-green-500" : "bg-red-500",
          )} />
          {customerSeesOpen ? "LOJA ABERTA" : "LOJA FECHADA"}
          {!customerSeesOpen && nextOpeningText && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">({nextOpeningText})</span>
          )}
        </div>

        <button
          onClick={requestToggleConfirmation}
          aria-busy={togglingStore}
          className={cn(
            "flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition-all",
            customerSeesOpen
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            togglingStore && "opacity-70",
          )}
        >
          <Power size={18} />
          {togglingStore
            ? customerSeesOpen
              ? "FECHANDO..."
              : "ABRINDO..."
            : customerSeesOpen
              ? "FECHAR LOJA"
              : "ABRIR LOJA"}
        </button>

        <button
          onClick={() => navigate("/admin/novo-pedido")}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={16} />
          Novo Pedido
        </button>


        <button
          onClick={acceptAllPending}
          disabled={orders.filter(o => o.status === "pending" || o.status === "paid").length === 0}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          <CheckCircle size={16} />
          Aceitar Todos ({orders.filter(o => o.status === "pending" || o.status === "paid").length})
        </button>

        <button
          onClick={() => setShowCloseDay(true)}
          disabled={!storeSettings?.is_open}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40"
        >
          <FileText size={16} />
          Finalizar Dia
        </button>

        <button
          onClick={openKitchenWindow}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted"
        >
          <ChefHat size={16} />
          Cozinha
        </button>

        <button
          onClick={() => { fetchOrders(); toast({ title: "✅ Pedidos atualizados!" }); }}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>

        <div className="ml-auto flex items-center gap-4 text-sm">
          <div className="text-muted-foreground">
            <span className="font-bold text-foreground">{orders.length}</span> pedidos
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            Faturamento: <span className="font-bold text-green-600">{valuesVisible ? `R$ ${todayRevenue.toFixed(2).replace(".",",")}` : "R$ •••••"}</span>
            <button onClick={() => setValuesVisible(v => !v)} className="p-1 rounded hover:bg-muted">
              {valuesVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Date Picker + Search + Reprint Report */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[200px] justify-start text-left font-medium", !selectedDate && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        {!isToday && (
          <button
            onClick={() => setSelectedDate(new Date())}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          >
            Voltar para Hoje
          </button>
        )}

        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por nº pedido, nome, telefone, endereço..."
            autoComplete="off"
            name="dashboard-search-nofill"
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <button
          onClick={() => requireReportPassword(reprintDailyReport)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Printer size={16} />
          Reimprimir Relatório
        </button>

        <button
          onClick={() => setShowPeriodReport(!showPeriodReport)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <FileText size={16} />
          Relatório de Período
        </button>

        <button
          onClick={() => setShowDeliveryReport(!showDeliveryReport)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Truck size={16} />
          Relatório de Entregas
        </button>
      </div>

      {showPeriodReport && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">De</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[160px] justify-start text-left font-medium">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {periodFrom ? format(periodFrom, "dd/MM/yyyy") : "Início"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={periodFrom} onSelect={(d) => d && setPeriodFrom(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Até</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[160px] justify-start text-left font-medium">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {periodTo ? format(periodTo, "dd/MM/yyyy") : "Fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={periodTo} onSelect={(d) => d && setPeriodTo(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={() => requireReportPassword(reprintPeriodReport)} disabled={!periodFrom || !periodTo}>
            <Printer size={16} />
            Imprimir Relatório de Período
          </Button>
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

      {/* Toggle Store Confirmation Modal */}
      <AlertDialog open={showToggleConfirm} onOpenChange={setShowToggleConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <Power size={24} className={customerSeesOpen ? "text-destructive" : "text-primary"} />
              <AlertDialogTitle>
                {customerSeesOpen ? "Fechar a loja?" : "Abrir a loja?"}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {customerSeesOpen
                ? "A loja será fechada manualmente agora, independentemente do horário ou do dia cadastrado."
                : "A loja será aberta manualmente agora, independentemente do horário ou do dia cadastrado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={togglingStore}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void (async () => {
                  await toggleStore();
                  setShowToggleConfirm(false);
                })();
              }}
              disabled={togglingStore}
              className={cn(
                customerSeesOpen
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {customerSeesOpen ? "Sim, fechar" : "Sim, abrir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {tabs.map(tab => {
          const count = stats[tab.key as keyof typeof stats] || 0;
          const isActive = activeTab === tab.key;
          const isPendingWithOrders = tab.key === "pending" && count > 0;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                isActive
                  ? `${tab.color} text-white`
                  : "bg-card border border-border text-foreground hover:bg-muted"
              } ${isPendingWithOrders && !isActive ? "animate-pulse border-amber-500 border-2" : ""}`}
            >
              <tab.icon size={16} />
              {tab.label}
              {count > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  isActive ? "bg-white/20 text-white" : isPendingWithOrders ? "bg-amber-500 text-white" : "bg-muted text-foreground"
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
          <p className="text-sm">{searchQuery ? "Nenhum pedido encontrado para essa busca" : "Nenhum pedido nesta categoria"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const next = order.status === "awaiting_payment" ? null : nextStatus[order.status];
            const elapsed = order.status === "preparing" ? getElapsed(order.preparing_at) : null;
            const profile = profiles[order.user_id];
            const customerCode = profile?.customer_code ? `T${String(profile.customer_code).padStart(5, '0')}` : "";
            const isEditing = editingOrder === order.id;

            return (
              <div key={order.id} className={`rounded-xl border bg-card shadow-sm overflow-hidden ${
                (order.status === "pending" || order.status === "paid") ? "border-amber-500 border-2 animate-pulse" : "border-border"
              }`}>
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
                      {order.status === "paid" && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                          💰 PAGO
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}{getPaymentDisplay(order.payment_method, order.payment_confirmed)}
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
                    {/* Edit mode */}
                    {isEditing ? (
                      <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                        <h4 className="text-xs font-bold text-foreground">✏️ Editando Pedido</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Tipo</label>
                            <select value={editData.delivery_type} onChange={e => setEditData(d => ({ ...d, delivery_type: e.target.value }))}
                              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground">
                              <option value="delivery">Delivery</option>
                              <option value="pickup">Retirada</option>
                              <option value="mesa">Mesa</option>
                              <option value="viagem">Viagem</option>
                              <option value="consumo">Consumo</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Pagamento</label>
                            <select value={editData.payment_method} onChange={e => setEditData(d => ({ ...d, payment_method: e.target.value }))}
                              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground">
                              <option value="pix">PIX</option>
                              <option value="dinheiro">Dinheiro</option>
                              <option value="cartao">Cartão</option>
                              <option value="fiado">Fiado</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Desconto (R$)</label>
                            <input type="number" step="0.01" value={editData.discount || 0}
                              onChange={e => setEditData(d => ({ ...d, discount: Number(e.target.value) }))}
                              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Taxa Entrega (R$)</label>
                            <input type="number" step="0.01" value={editData.delivery_fee ?? 0}
                              onChange={e => setEditData(d => ({ ...d, delivery_fee: Number(e.target.value) }))}
                              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Bairro</label>
                            <input type="text" value={editData.address_neighborhood || ""}
                              onChange={e => setEditData(d => ({ ...d, address_neighborhood: e.target.value }))}
                              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Rua</label>
                          <input type="text" value={editData.address_street || ""}
                            onChange={e => setEditData(d => ({ ...d, address_street: e.target.value }))}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Número</label>
                            <input type="text" value={editData.address_number || ""}
                              onChange={e => setEditData(d => ({ ...d, address_number: e.target.value }))}
                              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Complemento</label>
                            <input type="text" value={editData.address_complement || ""}
                              onChange={e => setEditData(d => ({ ...d, address_complement: e.target.value }))}
                              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Observações</label>
                          <textarea value={editData.observations || ""}
                            onChange={e => setEditData(d => ({ ...d, observations: e.target.value }))}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" rows={2} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(order.id)}
                            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                            <Save size={14} /> Salvar
                          </button>
                          <button onClick={() => setEditingOrder(null)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
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
                      </>
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
                      <button onClick={() => printReceipt(order.id, "pedido")}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                        <Printer size={14} /> Pedido
                      </button>
                      <button onClick={() => printReceipt(order.id, "obrigado")}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                        <Printer size={14} /> Obrigado
                      </button>
                      {!isEditing && (
                        <button onClick={() => startEdit(order)}
                          className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                          <Edit2 size={14} /> Editar
                        </button>
                      )}
                    </div>

                    {/* Payment actions */}
                    <div className="flex flex-wrap gap-2">
                      {order.payment_method !== "fiado" && order.status !== "cancelled" && (
                        <button onClick={() => markAsFiado(order.id)}
                          className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">
                          📝 Marcar Fiado
                        </button>
                      )}
                      {order.payment_confirmed && order.status !== "awaiting_payment" && (
                        <span className="flex items-center gap-1 rounded-lg bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700">
                          ✅ {getPaymentDisplay(order.payment_method, order.payment_confirmed)}
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
                      {order.status !== "cancelled" && (
                        <button
                          onClick={() => { setCancellingOrderId(order.id); setCancellationReason(""); }}
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
      {/* Cancel Reason Modal */}
      {cancellingOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-card p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold text-foreground">❌ Recusar Pedido</h3>
            <p className="text-sm text-muted-foreground">Informe o motivo da recusa para o cliente:</p>
            <textarea
              value={cancellationReason}
              onChange={e => setCancellationReason(e.target.value)}
              placeholder="Ex: Ingrediente em falta, fora da área de entrega..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              rows={3}
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setCancellingOrderId(null)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground">
                Voltar
              </button>
              <button
                disabled={!cancellationReason.trim()}
                onClick={async () => {
                  await supabase.from("orders").update({
                    status: "cancelled",
                    cancellation_reason: cancellationReason.trim(),
                  }).eq("id", cancellingOrderId);
                  toast({ title: "Pedido recusado." });
                  setCancellingOrderId(null);
                  fetchOrders();
                }}
                className="flex-1 rounded-lg bg-destructive py-2.5 text-sm font-bold text-destructive-foreground disabled:opacity-40"
              >
                Confirmar Recusa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report password modal */}
      {showReportPwModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-xs rounded-2xl bg-card p-6 space-y-4 mx-4">
            <h3 className="text-lg font-bold text-foreground">🔒 Senha do Administrador</h3>
            <p className="text-sm text-muted-foreground">Digite a senha para imprimir o relatório.</p>
            <input
              type="password"
              value={reportPwInput}
              onChange={e => { setReportPwInput(e.target.value); setReportPwError(false); }}
              onKeyDown={e => e.key === "Enter" && handleReportPwSubmit()}
              placeholder=""
              autoComplete="new-password"
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            {reportPwError && <p className="text-xs text-destructive font-medium">Senha incorreta</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowReportPwModal(false); setPendingReportAction(null); }}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleReportPwSubmit}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
              >
                Desbloquear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
