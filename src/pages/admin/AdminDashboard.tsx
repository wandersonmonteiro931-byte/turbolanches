import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag, DollarSign, Clock, CheckCircle, ChefHat, Package,
  Truck, X, Check, Printer, Store, StoreIcon, Power,
  FileText, AlertTriangle, Plus, Search, CalendarIcon, Edit2, Save, RefreshCw,
  Eye, EyeOff, Wallet, Trash2, PlusCircle, RotateCcw, Calculator
} from "lucide-react";
import { format, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { supabase } from "@/integrations/supabase/client";
import { formatBusinessDate, getBusinessDayRange, getTodayBusinessDay } from "@/lib/businessDay";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { openPrintUrl } from "@/lib/printPopup";
import { useStore } from "@/contexts/StoreContext";
import { useAdminSectionPassword } from "@/hooks/useAdminSectionPassword";
import { lazy, Suspense } from "react";
const CourierTrackingModal = lazy(() => import("@/components/admin/CourierTrackingModal"));
import ExpenseManager from "@/components/admin/ExpenseManager";
import CashRegister from "@/components/admin/CashRegister";
import CalculatorModal from "@/components/admin/CalculatorModal";
import { buildAdminPrintDocument, escapeHtml } from "@/lib/adminPrintTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";

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
  trashed_at: string | null;
  table_code?: string | null;
  table_stage?: string | null;
  charged_at?: string | null;
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
  entregador_receipt_enabled?: boolean;
}

const tabs = [
  { key: "pending", label: "Pendentes", icon: Clock, color: "bg-amber-500", statuses: ["pending", "paid"] },
  { key: "preparing", label: "Em Preparo", icon: ChefHat, color: "bg-purple-500", statuses: ["preparing"] },
  { key: "ready", label: "Aguardando", icon: Package, color: "bg-emerald-500", statuses: ["ready"] },
  { key: "delivering", label: "Entregando", icon: Truck, color: "bg-cyan-500", statuses: ["delivering"] },
  { key: "delivered", label: "Finalizados", icon: Check, color: "bg-green-600", statuses: ["delivered"] },
  { key: "cancelled", label: "Recusados", icon: X, color: "bg-red-500", statuses: ["cancelled"] },
  { key: "trashed", label: "Lixeira", icon: Trash2, color: "bg-gray-600", statuses: ["cancelled"] },
];

const nextStatus: Record<string, string> = {
  pending: "preparing",
  paid: "preparing",
  preparing: "ready",
  ready: "delivering",
  delivering: "delivered",
};

