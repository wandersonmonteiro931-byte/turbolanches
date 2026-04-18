import { useEffect, useMemo, useState, useCallback } from "react";
import { Wallet, Lock, Unlock, RefreshCw, AlertTriangle, CheckCircle2, History, Printer, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatBusinessDate, getBusinessDayRange, getTodayBusinessDay } from "@/lib/businessDay";
import { formatDateTimeBR, nowBrasilia } from "@/lib/brasiliaTime";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { roundMoney } from "@/components/admin/pricing/pricingMoney";

interface CashRegister {
  id: string;
  store_id: string | null;
  business_day: string;
  status: "open" | "closed";
  opened_at: string;
  opened_by: string;
  opening_cash: number;
  opening_card: number;
  opening_change_reserve: number;
  closed_at: string | null;
  closed_by: string | null;
  expense_employees: number;
  expense_couriers: number;
  expense_purchases: number;
  expense_gasoline: number;
  expense_ads: number;
  expense_other: number;
  closing_pix: number;
  closing_card: number;
  closing_cash: number;
  reopen_count: number;
  last_reopened_at: string | null;
  notes: string;
}

interface PaymentBreakdown {
  pix: number;
  card: number;
  cash: number;
  other: number;
  total: number;
}

const fmt = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

// Module-level cache so navigating between admin sections doesn't re-show
// "Carregando caixa..." every time the Dashboard remounts.
const registerCache = new Map<string, CashRegister>();

function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

interface Props {
  /** Called whenever register state changes so dashboard can refresh gating */
  onChange?: (isOpen: boolean) => void;
  /** Whether the storefront is currently open — used to trigger the "don't forget to close" blink */
  storeIsOpen?: boolean;
}

