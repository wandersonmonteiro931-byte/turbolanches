import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag,
  DollarSign,
  Clock,
  CheckCircle,
  ChefHat,
  Package,
  Truck,
  X,
  Check,
  Printer,
  Store,
  StoreIcon,
  Power,
  FileText,
  AlertTriangle,
  Plus,
  Search,
  CalendarIcon,
  Edit2,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Wallet,
  Trash2,
  PlusCircle,
  RotateCcw,
  Calculator,
  MapPin,
  ChevronDown,
  Zap,
} from "lucide-react";
import { format, eachDayOfInterval } from "date-fns";
import { formatDateBR, nowUtcMs } from "@/lib/brasiliaTime";
import { BrasiliaClock } from "@/components/admin/BrasiliaClock";
import { PrintModeSelector } from "@/components/admin/PrintModeSelector";
import { ptBR } from "date-fns/locale";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { supabase } from "@/integrations/supabase/client";
import { formatBusinessDate, getBusinessDayRange, getTodayBusinessDay } from "@/lib/businessDay";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { openPrintUrl } from "@/lib/printPopup";
import { tryPrintOrderViaQz } from "@/lib/printRouter";
import { printRawEscPos } from "@/lib/qzTray";
import { renderTemplateToEscPos } from "@/lib/escposTemplate";
import { getThermalPrintSettings } from "@/lib/thermalPrintSettings";
import { getPrintMode, setPrintMode, PRINT_MODE_LABEL, type PrintMode } from "@/lib/printModePreference";
import { useStore } from "@/contexts/StoreContext";
import { useAdminSectionPassword } from "@/hooks/useAdminSectionPassword";
import { useGlobalKeyboardSearch } from "@/hooks/useGlobalKeyboardSearch";
import { lazy, Suspense } from "react";
const CourierTrackingModal = lazy(() => import("@/components/admin/CourierTrackingModal"));
import ExpenseManager from "@/components/admin/ExpenseManager";
import CashRegister from "@/components/admin/CashRegister";
import CalculatorModal from "@/components/admin/CalculatorModal";
import NeighborhoodFeeQueryModal from "@/components/admin/NeighborhoodFeeQueryModal";
import { buildAdminPrintDocument, escapeHtml, makeTightThermalPrintHtml } from "@/lib/adminPrintTemplates";
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
import { normalizeSearch } from "@/lib/searchNormalize";

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
  { key: "ready", label: "Pronto", icon: Package, color: "bg-emerald-500", statuses: ["ready"] },
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
  if (order.status === "ready" && (order.delivery_type === "mesa" || order.delivery_type === "retirada"))
    return "delivered";
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
  const [profiles, setProfiles] = useState<Record<string, { customer_code: number; full_name: string; phone: string }>>(
    {},
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [activeTab, setActiveTab] = useState("pending");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [showCloseDay, setShowCloseDay] = useState(false);
  const [now, setNow] = useState(() => nowUtcMs());
  const nowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(getTodayBusinessDay());
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  useGlobalKeyboardSearch(searchInputRef, (text) => {
    if (text === "") setSearchQuery("");
    else if (text === "\b") setSearchQuery((s) => s.slice(0, -1));
    else setSearchQuery((s) => s + text);
  });
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
  const [showReportsMenu, setShowReportsMenu] = useState(false);
  const [showFeeQuery, setShowFeeQuery] = useState(false);
  const [deliveryTimeMinutes, setDeliveryTimeMinutes] = useState(45);

  // Alarm is now global via useAdminAlarm in App.tsx

  // Fetch couriers
  const fetchCouriers = useCallback(async () => {
    let q = supabase
      .from("couriers" as any)
      .select("id, name, fixed_fee")
      .eq("active", true);
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    setCouriers(((data as any[]) ?? []).map((c: any) => ({ id: c.id, name: c.name, fixed_fee: Number(c.fixed_fee) })));
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

    // STRICT: only show orders from the selected business day. Orders from previous days
    // are NOT carried over even if still active (per requirement: "só pedidos do dia atual").
    const dayRes = await dayQuery;
    const data = (dayRes.data ?? []) as Order[];
    const activeRes = { data: [] as any[] };

    console.log("[Dashboard] fetchOrders", {
      storeId,
      isToday,
      range: { start, end },
      dayCount: dayRes.data?.length ?? 0,
      activeCount: activeRes.data?.length ?? 0,
      mergedCount: data.length,
      preparingCount: data.filter((o) => o.status === "preparing").length,
      preparing: data
        .filter((o) => o.status === "preparing")
        .map((o) => ({
          n: o.order_number,
          status: o.status,
          pm: o.payment_method,
          pc: o.payment_confirmed,
          sid: (o as any).store_id,
        })),
    });

    setOrders(data);
    const userIds = [...new Set(data.map((o) => o.user_id))];
    if (userIds.length > 0) {
      supabase
        .from("profiles")
        .select("user_id, customer_code, full_name, phone")
        .in("user_id", userIds)
        .then(({ data: profilesData }) => {
          if (profilesData) {
            const map: Record<string, { customer_code: number; full_name: string; phone: string }> = {};
            profilesData.forEach((p) => {
              map[p.user_id] = p;
            });
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
      .select(
        "id, is_open, opened_at, closed_at, scheduled_open, scheduled_close, use_schedule, obrigado_receipt_enabled, entregador_receipt_enabled, delivery_time_minutes",
      )
      .limit(1);

    if (storeId) {
      query = query.eq("store_id", storeId);
    }

    const { data } = await query.maybeSingle();

    if (data) {
      const settings = data as StoreSettings;
      applyStoreSettings(settings);
      const dt = (data as any).delivery_time_minutes;
      if (typeof dt === "number" && dt > 0) setDeliveryTimeMinutes(dt);
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
      `width=${w},height=${h},left=${-w},top=0,menubar=no,toolbar=no,location=no,status=no`,
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
          const isUnpaidPix =
            newOrder.payment_method === "pix" && !newOrder.payment_confirmed && newOrder.status !== "paid";
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
  const hasPreparingVisible = activeTab === "preparing" && orders.some((o) => o.status === "preparing");
  useEffect(() => {
    if (hasPreparingVisible) {
      nowIntervalRef.current = setInterval(() => setNow(nowUtcMs()), 1000);
    } else {
      if (nowIntervalRef.current) {
        clearInterval(nowIntervalRef.current);
        nowIntervalRef.current = null;
      }
    }
    return () => {
      if (nowIntervalRef.current) {
        clearInterval(nowIntervalRef.current);
        nowIntervalRef.current = null;
      }
    };
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

  const getStatusBeforeCancel = (order: Order): string => {
    const observations = String(order.observations || "");
    const match = observations.match(/\[STATUS_ANTES_CANCELAR:([a-z_]+)\]/i);
    const savedStatus = match?.[1]?.toLowerCase();

    if (savedStatus && savedStatus !== "cancelled") {
      return savedStatus;
    }

    // Fallback para pedidos antigos que foram cancelados antes desta correção.
    // Não dá para saber 100% o status antigo se ele não foi salvo,
    // mas dá para inferir pela última etapa registrada no pedido.
    if (order.delivered_at) return "delivered";
    if (order.delivering_at) return "delivering";
    if (order.ready_at) return "ready";
    if (order.preparing_at) return "preparing";

    return "pending";
  };

  const withStatusBeforeCancelMarker = (order: Order, reason: string): string => {
    const observations = String(order.observations || "")
      .replace(/\[STATUS_ANTES_CANCELAR:[a-z_]+\]/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const previousStatus = order.status && order.status !== "cancelled" ? order.status : getStatusBeforeCancel(order);

    const cleanReason = reason.trim();

    return [
      `[STATUS_ANTES_CANCELAR:${previousStatus}]`,
      cleanReason ? `Motivo da recusa: ${cleanReason}` : "",
      observations,
    ]
      .filter(Boolean)
      .join(" | ");
  };

  const removeStatusBeforeCancelMarker = (observations: string | null | undefined): string | null => {
    const cleaned = String(observations || "")
      .replace(/\[STATUS_ANTES_CANCELAR:[a-z_]+\]/gi, "")
      .replace(/\s+/g, " ")
      .replace(/\s*\|\s*\|\s*/g, " | ")
      .replace(/^\s*\|\s*/, "")
      .replace(/\s*\|\s*$/, "")
      .trim();

    return cleaned || null;
  };

  const recuperarPedidoCancelado = async (order: Order) => {
    const statusAnterior = getStatusBeforeCancel(order);

    const confirmar = window.confirm(
      `Recuperar o pedido #${String(order.order_number).padStart(5, "0")}?\n\n` +
        `Ele vai voltar para: ${tabs.find((tab) => tab.key === statusAnterior)?.label || statusAnterior}.`,
    );

    if (!confirmar) return;

    const updateData: Record<string, unknown> = {
      status: statusAnterior,
      trashed_at: null,
      cancellation_reason: null,
      observations: removeStatusBeforeCancelMarker(order.observations),
    };

    const { error } = await supabase.from("orders").update(updateData).eq("id", order.id);

    if (error) {
      toast({ title: "Erro ao recuperar pedido", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "♻️ Pedido recuperado!",
      description: `Voltou para ${tabs.find((tab) => tab.key === statusAnterior)?.label || statusAnterior}.`,
    });

    await fetchOrders();
  };

  const updateStatus = async (orderId: string, newStatus: string, courierId?: string) => {
    const order = orders.find((o) => o.id === orderId);
    // Block accepting and finalization if cash register is closed
    if ((newStatus === "preparing" || newStatus === "delivered") && !cashRegisterOpen) {
      toast({
        title: " Caixa fechado",
        description:
          newStatus === "preparing"
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

    // Delivery orders require route closure; mesa/retirada finalize directly from Aguardando.
    if (newStatus === "delivered" && order?.delivery_type === "delivery") {
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
    if (newStatus === "delivered") updateData.delivered_at = nowISO;

    const { error } = await supabase.from("orders").update(updateData).eq("id", orderId);
    if (error) {
      toast({ title: "Erro ao atualizar pedido", variant: "destructive" });
      return;
    }
    toast({ title: newStatus === "delivered" ? " Pedido finalizado!" : `Pedido atualizado!` });
    await fetchOrders();

    // Mark coupon as used when order is accepted (preparing)
    if (newStatus === "preparing") {
      const order = orders.find((o) => o.id === orderId);
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
        title: " Caixa fechado",
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
    toast({ title: " Entrega finalizada com Fechamento de Rota!" });
    setShowRouteClosureModal(null);
    await fetchOrders();
  };

  const confirmCourierAndDeliver = async () => {
    if (!courierSelectOrderId || !selectedCourierId) return;
    const oid = courierSelectOrderId;
    const isReassign = orders.find((o) => o.id === oid)?.status === "delivering";
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
    toast({ title: " Pagamento confirmado manualmente!" });
    fetchOrders();
  };

  const markAsFiado = async (orderId: string) => {
    const { data: order, error: loadError } = await supabase
      .from("orders")
      .select("id, observations")
      .eq("id", orderId)
      .maybeSingle();

    if (loadError) {
      toast({
        title: "Erro ao carregar pedido",
        description: loadError.message,
        variant: "destructive",
      });
      return;
    }

    const observacaoAtual = String(order?.observations || "").trim();
    const observacaoFiado = observacaoAtual.includes("[FIADO]")
      ? observacaoAtual
      : `[FIADO]${observacaoAtual ? ` ${observacaoAtual}` : ""}`;

    const updateData: Record<string, unknown> = {
      payment_confirmed: false,
      paid_at: null,
      amount_paid_cash: 0,
      amount_paid_pix: 0,
      amount_paid_card: 0,
      observations: observacaoFiado,
    };

    // O banco não aceita payment_method = "fiado".
    // Então fiado é marcado por payment_confirmed = false + [FIADO] em observations.
    if (storeId) updateData.store_id = storeId;

    const { error } = await supabase.from("orders").update(updateData).eq("id", orderId);

    if (error) {
      toast({
        title: "Erro ao marcar como fiado",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "📝 Pedido marcado como fiado!" });
    await fetchOrders();
  };

  const printReceipt = async (orderId: string, tipo: string, delayMs?: number) => {
    const mode: PrintMode = getPrintMode();

    if (mode !== "pdf") {
      const sentViaQz = await tryPrintOrderViaQz(orderId, { tipo, copies: 1 });
      if (sentViaQz) return;

      if (mode === "qz") {
        toast({
          title: "QZ Tray indisponível",
          description: "Verifique se o QZ Tray está rodando e a impressora configurada.",
          variant: "destructive",
        });
        return;
      }
    }

    const params = new URLSearchParams({ tipo });
    if (typeof delayMs === "number") params.set("delay_ms", String(delayMs));
    const w = openPrintUrl(`/admin/imprimir/${orderId}?${params.toString()}`, `print_${tipo}`, "width=280,height=120");
    if (!w) return;
  };
  const acceptAllPending = async () => {
    if (!cashRegisterOpen) {
      toast({
        title: " Caixa fechado",
        description: "Abra o caixa antes de aceitar pedidos.",
        variant: "destructive",
      });
      return;
    }
    const toAccept = orders.filter((o) => o.status === "pending" || o.status === "paid");
    if (toAccept.length === 0) {
      toast({ title: "Nenhum pedido pendente para aceitar." });
      return;
    }

    const nowISO = new Date().toISOString();
    const { error } = await supabase
      .from("orders")
      .update({ status: "preparing", preparing_at: nowISO })
      .in(
        "id",
        toAccept.map((o) => o.id),
      );

    if (error) {
      toast({ title: "Erro ao aceitar pedidos", variant: "destructive" });
      return;
    }

    // Mark coupons as used for all accepted orders
    const couponOrders = toAccept.filter((o) => o.coupon_code);
    for (const order of couponOrders) {
      await supabase.rpc("increment_coupon_used_count" as any, { _code: order.coupon_code });
    }

    // Print receipts with shorter delays (800ms between each)
    toAccept.forEach((order, i) => {
      setTimeout(() => printReceipt(order.id, "pedido"), i * 800);
    });

    toast({ title: ` ${toAccept.length} pedido(s) aceito(s) e enviados para cozinha!` });
    fetchOrders();
  };

  // Edit order - navigate to manual order page with edit mode
  const startEdit = (order: Order) => {
    navigate(`/admin/novo-pedido?edit=${order.id}`);
  };

  const searchProducts = async (term: string) => {
    if (term.length < 2) {
      setProductSuggestions([]);
      return;
    }
    let q = supabase.from("products").select("name, price").ilike("name", `%${term}%`).eq("active", true).limit(8);
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    setProductSuggestions(data || []);
  };

  const updateEditItem = (
    itemId: string,
    field: "quantity" | "unit_price" | "product_name" | "observations",
    value: any,
  ) => {
    setEditItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));
  };

  const removeEditItem = (itemId: string) => {
    setEditItems((prev) => prev.filter((item) => item.id !== itemId));
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
    setEditItems((prev) => [...prev, newItem]);
    setAddItemName("");
    setAddItemQty(1);
    setAddItemPrice(0);
    setProductSuggestions([]);
  };

  const calcEditSubtotal = () => editItems.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);

  const saveEdit = async (orderId: string, reprint = false) => {
    const newSubtotal = calcEditSubtotal();
    const newDeliveryFee = Number(editData.delivery_fee ?? 0);
    const newDiscount = Number(editData.discount || 0);
    const newTotal = newSubtotal + newDeliveryFee - newDiscount;

    // Update order
    const { error } = await supabase
      .from("orders")
      .update({
        ...editData,
        subtotal: newSubtotal,
        delivery_fee: newDeliveryFee,
        discount: newDiscount,
        total: newTotal,
      })
      .eq("id", orderId);

    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
      return;
    }

    // Delete existing items and re-insert
    await supabase.from("order_items").delete().eq("order_id", orderId);

    const itemsToInsert = editItems.map((item) => ({
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
    setItems((prev) => {
      const copy = { ...prev };
      delete copy[orderId];
      return copy;
    });
    toast({ title: " Pedido atualizado!" });
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
      ? ordersForDay.filter((o) => o.status === "delivered" && o.courier_id)
      : [];

    if (!ordersForDay) {
      const PAGE_SIZE = 1000;
      let page = 0;
      while (true) {
        let q = supabase
          .from("orders")
          .select("courier_id, delivery_fee, status")
          .gte("created_at", start)
          .lte("created_at", end)
          .eq("status", "delivered")
          .not("courier_id", "is", null)
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
    const { data: courierData } = await supabase
      .from("couriers" as any)
      .select("id, name")
      .in("id", Array.from(courierIds));
    const courierNames = new Map<string, string>();
    ((courierData as any[]) ?? []).forEach((c: any) => courierNames.set(c.id, c.name));

    // Get daily fixed fees for the day of week
    const dayOfWeek = new Date(dateStr + "T12:00:00").getDay();
    let dfq = supabase
      .from("courier_daily_fees" as any)
      .select("courier_id, fixed_fee")
      .eq("day_of_week", dayOfWeek)
      .in("courier_id", Array.from(courierIds));
    if (storeId) dfq = dfq.eq("store_id", storeId);
    const { data: dailyFeeData } = await dfq;
    const dailyFixedFees = new Map<string, number>();
    ((dailyFeeData as any[]) ?? []).forEach((d: any) => dailyFixedFees.set(d.courier_id, Number(d.fixed_fee) || 0));

    // Also check couriers table default fixed_fee
    const { data: defaultFees } = await supabase
      .from("couriers" as any)
      .select("id, fixed_fee")
      .in("id", Array.from(courierIds));
    const defaultFixedFees = new Map<string, number>();
    ((defaultFees as any[]) ?? []).forEach((c: any) => defaultFixedFees.set(c.id, Number(c.fixed_fee) || 0));

    const expenses: { amount: number; category: string; description: string }[] = [];
    courierIds.forEach((cid) => {
      const name = courierNames.get(cid) || "Entregador";
      // Diária por dia da semana TEM PRIORIDADE (respeita 0); fallback = couriers.fixed_fee
      const fixedFee = dailyFixedFees.has(cid) ? (dailyFixedFees.get(cid) as number) : defaultFixedFees.get(cid) || 0;
      const deliveryTotal = courierFees.get(cid) || 0;
      const total = fixedFee + deliveryTotal;
      if (total > 0) {
        expenses.push({
          amount: total,
          category: "diario",
          description: `${name} (Fixa R$${fixedFee.toFixed(2).replace(".", ",")} + Taxas R$${deliveryTotal.toFixed(2).replace(".", ",")})`,
        });
      }
    });

    return expenses;
  };

  // Reprint daily report for any date
  const fetchExpensesForDate = async (dateStr: string) => {
    let q = supabase
      .from("report_expenses" as any)
      .select("amount, category, description")
      .eq("expense_date", dateStr);
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    return ((data as any[]) ?? []).map((e: any) => ({
      amount: Number(e.amount),
      category: e.category,
      description: e.description,
    }));
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

    await printDailyReport(currentDayOrders, bruto, delivery, gastos, liquido, expenses);
  };

  const fetchExpensesForRange = async (fromDate: string, toDate: string) => {
    let q = supabase
      .from("report_expenses" as any)
      .select("amount, category, description, expense_date")
      .gte("expense_date", fromDate)
      .lte("expense_date", toDate);
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    return ((data as any[]) ?? []).map((e: any) => ({
      amount: Number(e.amount),
      category: e.category,
      description: e.description,
      expense_date: e.expense_date,
    }));
  };

  const stripReportHtml = (value: string) =>
    String(value || "")
      .replace(
        /<div[^>]*class=["'][^"']*report-row[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi,
        (_, left, right) =>
          `__ITEM__${String(left)
            .replace(/<[^>]*>/g, "")
            .trim()}__SEP__${String(right)
            .replace(/<[^>]*>/g, "")
            .trim()}\n`,
      )
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/[\u{1F000}-\u{1FAFF}]/gu, "")
      .replace(/[\u{2600}-\u{27BF}]/gu, "")
      .replace(/[]/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const completeReportVariablesForQz = (variables: Record<string, string>) => ({
    "[NUMEROPEDIDO]": "",
    "[MESA]": "",
    "[NOMECLIENTE]": "",
    "[CODIGOCLIENTE]": "",
    "[TELEFONECLIENTE]": "",
    "[ENDEREÇO]": "",
    "[ENDERECO]": "",
    "[FORMAPAGTO]": "",
    "[TOTALRECEBER]": "",
    "[TOTALPAGO]": "",
    "[SUBTOTAL]": "",
    "[TOTAL]": "",
    "[TAXAENTREGA]": "",
    "[DESCONTO]": "",
    "[CUPOM]": "",
    "[TROCO]": "",
    "[DATAHORAENTREGA]": "",
    "[DATAHORASAÍDAENTREGA]": "",
    "[DATAHORASAIDAENTREGA]": "",
    "[OBS]": "",
    "[ITENS]": "",
    "[ITEM]": "",
    "[PRODUTO]": "",
    "[MARCA]": "",
    "[DATAFABRICACAO]": "",
    "[VALIDADE]": "",
    "[RESPONSAVEL]": "",
    "[TITULO]": "",
    "[TOTALITENS]": "",
    "[LISTA]": "",
    "[RESFRIADO]": "",
    "[CONGELADO]": "",
    "[ARMAZENAR]": "",
    "[GRAUS]": "",
    "[FRASEARMAZ]": "",
    ...variables,
  });

  const normalizeDeliveryReportText = (value: string) => {
    let out = String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    // Corrige qualquer variação do erro:
    // 1- #00492
    // 1 - #00492
    // 1-- #00492
    // 1 – – #00492
    out = out.replace(/(^|\n)(\s*\d+)\s*[-–—]+\s*[-–—]+\s*/g, "$1$2 - ");
    out = out.replace(/(^|\n)(\s*\d+)\s*[-–—]\s*/g, "$1$2 - ");

    // Remove linhas vazias entre entregas numeradas e antes do resumo.
    const lines = out.split("\n");
    const cleaned: string[] = [];

    const isDeliveryLine = (line: string) =>
      /^\s*\d+\s*[-–—]\s*(?:#\d+|RUA|AV|ALAMEDA|TRAVESSA|ROD|ESTRADA|LOTE|QD|CASA|[A-ZÀ-Ú0-9])/i.test(line.trim());

    const isSummaryLine = (line: string) =>
      /^\s*(TOTAL DE ENTREGAS|TOTAL TAXAS DE ENTREGA|TAXA FIXA DIÁRIA|TOTAL ENTREGADOR)/i.test(line.trim());

    for (let i = 0; i < lines.length; i += 1) {
      const cur = lines[i];
      const prev = cleaned.length ? cleaned[cleaned.length - 1] : "";
      const next = i + 1 < lines.length ? lines[i + 1] : "";

      if (cur.trim() === "" && (isDeliveryLine(prev) || isDeliveryLine(next) || isSummaryLine(next))) {
        continue;
      }

      cleaned.push(cur);
    }

    return cleaned
      .join("\n")
      .replace(/(^|\n)(\s*\d+)\s*[-–—]+\s*[-–—]+\s*/g, "$1$2 - ")
      .replace(/(^|\n)(\s*\d+)\s*-\s*-\s*/g, "$1$2 - ");
  };

  const normalizeDeliveryReportVariables = (variables: Record<string, string>) => {
    const next = { ...variables };

    for (const key of Object.keys(next)) {
      const upperKey = key.toUpperCase();
      if (
        upperKey.includes("LINHAS") ||
        upperKey.includes("ENTREGA") ||
        upperKey.includes("LISTA") ||
        upperKey.includes("RELATORIO") ||
        upperKey.includes("RELATÓRIO")
      ) {
        next[key] = normalizeDeliveryReportText(next[key]);
      }
    }

    return next;
  };

  const tryPrintTemplateReportViaQz = async (
    templateType: string,
    template: string,
    variables: Record<string, string>,
    blocks: Record<string, string> = {},
  ) => {
    const settings = getThermalPrintSettings();
    if (!settings.qzEnabled || !settings.qzPrinterName) return false;

    const cleanVariables: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      completeReportVariablesForQz(normalizeDeliveryReportVariables({ ...variables, ...blocks })),
    )) {
      cleanVariables[key] = stripReportHtml(value);
    }

    const bytes = renderTemplateToEscPos(
      {
        template,
        variables: cleanVariables,
      },
      {
        columns: settings.qzColumns,
        feedLines: settings.qzFeedLines,
        codepage: settings.qzCodepage,
      },
    );

    await printRawEscPos(settings.qzPrinterName, bytes, 1);
    return true;
  };

  const tryPrintPlainReportViaQz = async (template: string) => {
    const settings = getThermalPrintSettings();
    if (!settings.qzEnabled || !settings.qzPrinterName) return false;

    const bytes = renderTemplateToEscPos(
      {
        template,
        variables: {},
      },
      {
        columns: settings.qzColumns,
        feedLines: settings.qzFeedLines,
        codepage: settings.qzCodepage,
      },
    );

    await printRawEscPos(settings.qzPrinterName, bytes, 1);
    return true;
  };

  const printReportTemplate = async (
    templateType: string,
    variables: Record<string, string>,
    blocks: Record<string, string> = {},
  ) => {
    const { data } = await supabase
      .from("receipt_templates" as any)
      .select("*")
      .eq("template_type", templateType)
      .maybeSingle();
    const template = data as any;
    const label =
      template?.label || (templateType === "relatorio_entregas" ? "RELATÓRIO DE ENTREGAS" : "RELATÓRIO DE PERÍODO");
    const rawTemplate = template?.body_template || getDefaultTemplate(templateType);
    // Garantir título compacto no relatório de entregas (remove [GRANDE]/[TXTGIGANTE] em volta de [TIPOCOMANDA])
    const normalizedTemplate =
      templateType === "relatorio_entregas" || templateType === "relatorio_periodo"
        ? rawTemplate
            .replace(/\[GRANDE\]\s*\[TIPOCOMANDA\]\s*\[\/GRANDE\]/g, "[TIPOCOMANDA]")
            .replace(/\[TXTGIGANTE\]\s*\[TIPOCOMANDA\]\s*\[\/TXTGIGANTE\]/g, "[TIPOCOMANDA]")
        : rawTemplate;
    const mode = getPrintMode();

    if (mode !== "pdf") {
      try {
        const sentViaQz = await tryPrintTemplateReportViaQz(
          templateType,
          normalizedTemplate,
          {
            "[NOMELOJA]": template?.store_name || "TURBO LANCHES",
            "[TIPOCOMANDA]": label,
            "[RODAPÉ]": template?.footer_message || "",
            ...variables,
          },
          blocks,
        );

        if (sentViaQz) return;

        if (mode === "qz") {
          toast({
            title: "QZ Tray indisponível",
            description: "Verifique se o QZ Tray está aberto e a impressora configurada.",
            variant: "destructive",
          });
          return;
        }
      } catch (error) {
        if (mode === "qz") {
          toast({
            title: "Erro ao imprimir via QZ Tray",
            description: error instanceof Error ? error.message : "Falha desconhecida.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    const html = buildAdminPrintDocument({
      title: label,
      template: normalizedTemplate,
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
      labelFontSizePx: template?.label_font_size ?? (templateType === "relatorio_entregas" ? 12 : 18),
      sectionPaddingMm: 0,
      extraCss:
        ".report-row{display:flex;justify-content:space-between;gap:4px;font-weight:900;font-size:9px;padding:1px 0}.report-row span{white-space:normal;overflow-wrap:anywhere}.report-row span:last-child{white-space:nowrap}",
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
    const allManualExpenses = await fetchExpensesForRange(
      format(periodFrom, "yyyy-MM-dd"),
      format(periodTo, "yyyy-MM-dd"),
    );
    const manualExpensesByDate = new Map<string, number>();
    allManualExpenses.forEach((e) => {
      manualExpensesByDate.set(e.expense_date, (manualExpensesByDate.get(e.expense_date) || 0) + e.amount);
    });

    // Calculate courier costs per date
    const allDates: string[] = eachDayOfInterval({ start: periodFrom, end: periodTo }).map((d) =>
      format(d, "yyyy-MM-dd"),
    );

    const courierCostsByDate = new Map<string, number>();
    const courierResults = await Promise.all(
      allDates.map(async (dateStr) => {
        const courierExpenses = await fetchCourierCostsForDate(dateStr);
        const total = courierExpenses.reduce((s, e) => s + e.amount, 0);
        return { dateStr, total };
      }),
    );
    courierResults.forEach(({ dateStr, total }) => {
      if (total > 0) courierCostsByDate.set(dateStr, total);
    });

    // Build full rows
    const fullRows = allDates.map((dateStr) => {
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

    const reportRows = fullRows
      .map(
        (r) => `
      <div class="report-row"><span>${format(new Date(r.report_date + "T12:00:00"), "dd/MM")}</span><span>${r.total_orders} ped.</span><span>R$ ${r.total_bruto.toFixed(2).replace(".", ",")}</span><span>R$ ${r.total_liquido.toFixed(2).replace(".", ",")}</span></div>
    `,
      )
      .join("");
    await printReportTemplate(
      "relatorio_periodo",
      {
        "[PERIODO]": periodLabel,
        "[LINHAS]": reportRows,
        "[TOTALPEDIDOS]": String(totalOrders),
        "[TOTALBRUTO]": `R$ ${totalBruto.toFixed(2).replace(".", ",")}`,
        "[TOTALENTREGADORES]": `R$ ${totalCourierPaid.toFixed(2).replace(".", ",")}`,
        "[TOTALGASTOS]": `R$ ${totalGastos.toFixed(2).replace(".", ",")}`,
        "[TOTALLIQUIDO]": `R$ ${totalLiquido.toFixed(2).replace(".", ",")}`,
      },
      { "[LINHAS]": reportRows },
    );
  };

  const handleCloseDay = async () => {
    const businessDay = getTodayBusinessDay();
    const dateStr = format(businessDay, "yyyy-MM-dd");
    const [manualExpenses, courierExpenses] = await Promise.all([
      fetchExpensesForDate(dateStr),
      fetchCourierCostsForDate(dateStr, orders),
    ]);
    const expenses = [...courierExpenses, ...manualExpenses];

    const allOrders = orders.filter((o) => o.status !== "cancelled");
    const totalBruto = allOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalDelivery = allOrders.reduce((s, o) => s + Number(o.delivery_fee), 0);
    const totalGastos = expenses.reduce((s, e) => s + e.amount, 0);
    const totalLiquido = totalBruto - totalGastos;

    await supabase.from("daily_reports").upsert(
      {
        report_date: dateStr,
        total_orders: allOrders.length,
        total_bruto: totalBruto,
        total_delivery_fees: totalDelivery,
        total_gastos: totalGastos,
        total_liquido: totalLiquido,
        opened_at: storeSettings?.opened_at,
        closed_at: new Date().toISOString(),
        store_id: storeId,
      },
      { onConflict: "report_date" },
    );

    if (storeSettings) {
      await supabase
        .from("store_settings")
        .update({
          is_open: false,
          closed_at: new Date().toISOString(),
        })
        .eq("id", storeSettings.id);
    }

    printDailyReport(orders, totalBruto, totalDelivery, totalGastos, totalLiquido, expenses);
    setShowCloseDay(false);
    toast({ title: "📊 Dia finalizado! Relatório impresso." });
  };

  const printDailyReport = async (
    allOrders: Order[],
    bruto: number,
    delivery: number,
    gastos: number,
    liquido: number,
    expensesList: { amount: number; category: string; description: string }[] = [],
  ) => {
    const date = format(selectedDate, "dd/MM/yyyy");

    const statusCounts = {
      pending: allOrders.filter((o) => o.status === "pending" || o.status === "paid").length,

      preparing: allOrders.filter((o) => o.status === "preparing").length,
      ready: allOrders.filter((o) => o.status === "ready").length,
      delivering: allOrders.filter((o) => o.status === "delivering").length,
      delivered: allOrders.filter((o) => o.status === "delivered").length,
      cancelled: allOrders.filter((o) => o.status === "cancelled").length,
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

    const expenseRows =
      expensesList.length > 0
        ? expensesList
            .map(
              (e) =>
                `<div class="row"><span>${e.description}</span><span>R$ ${e.amount.toFixed(2).replace(".", ",")}</span></div>`,
            )
            .join("")
        : `<div class="row"><span>Nenhum gasto cadastrado</span><span>R$ 0,00</span></div>`;

    const mode = getPrintMode();
    if (mode !== "pdf") {
      const plainExpenseRows =
        expensesList.length > 0
          ? expensesList.map((e) => `${e.description}: R$ ${e.amount.toFixed(2).replace(".", ",")}`).join("\n")
          : "Nenhum gasto cadastrado: R$ 0,00";

      const plainStatusRows = Object.entries(statusCounts)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${statusLabels[key]}: ${count}`)
        .join("\n");

      const template = `[CENTRO][NOMELOJA][/CENTRO]
[CENTRO]RELATÓRIO DIÁRIO[/CENTRO]
[CENTRO]${date}[/CENTRO]
---
Total de Pedidos: ${allOrders.length}
${plainStatusRows}
---
TOTAL BRUTO: R$ ${bruto.toFixed(2).replace(".", ",")}
Pago Entregadores: R$ ${expensesList
        .filter((e) => e.category === "diario")
        .reduce((s, e) => s + e.amount, 0)
        .toFixed(2)
        .replace(".", ",")}
---
GASTOS DO DIA:
${plainExpenseRows}
Total Gastos: R$ ${gastos.toFixed(2).replace(".", ",")}
---
TOTAL LÍQUIDO: R$ ${liquido.toFixed(2).replace(".", ",")}
[CENTRO]Relatório gerado automaticamente[/CENTRO]`;

      try {
        const sentViaQz = await tryPrintPlainReportViaQz(template.replace("[NOMELOJA]", "TURBO LANCHES"));
        if (sentViaQz) return;

        if (mode === "qz") {
          toast({
            title: "QZ Tray indisponível",
            description: "Verifique se o QZ Tray está aberto e a impressora configurada.",
            variant: "destructive",
          });
          return;
        }
      } catch (error) {
        if (mode === "qz") {
          toast({
            title: "Erro ao imprimir via QZ Tray",
            description: error instanceof Error ? error.message : "Falha desconhecida.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;

    w.document.write(
      makeTightThermalPrintHtml(
        `
      <html><head><style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body { margin:0 !important; padding:0 !important; border:0 !important; min-height:0 !important; height:auto !important; overflow:visible; }
        body { font-family:'Inter',sans-serif; width:72mm; padding:0; font-size:10px; }
        .center { text-align:center; }
        .sep { border-top:1px dashed #000; margin:3px 0; }
        .row { display:flex; justify-content:space-between; padding:2px 0; font-weight:700; }
        .row span:last-child { white-space:nowrap; flex-shrink:0; }
        .big { font-size:14px; font-weight:900; }
        h1 { font-size:14px; font-weight:900; text-align:center; margin:4px 0; }
        h2 { font-size:11px; font-weight:900; text-align:center; margin:2px 0; }
        .sub { font-size:9px; font-weight:700; margin:4px 0 2px; color:#333; }
        @page { size:72mm auto; margin:0 !important; padding:0 !important; }
      </style></head><body>
        <h1>TURBO LANCHES</h1>
        <h2>RELATÓRIO DIÁRIO</h2>
        <div class="center">${date}</div>
        <div class="sep"></div>
        <div class="row"><span>Total de Pedidos:</span><span>${allOrders.length}</span></div>
        ${statusRows}
        <div class="sep"></div>
        <div class="row big"><span>TOTAL BRUTO:</span><span>R$ ${bruto.toFixed(2).replace(".", ",")}</span></div>
        <div class="row"><span>Pago Entregadores:</span><span>R$ ${expensesList
          .filter((e) => e.category === "diario")
          .reduce((s, e) => s + e.amount, 0)
          .toFixed(2)
          .replace(".", ",")}</span></div>
        <div class="sep"></div>
        <div class="sub">GASTOS DO DIA:</div>
        ${expenseRows}
        <div class="row"><span>Total Gastos:</span><span>R$ ${gastos.toFixed(2).replace(".", ",")}</span></div>
        <div class="sep"></div>
        <div class="row big"><span>TOTAL LÍQUIDO:</span><span>R$ ${liquido.toFixed(2).replace(".", ",")}</span></div>
        <div class="center" style="font-size:8px;">Relatório gerado automaticamente</div>
        <div class="sep thermal-cut-marker" data-thermal-cut="true" style="margin-bottom:0;padding-bottom:0;"></div>
      </body></html>
    `,
        72,
      ),
    );
    w.document.close();
    setTimeout(() => {
      try {
        (w as any).prepareTightThermalPrintPage?.();
      } catch {}
      setTimeout(() => {
        w.print();
        setTimeout(() => w.close(), 1400);
      }, 200);
    }, 500);
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
      days.forEach((d) => {
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
          .select(
            "order_number, address_street, address_neighborhood, delivery_fee, courier_id, delivering_at, delivered_at, created_at, status",
          )
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

    const courier = couriers.find((c) => c.id === deliveryReportCourierId);
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
      (allDailyFees || []).forEach((f: any) => feeMap.set(f.day_of_week, Number(f.fixed_fee) || 0));
      // Soma a diária por dia da semana (respeita 0 = "não cobra nesse dia")
      days.forEach((d) => {
        totalFixedFees += feeMap.has(d.getDay()) ? (feeMap.get(d.getDay()) as number) : Number(courier?.fixed_fee) || 0;
      });
    } else {
      const reportDow = selectedDate.getDay();
      const { data: dailyFeeData } = await supabase
        .from("courier_daily_fees")
        .select("fixed_fee")
        .eq("courier_id", deliveryReportCourierId)
        .eq("day_of_week", reportDow)
        .maybeSingle();
      // Diária do dia da semana TEM PRIORIDADE (respeita 0); só cai pro padrão se NÃO houver linha
      totalFixedFees = dailyFeeData ? Number(dailyFeeData.fixed_fee) || 0 : Number(courier?.fixed_fee) || 0;
    }

    const totalTaxas = allDeliveryOrders.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
    const totalEntregador = totalFixedFees + totalTaxas;

    const dateLabel =
      isPeriod && deliveryPeriodFrom && deliveryPeriodTo
        ? `${formatDateBR(deliveryPeriodFrom)} a ${formatDateBR(deliveryPeriodTo)}`
        : formatDateBR(selectedDate);

    // Ordena pela sequência real do pedido (order_number) para evitar inconsistências
    // causadas por relógio errado do notebook. Fallback: timestamps do servidor.
    allDeliveryOrders.sort((a, b) => {
      const nA = Number(a.order_number) || 0;
      const nB = Number(b.order_number) || 0;
      if (nA !== nB) return nA - nB;
      const tA = a.delivering_at || a.created_at;
      const tB = b.delivering_at || b.created_at;
      return new Date(tA).getTime() - new Date(tB).getTime();
    });

    const rows = allDeliveryOrders
      .map(
        (o, idx) => `
      <div class="report-row"><span>${idx + 1} - #${String(o.order_number).padStart(5, "0")} ${escapeHtml(o.address_street || "S/R")}, ${escapeHtml(o.address_neighborhood || "")}</span><span>R$ ${Number(
        o.delivery_fee || 0,
      )
        .toFixed(2)
        .replace(".", ",")}</span></div>
    `,
      )
      .join("");

    const fixedFeeLabel = isPeriod ? "Taxa Fixa (período)" : "Taxa Fixa do Dia";

    await printReportTemplate(
      "relatorio_entregas",
      {
        "[PERIODO]": dateLabel,
        "[NOMEENTREGADOR]": courierName,
        "[LINHAS]": rows,
        "[TOTALENTREGAS]": String(allDeliveryOrders.length),
        "[TOTALTAXAS]": `R$ ${totalTaxas.toFixed(2).replace(".", ",")}`,
        "[TAXAFIXA]": `R$ ${totalFixedFees.toFixed(2).replace(".", ",")}`,
        "[TOTALENTREGADOR]": `R$ ${totalEntregador.toFixed(2).replace(".", ",")}`,
      },
      { "[LINHAS]": rows },
    );
  };

  const activeTabConfig = tabs.find((t) => t.key === activeTab);
  // Hide PIX orders that have NOT been paid yet — only while still pending awaiting payment.
  // Once an order moves past pending (preparing/ready/delivering/delivered), it must always be visible
  // regardless of payment_confirmed flag, otherwise PDV/manual orders created with payment_method='pix'
  // would disappear from the dashboard while still showing in Kitchen and /pedidos (inconsistency).
  // Trashed orders are only visible inside the Lixeira tab.
  // Hide ONLY orders strictly awaiting an online PIX charge: status === 'awaiting_payment'.
  // Any order with status 'pending' is a confirmed pending order (cash/card/pix-on-delivery
  // or PIX checkout that already moved to pending) and MUST appear in the dashboard.
  const visibleOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (o.status === "awaiting_payment" && !o.payment_confirmed) return false;
        return true;
      }),
    [orders],
  );

  const filteredOrders = visibleOrders
    .filter((o) => {
      if (activeTab === "trashed") return o.status === "cancelled" && !!o.trashed_at;
      if (!activeTabConfig?.statuses.includes(o.status)) return false;
      return !o.trashed_at;
    })
    .filter((o) => {
      if (!searchQuery.trim()) return true;
      const q = normalizeSearch(searchQuery);
      const profile = profiles[o.user_id];
      const code = profile?.customer_code ? `t${String(profile.customer_code).padStart(5, "0")}` : "";
      return (
        String(o.order_number).includes(q) ||
        code.includes(q) ||
        normalizeSearch(profile?.full_name || "").includes(q) ||
        (profile?.phone || "").includes(q) ||
        normalizeSearch(o.address_street || "").includes(q) ||
        normalizeSearch(o.address_neighborhood || "").includes(q)
      );
    });

  const getElapsed = (preparingAt: string | null) => {
    if (!preparingAt) return null;
    const startedAt = new Date(preparingAt).getTime();
    if (!Number.isFinite(startedAt)) return { min: 0, sec: 0 };
    const diff = Math.max(0, now - startedAt);
    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    return { min, sec };
  };

  const stats = useMemo(
    () => ({
      pending: visibleOrders.filter(
        (o) => !o.trashed_at && (o.status === "pending" || o.status === "paid" || o.status === "awaiting_payment"),
      ).length,
      preparing: visibleOrders.filter((o) => !o.trashed_at && o.status === "preparing").length,
      ready: visibleOrders.filter((o) => !o.trashed_at && o.status === "ready").length,
      delivering: visibleOrders.filter((o) => !o.trashed_at && o.status === "delivering").length,
      delivered: visibleOrders.filter((o) => !o.trashed_at && o.status === "delivered").length,
      cancelled: visibleOrders.filter((o) => !o.trashed_at && o.status === "cancelled").length,
      trashed: visibleOrders.filter((o) => !!o.trashed_at && o.status === "cancelled").length,
    }),
    [visibleOrders],
  );

  const todayRevenue = useMemo(
    () =>
      visibleOrders.filter((o) => !o.trashed_at && o.status === "delivered").reduce((s, o) => s + Number(o.total), 0),
    [visibleOrders],
  );

  // Tick every 30s so late-delivery banner refreshes without waiting for new realtime events
  const [, forceLateTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceLateTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const lateDeliveryOrders = useMemo(() => {
    if (deliveryTimeMinutes <= 0) return [] as typeof visibleOrders;
    const active = ["pending", "paid", "accepted", "preparing", "ready", "delivering"];
    const now = Date.now();
    return visibleOrders.filter(
      (o) =>
        !o.trashed_at &&
        o.delivery_type === "delivery" &&
        active.includes(o.status) &&
        (now - new Date(o.created_at).getTime()) / 60000 > deliveryTimeMinutes,
    );
  }, [visibleOrders, deliveryTimeMinutes]);

  const totalOrdersVisible = visibleOrders.filter((o) => !o.trashed_at).length;
  const averageTicket = totalOrdersVisible > 0 ? todayRevenue / totalOrdersVisible : 0;

  return (
    <div className="space-y-4">
      {/* Cash Register */}
      <CashRegister onChange={setCashRegisterOpen} storeIsOpen={customerSeesOpen} />

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1.6fr]">
        <div className="rounded-[24px] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Store size={18} className="text-primary" />
            <h3 className="text-[15px] font-bold text-foreground">Status da Loja</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div
              className={cn(
                "rounded-[18px] border p-5",
                customerSeesOpen
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-green-200 bg-green-50 text-green-700",
              )}
            >
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-white/70 p-2.5">
                  <Store size={18} />
                </div>
                <div>
                  <p className="text-lg font-extrabold">{customerSeesOpen ? "LOJA ABERTA" : "LOJA FECHADA"}</p>
                  {!customerSeesOpen && nextOpeningText && (
                    <p className="mt-1 text-sm font-medium text-muted-foreground">{nextOpeningText.replace("(", "").replace(")", "")}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-[18px] border border-border bg-background p-5">
              <BrasiliaClock />
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Zap size={18} className="text-primary" />
            <h3 className="text-[15px] font-bold text-foreground">Ações Rápidas</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <button
              onClick={requestToggleConfirmation}
              aria-busy={togglingStore}
              className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] border border-border bg-background px-4 py-4 text-sm font-semibold text-green-600 hover:bg-muted"
            >
              <Power size={22} />
              <span>{customerSeesOpen ? "Fechar Loja" : "Abrir Loja"}</span>
            </button>
            <button
              onClick={() => navigate("/admin/novo-pedido")}
              className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] border border-border bg-background px-4 py-4 text-sm font-semibold text-orange-500 hover:bg-muted"
            >
              <Plus size={22} />
              <span>Novo Pedido</span>
            </button>
            <button
              onClick={openKitchenWindow}
              className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] border border-border bg-background px-4 py-4 text-sm font-semibold text-orange-500 hover:bg-muted"
            >
              <ChefHat size={22} />
              <span>Cozinha</span>
            </button>
            <button
              onClick={() => setShowFeeQuery(true)}
              className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] border border-border bg-background px-4 py-4 text-sm font-semibold text-violet-600 hover:bg-muted"
            >
              <MapPin size={22} />
              <span>Consultar Taxa</span>
            </button>
            <button
              onClick={() => {
                fetchOrders();
                toast({ title: " Pedidos atualizados!" });
              }}
              className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] border border-border bg-background px-4 py-4 text-sm font-semibold text-blue-600 hover:bg-muted"
            >
              <RefreshCw size={22} />
              <span>Atualizar</span>
            </button>
            <button
              onClick={() => setShowExpenseManager(true)}
              className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] border border-border bg-background px-4 py-4 text-sm font-semibold text-violet-600 hover:bg-muted"
            >
              <Wallet size={22} />
              <span>Gastos</span>
            </button>
            <button
              onClick={() => setShowCalculator(true)}
              className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] border border-border bg-background px-4 py-4 text-sm font-semibold text-violet-600 hover:bg-muted"
            >
              <Calculator size={22} />
              <span>Calculadora</span>
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-border bg-background px-4 py-3">
            <PrintModeSelector />
            <div className="flex items-center gap-4 text-sm">
              <div className="text-muted-foreground">
                <span className="font-bold text-foreground">{totalOrdersVisible}</span> pedidos
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                Faturamento:
                <span className="font-bold text-green-600">
                  {valuesVisible ? `R$ ${todayRevenue.toFixed(2).replace(".", ",")}` : "R$ •••••"}
                </span>
                <button onClick={() => setValuesVisible((v) => !v)} className="rounded p-1 hover:bg-muted">
                  {valuesVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Date Picker + Search + Reports menu */}
      {/* Date Picker + Search + Reports menu */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-[200px] justify-start text-left font-medium", !selectedDate && "text-muted-foreground")}
            >
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
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nº pedido, nome, telefone, endereço..."
            autoComplete="off"
            name="dashboard-search-nofill"
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Relatórios — agrupa Reimprimir, Período e Entregas */}
        <Popover open={showReportsMenu} onOpenChange={setShowReportsMenu}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted">
              <FileText size={16} />
              Relatórios
              <ChevronDown size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-1">
            <button
              onClick={() => {
                setShowReportsMenu(false);
                requireReportPassword(reprintDailyReport);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <Printer size={15} /> Reimprimir Relatório
            </button>
            <button
              onClick={() => {
                setShowReportsMenu(false);
                setShowPeriodReport((v) => !v);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <FileText size={15} /> Relatório de Período
            </button>
            <button
              onClick={() => {
                setShowReportsMenu(false);
                setShowDeliveryReport((v) => !v);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <Truck size={15} /> Relatório de Entregas
            </button>
          </PopoverContent>
        </Popover>
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
                <Calendar
                  mode="single"
                  selected={periodFrom}
                  onSelect={(d) => d && setPeriodFrom(d)}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
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
                <Calendar
                  mode="single"
                  selected={periodTo}
                  onSelect={(d) => d && setPeriodTo(d)}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
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
              onChange={(e) => setDeliveryReportCourierId(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground min-w-[180px]"
            >
              <option value="">Selecione...</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (R$ {c.fixed_fee.toFixed(2).replace(".", ",")})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Modo</label>
            <select
              value={deliveryReportMode}
              onChange={(e) => setDeliveryReportMode(e.target.value as "daily" | "period")}
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
                    <Calendar
                      mode="single"
                      selected={deliveryPeriodFrom}
                      onSelect={(d) => d && setDeliveryPeriodFrom(d)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
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
                    <Calendar
                      mode="single"
                      selected={deliveryPeriodTo}
                      onSelect={(d) => d && setDeliveryPeriodTo(d)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
          <Button
            onClick={() => requireReportPassword(printDeliveryReport)}
            disabled={
              !deliveryReportCourierId ||
              (deliveryReportMode === "period" && (!deliveryPeriodFrom || !deliveryPeriodTo))
            }
          >
            <Printer size={16} />
            Imprimir Relatório de Entregas
          </Button>
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
              <div className="flex justify-between">
                <span>Pedidos entregues:</span>
                <span className="font-bold">{stats.delivered}</span>
              </div>
              <div className="flex justify-between">
                <span>Faturamento bruto:</span>
                <span className="font-bold text-green-600">R$ {todayRevenue.toFixed(2).replace(".", ",")}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseDay(false)}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseDay}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white"
              >
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
              <AlertDialogTitle>{customerSeesOpen ? "Fechar a loja?" : "Abrir a loja?"}</AlertDialogTitle>
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

      {lateDeliveryOrders.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-red-600 bg-red-50 px-4 py-3 text-red-900 animate-pulse">
          <AlertTriangle size={20} className="shrink-0 text-red-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold">🚨 {lateDeliveryOrders.length} entrega(s) em ATRASO</p>
            <p className="text-xs font-semibold">
              Pedidos:{" "}
              {lateDeliveryOrders
                .slice(0, 6)
                .map((o) => `#${String(o.order_number).padStart(5, "0")}`)
                .join(", ")}
              {lateDeliveryOrders.length > 6 ? ` +${lateDeliveryOrders.length - 6}` : ""} · prazo: {deliveryTimeMinutes}
              min
            </p>
          </div>
          <button
            onClick={() => setActiveTab("delivering")}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
          >
            Ver
          </button>
        </div>
      )}

      <div className="flex w-full flex-wrap gap-1.5 pb-1 sm:gap-2">
        {tabs.map((tab) => {
          const count = stats[tab.key as keyof typeof stats] || 0;
          const isActive = activeTab === tab.key;
          const isPendingWithOrders = tab.key === "pending" && count > 0;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex min-w-0 flex-1 basis-0 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[11px] font-semibold transition-all sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm ${
                isActive ? `${tab.color} text-white` : "bg-card border border-border text-foreground hover:bg-muted"
              } ${isPendingWithOrders ? "animate-pulse ring-2 ring-amber-400 ring-offset-1" : ""}`}
            >
              <tab.icon size={14} className="shrink-0" />
              <span className="truncate">{tab.label}</span>
              {count > 0 && (
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold sm:text-xs ${
                    isActive
                      ? "bg-white/20 text-white"
                      : isPendingWithOrders
                        ? "bg-amber-500 text-white"
                        : "bg-muted text-foreground"
                  }`}
                >
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
          <p className="text-sm">
            {searchQuery ? "Nenhum pedido encontrado para essa busca" : "Nenhum pedido nesta categoria"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => {
            const next = order.status === "awaiting_payment" ? null : getNextStatusForOrder(order);
            const elapsed = order.status === "preparing" ? getElapsed(order.preparing_at) : null;
            const profile = profiles[order.user_id];
            const customerCode = profile?.customer_code ? `T${String(profile.customer_code).padStart(5, "0")}` : "";
            const isEditing = editingOrder === order.id;
            const tableCode = getTableCode(order);
            const displayObservation = cleanOrderObservation(order.observations);
            // Auto-load items so every card shows full info without a click
            if (!items[order.id]) void fetchItems(order.id);

            // Late delivery detection: delivery-type orders that aren't yet delivered/cancelled
            // and have exceeded the configured delivery time.
            const activeDeliveryStatuses = ["pending", "paid", "accepted", "preparing", "ready", "delivering"];
            const isDelivery = order.delivery_type === "delivery";
            const isLateDelivery =
              isDelivery &&
              activeDeliveryStatuses.includes(order.status) &&
              deliveryTimeMinutes > 0 &&
              (Date.now() - new Date(order.created_at).getTime()) / 60000 > deliveryTimeMinutes;
            const lateMinutes = isLateDelivery
              ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000) - deliveryTimeMinutes
              : 0;

            return (
              <div
                key={order.id}
                className={`flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden ${
                  isLateDelivery
                    ? "border-red-600 border-2 animate-pulse"
                    : order.status === "pending" || order.status === "paid"
                      ? "border-amber-500 border-2 animate-pulse"
                      : order.status === "ready" && order.courier_id
                        ? "border-red-500 border-2 animate-pulse"
                        : "border-border"
                }`}
              >
                <div className="flex items-start gap-3 p-4 border-b border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-foreground">
                        {tableCode || `#${String(order.order_number).padStart(5, "0")}`}
                      </span>
                      {customerCode && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          CLIENTE: {customerCode}
                        </span>
                      )}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {order.delivery_type === "delivery"
                          ? "DELIVERY"
                          : order.delivery_type === "mesa"
                            ? "MESA"
                            : order.delivery_type === "viagem"
                              ? "VIAGEM"
                              : order.delivery_type === "consumo"
                                ? "CONSUMO"
                                : "RETIRADA"}
                      </span>
                      {order.status === "paid" && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                          PAGO
                        </span>
                      )}
                      {order.status === "ready" && order.courier_id && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 animate-pulse">
                          DEVOLVIDO
                        </span>
                      )}
                      {isLateDelivery && (
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white animate-pulse">
                          🚨 ENTREGA EM ATRASO {lateMinutes > 0 ? `+${lateMinutes}min` : ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {getPaymentDisplay(order.payment_method, order.payment_confirmed)}
                      {profile?.full_name ? ` · ${profile.full_name}` : ""}
                    </p>
                  </div>

                  {elapsed && (
                    <div
                      className={`rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums ${
                        elapsed.min >= 20
                          ? "bg-red-600 text-white animate-pulse"
                          : elapsed.min >= 15
                            ? "bg-amber-500 text-white"
                            : "bg-green-600 text-white"
                      }`}
                    >
                      {elapsed.min}:{String(elapsed.sec).padStart(2, "0")}
                    </div>
                  )}

                  <span className="text-sm font-bold text-foreground">
                    R$ {Number(order.total).toFixed(2).replace(".", ",")}
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
                          <select
                            value={editData.delivery_type}
                            onChange={(e) => setEditData((d) => ({ ...d, delivery_type: e.target.value }))}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                          >
                            <option value="delivery">Delivery</option>
                            <option value="pickup">Retirada</option>
                            <option value="mesa">Mesa</option>
                            <option value="viagem">Viagem</option>
                            <option value="consumo">Consumo</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Pagamento</label>
                          <select
                            value={editData.payment_method}
                            onChange={(e) => setEditData((d) => ({ ...d, payment_method: e.target.value }))}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                          >
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
                          <input
                            type="number"
                            step="0.01"
                            value={editData.discount || 0}
                            onChange={(e) => setEditData((d) => ({ ...d, discount: Number(e.target.value) }))}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Taxa Entrega (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editData.delivery_fee ?? 0}
                            onChange={(e) => setEditData((d) => ({ ...d, delivery_fee: Number(e.target.value) }))}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Bairro</label>
                          <input
                            type="text"
                            value={editData.address_neighborhood || ""}
                            onChange={(e) => setEditData((d) => ({ ...d, address_neighborhood: e.target.value }))}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Rua</label>
                        <input
                          type="text"
                          value={editData.address_street || ""}
                          onChange={(e) => setEditData((d) => ({ ...d, address_street: e.target.value }))}
                          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Número</label>
                          <input
                            type="text"
                            value={editData.address_number || ""}
                            onChange={(e) => setEditData((d) => ({ ...d, address_number: e.target.value }))}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Complemento</label>
                          <input
                            type="text"
                            value={editData.address_complement || ""}
                            onChange={(e) => setEditData((d) => ({ ...d, address_complement: e.target.value }))}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Observações</label>
                        <textarea
                          value={editData.observations || ""}
                          onChange={(e) => setEditData((d) => ({ ...d, observations: e.target.value }))}
                          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                          rows={2}
                        />
                      </div>

                      {/* Items editing */}
                      <div className="space-y-2">
                        <h5 className="text-[10px] font-bold text-muted-foreground uppercase">Itens do Pedido</h5>
                        {editItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 rounded border border-border bg-background p-2"
                          >
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => updateEditItem(item.id, "quantity", Math.max(1, Number(e.target.value)))}
                              className="w-12 rounded border border-border bg-background px-1.5 py-1 text-xs text-center text-foreground"
                            />
                            <span className="text-xs text-muted-foreground">×</span>
                            <input
                              type="text"
                              value={item.product_name}
                              onChange={(e) => updateEditItem(item.id, "product_name", e.target.value)}
                              className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground min-w-0"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => updateEditItem(item.id, "unit_price", Number(e.target.value))}
                              className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                              title="Preço unitário"
                            />
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              = R$ {(Number(item.unit_price) * item.quantity).toFixed(2).replace(".", ",")}
                            </span>
                            <button
                              onClick={() => removeEditItem(item.id)}
                              className="text-destructive hover:text-destructive/80 p-0.5"
                              title="Remover item"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}

                        {/* Add new item */}
                        <div className="rounded border border-dashed border-primary/40 bg-primary/5 p-2 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                placeholder="Adicionar produto..."
                                value={addItemName}
                                onChange={(e) => {
                                  setAddItemName(e.target.value);
                                  searchProducts(e.target.value);
                                }}
                                className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                              />
                              {productSuggestions.length > 0 && (
                                <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border bg-card shadow-lg max-h-32 overflow-y-auto">
                                  {productSuggestions.map((p, i) => (
                                    <button
                                      key={i}
                                      onClick={() => {
                                        setAddItemName(p.name);
                                        setAddItemPrice(p.price);
                                        setProductSuggestions([]);
                                      }}
                                      className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-muted flex justify-between"
                                    >
                                      <span>{p.name}</span>
                                      <span className="text-muted-foreground">
                                        R$ {p.price.toFixed(2).replace(".", ",")}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input
                              type="number"
                              min={1}
                              value={addItemQty}
                              onChange={(e) => setAddItemQty(Math.max(1, Number(e.target.value)))}
                              className="w-12 rounded border border-border bg-background px-1.5 py-1 text-xs text-center text-foreground"
                              title="Quantidade"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={addItemPrice}
                              onChange={(e) => setAddItemPrice(Number(e.target.value))}
                              className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                              placeholder="R$"
                              title="Preço unitário"
                            />
                            <button
                              onClick={addNewItem}
                              disabled={!addItemName.trim()}
                              className="rounded-lg bg-primary p-1.5 text-primary-foreground disabled:opacity-40"
                              title="Adicionar item"
                            >
                              <PlusCircle size={14} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Totals preview */}
                      <div className="rounded-lg bg-muted/50 p-2 space-y-0.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal (itens)</span>
                          <span className="font-bold text-foreground">
                            R$ {calcEditSubtotal().toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">+ Entrega</span>
                          <span className="text-foreground">
                            R${" "}
                            {Number(editData.delivery_fee ?? 0)
                              .toFixed(2)
                              .replace(".", ",")}
                          </span>
                        </div>
                        {(editData.discount || 0) > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">- Desconto</span>
                            <span className="text-green-600">
                              R${" "}
                              {Number(editData.discount || 0)
                                .toFixed(2)
                                .replace(".", ",")}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-sm">
                          <span className="text-foreground">Total</span>
                          <span className="text-primary">
                            R${" "}
                            {(calcEditSubtotal() + Number(editData.delivery_fee ?? 0) - Number(editData.discount || 0))
                              .toFixed(2)
                              .replace(".", ",")}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => saveEdit(order.id)}
                          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                        >
                          <Save size={14} /> Salvar
                        </button>
                        <button
                          onClick={() => saveEdit(order.id, true)}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                        >
                          <Printer size={14} /> Salvar e Reimprimir
                        </button>
                        <button
                          onClick={() => setEditingOrder(null)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
                        >
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
                      {displayObservation && (
                        <p className="text-xs text-amber-600 font-medium">💬 {displayObservation}</p>
                      )}
                    </>
                  )}

                  <div className="space-y-1">
                    {(items[order.id] || []).map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">
                          {item.quantity}x {item.product_name}
                        </span>
                        <span className="text-muted-foreground">
                          R$ {(Number(item.unit_price) * item.quantity).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Show courier info for delivering orders */}
                  {order.status === "delivering" && order.courier_id && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {couriers.find((c) => c.id === order.courier_id)?.name || "Entregador"}
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
                    <button
                      onClick={() => printReceipt(order.id, "pedido")}
                      className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      <Printer size={14} /> Pedido
                    </button>
                    <button
                      onClick={() => printReceipt(order.id, "obrigado")}
                      className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      <Printer size={14} /> Obrigado
                    </button>
                    {/* Manual reprint of "Fechamento de Rota" is always available */}
                    <button
                      onClick={() => printReceipt(order.id, "entregador")}
                      className="flex items-center gap-1 rounded-lg border border-cyan-500 px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-50"
                    >
                      <Printer size={14} /> Fechamento de Rota
                    </button>
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(order)}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                      >
                        <Edit2 size={14} /> Editar
                      </button>
                    )}
                  </div>

                  {/* Payment actions */}
                  <div className="flex flex-wrap gap-2">
                    {order.payment_method !== "fiado" && order.status !== "cancelled" && (
                      <button
                        onClick={() => markAsFiado(order.id)}
                        className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        📝 Marcar Fiado
                      </button>
                    )}
                    {order.payment_confirmed && order.status !== "awaiting_payment" && (
                      <span className="flex items-center gap-1 rounded-lg bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700">
                        {getPaymentDisplay(order.payment_method, order.payment_confirmed)}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {next && (
                      <button
                        onClick={() => updateStatus(order.id, next)}
                        className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
                      >
                        {next === "preparing"
                          ? " Aceitar Pedido"
                          : next === "delivered"
                            ? "Finalizar"
                            : `Avançar → ${tabs.find((t) => t.key === next)?.label}`}
                      </button>
                    )}
                    {order.status !== "cancelled" && (
                      <button
                        onClick={() => {
                          setCancellingOrderId(order.id);
                          setCancellationReason("");
                        }}
                        className="rounded-lg border border-destructive px-4 py-2.5 text-sm font-bold text-destructive"
                      >
                        Recusar
                      </button>
                    )}
                    {order.status === "cancelled" && !order.trashed_at && (
                      <>
                        <button
                          onClick={() => recuperarPedidoCancelado(order)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-500 py-2.5 text-sm font-bold text-blue-700"
                        >
                          <RotateCcw size={14} /> Recuperar
                        </button>
                        <button
                          onClick={async () => {
                            if (
                              !window.confirm(
                                "Mover este pedido para a lixeira? Ele deixará de aparecer em 'Recusados' e não será contabilizado.",
                              )
                            )
                              return;
                            const { error } = await supabase
                              .from("orders")
                              .update({ trashed_at: new Date().toISOString() })
                              .eq("id", order.id);
                            if (error) {
                              toast({ title: "Erro ao mover para a lixeira", variant: "destructive" });
                              return;
                            }
                            toast({ title: "🗑️ Pedido movido para a lixeira" });
                            fetchOrders();
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-500 py-2.5 text-sm font-bold text-gray-700"
                        >
                          <Trash2 size={14} /> Excluir
                        </button>
                      </>
                    )}
                    {order.status === "cancelled" && order.trashed_at && (
                      <button
                        onClick={() => recuperarPedidoCancelado(order)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-500 py-2.5 text-sm font-bold text-blue-700"
                      >
                        <RotateCcw size={14} /> Recuperar
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
            <h3 className="text-lg font-bold text-foreground"> Recusar Pedido</h3>
            <p className="text-sm text-muted-foreground">Informe o motivo da recusa para o cliente:</p>
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="Ex: Ingrediente em falta, fora da área de entrega..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              rows={3}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setCancellingOrderId(null)}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground"
              >
                Voltar
              </button>
              <button
                disabled={!cancellationReason.trim()}
                onClick={async () => {
                  const orderToCancel = orders.find((order) => order.id === cancellingOrderId);

                  if (!orderToCancel) {
                    toast({ title: "Pedido não encontrado", variant: "destructive" });
                    setCancellingOrderId(null);
                    return;
                  }

                  const { error } = await supabase
                    .from("orders")
                    .update({
                      status: "cancelled",
                      cancellation_reason: cancellationReason.trim(),
                      observations: withStatusBeforeCancelMarker(orderToCancel, cancellationReason.trim()),
                    })
                    .eq("id", cancellingOrderId);

                  if (error) {
                    toast({ title: "Erro ao recusar pedido", description: error.message, variant: "destructive" });
                    return;
                  }

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
            <h3 className="text-lg font-bold text-foreground"> Selecionar Entregador</h3>
            <p className="text-sm text-muted-foreground">Escolha o entregador para esta entrega:</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {couriers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCourierId(c.id)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left text-sm font-semibold transition-all",
                    selectedCourierId === c.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground hover:bg-muted",
                  )}
                >
                  {c.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (R$ {c.fixed_fee.toFixed(2).replace(".", ",")}/entrega)
                  </span>
                </button>
              ))}
              {couriers.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum entregador cadastrado. Cadastre em Entregas.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setCourierSelectOrderId(null)}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground"
              >
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
            <h3 className="text-lg font-bold text-foreground"> Senha do Administrador</h3>
            <p className="text-sm text-muted-foreground">Digite a senha para imprimir o relatório.</p>
            <input
              type="password"
              value={reportPwInput}
              onChange={(e) => {
                setReportPwInput(e.target.value);
                setReportPwError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleReportPwSubmit()}
              placeholder=""
              autoComplete="new-password"
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            {reportPwError && <p className="text-xs text-destructive font-medium">Senha incorreta</p>}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReportPwModal(false);
                  setPendingReportAction(null);
                }}
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
      {showRouteClosureModal &&
        (() => {
          const closureOrder = orders.find((o) => o.id === showRouteClosureModal);
          const isReturned = closureOrder?.status === "ready" && !!closureOrder?.courier_id;
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
              <div className="w-full max-w-sm rounded-2xl bg-card p-6 space-y-4 mx-4">
                <h3 className="text-lg font-bold text-foreground">
                  {isReturned ? " Pedido Devolvido" : "📋 Fechamento de Rota"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isReturned ? (
                    <>
                      O pedido foi <span className="font-bold text-foreground">devolvido</span>?
                    </>
                  ) : (
                    <>
                      Foi realizado o <span className="font-bold text-foreground">Fechamento de Rota</span>?
                    </>
                  )}
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
      {trackingCourierId &&
        (() => {
          const trackingOrder = orders.find((o) => o.courier_id === trackingCourierId && o.status === "delivering");
          return (
            <Suspense
              fallback={
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
                  <p className="text-white">Carregando mapa...</p>
                </div>
              }
            >
              <CourierTrackingModal
                courierId={trackingCourierId}
                courierName={couriers.find((c) => c.id === trackingCourierId)?.name || "Entregador"}
                destinationAddress={
                  trackingOrder
                    ? `${trackingOrder.address_street || ""} ${trackingOrder.address_number || ""}`.trim()
                    : undefined
                }
                destinationNeighborhood={trackingOrder?.address_neighborhood || undefined}
                onClose={() => setTrackingCourierId(null)}
              />
            </Suspense>
          );
        })()}

      {showExpenseManager && (
        <ExpenseManager selectedDate={selectedDate} onClose={() => setShowExpenseManager(false)} />
      )}

      <CalculatorModal open={showCalculator} onClose={() => setShowCalculator(false)} />
      <NeighborhoodFeeQueryModal open={showFeeQuery} onClose={() => setShowFeeQuery(false)} />
    </div>
  );
};

export default AdminDashboard;