const getTableCode = (order: Pick<Order, "delivery_type" | "table_code" | "observations">) => {
  if (order.delivery_type !== "mesa") return null;
  const fromColumn = order.table_code?.trim();
  if (fromColumn) return fromColumn;
  const fromObs = order.observations?.match(/#?MESA\d+/i)?.[0];
  return fromObs ? (fromObs.startsWith("#") ? fromObs.toUpperCase() : `#${fromObs.toUpperCase()}`) : "MESA";
};

const cleanOrderObservation = (value: string | null) =>
  (value || "")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part && part !== "[PDV]" && !/^Mesa:\s*#?MESA\d+/i.test(part) && !/^#?MESA\d+$/i.test(part))
    .join(" | ");

const getNextStatusForOrder = (order: Pick<Order, "status" | "delivery_type">) => {
  if (order.status === "ready" && (order.delivery_type === "mesa" || order.delivery_type === "retirada")) return "delivered";
  return nextStatus[order.status];
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
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [addItemName, setAddItemName] = useState("");
  const [addItemQty, setAddItemQty] = useState(1);
  const [addItemPrice, setAddItemPrice] = useState(0);
  const [productSuggestions, setProductSuggestions] = useState<{ name: string; price: number }[]>([]);
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
  const [deliveryReportMode, setDeliveryReportMode] = useState<"daily" | "period">("daily");
  const [deliveryPeriodFrom, setDeliveryPeriodFrom] = useState<Date | undefined>(undefined);
  const [deliveryPeriodTo, setDeliveryPeriodTo] = useState<Date | undefined>(undefined);
  const [trackingCourierId, setTrackingCourierId] = useState<string | null>(null);
  const [showExpenseManager, setShowExpenseManager] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);

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
    const ACTIVE_STATUSES = ["pending", "paid", "preparing", "ready", "delivering"];

    // Query 1: orders within the selected business day (include trashed for Lixeira tab)
    let dayQuery = supabase
      .from("orders")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });
    if (storeId) dayQuery = dayQuery.eq("store_id", storeId);

    // Query 2: ALL active (in-flight) orders regardless of date — only when viewing today
    // This ensures preparing/ready/delivering orders from previous days still appear in the dashboard
    const activeQuery = isToday
      ? (() => {
          let q = supabase
            .from("orders")
            .select("*")
            .in("status", ACTIVE_STATUSES)
            .is("trashed_at", null)
            .order("created_at", { ascending: false });
          if (storeId) q = q.eq("store_id", storeId);
          return q;
        })()
      : null;

    let fiadoQuery = supabase
      .from("orders")
      .select("*")
      .eq("payment_method", "fiado")
      .neq("status", "cancelled")
      .is("trashed_at", null)
      .order("created_at", { ascending: false });
    if (storeId) fiadoQuery = fiadoQuery.eq("store_id", storeId);

    const [dayRes, activeRes, fiadoRes] = await Promise.all([
      dayQuery,
      activeQuery ?? Promise.resolve({ data: [] as any[] }),
      fiadoQuery,
    ]);

    const merged = new Map<string, Order>();
    (dayRes.data ?? []).forEach((o: any) => merged.set(o.id, o as Order));
    (activeRes.data ?? []).forEach((o: any) => { if (!merged.has(o.id)) merged.set(o.id, o as Order); });
    (fiadoRes.data ?? []).forEach((o: any) => { if (!merged.has(o.id)) merged.set(o.id, o as Order); });
    const data = Array.from(merged.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    console.log("[Dashboard] fetchOrders", {
      storeId,
      isToday,
      range: { start, end },
      dayCount: dayRes.data?.length ?? 0,
      activeCount: activeRes.data?.length ?? 0,
      fiadoCount: fiadoRes.data?.length ?? 0,
      mergedCount: data.length,
      preparingCount: data.filter(o => o.status === "preparing").length,
      preparing: data.filter(o => o.status === "preparing").map(o => ({
        n: o.order_number, status: o.status, pm: o.payment_method, pc: o.payment_confirmed, sid: (o as any).store_id,
      })),
    });

    setOrders(data);
    const userIds = [...new Set(data.map(o => o.user_id))];
    if (userIds.length > 0) {
      supabase
        .from("profiles")
        .select("user_id, customer_code, full_name, phone")
        .in("user_id", userIds)
        .then(({ data: profilesData }) => {
          if (profilesData) {
            const map: Record<string, { customer_code: number; full_name: string; phone: string }> = {};
            profilesData.forEach(p => { map[p.user_id] = p; });
            setProfiles(map);
          }
        });
    }
  }, [selectedDate, storeId, isToday]);

  const applyStoreSettings = useCallback((data: StoreSettings) => {
    setStoreSettings(data);
  }, []);

  const fetchStoreSettings = useCallback(async () => {
    let query = supabase
      .from("store_settings")
      .select("id, is_open, opened_at, closed_at, scheduled_open, scheduled_close, use_schedule, obrigado_receipt_enabled, entregador_receipt_enabled")
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
        if (!isToday) return;
        const { start, end } = getBusinessDayRange(selectedDate);
        const inRange = (createdAt?: string) => {
          if (!createdAt) return false;
          return createdAt >= start && createdAt <= end;
        };

        if (payload.eventType === "INSERT") {
          const newOrder = payload.new as Order;
          if (!inRange(newOrder.created_at) || (storeId && (newOrder as any).store_id !== storeId)) return;
          // Only alert for orders that are visible (PIX must be paid first)
          const isUnpaidPix = newOrder.payment_method === "pix" && !newOrder.payment_confirmed && newOrder.status !== "paid";
          if (!isUnpaidPix) {
            toast({ title: "🔔 Novo pedido!", description: "Um novo pedido acaba de chegar." });
          }
          setOrders((prev) => {
            if (prev.some((o) => o.id === newOrder.id)) return prev;
            return [newOrder, ...prev];
          });
          // Fetch profile for the new user if missing (no full reload)
          if (newOrder.user_id) {
            setProfiles((prevProfiles) => {
              if (prevProfiles[newOrder.user_id]) return prevProfiles;
              supabase
                .from("profiles")
                .select("user_id, customer_code, full_name, phone")
                .eq("user_id", newOrder.user_id)
                .maybeSingle()
                .then(({ data }) => {
                  if (data) setProfiles((p) => ({ ...p, [data.user_id]: data }));
                });
              return prevProfiles;
            });
          }
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as Order;
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
        } else if (payload.eventType === "DELETE") {
          const oldId = (payload.old as any)?.id;
          if (oldId) setOrders((prev) => prev.filter((o) => o.id !== oldId));
        }
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
  }, [fetchOrders, fetchStoreSettings, fetchCouriers, isToday, selectedDate, storeId, toast]);

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


  const [showRouteClosureModal, setShowRouteClosureModal] = useState<string | null>(null);
  const [cashRegisterOpen, setCashRegisterOpen] = useState(false);

  const updateStatus = async (orderId: string, newStatus: string, courierId?: string) => {
    // Block accepting and finalization if cash register is closed
    if ((newStatus === "preparing" || newStatus === "delivered") && !cashRegisterOpen) {
      toast({
        title: "🔒 Caixa fechado",
        description: newStatus === "preparing"
          ? "Abra o caixa antes de aceitar pedidos."
          : "Abra o caixa antes de finalizar pedidos.",
        variant: "destructive",
      });
      return;
    }

    // If moving to delivering and couriers exist, show courier selector first
    if (newStatus === "delivering" && couriers.length > 0 && !courierId) {
      setCourierSelectOrderId(orderId);
      setSelectedCourierId(null);
      return;
    }

    // If moving to delivered, require route closure confirmation
    if (newStatus === "delivered") {
      setShowRouteClosureModal(orderId);
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

  const confirmRouteClosure = async (orderId: string) => {
    if (!cashRegisterOpen) {
      toast({
        title: "🔒 Caixa fechado",
        description: "Abra o caixa antes de finalizar pedidos.",
        variant: "destructive",
      });
      setShowRouteClosureModal(null);
      return;
    }
    const updateData: any = {
      status: "delivered",
      delivered_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("orders").update(updateData).eq("id", orderId);
    if (error) {
      toast({ title: "Erro ao finalizar pedido", variant: "destructive" });
      return;
    }
    toast({ title: "✅ Entrega finalizada com Fechamento de Rota!" });
    setShowRouteClosureModal(null);
    await fetchOrders();
  };

  const confirmCourierAndDeliver = async () => {
    if (!courierSelectOrderId || !selectedCourierId) return;
    const oid = courierSelectOrderId;
    const isReassign = orders.find(o => o.id === oid)?.status === "delivering";
    setCourierSelectOrderId(null);
    if (isReassign) {
      // Just change courier, don't change status
      await supabase.from("orders").update({ courier_id: selectedCourierId }).eq("id", oid);
      toast({ title: "🔄 Entregador alterado!" });
      await fetchOrders();
    } else {
      await updateStatus(oid, "delivering", selectedCourierId);
      // Auto-print Fechamento de Rota receipt if enabled
      if (storeSettings?.entregador_receipt_enabled !== false) {
        printReceipt(oid, "entregador");
      }
    }
  };

  const changeCourier = (orderId: string, currentCourierId: string | null) => {
    setCourierSelectOrderId(orderId);
    setSelectedCourierId(currentCourierId);
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
    const w = openPrintUrl(`/admin/imprimir/${orderId}?tipo=${tipo}${delayParam}`, `print_${tipo}`, "width=300,height=600");
    if (!w) return;
    // AdminPrint.tsx already calls window.print() + window.close() on load
  };
  const acceptAllPending = async () => {
    if (!cashRegisterOpen) {
      toast({
        title: "🔒 Caixa fechado",
        description: "Abra o caixa antes de aceitar pedidos.",
        variant: "destructive",
      });
      return;
    }
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

  // Edit order - navigate to manual order page with edit mode
  const startEdit = (order: Order) => {
    navigate(`/admin/novo-pedido?edit=${order.id}`);
  };

  const searchProducts = async (term: string) => {
    if (term.length < 2) { setProductSuggestions([]); return; }
    let q = supabase.from("products").select("name, price").ilike("name", `%${term}%`).eq("active", true).limit(8);
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    setProductSuggestions(data || []);
  };

  const updateEditItem = (itemId: string, field: "quantity" | "unit_price" | "product_name" | "observations", value: any) => {
    setEditItems(prev => prev.map(item => item.id === itemId ? { ...item, [field]: value } : item));
  };

  const removeEditItem = (itemId: string) => {
    setEditItems(prev => prev.filter(item => item.id !== itemId));
  };

  const addNewItem = () => {
    if (!addItemName.trim()) return;
    const newItem: OrderItem = {
      id: `new-${Date.now()}`,
      product_name: addItemName.trim(),
      quantity: addItemQty,
      unit_price: addItemPrice,
      observations: null,
      addons_json: [],
    };
    setEditItems(prev => [...prev, newItem]);
    setAddItemName("");
    setAddItemQty(1);
    setAddItemPrice(0);
    setProductSuggestions([]);
  };

  const calcEditSubtotal = () => editItems.reduce((sum, item) => sum + (Number(item.unit_price) * item.quantity), 0);

  const saveEdit = async (orderId: string, reprint = false) => {
    const newSubtotal = calcEditSubtotal();
    const newDeliveryFee = Number(editData.delivery_fee ?? 0);
    const newDiscount = Number(editData.discount || 0);
    const newTotal = newSubtotal + newDeliveryFee - newDiscount;

    // Update order
    const { error } = await supabase.from("orders").update({
      ...editData,
      subtotal: newSubtotal,
      delivery_fee: newDeliveryFee,
      discount: newDiscount,
      total: newTotal,
    }).eq("id", orderId);

    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
      return;
    }

    // Delete existing items and re-insert
    await supabase.from("order_items").delete().eq("order_id", orderId);
    
    const itemsToInsert = editItems.map(item => ({
      order_id: orderId,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      observations: item.observations || "",
      addons_json: item.addons_json || [],
    }));
    
    if (itemsToInsert.length > 0) {
      await supabase.from("order_items").insert(itemsToInsert);
    }

    setEditingOrder(null);
    // Refresh items cache
    setItems(prev => { const copy = { ...prev }; delete copy[orderId]; return copy; });
    toast({ title: "✅ Pedido atualizado!" });
    await fetchOrders();
    await fetchItems(orderId);

    if (reprint) {
      printReceipt(orderId, "pedido");
    }
  };

  // Calculate courier costs for a given date from delivered orders
  const fetchCourierCostsForDate = async (dateStr: string, ordersForDay?: Order[]) => {
    const { start, end } = getBusinessDayRange(new Date(dateStr + "T12:00:00"));
    let deliveredOrders: any[] = ordersForDay
      ? ordersForDay.filter(o => o.status === "delivered" && o.courier_id)
      : [];

    if (!ordersForDay) {
      const PAGE_SIZE = 1000;
      let page = 0;
      while (true) {
        let q = supabase.from("orders").select("courier_id, delivery_fee, status")
          .gte("created_at", start).lte("created_at", end)
          .eq("status", "delivered").not("courier_id", "is", null)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (storeId) q = q.eq("store_id", storeId);
        const { data } = await q;
        if (!data || data.length === 0) break;
        deliveredOrders = deliveredOrders.concat(data);
        if (data.length < PAGE_SIZE) break;
        page++;
      }
    }

    // Group delivery fees by courier
    const courierFees = new Map<string, number>();
    const courierIds = new Set<string>();
    deliveredOrders.forEach((o: any) => {
      if (!o.courier_id) return;
      courierIds.add(o.courier_id);
      courierFees.set(o.courier_id, (courierFees.get(o.courier_id) || 0) + Number(o.delivery_fee || 0));
    });

    if (courierIds.size === 0) return [];

    // Get courier names
    const { data: courierData } = await supabase.from("couriers" as any).select("id, name").in("id", Array.from(courierIds));
    const courierNames = new Map<string, string>();
    (courierData as any[] ?? []).forEach((c: any) => courierNames.set(c.id, c.name));

    // Get daily fixed fees for the day of week
    const dayOfWeek = new Date(dateStr + "T12:00:00").getDay();
    let dfq = supabase.from("courier_daily_fees" as any).select("courier_id, fixed_fee").eq("day_of_week", dayOfWeek).in("courier_id", Array.from(courierIds));
    if (storeId) dfq = dfq.eq("store_id", storeId);
    const { data: dailyFeeData } = await dfq;
    const dailyFixedFees = new Map<string, number>();
    (dailyFeeData as any[] ?? []).forEach((d: any) => dailyFixedFees.set(d.courier_id, Number(d.fixed_fee)));

    // Also check couriers table default fixed_fee
    const { data: defaultFees } = await supabase.from("couriers" as any).select("id, fixed_fee").in("id", Array.from(courierIds));
    const defaultFixedFees = new Map<string, number>();
    (defaultFees as any[] ?? []).forEach((c: any) => defaultFixedFees.set(c.id, Number(c.fixed_fee)));

    const expenses: { amount: number; category: string; description: string }[] = [];
    courierIds.forEach(cid => {
      const name = courierNames.get(cid) || "Entregador";
      const fixedFee = dailyFixedFees.has(cid) ? dailyFixedFees.get(cid)! : (defaultFixedFees.get(cid) || 0);
      const deliveryTotal = courierFees.get(cid) || 0;
      const total = fixedFee + deliveryTotal;
      if (total > 0) {
        expenses.push({ amount: total, category: "diario", description: `${name} (Fixa R$${fixedFee.toFixed(2).replace(".",",")} + Taxas R$${deliveryTotal.toFixed(2).replace(".",",")})` });
      }
    });

    return expenses;
  };

  // Reprint daily report for any date
  const fetchExpensesForDate = async (dateStr: string) => {
    let q = supabase.from("report_expenses" as any).select("amount, category, description").eq("expense_date", dateStr);
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    return (data as any[] ?? []).map((e: any) => ({ amount: Number(e.amount), category: e.category, description: e.description }));
  };

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
        .is("trashed_at", null)
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

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const [manualExpenses, courierExpenses] = await Promise.all([
      fetchExpensesForDate(dateStr),
      fetchCourierCostsForDate(dateStr, currentDayOrders),
    ]);
    const expenses = [...courierExpenses, ...manualExpenses];

    const validOrders = currentDayOrders.filter((o) => o.status !== "cancelled");
    const bruto = validOrders.reduce((s, o) => s + Number(o.total), 0);
    const delivery = validOrders.reduce((s, o) => s + Number(o.delivery_fee), 0);
    const gastos = expenses.reduce((s, e) => s + e.amount, 0);
    const liquido = bruto - gastos;

    printDailyReport(currentDayOrders, bruto, delivery, gastos, liquido, expenses);
  };


  const fetchExpensesForRange = async (fromDate: string, toDate: string) => {
    let q = supabase.from("report_expenses" as any).select("amount, category, description, expense_date").gte("expense_date", fromDate).lte("expense_date", toDate);
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    return (data as any[] ?? []).map((e: any) => ({ amount: Number(e.amount), category: e.category, description: e.description, expense_date: e.expense_date }));
  };

  const printReportTemplate = async (templateType: string, variables: Record<string, string>, blocks: Record<string, string> = {}) => {
    const { data } = await supabase.from("receipt_templates" as any).select("*").eq("template_type", templateType).maybeSingle();
    const template = data as any;
    const label = template?.label || (templateType === "relatorio_entregas" ? "RELATÓRIO DE ENTREGAS" : "RELATÓRIO DE PERÍODO");
    const html = buildAdminPrintDocument({
      title: label,
      template: template?.body_template || getDefaultTemplate(templateType),
      variables: {
        "[NOMELOJA]": template?.store_name || "TURBO LANCHES",
        "[TIPOCOMANDA]": label,
        "[RODAPÉ]": template?.footer_message || "",
        ...variables,
      },
      blocks,
      pageWidthMm: 72,
      pageHeightMm: "auto",
      pageMarginMm: 0,
      bodyFontFamily: "Arial, Helvetica, sans-serif",
      bodyFontSizePx: template?.body_font_size ?? 10,
      labelFontSizePx: template?.label_font_size ?? 18,
      sectionPaddingMm: 0,
      extraCss: ".report-row{display:flex;justify-content:space-between;gap:4px;font-weight:900;font-size:9px;padding:1px 0}.report-row span{white-space:normal;overflow-wrap:anywhere}.report-row span:last-child{white-space:nowrap}",
    });
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const reprintPeriodReport = async () => {
    if (!periodFrom || !periodTo) {
      toast({ title: "Selecione as datas de início e fim", variant: "destructive" });
      return;
    }
    toast({ title: "Buscando pedidos do período..." });

    const { start: fromISO } = getBusinessDayRange(periodFrom);
    const { end: toISO } = getBusinessDayRange(periodTo);

    // Fetch ALL orders (paginate to avoid 1000 row limit) - include courier_id for courier cost calc
    let allOrders: any[] = [];
    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      let q = supabase
        .from("orders")
        .select("total, delivery_fee, status, created_at, courier_id")
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .neq("status", "cancelled")
        .is("trashed_at", null)
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

    // Fetch manual expenses for the period
    const allManualExpenses = await fetchExpensesForRange(format(periodFrom, "yyyy-MM-dd"), format(periodTo, "yyyy-MM-dd"));
    const manualExpensesByDate = new Map<string, number>();
    allManualExpenses.forEach(e => {
      manualExpensesByDate.set(e.expense_date, (manualExpensesByDate.get(e.expense_date) || 0) + e.amount);
    });

    // Calculate courier costs per date
    const allDates: string[] = eachDayOfInterval({ start: periodFrom, end: periodTo }).map(d => format(d, "yyyy-MM-dd"));
    
    const courierCostsByDate = new Map<string, number>();
    const courierResults = await Promise.all(
      allDates.map(async (dateStr) => {
        const courierExpenses = await fetchCourierCostsForDate(dateStr);
        const total = courierExpenses.reduce((s, e) => s + e.amount, 0);
        return { dateStr, total };
      })
    );
    courierResults.forEach(({ dateStr, total }) => {
      if (total > 0) courierCostsByDate.set(dateStr, total);
    });

    // Build full rows
    const fullRows = allDates.map(dateStr => {
      const orderData = ordersByDate.get(dateStr);
      const manualExp = manualExpensesByDate.get(dateStr) || 0;
      const courierExp = courierCostsByDate.get(dateStr) || 0;
      const dayExpenses = manualExp + courierExp;

      if (orderData && orderData.count > 0) {
        return {
          report_date: dateStr,
          total_orders: orderData.count,
          total_bruto: orderData.bruto,
          total_delivery_fees: orderData.delivery,
          total_gastos: dayExpenses,
          total_liquido: orderData.bruto - dayExpenses,
        };
      }
      return {
        report_date: dateStr,
        total_orders: 0,
        total_bruto: 0,
        total_delivery_fees: 0,
        total_gastos: dayExpenses,
        total_liquido: -dayExpenses,
      };
    });
    const totalBruto = fullRows.reduce((s, r) => s + r.total_bruto, 0);
    const totalCourierPaid = Array.from(courierCostsByDate.values()).reduce((s, v) => s + v, 0);
    const totalGastos = fullRows.reduce((s, r) => s + r.total_gastos, 0);
    const totalLiquido = fullRows.reduce((s, r) => s + r.total_liquido, 0);
    const totalOrders = fullRows.reduce((s, r) => s + r.total_orders, 0);

    const periodLabel = `${format(periodFrom, "dd/MM/yyyy")} a ${format(periodTo, "dd/MM/yyyy")}`;

    const reportRows = fullRows.map(r => `
      <div class="report-row"><span>${format(new Date(r.report_date + "T12:00:00"), "dd/MM")}</span><span>${r.total_orders} ped.</span><span>R$ ${r.total_bruto.toFixed(2).replace(".",",")}</span><span>R$ ${r.total_liquido.toFixed(2).replace(".",",")}</span></div>
    `).join("");
    await printReportTemplate("relatorio_periodo", {
      "[PERIODO]": periodLabel,
      "[LINHAS]": reportRows,
      "[TOTALPEDIDOS]": String(totalOrders),
      "[TOTALBRUTO]": `R$ ${totalBruto.toFixed(2).replace(".",",")}`,
      "[TOTALENTREGADORES]": `R$ ${totalCourierPaid.toFixed(2).replace(".",",")}`,
      "[TOTALGASTOS]": `R$ ${totalGastos.toFixed(2).replace(".",",")}`,
      "[TOTALLIQUIDO]": `R$ ${totalLiquido.toFixed(2).replace(".",",")}`,
    }, { "[LINHAS]": reportRows });
  };

  const handleCloseDay = async () => {
    const businessDay = getTodayBusinessDay();
    const dateStr = format(businessDay, "yyyy-MM-dd");
    const [manualExpenses, courierExpenses] = await Promise.all([
      fetchExpensesForDate(dateStr),
      fetchCourierCostsForDate(dateStr, orders),
    ]);
    const expenses = [...courierExpenses, ...manualExpenses];

    const allOrders = orders.filter(o => o.status !== "cancelled");
    const totalBruto = allOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalDelivery = allOrders.reduce((s, o) => s + Number(o.delivery_fee), 0);
    const totalGastos = expenses.reduce((s, e) => s + e.amount, 0);
    const totalLiquido = totalBruto - totalGastos;

    await supabase.from("daily_reports").upsert({
      report_date: dateStr,
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

    printDailyReport(orders, totalBruto, totalDelivery, totalGastos, totalLiquido, expenses);
    setShowCloseDay(false);
    toast({ title: "📊 Dia finalizado! Relatório impresso." });
  };

  const printDailyReport = (allOrders: Order[], bruto: number, delivery: number, gastos: number, liquido: number, expensesList: { amount: number; category: string; description: string }[] = []) => {
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

    const expenseRows = expensesList.length > 0
      ? expensesList.map(e => `<div class="row"><span>${e.description}</span><span>R$ ${e.amount.toFixed(2).replace(".",",")}</span></div>`).join("")
      : `<div class="row"><span>Nenhum gasto cadastrado</span><span>R$ 0,00</span></div>`;

    w.document.write(`
      <html><head><style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Inter',sans-serif; width:72mm; padding:2mm; font-size:10px; }
        .center { text-align:center; }
        .sep { border-top:1px dashed #000; margin:3px 0; }
        .row { display:flex; justify-content:space-between; padding:2px 0; font-weight:700; }
        .row span:last-child { white-space:nowrap; flex-shrink:0; }
        .big { font-size:14px; font-weight:900; }
        h1 { font-size:14px; font-weight:900; text-align:center; margin:4px 0; }
        h2 { font-size:11px; font-weight:900; text-align:center; margin:2px 0; }
        .sub { font-size:9px; font-weight:700; margin:4px 0 2px; color:#333; }
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
        <div class="row"><span>Pago Entregadores:</span><span>R$ ${expensesList.filter(e => e.category === "diario").reduce((s, e) => s + e.amount, 0).toFixed(2).replace(".",",")}</span></div>
        <div class="sep"></div>
        <div class="sub">GASTOS DO DIA:</div>
        ${expenseRows}
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

    const isPeriod = deliveryReportMode === "period";
    if (isPeriod && (!deliveryPeriodFrom || !deliveryPeriodTo)) {
      toast({ title: "Selecione o período", variant: "destructive" });
      return;
    }

    // Build date ranges
    const dateRanges: { start: string; end: string; date: Date }[] = [];
    if (isPeriod && deliveryPeriodFrom && deliveryPeriodTo) {
      const days = eachDayOfInterval({ start: deliveryPeriodFrom, end: deliveryPeriodTo });
      days.forEach(d => {
        const r = getBusinessDayRange(d);
        dateRanges.push({ start: r.start, end: r.end, date: d });
      });
    } else {
      const r = getBusinessDayRange(selectedDate);
      dateRanges.push({ start: r.start, end: r.end, date: selectedDate });
    }

    const PAGE_SIZE = 1000;
    let allDeliveryOrders: any[] = [];

    for (const range of dateRanges) {
      let page = 0;
      while (true) {
        let q = supabase
          .from("orders")
          .select("order_number, address_street, address_neighborhood, delivery_fee, courier_id, delivering_at, delivered_at, created_at, status")
          .gte("created_at", range.start)
          .lte("created_at", range.end)
          .eq("delivery_type", "delivery")
          .eq("courier_id", deliveryReportCourierId)
          .eq("status", "delivered")
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (storeId) q = q.eq("store_id", storeId);
        const { data } = await q;
        if (!data || data.length === 0) break;
        allDeliveryOrders = allDeliveryOrders.concat(data);
        if (data.length < PAGE_SIZE) break;
        page++;
      }
    }

    const courier = couriers.find(c => c.id === deliveryReportCourierId);
    const courierName = courier?.name || "Desconhecido";

    // Calculate fixed fees
    let totalFixedFees = 0;
    if (isPeriod && deliveryPeriodFrom && deliveryPeriodTo) {
      const days = eachDayOfInterval({ start: deliveryPeriodFrom, end: deliveryPeriodTo });
      const { data: allDailyFees } = await supabase
        .from("courier_daily_fees")
        .select("day_of_week, fixed_fee")
        .eq("courier_id", deliveryReportCourierId);
      const feeMap = new Map<number, number>();
      (allDailyFees || []).forEach((f: any) => feeMap.set(f.day_of_week, Number(f.fixed_fee)));
      days.forEach(d => {
        totalFixedFees += feeMap.get(d.getDay()) ?? (courier?.fixed_fee || 0);
      });
    } else {
      const reportDow = selectedDate.getDay();
      const { data: dailyFeeData } = await supabase
        .from("courier_daily_fees")
        .select("fixed_fee")
        .eq("courier_id", deliveryReportCourierId)
        .eq("day_of_week", reportDow)
        .maybeSingle();
      totalFixedFees = dailyFeeData ? Number(dailyFeeData.fixed_fee) : (courier?.fixed_fee || 0);
    }

    const totalTaxas = allDeliveryOrders.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
    const totalEntregador = totalFixedFees + totalTaxas;

    const dateLabel = isPeriod && deliveryPeriodFrom && deliveryPeriodTo
      ? `${format(deliveryPeriodFrom, "dd/MM/yyyy")} a ${format(deliveryPeriodTo, "dd/MM/yyyy")}`
      : format(selectedDate, "dd/MM/yyyy");

    allDeliveryOrders.sort((a, b) => {
      const tA = a.delivering_at || a.created_at;
      const tB = b.delivering_at || b.created_at;
      return new Date(tA).getTime() - new Date(tB).getTime();
    });

    const rows = allDeliveryOrders.map((o, idx) => `
      <div class="report-row"><span>${idx + 1} - #${String(o.order_number).padStart(5,"0")} ${escapeHtml(o.address_street || "S/R")}, ${escapeHtml(o.address_neighborhood || "")}</span><span>R$ ${Number(o.delivery_fee || 0).toFixed(2).replace(".",",")}</span></div>
    `).join("");

    const fixedFeeLabel = isPeriod ? "Taxa Fixa (período)" : "Taxa Fixa do Dia";

    await printReportTemplate("relatorio_entregas", {
      "[PERIODO]": dateLabel,
      "[NOMEENTREGADOR]": `🚚 ${courierName}`,
      "[LINHAS]": rows,
      "[TOTALENTREGAS]": String(allDeliveryOrders.length),
      "[TOTALTAXAS]": `R$ ${totalTaxas.toFixed(2).replace(".",",")}`,
      "[TAXAFIXA]": `R$ ${totalFixedFees.toFixed(2).replace(".",",")}`,
      "[TOTALENTREGADOR]": `R$ ${totalEntregador.toFixed(2).replace(".",",")}`,
    }, { "[LINHAS]": rows });
  };

  const activeTabConfig = tabs.find(t => t.key === activeTab);
  // Hide PIX orders that have NOT been paid yet — only while still pending awaiting payment.
  // Once an order moves past pending (preparing/ready/delivering/delivered), it must always be visible
  // regardless of payment_confirmed flag, otherwise PDV/manual orders created with payment_method='pix'
  // would disappear from the dashboard while still showing in Kitchen and /pedidos (inconsistency).
  // Trashed orders are only visible inside the Lixeira tab.
  const visibleOrders = useMemo(() => orders.filter(o => {
    if (
      o.payment_method === "pix" &&
      !o.payment_confirmed &&
      (o.status === "pending" || o.status === "awaiting_payment")
    ) return false;
    return true;
  }), [orders]);

  const filteredOrders = visibleOrders
    .filter(o => {
      if (activeTab === "trashed") return o.status === "cancelled" && !!o.trashed_at;
      if (!activeTabConfig?.statuses.includes(o.status)) return false;
      return !o.trashed_at;
    })
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
    pending: visibleOrders.filter(o => !o.trashed_at && (o.status === "pending" || o.status === "paid" || o.status === "awaiting_payment")).length,
    preparing: visibleOrders.filter(o => !o.trashed_at && o.status === "preparing").length,
    ready: visibleOrders.filter(o => !o.trashed_at && o.status === "ready").length,
    delivering: visibleOrders.filter(o => !o.trashed_at && o.status === "delivering").length,
    delivered: visibleOrders.filter(o => !o.trashed_at && o.status === "delivered").length,
    cancelled: visibleOrders.filter(o => !o.trashed_at && o.status === "cancelled").length,
    trashed: visibleOrders.filter(o => !!o.trashed_at && o.status === "cancelled").length,
  }), [visibleOrders]);

  const todayRevenue = useMemo(() => visibleOrders.filter(o => !o.trashed_at && o.status === "delivered").reduce((s, o) => s + Number(o.total), 0), [visibleOrders]);
  const fiadoOrders = useMemo(() => visibleOrders.filter(o => !o.trashed_at && o.payment_method === "fiado" && o.status !== "cancelled"), [visibleOrders]);
  const fiadoTotal = useMemo(() => fiadoOrders.reduce((s, o) => s + Number(o.total), 0), [fiadoOrders]);

  return (
    <div className="space-y-4">
      {/* Cash Register */}
      <CashRegister onChange={setCashRegisterOpen} storeIsOpen={customerSeesOpen} />

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
            <span className="font-bold text-foreground">{visibleOrders.filter(o => !o.trashed_at).length}</span> pedidos
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

        <button
          onClick={() => setShowExpenseManager(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Wallet size={16} />
          Gastos
        </button>

        <button
          onClick={() => setShowCalculator(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Calculator size={16} />
          Calculadora
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

      {showDeliveryReport && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Entregador</label>
            <select
              value={deliveryReportCourierId}
              onChange={e => setDeliveryReportCourierId(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground min-w-[180px]"
            >
              <option value="">Selecione...</option>
              {couriers.map(c => (
                <option key={c.id} value={c.id}>{c.name} (R$ {c.fixed_fee.toFixed(2).replace(".",",")})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Modo</label>
            <select
              value={deliveryReportMode}
              onChange={e => setDeliveryReportMode(e.target.value as "daily" | "period")}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground min-w-[140px]"
            >
              <option value="daily">Dia Selecionado</option>
              <option value="period">Por Período</option>
            </select>
          </div>
          {deliveryReportMode === "period" && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">De</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[150px] justify-start text-left font-medium">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {deliveryPeriodFrom ? format(deliveryPeriodFrom, "dd/MM/yyyy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={deliveryPeriodFrom} onSelect={(d) => d && setDeliveryPeriodFrom(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Até</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[150px] justify-start text-left font-medium">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {deliveryPeriodTo ? format(deliveryPeriodTo, "dd/MM/yyyy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={deliveryPeriodTo} onSelect={(d) => d && setDeliveryPeriodTo(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
          <Button onClick={() => requireReportPassword(printDeliveryReport)} disabled={!deliveryReportCourierId || (deliveryReportMode === "period" && (!deliveryPeriodFrom || !deliveryPeriodTo))}>
            <Printer size={16} />
            Imprimir Relatório de Entregas
          </Button>
        </div>
      )}

      {fiadoOrders.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black uppercase text-foreground">Todos Fiados</h2>
            <span className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-black text-white">Pendente: R$ {fiadoTotal.toFixed(2).replace(".", ",")}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {fiadoOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-border bg-background p-3 text-sm">
                <div className="flex items-center justify-between gap-2 font-bold text-foreground">
                  <span>{order.delivery_type === "mesa" ? (order.table_code || "Mesa") : `#${String(order.order_number).padStart(5, "0")}`}</span>
                  <span>R$ {Number(order.total).toFixed(2).replace(".", ",")}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{order.delivery_type === "mesa" ? "Mesa fiada" : "Pedido fiado"} · Total a receber pendente</p>
              </div>
            ))}
          </div>
        </div>
      )}


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
              } ${isPendingWithOrders ? "animate-pulse ring-2 ring-amber-400 ring-offset-2" : ""}`}
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => {
            const next = order.status === "awaiting_payment" ? null : nextStatus[order.status];
            const elapsed = order.status === "preparing" ? getElapsed(order.preparing_at) : null;
            const profile = profiles[order.user_id];
            const customerCode = profile?.customer_code ? `T${String(profile.customer_code).padStart(5, '0')}` : "";
            const isEditing = editingOrder === order.id;
            // Auto-load items so every card shows full info without a click
            if (!items[order.id]) void fetchItems(order.id);

            return (
              <div key={order.id} className={`flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden ${
                (order.status === "pending" || order.status === "paid") ? "border-amber-500 border-2 animate-pulse" :
                (order.status === "ready" && order.courier_id) ? "border-red-500 border-2 animate-pulse" :
                "border-border"
              }`}>
                <div className="flex items-start gap-3 p-4 border-b border-border">
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
                      {order.status === "ready" && order.courier_id && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 animate-pulse">
                          ⚠️ DEVOLVIDO
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
                </div>

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
                              <option value="credito">Crédito</option>
                              <option value="debito">Débito</option>
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

                        {/* Items editing */}
                        <div className="space-y-2">
                          <h5 className="text-[10px] font-bold text-muted-foreground uppercase">Itens do Pedido</h5>
                          {editItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-2 rounded border border-border bg-background p-2">
                              <input
                                type="number" min={1} value={item.quantity}
                                onChange={e => updateEditItem(item.id, "quantity", Math.max(1, Number(e.target.value)))}
                                className="w-12 rounded border border-border bg-background px-1.5 py-1 text-xs text-center text-foreground"
                              />
                              <span className="text-xs text-muted-foreground">×</span>
                              <input
                                type="text" value={item.product_name}
                                onChange={e => updateEditItem(item.id, "product_name", e.target.value)}
                                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground min-w-0"
                              />
                              <input
                                type="number" step="0.01" value={item.unit_price}
                                onChange={e => updateEditItem(item.id, "unit_price", Number(e.target.value))}
                                className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                title="Preço unitário"
                              />
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                = R$ {(Number(item.unit_price) * item.quantity).toFixed(2).replace(".", ",")}
                              </span>
                              <button onClick={() => removeEditItem(item.id)} className="text-destructive hover:text-destructive/80 p-0.5" title="Remover item">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}

                          {/* Add new item */}
                          <div className="rounded border border-dashed border-primary/40 bg-primary/5 p-2 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <div className="relative flex-1">
                                <input
                                  type="text" placeholder="Adicionar produto..."
                                  value={addItemName}
                                  onChange={e => { setAddItemName(e.target.value); searchProducts(e.target.value); }}
                                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                                />
                                {productSuggestions.length > 0 && (
                                  <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border bg-card shadow-lg max-h-32 overflow-y-auto">
                                    {productSuggestions.map((p, i) => (
                                      <button key={i} onClick={() => {
                                        setAddItemName(p.name);
                                        setAddItemPrice(p.price);
                                        setProductSuggestions([]);
                                      }} className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-muted flex justify-between">
                                        <span>{p.name}</span>
                                        <span className="text-muted-foreground">R$ {p.price.toFixed(2).replace(".", ",")}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <input type="number" min={1} value={addItemQty}
                                onChange={e => setAddItemQty(Math.max(1, Number(e.target.value)))}
                                className="w-12 rounded border border-border bg-background px-1.5 py-1 text-xs text-center text-foreground"
                                title="Quantidade"
                              />
                              <input type="number" step="0.01" value={addItemPrice}
                                onChange={e => setAddItemPrice(Number(e.target.value))}
                                className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                placeholder="R$"
                                title="Preço unitário"
                              />
                              <button onClick={addNewItem} disabled={!addItemName.trim()}
                                className="rounded-lg bg-primary p-1.5 text-primary-foreground disabled:opacity-40" title="Adicionar item">
                                <PlusCircle size={14} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Totals preview */}
                        <div className="rounded-lg bg-muted/50 p-2 space-y-0.5 text-xs">
                          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (itens)</span><span className="font-bold text-foreground">R$ {calcEditSubtotal().toFixed(2).replace(".", ",")}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">+ Entrega</span><span className="text-foreground">R$ {Number(editData.delivery_fee ?? 0).toFixed(2).replace(".", ",")}</span></div>
                          {(editData.discount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">- Desconto</span><span className="text-green-600">R$ {Number(editData.discount || 0).toFixed(2).replace(".", ",")}</span></div>}
                          <div className="flex justify-between font-bold text-sm"><span className="text-foreground">Total</span><span className="text-primary">R$ {(calcEditSubtotal() + Number(editData.delivery_fee ?? 0) - Number(editData.discount || 0)).toFixed(2).replace(".", ",")}</span></div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => saveEdit(order.id)}
                            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                            <Save size={14} /> Salvar
                          </button>
                          <button onClick={() => saveEdit(order.id, true)}
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                            <Printer size={14} /> Salvar e Reimprimir
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

                    {/* Show courier info for delivering orders */}
                    {order.status === "delivering" && order.courier_id && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          🚚 {couriers.find(c => c.id === order.courier_id)?.name || "Entregador"}
                        </span>
                        <button
                          onClick={() => changeCourier(order.id, order.courier_id)}
                          className="rounded-lg border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                        >
                          Trocar
                        </button>
                        <button
                          onClick={() => setTrackingCourierId(order.courier_id)}
                          className="rounded-lg border border-border px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10"
                        >
                          📍 Rastrear
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => printReceipt(order.id, "pedido")}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                        <Printer size={14} /> Pedido
                      </button>
                      <button onClick={() => printReceipt(order.id, "obrigado")}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                        <Printer size={14} /> Obrigado
                      </button>
                      {/* Manual reprint of "Fechamento de Rota" is always available */}
                      <button onClick={() => printReceipt(order.id, "entregador")}
                        className="flex items-center gap-1 rounded-lg border border-cyan-500 px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-50">
                        <Printer size={14} /> Fechamento de Rota
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
                      {order.status === "cancelled" && !order.trashed_at && (
                        <button
                          onClick={async () => {
                            if (!window.confirm("Mover este pedido para a lixeira? Ele deixará de aparecer em 'Recusados' e não será contabilizado.")) return;
                            const { error } = await supabase.from("orders").update({ trashed_at: new Date().toISOString() }).eq("id", order.id);
                            if (error) { toast({ title: "Erro ao mover para a lixeira", variant: "destructive" }); return; }
                            toast({ title: "🗑️ Pedido movido para a lixeira" });
                            fetchOrders();
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-500 py-2.5 text-sm font-bold text-gray-700"
                        >
                          <Trash2 size={14} /> Excluir
                        </button>
                      )}
                      {order.status === "cancelled" && order.trashed_at && (
                        <button
                          onClick={async () => {
                            const { error } = await supabase.from("orders").update({ trashed_at: null }).eq("id", order.id);
                            if (error) { toast({ title: "Erro ao restaurar", variant: "destructive" }); return; }
                            toast({ title: "♻️ Pedido restaurado para Recusados" });
                            fetchOrders();
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-500 py-2.5 text-sm font-bold text-blue-700"
                        >
                          <RotateCcw size={14} /> Restaurar
                        </button>
                      )}
                    </div>
                  </div>
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

      {/* Courier Selector Modal */}
      {courierSelectOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-card p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold text-foreground">🚚 Selecionar Entregador</h3>
            <p className="text-sm text-muted-foreground">Escolha o entregador para esta entrega:</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {couriers.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCourierId(c.id)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left text-sm font-semibold transition-all",
                    selectedCourierId === c.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground hover:bg-muted"
                  )}
                >
                  {c.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (R$ {c.fixed_fee.toFixed(2).replace(".",",")}/entrega)
                  </span>
                </button>
              ))}
              {couriers.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum entregador cadastrado. Cadastre em Entregas.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCourierSelectOrderId(null)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground">
                Cancelar
              </button>
              <button
                disabled={!selectedCourierId}
                onClick={confirmCourierAndDeliver}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
              >
                Confirmar e Enviar
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Route Closure Confirmation Modal */}
      {showRouteClosureModal && (() => {
        const closureOrder = orders.find(o => o.id === showRouteClosureModal);
        const isReturned = closureOrder?.status === "ready" && !!closureOrder?.courier_id;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-2xl bg-card p-6 space-y-4 mx-4">
              <h3 className="text-lg font-bold text-foreground">
                {isReturned ? "⚠️ Pedido Devolvido" : "📋 Fechamento de Rota"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isReturned
                  ? <>O pedido foi <span className="font-bold text-foreground">devolvido</span>?</>
                  : <>Foi realizado o <span className="font-bold text-foreground">Fechamento de Rota</span>?</>
                }
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
        );
      })()}

      {/* Courier Tracking Modal */}
      {trackingCourierId && (() => {
        const trackingOrder = orders.find(o => o.courier_id === trackingCourierId && o.status === "delivering");
        return (
          <Suspense fallback={<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60"><p className="text-white">Carregando mapa...</p></div>}>
            <CourierTrackingModal
              courierId={trackingCourierId}
              courierName={couriers.find(c => c.id === trackingCourierId)?.name || "Entregador"}
              destinationAddress={trackingOrder ? `${trackingOrder.address_street || ""} ${trackingOrder.address_number || ""}`.trim() : undefined}
              destinationNeighborhood={trackingOrder?.address_neighborhood || undefined}
              onClose={() => setTrackingCourierId(null)}
            />
          </Suspense>
        );
      })()}

      {showExpenseManager && (
        <ExpenseManager
          selectedDate={selectedDate}
          onClose={() => setShowExpenseManager(false)}
        />
      )}

      <CalculatorModal open={showCalculator} onClose={() => setShowCalculator(false)} />
    </div>
  );
};

export default AdminDashboard;