export default function CashRegister({ onChange, storeIsOpen = true }: Props) {
  const { storeId } = useStore();
  const { user } = useAuth();
  const { toast } = useToast();

  const [register, setRegister] = useState<CashRegister | null>(() => {
    return storeId ? registerCache.get(storeId) || null : null;
  });
  const [loading, setLoading] = useState(() => {
    return !(storeId && registerCache.has(storeId));
  });
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<CashRegister[]>([]);
  const [editingReg, setEditingReg] = useState<CashRegister | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [paymentTotals, setPaymentTotals] = useState<PaymentBreakdown>({
    pix: 0, card: 0, cash: 0, other: 0, total: 0,
  });
  const [productsCostInfo, setProductsCostInfo] = useState<{ totalCost: number; missingCount: number; totalProducts: number }>({
    totalCost: 0, missingCount: 0, totalProducts: 0,
  });
  const [orderStats, setOrderStats] = useState<{ completed: number; cancelled: number }>({ completed: 0, cancelled: 0 });
  const [topItems, setTopItems] = useState<{ name: string; qty: number }[]>([]);
  const [autoCouriers, setAutoCouriers] = useState<{ total: number; breakdown: { name: string; fee: number }[] }>({ total: 0, breakdown: [] });

  // Live clock — updates every second for the open-time counter and current date/time labels
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Storage keys (per store) — persist drafts across reloads/closes
  const openDraftKey = `cashRegister:openDraft:${storeId || "default"}`;
  const closeDraftKey = `cashRegister:closeDraft:${storeId || "default"}`;

  const defaultOpenForm = { cash: "0", card: "0", change_reserve: "0", notes: "", responsible_name: "" };
  const defaultCloseForm = {
    expense_employees: "0",
    expense_couriers: "0",
    expense_purchases: "0",
    expense_gasoline: "0",
    expense_ads: "0",
    expense_other: "0",
    closing_pix: "0",
    closing_card: "0",
    closing_cash: "0",
    notes: "",
    responsible_name: "",
  };

  const loadDraft = <T,>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return { ...fallback, ...JSON.parse(raw) };
    } catch {
      return fallback;
    }
  };

  // Open form
  const [openForm, setOpenForm] = useState(() => loadDraft(openDraftKey, defaultOpenForm));

  // Close form
  const [closeForm, setCloseForm] = useState(() => loadDraft(closeDraftKey, defaultCloseForm));

  // Persist drafts on every change
  useEffect(() => {
    try { localStorage.setItem(openDraftKey, JSON.stringify(openForm)); } catch {}
  }, [openForm, openDraftKey]);

  useEffect(() => {
    try { localStorage.setItem(closeDraftKey, JSON.stringify(closeForm)); } catch {}
  }, [closeForm, closeDraftKey]);

  // Reload drafts when storeId becomes available (avoid losing data on first mount)
  useEffect(() => {
    if (!storeId) return;
    setOpenForm((prev) => loadDraft(openDraftKey, prev));
    setCloseForm((prev) => loadDraft(closeDraftKey, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Memoize so it doesn't change on every render (avoiding fetchRegister recreation loop)
  const todayBusinessDay = useMemo(() => formatBusinessDate(nowBrasilia()), [
    // Recompute only when the date actually changes (not the second-by-second clock)
    new Date(now).toDateString(),
  ]);

  /** Fetch today's register, plus the previous day's if it's still open (must close first) */
  const fetchRegister = useCallback(async () => {
    if (!storeId) {
      setRegister(null);
      setLoading(false);
      return;
    }
    // If we have a cached value, keep showing it (no spinner) and refresh in background
    const cached = registerCache.get(storeId);
    if (!cached) setLoading(true);

    try {
      const { data, error } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("store_id", storeId)
        .order("business_day", { ascending: false })
        .limit(5);

      if (error) {
        console.error("[CashRegister] fetch error:", error);
        setLoading(false);
        return;
      }

      const list = (data || []) as CashRegister[];
      const today = list.find((r) => r.business_day === todayBusinessDay);
      const previousOpen = list.find((r) => r.business_day !== todayBusinessDay && r.status === "open");

      const next = previousOpen || today || null;
      if (next) registerCache.set(storeId, next);
      else registerCache.delete(storeId);
      setRegister(next);
    } catch (e) {
      console.error("[CashRegister] fetch exception:", e);
    } finally {
      setLoading(false);
    }
  }, [storeId, todayBusinessDay]);

  // Safety: never hang on "Carregando caixa…" forever — force release after 5s
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(t);
  }, [loading]);

  /** Compute the day's payment breakdown based on delivered orders */
  const fetchPaymentTotals = useCallback(async (businessDay: string) => {
    if (!storeId) return;
    const { start, end } = getBusinessDayRange(new Date(businessDay + "T12:00:00"));
    // Buscar TODOS os pedidos do dia (incluindo cancelados) para estatísticas
    // IMPORTANTE: ignora pedidos na lixeira (trashed_at) em qualquer cálculo
    const { data: allOrdersRaw } = await supabase
      .from("orders")
      .select("id, payment_method, total, status, courier_id, delivery_fee, delivery_type, trashed_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .eq("store_id", storeId)
      .is("trashed_at", null);

    const allOrdersData = (allOrdersRaw || []).filter((o: any) => !o.trashed_at);
    const completedStatuses = ["delivered", "ready", "delivering", "preparing"];
    const ordersData = allOrdersData.filter((o: any) => completedStatuses.includes(o.status));
    const cancelledCount = allOrdersData.filter((o: any) => o.status === "cancelled").length;

    const totals: PaymentBreakdown = { pix: 0, card: 0, cash: 0, other: 0, total: 0 };
    const orderIds: string[] = [];
    const courierIds = new Set<string>();
    const courierDeliveryFees = new Map<string, number>(); // soma das taxas dos pedidos entregues por entregador
    ordersData.forEach((o: any) => {
      orderIds.push(o.id);
      if (o.courier_id) {
        courierIds.add(o.courier_id);
        // Apenas pedidos delivery realmente entregues contam para a taxa
        if (o.status === "delivered" && String(o.delivery_type || "delivery") === "delivery") {
          const fee = Number(o.delivery_fee) || 0;
          courierDeliveryFees.set(o.courier_id, (courierDeliveryFees.get(o.courier_id) || 0) + fee);
        }
      }
      const m = String(o.payment_method || "").toLowerCase();
      const t = Number(o.total) || 0;
      totals.total += t;
      // Qualquer variante PIX (pix, pix_pago, pix_entrega, pix_online…) entra como PIX
      if (m.includes("pix")) totals.pix += t;
      else if (m.includes("card") || m.includes("cart") || m.includes("debit") || m.includes("credit") || m.includes("maquin")) totals.card += t;
      else if (m.includes("dinheiro") || m === "cash" || m === "money") totals.cash += t;
      else totals.other += t;
    });
    setPaymentTotals(totals);
    setOrderStats({ completed: ordersData.length, cancelled: cancelledCount });

    // ===== Cálculo AUTOMÁTICO da despesa de entregadores =====
    // Para cada entregador único que fez entrega no dia, soma a taxa fixa do
    // dia da semana (courier_daily_fees) ou cai para couriers.fixed_fee.
    if (courierIds.size > 0) {
      const dayOfWeek = new Date(businessDay + "T12:00:00").getDay(); // 0 = domingo
      const ids = [...courierIds];
      const [couriersRes, dailyFeesRes] = await Promise.all([
        supabase.from("couriers").select("id, name, fixed_fee").in("id", ids),
        supabase.from("courier_daily_fees").select("courier_id, fixed_fee").in("courier_id", ids).eq("day_of_week", dayOfWeek),
      ]);
      const dailyMap = new Map<string, number>();
      (dailyFeesRes.data || []).forEach((r: any) => dailyMap.set(r.courier_id, Number(r.fixed_fee) || 0));
      let totalCouriers = 0;
      const breakdown: { name: string; fee: number }[] = [];
      (couriersRes.data || []).forEach((c: any) => {
        const dailyFee = dailyMap.get(c.id);
        // Diária do dia (com fallback para fixed_fee do cadastro)
        const dailyBase = dailyFee != null && dailyFee > 0 ? dailyFee : (Number(c.fixed_fee) || 0);
        // Soma das taxas dos pedidos entregues por este entregador no dia
        const deliveryFees = courierDeliveryFees.get(c.id) || 0;
        const fee = roundMoney(dailyBase + deliveryFees);
        totalCouriers += fee;
        breakdown.push({ name: c.name, fee });
      });
      setAutoCouriers({ total: roundMoney(totalCouriers), breakdown });
    } else {
      setAutoCouriers({ total: 0, breakdown: [] });
    }


    // Compute Cost of Goods Sold (COGS) for the day
    if (orderIds.length === 0) {
      setProductsCostInfo({ totalCost: 0, missingCount: 0, totalProducts: 0 });
      setTopItems([]);
      return;
    }
    const { data: itemsData } = await supabase
      .from("order_items")
      .select("product_id, product_name, quantity")
      .in("order_id", orderIds);

    const productQty = new Map<string, number>();
    const nameQty = new Map<string, number>();
    let totalUnits = 0;
    (itemsData || []).forEach((it: any) => {
      const q = Number(it.quantity) || 0;
      totalUnits += q;
      const name = String(it.product_name || "Item").trim();
      nameQty.set(name, (nameQty.get(name) || 0) + q);
      if (!it.product_id) return;
      productQty.set(it.product_id, (productQty.get(it.product_id) || 0) + q);
    });

    // Top 5 itens mais vendidos
    const top = [...nameQty.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));
    setTopItems(top);

    const productIds = [...productQty.keys()];
    if (productIds.length === 0) {
      setProductsCostInfo({ totalCost: 0, missingCount: 0, totalProducts: totalUnits });
      return;
    }

    const [prodRes, piRes] = await Promise.all([
      supabase.from("products").select("id, manual_cost, price").in("id", productIds),
      supabase.from("product_ingredients").select("product_id, ingredient_id, quantity").in("product_id", productIds),
    ]);

    const ingIds = [...new Set((piRes.data || []).map((r: any) => r.ingredient_id))];
    const ingMap = new Map<string, number>();
    if (ingIds.length > 0) {
      const { data: ingRows } = await supabase
        .from("ingredients").select("id, cost_per_unit").in("id", ingIds);
      (ingRows || []).forEach((i: any) => ingMap.set(i.id, Number(i.cost_per_unit) || 0));
    }

    const piByProduct = new Map<string, { ingredient_id: string; quantity: number }[]>();
    (piRes.data || []).forEach((r: any) => {
      const list = piByProduct.get(r.product_id) || [];
      list.push({ ingredient_id: r.ingredient_id, quantity: Number(r.quantity) || 0 });
      piByProduct.set(r.product_id, list);
    });

    let totalCost = 0;
    let missingUnits = 0;
    const fallbackRatio = 0.35; // estimativa: ~35% do preço quando não há custo cadastrado
    (prodRes.data || []).forEach((p: any) => {
      const qty = productQty.get(p.id) || 0;
      if (qty <= 0) return;
      const manualCost = Number(p.manual_cost) || 0;
      const recipe = piByProduct.get(p.id) || [];
      const recipeCost = recipe.reduce(
        (s, r) => s + (ingMap.get(r.ingredient_id) || 0) * r.quantity, 0
      );
      const unitCost = manualCost > 0 ? manualCost : recipeCost;
      if (unitCost > 0) {
        totalCost += unitCost * qty;
      } else {
        // Não cadastrado → estima como % do preço para não zerar
        totalCost += (Number(p.price) || 0) * fallbackRatio * qty;
        missingUnits += qty;
      }
    });

    setProductsCostInfo({
      totalCost: roundMoney(totalCost),
      missingCount: missingUnits,
      totalProducts: totalUnits,
    });
  }, [storeId]);

  useEffect(() => { fetchRegister(); }, [fetchRegister]);

  useEffect(() => {
    onChange?.(register?.status === "open" && register?.business_day === todayBusinessDay);
  }, [register, todayBusinessDay, onChange]);

  // Pre-fill close form with payment totals when opening modal
  useEffect(() => {
    if (showClose && register) {
      fetchPaymentTotals(register.business_day);
    }
  }, [showClose, register, fetchPaymentTotals]);

  // Auto-fill the declared balances with the EXPECTED totals (based on each
  // order's payment for the current business day) AND auto-fill the couriers
  // expense based on courier_daily_fees — but only if the user hasn't already
  // typed a value (keeps drafts intact).
  useEffect(() => {
    if (!showClose) return;
    setCloseForm((prev) => {
      const next = { ...prev };
      const isZero = (v: string) => !v || Number(v) === 0;
      if (isZero(prev.closing_pix) && paymentTotals.pix > 0) next.closing_pix = paymentTotals.pix.toFixed(2);
      if (isZero(prev.closing_card) && paymentTotals.card > 0) next.closing_card = paymentTotals.card.toFixed(2);
      if (isZero(prev.closing_cash) && paymentTotals.cash > 0) next.closing_cash = paymentTotals.cash.toFixed(2);
      if (isZero(prev.expense_couriers) && autoCouriers.total > 0) next.expense_couriers = autoCouriers.total.toFixed(2);
      return next;
    });
  }, [showClose, paymentTotals.pix, paymentTotals.card, paymentTotals.cash, autoCouriers.total]);


  const handleOpen = async () => {
    if (!storeId || !user) {
      toast({
        title: "Não foi possível abrir o caixa",
        description: !storeId ? "Loja não identificada." : "Usuário não autenticado.",
        variant: "destructive",
      });
      return;
    }
    if (!openForm.responsible_name?.trim()) {
      toast({
        title: "Responsável obrigatório",
        description: "Informe o nome de quem está abrindo o caixa.",
        variant: "destructive",
      });
      return;
    }
    // Block if previous day still open
    const { data: prev, error: prevErr } = await supabase
      .from("cash_registers")
      .select("business_day,status")
      .eq("store_id", storeId)
      .neq("business_day", todayBusinessDay)
      .eq("status", "open")
      .limit(1);
    if (prevErr) {
      console.error("[CashRegister] previous-day check error", prevErr);
    }
    if (prev && prev.length > 0) {
      toast({
        title: "Caixa anterior em aberto",
        description: `Feche o caixa de ${prev[0].business_day} antes de abrir um novo.`,
        variant: "destructive",
      });
      setShowOpen(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const payload = {
      store_id: storeId,
      business_day: todayBusinessDay,
      status: "open" as const,
      opened_by: user.id,
      opened_at: nowIso,
      opening_cash: Number(openForm.cash) || 0,
      opening_card: Number(openForm.card) || 0,
      opening_change_reserve: Number(openForm.change_reserve) || 0,
      notes: `[Aberto por: ${openForm.responsible_name.trim()}] ${openForm.notes || ""}`.trim(),
    };

    // Upsert into today's slot (handles reopen also)
    const { data: existing } = await supabase
      .from("cash_registers")
      .select("id,reopen_count")
      .eq("store_id", storeId)
      .eq("business_day", todayBusinessDay)
      .maybeSingle();

    let regId: string | null = null;
    if (existing) {
      // Reopen flow — only allowed before 6 AM next day, but today's record allowed
      const { error } = await supabase
        .from("cash_registers")
        .update({
          status: "open",
          last_reopened_at: new Date().toISOString(),
          reopen_count: (existing.reopen_count || 0) + 1,
        })
        .eq("id", existing.id);
      if (error) {
        toast({ title: "Erro ao reabrir caixa", description: error.message, variant: "destructive" });
        return;
      }
      regId = existing.id;
      await supabase.from("cash_register_events").insert({
        cash_register_id: regId,
        store_id: storeId,
        event_type: "reopen",
        performed_by: user.id,
        snapshot: payload,
      });
      toast({ title: "🔓 Caixa reaberto" });
    } else {
      const { data: ins, error } = await supabase
        .from("cash_registers")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast({ title: "Erro ao abrir caixa", description: error.message, variant: "destructive" });
        return;
      }
      regId = ins.id;
      await supabase.from("cash_register_events").insert({
        cash_register_id: regId,
        store_id: storeId,
        event_type: "open",
        performed_by: user.id,
        snapshot: payload,
      });
      toast({ title: "✅ Caixa aberto!" });
    }

    setShowOpen(false);
    setOpenForm(defaultOpenForm);
    try { localStorage.removeItem(openDraftKey); } catch {}
    await fetchRegister();
  };

  const handleClose = async () => {
    if (!storeId || !user || !register) return;
    if (!closeForm.responsible_name?.trim()) {
      toast({
        title: "Responsável obrigatório",
        description: "Informe o nome de quem está fechando o caixa.",
        variant: "destructive",
      });
      return;
    }
    const closerTag = `[Fechado por: ${closeForm.responsible_name.trim()}]`;
    const baseNotes = (register.notes || "").includes("[Fechado por:")
      ? (register.notes || "").replace(/\[Fechado por:[^\]]*\]/, closerTag)
      : `${register.notes || ""} ${closerTag}`.trim();
    const payload = {
      status: "closed" as const,
      closed_at: new Date().toISOString(),
      closed_by: user.id,
      expense_employees: Number(closeForm.expense_employees) || 0,
      expense_couriers: Number(closeForm.expense_couriers) || 0,
      expense_purchases: Number(closeForm.expense_purchases) || 0,
      expense_gasoline: Number(closeForm.expense_gasoline) || 0,
      expense_ads: Number(closeForm.expense_ads) || 0,
      expense_other: Number(closeForm.expense_other) || 0,
      closing_pix: Number(closeForm.closing_pix) || 0,
      closing_card: Number(closeForm.closing_card) || 0,
      closing_cash: Number(closeForm.closing_cash) || 0,
      notes: `${baseNotes} ${closeForm.notes || ""}`.trim(),
    };
    const { error } = await supabase
      .from("cash_registers")
      .update(payload)
      .eq("id", register.id);
    if (error) {
      toast({ title: "Erro ao fechar caixa", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("cash_register_events").insert({
      cash_register_id: register.id,
      store_id: storeId,
      event_type: "close",
      performed_by: user.id,
      snapshot: payload,
    });
    toast({ title: "🔒 Caixa fechado!" });
    setShowClose(false);
    try { localStorage.removeItem(closeDraftKey); } catch {}
    setCloseForm(defaultCloseForm);
    await fetchRegister();
    // Imprime relatório automaticamente após fechar
    const reportData: CashRegister = {
      ...register,
      ...payload,
    } as CashRegister;
    printRegisterReport(reportData, paymentTotals, closeSummary, orderStats, topItems);
  };

  /** Fetch history of all registers */
  const fetchHistory = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("cash_registers")
      .select("*")
      .eq("store_id", storeId)
      .order("business_day", { ascending: false })
      .limit(120);
    setHistory((data || []) as CashRegister[]);
  }, [storeId]);

  useEffect(() => { if (showHistory) fetchHistory(); }, [showHistory, fetchHistory]);

  /** Reprint a saved register */
  const reprintRegister = async (reg: CashRegister) => {
    const { start, end } = getBusinessDayRange(new Date(reg.business_day + "T12:00:00"));
    const { data: allOrdersRaw } = await supabase
      .from("orders")
      .select("id, payment_method, total, status, trashed_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .eq("store_id", reg.store_id)
      .is("trashed_at", null);
    const allOrdersData = (allOrdersRaw || []).filter((o: any) => !o.trashed_at);
    const completedStatuses = ["delivered", "ready", "delivering", "preparing"];
    const ordersData = allOrdersData.filter((o: any) => completedStatuses.includes(o.status));
    const cancelledCount = allOrdersData.filter((o: any) => o.status === "cancelled").length;
    const totals: PaymentBreakdown = { pix: 0, card: 0, cash: 0, other: 0, total: 0 };
    const orderIds: string[] = [];
    ordersData.forEach((o: any) => {
      orderIds.push(o.id);
      const m = String(o.payment_method || "").toLowerCase();
      const t = Number(o.total) || 0;
      totals.total += t;
      if (m.includes("pix")) totals.pix += t;
      else if (m.includes("card") || m.includes("cart") || m.includes("debit") || m.includes("credit") || m.includes("maquin")) totals.card += t;
      else if (m.includes("dinheiro") || m === "cash" || m === "money") totals.cash += t;
      else totals.other += t;
    });
    const stats = { completed: ordersData.length, cancelled: cancelledCount };
    let top: { name: string; qty: number }[] = [];
    // Recompute COGS for this business day
    let cogs = { totalCost: 0, missingCount: 0, totalProducts: 0 };
    if (orderIds.length > 0) {
      const { data: itemsData } = await supabase
        .from("order_items").select("product_id, product_name, quantity").in("order_id", orderIds);
      const productQty = new Map<string, number>();
      const nameQty = new Map<string, number>();
      let totalUnits = 0;
      (itemsData || []).forEach((it: any) => {
        const q = Number(it.quantity) || 0;
        totalUnits += q;
        const name = String(it.product_name || "Item").trim();
        nameQty.set(name, (nameQty.get(name) || 0) + q);
        if (!it.product_id) return;
        productQty.set(it.product_id, (productQty.get(it.product_id) || 0) + q);
      });
      top = [...nameQty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }));
      const productIds = [...productQty.keys()];
      if (productIds.length > 0) {
        const [prodRes, piRes] = await Promise.all([
          supabase.from("products").select("id, manual_cost, price").in("id", productIds),
          supabase.from("product_ingredients").select("product_id, ingredient_id, quantity").in("product_id", productIds),
        ]);
        const ingIds = [...new Set((piRes.data || []).map((r: any) => r.ingredient_id))];
        const ingMap = new Map<string, number>();
        if (ingIds.length > 0) {
          const { data: ingRows } = await supabase.from("ingredients").select("id, cost_per_unit").in("id", ingIds);
          (ingRows || []).forEach((i: any) => ingMap.set(i.id, Number(i.cost_per_unit) || 0));
        }
        const piByProduct = new Map<string, { ingredient_id: string; quantity: number }[]>();
        (piRes.data || []).forEach((r: any) => {
          const list = piByProduct.get(r.product_id) || [];
          list.push({ ingredient_id: r.ingredient_id, quantity: Number(r.quantity) || 0 });
          piByProduct.set(r.product_id, list);
        });
        let totalCost = 0; let missingUnits = 0;
        (prodRes.data || []).forEach((p: any) => {
          const qty = productQty.get(p.id) || 0;
          if (qty <= 0) return;
          const recipeCost = (piByProduct.get(p.id) || []).reduce(
            (s, r) => s + (ingMap.get(r.ingredient_id) || 0) * r.quantity, 0);
          const unitCost = Number(p.manual_cost) > 0 ? Number(p.manual_cost) : recipeCost;
          if (unitCost > 0) totalCost += unitCost * qty;
          else { totalCost += (Number(p.price) || 0) * 0.35 * qty; missingUnits += qty; }
        });
        cogs = { totalCost: roundMoney(totalCost), missingCount: missingUnits, totalProducts: totalUnits };
      } else {
        cogs.totalProducts = totalUnits;
      }
    }
    const summary = computeSummary(reg, totals, cogs);
    printRegisterReport(reg, totals, summary, stats, top);
  };

  /** Save edits to a saved register */
  const saveRegisterEdits = async () => {
    if (!editingReg) return;
    const { id, ...rest } = editingReg as any;
    // Reconstruir notes: [Aberto por: X] [Fechado por: Y] + obs limpas
    const openTag = rest._opened_by_name?.trim()
      ? `[Aberto por: ${rest._opened_by_name.trim()}]`
      : "";
    const closeTag = rest._closed_by_name?.trim()
      ? `[Fechado por: ${rest._closed_by_name.trim()}]`
      : "";
    const cleanObs = String(rest._clean_notes ?? rest.notes ?? "")
      .replace(/\[Aberto por:[^\]]*\]/g, "")
      .replace(/\[Fechado por:[^\]]*\]/g, "")
      .trim();
    const finalNotes = [openTag, closeTag, cleanObs].filter(Boolean).join(" ").trim();

    const payload: Record<string, unknown> = {
      opening_cash: Number(rest.opening_cash) || 0,
      opening_card: Number(rest.opening_card) || 0,
      opening_change_reserve: Number(rest.opening_change_reserve) || 0,
      expense_employees: Number(rest.expense_employees) || 0,
      expense_couriers: Number(rest.expense_couriers) || 0,
      expense_purchases: Number(rest.expense_purchases) || 0,
      expense_gasoline: Number(rest.expense_gasoline) || 0,
      expense_ads: Number(rest.expense_ads) || 0,
      expense_other: Number(rest.expense_other) || 0,
      closing_pix: Number(rest.closing_pix) || 0,
      closing_card: Number(rest.closing_card) || 0,
      closing_cash: Number(rest.closing_cash) || 0,
      notes: finalNotes,
    };
    if (rest.opened_at) payload.opened_at = rest.opened_at;
    if (rest.closed_at) payload.closed_at = rest.closed_at;

    const { error } = await supabase.from("cash_registers").update(payload).eq("id", id);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅ Relatório atualizado" });
    setEditingReg(null);
    await fetchHistory();
    await fetchRegister();
  };

  // Reopen check: allowed if same business day OR before 6am of next day
  const canReopen = useMemo(() => {
    if (!register || register.status !== "closed") return false;
    if (register.business_day === todayBusinessDay) return true;
    return false; // business day already cuts off at 6am, so any later day means too late
  }, [register, todayBusinessDay]);

  // ============== Close summary calculations ==============
  const closeSummary = useMemo(() => {
    const expensesTotal =
      (Number(closeForm.expense_employees) || 0) +
      (Number(closeForm.expense_couriers) || 0) +
      (Number(closeForm.expense_purchases) || 0) +
      (Number(closeForm.expense_gasoline) || 0) +
      (Number(closeForm.expense_ads) || 0) +
      (Number(closeForm.expense_other) || 0);

    const declaredPix = Number(closeForm.closing_pix) || 0;
    const declaredCard = Number(closeForm.closing_card) || 0;
    const declaredCash = Number(closeForm.closing_cash) || 0;
    const declaredTotal = declaredPix + declaredCard + declaredCash;

    const opening = (register?.opening_cash || 0) + (register?.opening_card || 0) + (register?.opening_change_reserve || 0);

    // Expected values are based STRICTLY on the sum of each order's payment for the current business day.
    const expectedPix = paymentTotals.pix;
    const expectedCard = paymentTotals.card;
    const expectedCash = paymentTotals.cash;
    const expectedTotal = expectedCash + expectedPix + expectedCard;

    const diffCash = declaredCash - expectedCash;
    const diffPix = declaredPix - expectedPix;
    const diffCard = declaredCard - expectedCard;
    const diffTotal = declaredTotal - expectedTotal;

    const grossRevenue = paymentTotals.total;
    const netRevenue = grossRevenue - expensesTotal;
    // Lucro líquido com custo dos produtos vendidos (COGS) descontado
    const netAfterCogs = netRevenue - productsCostInfo.totalCost;
    // Se algum produto vendido não tem custo cadastrado → estimado
    const cogsIsEstimate = productsCostInfo.missingCount > 0;

    return {
      opening, expensesTotal, declaredTotal, expectedTotal,
      expectedCash, expectedPix, expectedCard,
      diffCash, diffPix, diffCard, diffTotal,
      grossRevenue, netRevenue,
      productsCost: productsCostInfo.totalCost,
      netAfterCogs, cogsIsEstimate,
      missingCostUnits: productsCostInfo.missingCount,
      totalSoldUnits: productsCostInfo.totalProducts,
    };
  }, [closeForm, register, paymentTotals, productsCostInfo]);

  // ============== UI ==============
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Carregando caixa…
      </div>
    );
  }

  if (!storeId) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        ⚠️ Loja não identificada. Recarregue a página (Ctrl+Shift+R) ou verifique o vínculo do administrador à loja.
      </div>
    );
  }

  const isOpenToday = register?.status === "open" && register?.business_day === todayBusinessDay;
  const previousDayBlocking = register && register.status === "open" && register.business_day !== todayBusinessDay;
  // Reminder: store closed but cash still open → blink to remind admin to close it
  const remindClose = isOpenToday && !storeIsOpen;

  return (
    <>
      <div className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border-2 p-4",
        remindClose
          ? "border-destructive/60 cash-banner-blink"
          : isOpenToday
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-amber-500/40 bg-amber-500/5",
      )}>
        <div className="flex items-center gap-2 text-sm font-bold">
          <Wallet size={20} className={isOpenToday ? "text-emerald-600" : "text-amber-600"} />
          <span className={isOpenToday ? "text-emerald-700" : "text-amber-700"}>
            {previousDayBlocking
              ? `⚠️ CAIXA DE ${register?.business_day} EM ABERTO`
              : isOpenToday
                ? "CAIXA ABERTO"
                : "CAIXA FECHADO"}
          </span>
        </div>

        {register && (
          <div className="text-xs text-muted-foreground">
            <div>Aberto em: <strong>{formatDateTimeBR(register.opened_at)}</strong></div>
            {isOpenToday && (
              <div className="text-emerald-700 font-bold">
                ⏱ Tempo aberto: {formatDuration(now.getTime() - new Date(register.opened_at).getTime())}
              </div>
            )}
            {register.closed_at && (
              <div>Fechado em: <strong>{formatDateTimeBR(register.closed_at)}</strong></div>
            )}
            {register.reopen_count > 0 && (
              <div>Reabertura{register.reopen_count > 1 ? "s" : ""}: <strong>{register.reopen_count}</strong></div>
            )}
          </div>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowHistory(true)}>
            <History size={16} className="mr-1" /> Histórico
          </Button>
          {!register || register.business_day !== todayBusinessDay ? (
            <Button
              onClick={() => setShowOpen(true)}
              disabled={!!previousDayBlocking}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Unlock size={16} className="mr-1" /> Abrir Caixa
            </Button>
          ) : isOpenToday ? (
            <Button
              onClick={() => setShowClose(true)}
              className={cn(
                "text-white",
                remindClose
                  ? "bg-destructive hover:bg-destructive/90 cash-blink font-extrabold"
                  : "bg-amber-600 hover:bg-amber-700",
              )}
            >
              <Lock size={16} className="mr-1" />
              {remindClose ? "FECHAR CAIXA AGORA" : "Fechar Caixa"}
            </Button>
          ) : canReopen ? (
            <Button
              onClick={() => setShowOpen(true)}
              variant="outline"
            >
              <RefreshCw size={16} className="mr-1" /> Reabrir Caixa
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Caixa do dia já encerrado.</span>
          )}
        </div>
      </div>

      {/* OPEN MODAL */}
      <Dialog open={showOpen} onOpenChange={setShowOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir Caixa — {todayBusinessDay}</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs">
            <div className="font-bold text-emerald-700">📅 Data e hora da abertura</div>
            <div className="text-foreground font-mono">{formatDateTimeBR(now.toISOString())}</div>
          </div>
          <div className="space-y-3 py-2">
            <div>
              <Label>
                Responsável pela abertura <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Nome de quem está abrindo o caixa"
                value={openForm.responsible_name}
                onChange={(e) => setOpenForm({ ...openForm, responsible_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Dinheiro em caixa (R$)</Label>
              <Input type="number" step="0.01" value={openForm.cash}
                onChange={(e) => setOpenForm({ ...openForm, cash: e.target.value })} />
            </div>
            <div>
              <Label>Saldo em máquina/conta (R$)</Label>
              <Input type="number" step="0.01" value={openForm.card}
                onChange={(e) => setOpenForm({ ...openForm, card: e.target.value })} />
            </div>
            <div>
              <Label>Troco reserva (R$)</Label>
              <Input type="number" step="0.01" value={openForm.change_reserve}
                onChange={(e) => setOpenForm({ ...openForm, change_reserve: e.target.value })} />
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={openForm.notes}
                onChange={(e) => setOpenForm({ ...openForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOpen(false)}>Cancelar</Button>
            <Button onClick={handleOpen} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {register ? "Reabrir" : "Abrir"} Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLOSE MODAL */}
      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fechar Caixa — {register?.business_day}</DialogTitle>
          </DialogHeader>
          {register && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs space-y-1">
              <div>
                <span className="font-bold text-amber-700">📅 Aberto em: </span>
                <span className="font-mono">{formatDateTimeBR(register.opened_at)}</span>
              </div>
              <div>
                <span className="font-bold text-amber-700">🔒 Fechando agora: </span>
                <span className="font-mono">{formatDateTimeBR(now.toISOString())}</span>
              </div>
              <div>
                <span className="font-bold text-amber-700">⏱ Tempo total: </span>
                <span className="font-mono">{formatDuration(now.getTime() - new Date(register.opened_at).getTime())}</span>
              </div>
            </div>
          )}

          {register && (
            <div className="space-y-4 py-2">
              {/* Opening info */}
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="font-bold mb-1">📂 Abertura</div>
                <div>Data/Hora: {formatDateTimeBR(register.opened_at)}</div>
                {(() => {
                  const m = (register.notes || "").match(/\[Aberto por:\s*([^\]]+)\]/);
                  return m ? <div>Responsável: <strong>{m[1].trim()}</strong></div> : null;
                })()}
                <div>Dinheiro: <strong>{fmt(register.opening_cash)}</strong></div>
                <div>Máquina/Conta: <strong>{fmt(register.opening_card)}</strong></div>
                <div>Troco reserva: <strong>{fmt(register.opening_change_reserve)}</strong></div>
              </div>

              {/* Stats: orders count + top items */}
              <div className="rounded-lg border border-border bg-card p-3 text-sm space-y-2">
                <div className="font-bold">📊 Pedidos do dia</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-700">
                    Realizados: <strong>{orderStats.completed}</strong>
                  </div>
                  <div className="rounded bg-destructive/10 px-2 py-1 text-destructive">
                    Cancelados: <strong>{orderStats.cancelled}</strong>
                  </div>
                </div>
                {topItems.length > 0 && (
                  <div className="pt-1">
                    <div className="font-bold text-xs mb-1">🏆 Itens mais vendidos</div>
                    <ol className="list-decimal pl-5 space-y-0.5 text-xs">
                      {topItems.map((it, i) => (
                        <li key={i}>
                          <span className="font-semibold">{it.qty}×</span> {it.name}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              {/* Responsável pelo fechamento */}
              <div>
                <Label>
                  Responsável pelo fechamento <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Nome de quem está fechando o caixa"
                  value={closeForm.responsible_name}
                  onChange={(e) => setCloseForm({ ...closeForm, responsible_name: e.target.value })}
                  required
                />
              </div>

              {/* Expenses */}
              <div className="space-y-2">
                <div className="font-bold text-sm">💸 Gastos do dia</div>
                {[
                  ["expense_employees", "Funcionários"],
                  ["expense_couriers", "Entregadores"],
                  ["expense_purchases", "Compras"],
                  ["expense_gasoline", "Gasolina"],
                  ["expense_ads", "Anúncios / Divulgação"],
                  ["expense_other", "Outros"],
                ].map(([key, label]) => {
                  const isCouriers = key === "expense_couriers";
                  const declared = Number((closeForm as any)[key]) || 0;
                  const matchesAuto = isCouriers && autoCouriers.total > 0 && Math.abs(declared - autoCouriers.total) < 0.01;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="grid grid-cols-2 gap-2 items-center">
                        <Label className="text-sm flex items-center gap-1">
                          {label}
                          {isCouriers && autoCouriers.total > 0 && (
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-bold",
                                matchesAuto ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"
                              )}
                              title={matchesAuto ? "Valor automático" : "Valor alterado manualmente"}
                            >
                              {matchesAuto ? "AUTO" : "MANUAL"}
                            </span>
                          )}
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={(closeForm as any)[key]}
                          onChange={(e) => setCloseForm({ ...closeForm, [key]: e.target.value })}
                        />
                      </div>
                      {isCouriers && autoCouriers.breakdown.length > 0 && (
                        <div className="text-[11px] text-muted-foreground pl-1">
                          🛵 Auto: {autoCouriers.breakdown.map(b => `${b.name} ${fmt(b.fee)}`).join(" • ")}
                          {" = "}<strong className="text-foreground">{fmt(autoCouriers.total)}</strong>
                          {!matchesAuto && (
                            <button
                              type="button"
                              className="ml-2 underline text-primary"
                              onClick={() => setCloseForm({ ...closeForm, expense_couriers: autoCouriers.total.toFixed(2) })}
                            >
                              usar automático
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="text-right text-sm font-bold">
                  Total gastos: <span className="text-destructive">{fmt(closeSummary.expensesTotal)}</span>
                </div>
              </div>

              {/* Declared balances with expected hint */}
              <div className="space-y-2">
                <div className="font-bold text-sm">💰 Saldo final em caixa</div>
                {[
                  { key: "closing_pix", label: "PIX", expected: closeSummary.expectedPix },
                  { key: "closing_card", label: "Máquina de cartão", expected: closeSummary.expectedCard },
                  { key: "closing_cash", label: "Dinheiro", expected: closeSummary.expectedCash },
                ].map(({ key, label, expected }) => (
                  <div key={key} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                    <Label className="text-sm">{label}</Label>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      Esperado: <strong className="text-foreground">{fmt(expected)}</strong>
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      value={(closeForm as any)[key]}
                      onChange={(e) => setCloseForm({ ...closeForm, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>

              {/* Reconciliation summary */}
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
                <div className="font-bold mb-1 flex items-center gap-2">
                  <CheckCircle2 size={16} /> Conferência de caixa
                </div>
                <div className="text-[11px] text-muted-foreground italic mb-2">
                  Compara o que o sistema esperava receber (vendas) com o que foi contado no fechamento. Diferença positiva = sobra, negativa = falta.
                </div>
                <Row label="Faturamento bruto (pedidos)" value={fmt(closeSummary.grossRevenue)} />
                <Row label="− Total de gastos" value={fmt(closeSummary.expensesTotal)} negative />
                <Row label="= Lucro líquido (sem custos dos produtos)" value={fmt(closeSummary.netRevenue)} bold />
                <Row
                  label={`− Custo dos produtos vendidos${closeSummary.cogsIsEstimate ? " (estimado)" : ""}`}
                  value={fmt(closeSummary.productsCost)}
                  negative
                />
                <Row
                  label={`= ${closeSummary.cogsIsEstimate ? "Lucro líquido (estimado)" : "Lucro líquido REAL"}`}
                  value={fmt(closeSummary.netAfterCogs)}
                  bold
                  warn={closeSummary.cogsIsEstimate}
                />
                {closeSummary.cogsIsEstimate && closeSummary.totalSoldUnits > 0 && (
                  <div className="text-[11px] text-amber-700 italic">
                    ⚠️ {closeSummary.missingCostUnits} de {closeSummary.totalSoldUnits} itens vendidos não possuem custo cadastrado — valor aproximado (~35% do preço). Cadastre a ficha técnica ou custo manual em Precificação para obter o lucro real.
                  </div>
                )}
                <hr className="my-2 border-border" />
                <Row label="Esperado em caixa" value={fmt(closeSummary.expectedTotal)} />
                <Row label="Declarado em caixa" value={fmt(closeSummary.declaredTotal)} />
                <Row
                  label="Diferença (quebra)"
                  value={fmt(closeSummary.diffTotal)}
                  bold
                  warn={Math.abs(closeSummary.diffTotal) > 0.01}
                />
                {Math.abs(closeSummary.diffTotal) > 0.01 && (
                  <div className="mt-2 flex items-start gap-2 rounded bg-amber-500/10 p-2 text-xs text-amber-700">
                    <AlertTriangle size={14} className="mt-0.5" />
                    <div>
                      <div>{closeSummary.diffTotal > 0 ? "Sobra" : "Falta"} de <strong>{fmt(Math.abs(closeSummary.diffTotal))}</strong>.</div>
                      <div>PIX: {fmt(closeSummary.diffPix)} • Cartão: {fmt(closeSummary.diffCard)} • Dinheiro: {fmt(closeSummary.diffCash)}</div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label>Observações</Label>
                <Input value={closeForm.notes}
                  onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClose(false)}>Cancelar</Button>
            <Button onClick={handleClose} className="bg-amber-600 hover:bg-amber-700 text-white">
              <Lock size={16} className="mr-1" /> Confirmar Fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HISTORY MODAL */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de Caixas</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {history.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">Nenhum caixa registrado.</div>
            )}
            {history.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <div className="min-w-[140px]">
                  <div className="font-bold">{r.business_day}</div>
                  <div className={cn("text-xs", r.status === "open" ? "text-emerald-600" : "text-muted-foreground")}>
                    {r.status === "open" ? "ABERTO" : "FECHADO"}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex-1 min-w-[180px]">
                  <div>Aberto: {formatDateTimeBR(r.opened_at)}</div>
                  {r.closed_at && <div>Fechado: {formatDateTimeBR(r.closed_at)}</div>}
                </div>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => reprintRegister(r)}>
                    <Printer size={14} className="mr-1" /> Imprimir
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    const notes = r.notes || "";
                    const oM = notes.match(/\[Aberto por:\s*([^\]]+)\]/);
                    const cM = notes.match(/\[Fechado por:\s*([^\]]+)\]/);
                    const cleanNotes = notes
                      .replace(/\[Aberto por:[^\]]*\]/g, "")
                      .replace(/\[Fechado por:[^\]]*\]/g, "")
                      .trim();
                    setEditingReg({
                      ...r,
                      _opened_by_name: oM ? oM[1].trim() : "",
                      _closed_by_name: cM ? cM[1].trim() : "",
                      _clean_notes: cleanNotes,
                    } as any);
                  }}>
                    <Pencil size={14} className="mr-1" /> Editar
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistory(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT MODAL — replica das telas originais (Abertura + Fechamento) */}
      <Dialog open={!!editingReg} onOpenChange={(o) => !o && setEditingReg(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Caixa — {editingReg?.business_day}</DialogTitle>
          </DialogHeader>
          {editingReg && (() => {
            const er = editingReg as any;
            const set = (patch: Record<string, unknown>) => setEditingReg({ ...er, ...patch });
            const numField = (key: string) => ({
              type: "number" as const,
              step: "0.01",
              value: er[key] ?? 0,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: e.target.value }),
            });
            const toLocalInput = (iso: string | null | undefined) => {
              if (!iso) return "";
              const d = new Date(iso);
              const pad = (n: number) => String(n).padStart(2, "0");
              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            };
            return (
              <Tabs defaultValue="abertura" className="py-2">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="abertura">📂 Abertura</TabsTrigger>
                  <TabsTrigger value="fechamento" disabled={!er.closed_at}>
                    🔒 Fechamento {!er.closed_at && "(em aberto)"}
                  </TabsTrigger>
                </TabsList>

                {/* TAB ABERTURA — espelha o modal de Abrir Caixa */}
                <TabsContent value="abertura" className="space-y-3 pt-3">
                  <div>
                    <Label>Data/Hora da abertura</Label>
                    <Input
                      type="datetime-local"
                      value={toLocalInput(er.opened_at)}
                      onChange={(e) => set({ opened_at: new Date(e.target.value).toISOString() })}
                    />
                  </div>
                  <div>
                    <Label>Responsável pela abertura <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="Nome de quem abriu o caixa"
                      value={er._opened_by_name || ""}
                      onChange={(e) => set({ _opened_by_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Dinheiro em caixa (R$)</Label>
                    <Input {...numField("opening_cash")} />
                  </div>
                  <div>
                    <Label>Saldo em máquina/conta (R$)</Label>
                    <Input {...numField("opening_card")} />
                  </div>
                  <div>
                    <Label>Troco reserva (R$)</Label>
                    <Input {...numField("opening_change_reserve")} />
                  </div>
                </TabsContent>

                {/* TAB FECHAMENTO — espelha o modal de Fechar Caixa */}
                <TabsContent value="fechamento" className="space-y-4 pt-3">
                  <div>
                    <Label>Data/Hora do fechamento</Label>
                    <Input
                      type="datetime-local"
                      value={toLocalInput(er.closed_at)}
                      onChange={(e) => set({ closed_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    />
                  </div>
                  <div>
                    <Label>Responsável pelo fechamento <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="Nome de quem fechou o caixa"
                      value={er._closed_by_name || ""}
                      onChange={(e) => set({ _closed_by_name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="font-bold text-sm">💸 Gastos do dia</div>
                    {[
                      ["expense_employees", "Funcionários"],
                      ["expense_couriers", "Entregadores"],
                      ["expense_purchases", "Compras"],
                      ["expense_gasoline", "Gasolina"],
                      ["expense_ads", "Anúncios / Divulgação"],
                      ["expense_other", "Outros"],
                    ].map(([key, label]) => (
                      <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-2">
                        <Label className="text-sm">{label}</Label>
                        <Input className="w-40" {...numField(key as string)} />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="font-bold text-sm">💰 Saldo final em caixa</div>
                    {[
                      ["closing_pix", "PIX"],
                      ["closing_card", "Máquina de cartão"],
                      ["closing_cash", "Dinheiro"],
                    ].map(([key, label]) => (
                      <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-2">
                        <Label className="text-sm">{label}</Label>
                        <Input className="w-40" {...numField(key as string)} />
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <div className="pt-3">
                  <Label>Observações</Label>
                  <Input
                    value={er._clean_notes ?? ""}
                    onChange={(e) => set({ _clean_notes: e.target.value })}
                  />
                </div>
              </Tabs>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingReg(null)}>Cancelar</Button>
            <Button onClick={saveRegisterEdits} className="bg-primary text-primary-foreground">Salvar alterações</Button>
            {editingReg && (
              <Button variant="outline" onClick={() => reprintRegister(editingReg)}>
                <Printer size={14} className="mr-1" /> Imprimir
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value, bold, negative, warn }: { label: string; value: string; bold?: boolean; negative?: boolean; warn?: boolean }) {
  return (
    <div className={cn("flex justify-between", bold && "font-bold text-base")}>
      <span>{label}</span>
      <span className={cn(
        negative && "text-destructive",
        warn && "text-amber-700",
      )}>{value}</span>
    </div>
  );
}

// ============== Helpers ==============
function computeSummary(reg: CashRegister, totals: PaymentBreakdown, cogs?: { totalCost: number; missingCount: number; totalProducts: number }) {
  const expensesTotal =
    (reg.expense_employees || 0) + (reg.expense_couriers || 0) + (reg.expense_purchases || 0) +
    (reg.expense_gasoline || 0) + (reg.expense_ads || 0) + (reg.expense_other || 0);
  const declaredPix = reg.closing_pix || 0;
  const declaredCard = reg.closing_card || 0;
  const declaredCash = reg.closing_cash || 0;
  const declaredTotal = declaredPix + declaredCard + declaredCash;
  const expectedPix = totals.pix;
  const expectedCard = totals.card;
  const expectedCash = totals.cash;
  const expectedTotal = expectedCash + expectedPix + expectedCard;
  const productsCost = cogs?.totalCost || 0;
  const cogsIsEstimate = (cogs?.missingCount || 0) > 0;
  const grossRevenue = totals.total;
  const netRevenue = grossRevenue - expensesTotal;
  const netAfterCogs = netRevenue - productsCost;
  return {
    expensesTotal, declaredTotal, expectedTotal, expectedCash, expectedPix, expectedCard,
    diffCash: declaredCash - expectedCash, diffPix: declaredPix - expectedPix,
    diffCard: declaredCard - expectedCard, diffTotal: declaredTotal - expectedTotal,
    grossRevenue, netRevenue, productsCost, netAfterCogs, cogsIsEstimate,
    missingCostUnits: cogs?.missingCount || 0, totalSoldUnits: cogs?.totalProducts || 0,
  };
}

function printRegisterReport(
  reg: CashRegister,
  totals: PaymentBreakdown,
  summary: ReturnType<typeof computeSummary>,
  stats: { completed: number; cancelled: number } = { completed: 0, cancelled: 0 },
  topItems: { name: string; qty: number }[] = [],
) {
  const f = (n: number) => `R$ ${(Number(n) || 0).toFixed(2).replace(".", ",")}`;
  const openedByMatch = (reg.notes || "").match(/\[Aberto por:\s*([^\]]+)\]/);
  const closedByMatch = (reg.notes || "").match(/\[Fechado por:\s*([^\]]+)\]/);
  const openedBy = openedByMatch ? openedByMatch[1].trim() : "";
  const closedBy = closedByMatch ? closedByMatch[1].trim() : "";
  const cleanNotes = (reg.notes || "")
    .replace(/\[Aberto por:[^\]]*\]/g, "")
    .replace(/\[Fechado por:[^\]]*\]/g, "")
    .trim();
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Relatorio Caixa ${reg.business_day}</title>
<style>
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-weight: 900; margin: 0; padding: 6px 8px; color: #000; font-size: 12px; }
h1 { font-size: 14px; text-align: center; margin: 4px 0; }
.row { display: flex; justify-content: space-between; }
hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
.warn { color: #b45309; }
.big { font-size: 13px; }
</style></head><body>
<h1>RELATÓRIO DE CAIXA</h1>
<div class="row"><span>Dia:</span><strong>${reg.business_day}</strong></div>
<div class="row"><span>Status:</span><strong>${reg.status === "open" ? "ABERTO" : "FECHADO"}</strong></div>
<hr/>
<div><strong>ABERTURA</strong></div>
<div class="row"><span>Data/Hora:</span><span>${formatDateTimeBR(reg.opened_at)}</span></div>
${openedBy ? `<div class="row"><span>Responsável:</span><strong>${openedBy}</strong></div>` : ""}
<div class="row"><span>Dinheiro:</span><span>${f(reg.opening_cash)}</span></div>
<div class="row"><span>Máquina/Conta:</span><span>${f(reg.opening_card)}</span></div>
<div class="row"><span>Troco reserva:</span><span>${f(reg.opening_change_reserve)}</span></div>
${reg.closed_at ? `<hr/><div><strong>FECHAMENTO</strong></div>
<div class="row"><span>Data/Hora:</span><span>${formatDateTimeBR(reg.closed_at)}</span></div>
${closedBy ? `<div class="row"><span>Responsável:</span><strong>${closedBy}</strong></div>` : ""}` : ""}
<hr/>
<div><strong>PEDIDOS DO DIA</strong></div>
<div class="row"><span>Realizados:</span><strong>${stats.completed}</strong></div>
<div class="row"><span>Cancelados:</span><strong>${stats.cancelled}</strong></div>
${topItems.length > 0 ? `<div style="margin-top:3px;"><strong>MAIS VENDIDOS:</strong></div>
${topItems.map((it, i) => `<div class="row"><span>${i + 1}. ${it.name}</span><strong>${it.qty}×</strong></div>`).join("")}` : ""}
<hr/>
<div><strong>GASTOS</strong></div>
<div class="row"><span>Funcionários:</span><span>${f(reg.expense_employees)}</span></div>
<div class="row"><span>Entregadores:</span><span>${f(reg.expense_couriers)}</span></div>
<div class="row"><span>Compras:</span><span>${f(reg.expense_purchases)}</span></div>
<div class="row"><span>Gasolina:</span><span>${f(reg.expense_gasoline)}</span></div>
<div class="row"><span>Anúncios/Divulg.:</span><span>${f(reg.expense_ads)}</span></div>
<div class="row"><span>Outros:</span><span>${f(reg.expense_other)}</span></div>
<div class="row"><span>TOTAL GASTOS:</span><strong>${f(summary.expensesTotal)}</strong></div>
<hr/>
<div><strong>VENDAS POR PAGAMENTO</strong></div>
<div class="row"><span>PIX:</span><span>${f(totals.pix)}</span></div>
<div class="row"><span>Cartão:</span><span>${f(totals.card)}</span></div>
<div class="row"><span>Dinheiro:</span><span>${f(totals.cash)}</span></div>
<div class="row"><span>Outros:</span><span>${f(totals.other)}</span></div>
<div class="row"><span>BRUTO:</span><strong>${f(summary.grossRevenue)}</strong></div>
<hr/>
<div><strong>CONFERÊNCIA DE CAIXA</strong></div>
<div style="font-size:10px;font-style:italic;margin-bottom:3px;">Esperado = vendas do sistema · Declarado = contado no fechamento · Diferença = sobra (+) ou falta (−)</div>
<div class="row" style="font-weight:bold;"><span>Forma</span><span>Esperado / Declarado / Dif.</span></div>
<div class="row"><span>PIX:</span><span>${f(totals.pix)} / ${f(reg.closing_pix)} / <strong>${f(summary.diffPix)}</strong></span></div>
<div class="row"><span>Cartão:</span><span>${f(totals.card)} / ${f(reg.closing_card)} / <strong>${f(summary.diffCard)}</strong></span></div>
<div class="row"><span>Dinheiro:</span><span>${f(totals.cash)} / ${f(reg.closing_cash)} / <strong>${f(summary.diffCash)}</strong></span></div>
${totals.other > 0 ? `<div class="row"><span>Outros:</span><span>${f(totals.other)} / — / —</span></div>` : ""}
<div class="row"><span>TOTAL Esperado:</span><strong>${f(summary.expectedTotal)}</strong></div>
<div class="row"><span>TOTAL Declarado:</span><strong>${f(summary.declaredTotal)}</strong></div>
<div class="row big ${Math.abs(summary.diffTotal) > 0.01 ? "warn" : ""}"><span>DIFERENÇA:</span><strong>${f(summary.diffTotal)}</strong></div>
<hr/>
<div><strong>RESULTADO DO DIA</strong></div>
<div class="row"><span>Faturamento BRUTO:</span><strong>${f(summary.grossRevenue)}</strong></div>
<div class="row"><span>− Gastos do dia:</span><span class="warn">${f(summary.expensesTotal)}</span></div>
<div class="row big"><span>= LUCRO LÍQUIDO:</span><strong>${f(summary.netRevenue)}</strong></div>
<div class="row"><span>− Custo dos produtos${summary.cogsIsEstimate ? " (estim.)" : ""}:</span><span class="warn">${f(summary.productsCost)}</span></div>
<div class="row big ${summary.cogsIsEstimate ? "warn" : ""}"><span>= LUCRO ${summary.cogsIsEstimate ? "ESTIMADO" : "REAL"}:</span><strong>${f(summary.netAfterCogs)}</strong></div>
${summary.cogsIsEstimate && summary.totalSoldUnits > 0 ? `<div class="warn" style="font-size:10px;">${summary.missingCostUnits}/${summary.totalSoldUnits} itens sem custo cadastrado (estim. 35% do preço).</div>` : ""}
${cleanNotes ? `<hr/><div><strong>Observações:</strong> ${cleanNotes}</div>` : ""}
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
  const w = window.open("", "_print_caixa_" + Date.now(), "width=380,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
