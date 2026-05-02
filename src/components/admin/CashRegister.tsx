import { useEffect, useMemo, useState, useCallback } from "react";
import { Wallet, Lock, Unlock, RefreshCw, AlertTriangle, CheckCircle2, History, Printer, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatBusinessDate, getBusinessDayRange, getTodayBusinessDay } from "@/lib/businessDay";
import { formatDateTimeBR, nowBrasilia } from "@/lib/brasiliaTime";
import { makeTightThermalPrintHtml } from "@/lib/adminPrintTemplates";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { roundMoney } from "@/components/admin/pricing/pricingMoney";

type PayMethod = "cash" | "pix" | "card" | "unpaid";

/**
 * Converte uma string monetária digitada (aceita vírgula OU ponto como
 * separador decimal, e ignora separadores de milhar) em número.
 * Ex.: "347,97" → 347.97 | "1.234,56" → 1234.56 | "" → 0
 */
const parseMoneyInput = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // Se contém vírgula, assumimos formato pt-BR (milhar com ".", decimal com ",")
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

interface CashRegister {
  id: string;
  store_id: string | null;
  business_day: string;
  status: "open" | "closed";
  opened_at: string;
  opened_by: string;
  opening_cash: number;
  opening_card: number;
  opening_pix: number;
  opening_change_reserve: number;
  closed_at: string | null;
  closed_by: string | null;
  expense_employees: number;
  expense_couriers: number;
  expense_purchases: number;
  expense_gasoline: number;
  expense_ads: number;
  expense_ads_external: number;
  expense_other: number;
  expense_employees_method: PayMethod;
  expense_couriers_method: PayMethod;
  expense_purchases_method: PayMethod;
  expense_gasoline_method: PayMethod;
  expense_ads_method: PayMethod;
  expense_other_method: PayMethod;
  closing_pix: number;
  closing_card: number;
  closing_cash: number;
  // Snapshot persistido no fechamento (única fonte da verdade para impressão/histórico)
  expected_cash?: number;
  expected_pix?: number;
  expected_card?: number;
  gross_cash?: number;
  gross_pix?: number;
  gross_card?: number;
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
  // (legacy editingReg removido — edição agora reusa os modais reais via editingRegId)
  // 🔧 Edit-from-history mode: when set, the real Open/Close modals operate on this saved register
  // (UPDATE in place) instead of creating/closing the active one.
  const [editingRegId, setEditingRegId] = useState<string | null>(null);
  const [editingRegBackup, setEditingRegBackup] = useState<CashRegister | null>(null);
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
  const [autoExpenses, setAutoExpenses] = useState<{
    employees: number;
    gasoline: number;
    other: number;
    breakdown: { category: string; description: string; amount: number }[];
  }>({ employees: 0, gasoline: 0, other: 0, breakdown: [] });

  // Live clock — updates every second for the open-time counter and current date/time labels
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Storage keys (per store) — persist drafts across reloads/closes
  const openDraftKey = `cashRegister:openDraft:${storeId || "default"}`;
  const closeDraftKey = `cashRegister:closeDraft:${storeId || "default"}`;

  const defaultOpenForm = { cash: "0", card: "0", pix: "0", change_reserve: "0", notes: "", responsible_name: "" };
  const defaultCloseForm = {
    expense_employees: "0",
    expense_couriers: "0",
    expense_purchases: "0",
    expense_gasoline: "0",
    expense_ads: "0",
    expense_ads_external: "0",
    expense_other: "0",
    expense_employees_method: "cash" as PayMethod,
    expense_couriers_method: "cash" as PayMethod,
    expense_purchases_method: "cash" as PayMethod,
    expense_gasoline_method: "cash" as PayMethod,
    expense_ads_method: "cash" as PayMethod,
    expense_other_method: "cash" as PayMethod,
    // Caixa BRUTO (antes dos gastos) — valor real contado pelo operador
    declared_gross_cash: "0",
    declared_gross_pix: "0",
    declared_gross_card: "0",
    // Reserva de troco que já estava na gaveta na abertura, mas não foi
    // registrada (somada ao Esperado em dinheiro como entrada inicial).
    closing_change_reserve: "",
    // Valores REAIS informados pelo operador — começam vazios para
    // forçar digitação manual e nunca herdar valores de sessões antigas.
    closing_pix: "",
    closing_card: "",
    closing_cash: "",
    closing_account: "", // PIX + cartão (campo unificado da UI)
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

  const closeFormFromRegister = (reg: CashRegister, responsibleName = "") => ({
    ...defaultCloseForm,
    expense_employees: String(reg.expense_employees ?? 0),
    expense_couriers: String(reg.expense_couriers ?? 0),
    expense_purchases: String(reg.expense_purchases ?? 0),
    expense_gasoline: String(reg.expense_gasoline ?? 0),
    expense_ads: String(reg.expense_ads ?? 0),
    expense_ads_external: String(reg.expense_ads_external ?? 0),
    expense_other: String(reg.expense_other ?? 0),
    expense_employees_method: (reg.expense_employees_method as PayMethod) || "cash",
    expense_couriers_method: (reg.expense_couriers_method as PayMethod) || "cash",
    expense_purchases_method: (reg.expense_purchases_method as PayMethod) || "cash",
    expense_gasoline_method: (reg.expense_gasoline_method as PayMethod) || "cash",
    expense_ads_method: (reg.expense_ads_method as PayMethod) || "cash",
    expense_other_method: (reg.expense_other_method as PayMethod) || "cash",
    closing_pix: String(reg.closing_pix ?? 0),
    closing_card: String(reg.closing_card ?? 0),
    closing_cash: String(reg.closing_cash ?? 0),
    closing_account: ((Number(reg.closing_pix) || 0) + (Number(reg.closing_card) || 0)).toFixed(2),
    declared_gross_cash: String((reg as any).declared_gross_cash ?? (reg as any).gross_cash ?? 0),
    declared_gross_pix: String((reg as any).declared_gross_pix ?? (reg as any).gross_pix ?? 0),
    declared_gross_card: String((reg as any).declared_gross_card ?? (reg as any).gross_card ?? 0),
    closing_change_reserve: String(reg.opening_change_reserve ?? 0),
    responsible_name: responsibleName,
  });

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

      // Prioriza o caixa do dia atual; se não existir, mostra o anterior em aberto
      // (que poderá ser fechado pelo Histórico). Isso libera "Abrir Caixa" mesmo
      // quando o caixa do dia anterior ainda não foi encerrado.
      const next = today || previousOpen || null;
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
      .select("id, payment_method, total, status, courier_id, delivery_fee, delivery_type, trashed_at, amount_paid_cash, amount_paid_pix, amount_paid_card, change_given_cash, change_given_pix, change_given_card, change_for")
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
    const courierDeliveryFees = new Map<string, number>();
    ordersData.forEach((o: any) => {
      orderIds.push(o.id);
      if (o.courier_id) {
        courierIds.add(o.courier_id);
        if (o.status === "delivered" && String(o.delivery_type || "delivery") === "delivery") {
          const fee = Number(o.delivery_fee) || 0;
          courierDeliveryFees.set(o.courier_id, (courierDeliveryFees.get(o.courier_id) || 0) + fee);
        }
      }
      const t = Number(o.total) || 0;
      totals.total += t;
      // ✅ REGRA: a NOTA inteira entregue pelo cliente entra no caixa.
      // O troco devolvido NÃO é descontado da entrada — ele sai do troco do dia /
      // reserva de troco / dinheiro acumulado em caixa, e isso já é refletido na
      // gaveta física no fim do dia. Aqui contamos apenas o que ENTROU.
      // Para PIX/Cartão não há troco em dinheiro, então é apenas o valor pago.
      const rawPaidCash = Number(o.amount_paid_cash) || 0;
      const changeFor   = Number(o.change_for) || 0;
      const isCashOrder = String(o.payment_method || "") === "dinheiro";
      const paidCash = Math.max(
        rawPaidCash,
        isCashOrder ? Math.max(changeFor, t) : 0,
      );
      const paidPix    = Number(o.amount_paid_pix)    || (String(o.payment_method) === "pix" ? t : 0);
      const paidCard   = Number(o.amount_paid_card)   || (["cartao","card","debito","credito"].includes(String(o.payment_method)) ? t : 0);
      totals.cash += paidCash;
      totals.pix  += paidPix;
      totals.card += paidCard;
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
        // Diária por dia da semana TEM PRIORIDADE sobre o valor padrão.
        // Só cai para couriers.fixed_fee se NÃO houver linha em courier_daily_fees
        // para este dia (inclusive 0 = "não cobra nesse dia" deve ser respeitado).
        const dailyBase = dailyMap.has(c.id) ? (dailyMap.get(c.id) as number) : (Number(c.fixed_fee) || 0);
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

    // Item mais vendido (apenas o top 1)
    const top = [...nameQty.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1)
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
      if (!editingRegId && register.status === "open" && register.reopen_count > 0 && register.closed_at) {
        const cM = (register.notes || "").match(/\[Fechado por:\s*([^\]]+)\]/);
        setCloseForm(closeFormFromRegister(register, cM ? cM[1].trim() : ""));
      }
      fetchPaymentTotals(register.business_day);
      // Pull the day's manually-registered expenses (Gastos do Dia) so they
      // are auto-included on closing and the operator doesn't have to retype them.
      void (async () => {
        let q = supabase
          .from("report_expenses" as any)
          .select("category, description, amount")
          .eq("expense_date", register.business_day);
        if (storeId) q = q.eq("store_id", storeId);
        const { data } = await q;
        const rows = (data as any[] | null) || [];
        let employees = 0, gasoline = 0, other = 0;
        const breakdown: { category: string; description: string; amount: number }[] = [];
        rows.forEach((r) => {
          const amt = Number(r.amount) || 0;
          breakdown.push({ category: r.category, description: r.description || "", amount: amt });
          if (r.category === "funcionario") employees += amt;
          else if (r.category === "gas") gasoline += amt;
          else other += amt;
        });
        setAutoExpenses({ employees, gasoline, other, breakdown });
      })();
    } else if (!showClose) {
      setAutoExpenses({ employees: 0, gasoline: 0, other: 0, breakdown: [] });
    }
  }, [showClose, register, fetchPaymentTotals, editingRegId, storeId]);

  // Auto-fill the declared balances with the EXPECTED totals (based on each
  // order's payment for the current business day) AND auto-fill the couriers
  // expense based on courier_daily_fees — but only if the user hasn't already
  // typed a value (keeps drafts intact).
  useEffect(() => {
    if (!showClose) return;
    setCloseForm((prev) => {
      const next = { ...prev };
      const isZero = (v: string) => !v || Number(v) === 0;
      // 🔧 Em modo EDIÇÃO de um fechamento já salvo, NÃO limpamos nem
      // sobrescrevemos os valores — preservamos exatamente o que foi
      // digitado/salvo originalmente para o operador apenas ajustar.
      const isReopenedRegister = register?.status === "open" && (register?.reopen_count || 0) > 0 && !!register?.closed_at;
      if (!editingRegId && !isReopenedRegister) {
        // SEMPRE zera os campos "Valores reais ao final do dia" ao abrir o
        // modal de fechamento NOVO — eles devem ser digitados manualmente,
        // sem herdar rascunho antigo do localStorage.
        next.closing_cash = "";
        next.closing_pix = "";
        next.closing_card = "";
        next.closing_account = "";
        if (isZero(prev.expense_couriers) && autoCouriers.total > 0) next.expense_couriers = autoCouriers.total.toFixed(2);
        // Auto-pull expenses registered during the business day (Gastos do Dia)
        if (isZero(prev.expense_employees) && autoExpenses.employees > 0) next.expense_employees = autoExpenses.employees.toFixed(2);
        if (isZero(prev.expense_gasoline) && autoExpenses.gasoline > 0) next.expense_gasoline = autoExpenses.gasoline.toFixed(2);
        if (isZero(prev.expense_other) && autoExpenses.other > 0) next.expense_other = autoExpenses.other.toFixed(2);
        // Pré-preenche o caixa BRUTO (antes dos gastos) com o esperado bruto
        const grossCashExp = (register?.opening_cash || 0) + (register?.opening_change_reserve || 0) + paymentTotals.cash;
        const grossPixExp  = (register?.opening_pix  || 0) + paymentTotals.pix;
        const grossCardExp = (register?.opening_card || 0) + paymentTotals.card;
        if (isZero(prev.declared_gross_cash) && grossCashExp > 0) next.declared_gross_cash = grossCashExp.toFixed(2);
        if (isZero(prev.declared_gross_pix)  && grossPixExp  > 0) next.declared_gross_pix  = grossPixExp.toFixed(2);
        if (isZero(prev.declared_gross_card) && grossCardExp > 0) next.declared_gross_card = grossCardExp.toFixed(2);
      }
      return next;
    });
  }, [showClose, paymentTotals.pix, paymentTotals.card, paymentTotals.cash, autoCouriers.total, autoExpenses.employees, autoExpenses.gasoline, autoExpenses.other, register, editingRegId]);


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
    // 🔧 EDIT MODE: just UPDATE the saved register's opening fields
    if (editingRegId) {
      const cleanNotes = String(openForm.notes || "")
        .replace(/\[Aberto por:[^\]]*\]/g, "")
        .trim();
      const closedTagMatch = (editingRegBackup?.notes || "").match(/\[Fechado por:[^\]]+\]/);
      const closedTag = closedTagMatch ? ` ${closedTagMatch[0]}` : "";
      const updatePayload: Record<string, unknown> = {
        opening_cash: Number(openForm.cash) || 0,
        opening_card: Number(openForm.card) || 0,
        opening_pix: Number(openForm.pix) || 0,
        opening_change_reserve: Number(openForm.change_reserve) || 0,
        notes: `[Aberto por: ${openForm.responsible_name.trim()}]${closedTag} ${cleanNotes}`.trim(),
      };
      const { error } = await supabase
        .from("cash_registers")
        .update(updatePayload)
        .eq("id", editingRegId);
      if (error) {
        toast({ title: "Erro ao salvar abertura", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "✅ Abertura atualizada" });
      setShowOpen(false);
      // Restore real active register
      setRegister(editingRegBackup);
      setEditingRegId(null);
      setEditingRegBackup(null);
      setOpenForm(defaultOpenForm);
      try { localStorage.removeItem(openDraftKey); } catch {}
      await fetchHistory();
      await fetchRegister();
      return;
    }


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
      opening_pix: Number(openForm.pix) || 0,
      opening_change_reserve: Number(openForm.change_reserve) || 0,
      notes: `[Aberto por: ${openForm.responsible_name.trim()}] ${openForm.notes || ""}`.trim(),
    };

    // Upsert into today's slot (handles reopen also)
      const { data: existing } = await supabase
      .from("cash_registers")
      .select("*")
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
        snapshot: existing,
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
    // 🚨 Validação: não permitir caixa negativo
    const declaredCash = parseMoneyInput(closeForm.closing_cash);
    const declaredPix = parseMoneyInput(closeForm.closing_pix);
    const declaredCard = parseMoneyInput(closeForm.closing_card);
    if (declaredCash < 0 || declaredPix < 0 || declaredCard < 0) {
      toast({
        title: "Valores inválidos",
        description: "Os saldos finais não podem ser negativos.",
        variant: "destructive",
      });
      return;
    }
    // (Alerta de divergência removido a pedido do usuário — o fechamento
    // sempre prossegue sem aviso, mesmo com diferenças.)
    const closerTag = `[Fechado por: ${closeForm.responsible_name.trim()}]`;
    const baseNotes = (register.notes || "").includes("[Fechado por:")
      ? (register.notes || "").replace(/\[Fechado por:[^\]]*\]/, closerTag)
      : `${register.notes || ""} ${closerTag}`.trim();
    const payload = {
      status: "closed" as const,
      closed_at: editingRegId && register.closed_at ? register.closed_at : new Date().toISOString(),
      closed_by: user.id,
      expense_employees: parseMoneyInput(closeForm.expense_employees),
      expense_couriers: parseMoneyInput(closeForm.expense_couriers),
      expense_purchases: parseMoneyInput(closeForm.expense_purchases),
      expense_gasoline: parseMoneyInput(closeForm.expense_gasoline),
      expense_ads: parseMoneyInput(closeForm.expense_ads),
      expense_ads_external: parseMoneyInput(closeForm.expense_ads_external),
      expense_other: parseMoneyInput(closeForm.expense_other),
      expense_employees_method: closeForm.expense_employees_method,
      expense_couriers_method: closeForm.expense_couriers_method,
      expense_purchases_method: closeForm.expense_purchases_method,
      expense_gasoline_method: closeForm.expense_gasoline_method,
      expense_ads_method: closeForm.expense_ads_method,
      expense_other_method: closeForm.expense_other_method,
      closing_pix: parseMoneyInput(closeForm.closing_pix),
      closing_card: parseMoneyInput(closeForm.closing_card),
      closing_cash: parseMoneyInput(closeForm.closing_cash),
      // Persiste a reserva de troco final (atualiza o registro do dia)
      opening_change_reserve: closeSummary.changeReserve,
      // Snapshot consolidado das métricas do fechamento
      expected_cash: closeSummary.expectedCash,
      expected_pix: closeSummary.expectedPix,
      expected_card: closeSummary.expectedCard,
      declared_cash: parseMoneyInput(closeForm.closing_cash),
      declared_pix: parseMoneyInput(closeForm.closing_pix),
      declared_card: parseMoneyInput(closeForm.closing_card),
      difference_cash: closeSummary.diffCash,
      difference_pix: closeSummary.diffPix,
      difference_card: closeSummary.diffCard,
      // Etapa 1 — Caixa Bruto (antes dos gastos)
      gross_cash: closeSummary.grossCash,
      gross_pix: closeSummary.grossPix,
      gross_card: closeSummary.grossCard,
      declared_gross_cash: closeSummary.declaredGrossCash,
      declared_gross_pix: closeSummary.declaredGrossPix,
      declared_gross_card: closeSummary.declaredGrossCard,
      // Etapa 3 — Caixa Final (após gastos) — espelha o esperado pós-gastos
      final_cash: closeSummary.expectedCash,
      final_pix: closeSummary.expectedPix,
      final_card: closeSummary.expectedCard,
      total_sales: closeSummary.grossRevenue,
      total_expenses: closeSummary.expensesTotal,
      gross_profit: closeSummary.netRevenue,
      net_profit: closeSummary.netAfterCogs,
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
      event_type: editingRegId ? "edit_close" : "close",
      performed_by: user.id,
      snapshot: payload,
    });

    // ⏳ Registrar despesas marcadas como "Não pago" na tabela unpaid_expenses
    const unpaidEntries: Array<{ key: string; label: string; category: string }> = [
      { key: "expense_employees", label: "Funcionários", category: "funcionario" },
      { key: "expense_couriers",  label: "Entregadores", category: "entregador" },
      { key: "expense_purchases", label: "Compras",      category: "compras" },
      { key: "expense_gasoline",  label: "Gasolina",     category: "gasolina" },
      { key: "expense_ads",       label: "Anúncios",     category: "anuncios" },
      { key: "expense_other",     label: "Outros",       category: "outros" },
    ];
    const toInsertUnpaid: any[] = [];
    for (const e of unpaidEntries) {
      const method = (closeForm as any)[`${e.key}_method`] as PayMethod;
      const amount = parseMoneyInput((closeForm as any)[e.key]);
      if (method === "unpaid" && amount > 0) {
        toInsertUnpaid.push({
          store_id: storeId,
          category: e.category,
          name: `${e.label} - Fechamento ${register.business_day}`,
          amount,
          source: "cash_register",
          source_ref: register.id,
          notes: closeForm.notes?.trim() || "",
          created_by: user.id,
        });
      }
    }
    if (toInsertUnpaid.length > 0) {
      await supabase.from("unpaid_expenses" as any).insert(toInsertUnpaid as any);
    }

    toast({ title: editingRegId ? "✅ Fechamento atualizado" : "🔒 Caixa fechado!" });
    setShowClose(false);
    try { localStorage.removeItem(closeDraftKey); } catch {}
    setCloseForm(defaultCloseForm);
    const wasEditing = !!editingRegId;
    if (wasEditing) {
      setRegister(editingRegBackup);
      setEditingRegId(null);
      setEditingRegBackup(null);
      await fetchHistory();
    }
    await fetchRegister();
    // Imprime relatório automaticamente após fechar (apenas em fechamento real)
    if (!wasEditing) {
      const reportData: CashRegister = {
        ...register,
        ...payload,
      } as CashRegister;
      printRegisterReport(reportData, paymentTotals, closeSummary, orderStats, topItems);
    }
  };

  const discardReopen = async () => {
    if (!storeId || !user || !register || register.status !== "open" || register.reopen_count <= 0) return;
    const { data: lastReopen, error: eventError } = await supabase
      .from("cash_register_events")
      .select("snapshot")
      .eq("cash_register_id", register.id)
      .eq("event_type", "reopen")
      .order("event_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapshot = lastReopen?.snapshot as Partial<CashRegister> | null;
    const baseRestore = !eventError && snapshot && snapshot.status === "closed"
      ? snapshot
      : { ...register, status: "closed" as const };

    const restorePayload = { ...baseRestore, reopen_count: Math.max((register.reopen_count || 1) - 1, 0), last_reopened_at: null };
    delete (restorePayload as any).id;
    const { error } = await supabase.from("cash_registers").update(restorePayload as any).eq("id", register.id);
    if (error) {
      toast({ title: "Erro ao descartar reabertura", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("cash_register_events").insert({
      cash_register_id: register.id,
      store_id: storeId,
      event_type: "discard_reopen",
      performed_by: user.id,
      snapshot: restorePayload,
    });
    toast({ title: "↩️ Reabertura descartada" });
    await fetchRegister();
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
      .select("id, payment_method, total, status, trashed_at, amount_paid_cash, amount_paid_pix, amount_paid_card, change_given_cash, change_given_pix, change_given_card, change_for")
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
      const t = Number(o.total) || 0;
      totals.total += t;
      // A nota inteira entregue pelo cliente entra no caixa (troco não desconta).
      const rawPaidCash = Number(o.amount_paid_cash) || 0;
      const changeFor   = Number(o.change_for) || 0;
      const isCashOrder = String(o.payment_method || "") === "dinheiro";
      const paidCash = Math.max(
        rawPaidCash,
        isCashOrder ? Math.max(changeFor, t) : 0,
      );
      const paidPix  = Number(o.amount_paid_pix)  || (String(o.payment_method) === "pix" ? t : 0);
      const paidCard = Number(o.amount_paid_card) || (["cartao","card","debito","credito"].includes(String(o.payment_method)) ? t : 0);
      totals.cash += paidCash;
      totals.pix  += paidPix;
      totals.card += paidCard;
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
      top = [...nameQty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1).map(([name, qty]) => ({ name, qty }));
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

  // (saveRegisterEdits removido — edição agora é feita via handleOpen/handleClose em modo editingRegId)

  // Reopen check: allowed if same business day OR before 6am of next day
  const canReopen = useMemo(() => {
    if (!register || register.status !== "closed") return false;
    if (register.business_day === todayBusinessDay) return true;
    return false; // business day already cuts off at 6am, so any later day means too late
  }, [register, todayBusinessDay]);

  // ============== Close summary calculations ==============
  const closeSummary = useMemo(() => {
    // Gastos por método de pagamento
    // ⚠️ "unpaid" (não pago) é IGNORADO — não entra em nenhum total/cálculo do caixa.
    // Será gravado em uma tabela separada (unpaid_expenses) ao salvar o fechamento.
    const expensesByMethod = { cash: 0, pix: 0, card: 0 };
    const addExpense = (amountStr: string, method: PayMethod) => {
      const v = Number(amountStr) || 0;
      if (method === "unpaid") return; // não impacta caixa
      expensesByMethod[method] += v;
    };
    addExpense(closeForm.expense_employees, closeForm.expense_employees_method);
    addExpense(closeForm.expense_couriers,  closeForm.expense_couriers_method);
    addExpense(closeForm.expense_purchases, closeForm.expense_purchases_method);
    addExpense(closeForm.expense_gasoline,  closeForm.expense_gasoline_method);
    addExpense(closeForm.expense_ads,       closeForm.expense_ads_method);
    addExpense(closeForm.expense_other,     closeForm.expense_other_method);
    // Troco agora é registrado por pedido (change_given_*), não no fechamento.
    const expensesTotal = expensesByMethod.cash + expensesByMethod.pix + expensesByMethod.card;


    const declaredPix = parseMoneyInput(closeForm.closing_pix);
    const declaredCard = parseMoneyInput(closeForm.closing_card);
    const declaredCash = parseMoneyInput(closeForm.closing_cash);
    const declaredTotal = declaredPix + declaredCard + declaredCash;

    const openingCash = register?.opening_cash || 0;
    const openingPix = register?.opening_pix || 0;
    const openingCard = register?.opening_card || 0;
    // Reserva de troco: prioriza o que o operador digitou agora no fechamento.
    // Se vazio, usa o que foi registrado na abertura.
    const closingChangeReserveStr = (closeForm as any).closing_change_reserve;
    const hasClosingReserveTyped = closingChangeReserveStr !== undefined
      && String(closingChangeReserveStr).trim() !== "";
    const openingChange = hasClosingReserveTyped
      ? parseMoneyInput(closingChangeReserveStr)
      : (register?.opening_change_reserve || 0);
    const opening = openingCash + openingPix + openingCard + openingChange;

    // ============= ETAPA 1: BRUTO DE VENDAS (somente vendas, sem abertura) =============
    // gross_* representa o faturamento do dia por método — NÃO inclui saldo de abertura.
    const grossCash = roundMoney(paymentTotals.cash);
    const grossPix  = roundMoney(paymentTotals.pix);
    const grossCard = roundMoney(paymentTotals.card);

    const declaredGrossCash = parseMoneyInput(closeForm.declared_gross_cash);
    const declaredGrossPix  = parseMoneyInput(closeForm.declared_gross_pix);
    const declaredGrossCard = parseMoneyInput(closeForm.declared_gross_card);

    const diffGrossCash = roundMoney(declaredGrossCash - grossCash);
    const diffGrossPix  = roundMoney(declaredGrossPix  - grossPix);
    const diffGrossCard = roundMoney(declaredGrossCard - grossCard);

    // ============= ETAPA 3: SALDO ESPERADO (após gastos, com abertura) =============
    // Esperado = Abertura (do método) + Vendas (do método) − Gastos (do método)
    const expectedCash = roundMoney(openingCash + openingChange + grossCash - expensesByMethod.cash);
    const expectedPix  = roundMoney(openingPix  + grossPix  - expensesByMethod.pix);
    const expectedCard = roundMoney(openingCard + grossCard - expensesByMethod.card);
    const expectedTotal = roundMoney(expectedCash + expectedPix + expectedCard);

    const diffCash = roundMoney(declaredCash - expectedCash);
    const diffPix  = roundMoney(declaredPix  - expectedPix);
    const diffCard = roundMoney(declaredCard - expectedCard);
    const diffTotal = roundMoney(declaredTotal - expectedTotal);

    const grossRevenue = paymentTotals.total;
    const netRevenue = grossRevenue - expensesTotal;
    const netAfterCogs = netRevenue - productsCostInfo.totalCost;
    const cogsIsEstimate = productsCostInfo.missingCount > 0;

    const externalAds = parseMoneyInput(closeForm.expense_ads_external);

    return {
      opening, expensesTotal, expensesByMethod, declaredTotal, expectedTotal,
      expectedCash, expectedPix, expectedCard,
      diffCash, diffPix, diffCard, diffTotal,
      // Reserva de troco aplicada no cálculo (digitada ou herdada da abertura)
      changeReserve: openingChange,
      // Etapa 1 — bruto
      grossCash, grossPix, grossCard,
      declaredGrossCash, declaredGrossPix, declaredGrossCard,
      diffGrossCash, diffGrossPix, diffGrossCard,
      grossRevenue, netRevenue,
      productsCost: productsCostInfo.totalCost,
      netAfterCogs, cogsIsEstimate,
      missingCostUnits: productsCostInfo.missingCount,
      totalSoldUnits: productsCostInfo.totalProducts,
      externalAds,
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
  // Caixa de dia anterior ainda em aberto: apenas EXIBE aviso — não bloqueia mais
  // a abertura de um novo caixa (o anterior pode ser encerrado pelo Histórico).
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Unlock size={16} className="mr-1" /> Abrir Caixa
            </Button>
          ) : isOpenToday ? (
            <>
              {register.reopen_count > 0 && register.closed_at && (
                <Button variant="outline" onClick={discardReopen}>
                  <RefreshCw size={16} className="mr-1" /> Descartar Reabertura
                </Button>
              )}
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
            </>
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
      <Dialog open={showOpen} onOpenChange={(o) => {
        setShowOpen(o);
        if (!o && editingRegId) {
          // Cancelou edição da abertura → restaurar caixa ativo real
          setRegister(editingRegBackup);
          setEditingRegId(null);
          setEditingRegBackup(null);
          setOpenForm(defaultOpenForm);
        }
      }}>
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
              <Label>Saldo em máquina/cartão (R$)</Label>
              <Input type="number" step="0.01" value={openForm.card}
                onChange={(e) => setOpenForm({ ...openForm, card: e.target.value })} />
            </div>
            <div>
              <Label>Saldo em PIX/conta (R$)</Label>
              <Input type="number" step="0.01" value={openForm.pix}
                onChange={(e) => setOpenForm({ ...openForm, pix: e.target.value })} />
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
      <Dialog open={showClose} onOpenChange={(o) => {
        setShowClose(o);
        if (!o && editingRegId) {
          // Cancelou edição do fechamento → restaurar caixa ativo real
          setRegister(editingRegBackup);
          setEditingRegId(null);
          setEditingRegBackup(null);
          setCloseForm(defaultCloseForm);
        }
      }}>
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
                <div>Máquina/Cartão: <strong>{fmt(register.opening_card)}</strong></div>
                <div>PIX/Conta: <strong>{fmt(register.opening_pix || 0)}</strong></div>
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
                <div className="text-[11px] text-muted-foreground italic">
                  Selecione a forma de pagamento de cada gasto — afeta o cálculo do esperado em caixa.
                </div>
                {[
                  ["expense_employees", "Funcionários"],
                  ["expense_couriers", "Entregadores"],
                  ["expense_purchases", "Compras"],
                  ["expense_gasoline", "Gasolina"],
                  ["expense_ads", "Anúncios / Divulgação"],
                  ["expense_other", "Outros"],
                ].map(([key, label]) => {
                  const isCouriers = key === "expense_couriers";
                  const autoMap: Record<string, number> = {
                    expense_employees: autoExpenses.employees,
                    expense_gasoline: autoExpenses.gasoline,
                    expense_other: autoExpenses.other,
                  };
                  const autoVal = isCouriers ? autoCouriers.total : (autoMap[key as string] || 0);
                  const methodKey = `${key}_method` as keyof typeof closeForm;
                  const declared = Number((closeForm as any)[key]) || 0;
                  const matchesAuto = autoVal > 0 && Math.abs(declared - autoVal) < 0.01;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="grid grid-cols-[1fr_110px_120px] gap-2 items-center">
                        <Label className="text-sm flex items-center gap-1">
                          {label}
                          {autoVal > 0 && (
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-bold",
                                matchesAuto ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"
                              )}
                              title={matchesAuto ? "Valor puxado automaticamente" : "Valor alterado manualmente"}
                            >
                              {matchesAuto ? "AUTO" : "MANUAL"}
                            </span>
                          )}
                        </Label>
                        <Select
                          value={(closeForm as any)[methodKey]}
                          onValueChange={(v) => setCloseForm({ ...closeForm, [methodKey]: v as PayMethod })}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">💰 Dinheiro</SelectItem>
                            <SelectItem value="pix">📲 PIX</SelectItem>
                            <SelectItem value="card">💳 Cartão</SelectItem>
                            <SelectItem value="unpaid">⏳ Não pago</SelectItem>
                          </SelectContent>
                        </Select>
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
                      {!isCouriers && autoVal > 0 && (
                        <div className="text-[11px] text-muted-foreground pl-1">
                          📒 Puxado de "Gastos do Dia": <strong className="text-foreground">{fmt(autoVal)}</strong>
                          {!matchesAuto && (
                            <button
                              type="button"
                              className="ml-2 underline text-primary"
                              onClick={() => setCloseForm({ ...closeForm, [key as string]: autoVal.toFixed(2) } as any)}
                            >
                              usar automático
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 💼 Anúncios pagos pelo dono (externos) — não impactam caixa nem lucro */}
                <div className="space-y-1 rounded-lg border border-dashed border-purple-400/40 bg-purple-50/30 dark:bg-purple-500/5 p-2">
                  <div className="grid grid-cols-[1fr_110px_120px] gap-2 items-center">
                    <Label className="text-sm flex items-center gap-1">
                      Anúncios <span className="text-purple-600 font-bold">(externo)</span>
                    </Label>
                    <div className="text-[11px] text-purple-700 dark:text-purple-300 font-bold text-center">
                      💼 Pago pelo dono
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      value={closeForm.expense_ads_external}
                      onChange={(e) => setCloseForm({ ...closeForm, expense_ads_external: e.target.value })}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground italic pl-1">
                    Não entra no caixa nem no cálculo de lucro — apenas histórico.
                  </div>
                </div>

                {/* Troco agora é registrado por pedido (PDV) — não há mais campo manual aqui. */}

                <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                  <div className="rounded bg-muted/50 px-2 py-1">💰 Dinheiro: <strong>{fmt(closeSummary.expensesByMethod.cash)}</strong></div>
                  <div className="rounded bg-muted/50 px-2 py-1">📲 PIX: <strong>{fmt(closeSummary.expensesByMethod.pix)}</strong></div>
                  <div className="rounded bg-muted/50 px-2 py-1">💳 Cartão: <strong>{fmt(closeSummary.expensesByMethod.card)}</strong></div>
                </div>
                <div className="text-right text-sm font-bold">
                  Total gastos: <span className="text-destructive">{fmt(closeSummary.expensesTotal)}</span>
                </div>
                {closeSummary.externalAds > 0 && (
                  <div className="rounded-lg border border-purple-400/40 bg-purple-50/40 dark:bg-purple-500/10 px-3 py-2 text-[11px] text-purple-800 dark:text-purple-200">
                    ℹ️ <strong>{fmt(closeSummary.externalAds)}</strong> em anúncios foram pagos pelo proprietário e <strong>não impactam</strong> o caixa ou lucro.
                  </div>
                )}
              </div>


              {/* ETAPA 1 — Valores reais do fim do dia (unificados) */}
              <div className="space-y-2 rounded-lg border-2 border-emerald-500/40 bg-emerald-500/5 p-3">
                <div className="font-bold text-sm">💰 Valores reais ao final do dia</div>
                <div className="text-[11px] text-muted-foreground italic">
                  Informe quanto realmente tem na gaveta e na conta (PIX + cartão).
                </div>

                {/* Reserva de troco — dinheiro que já estava na gaveta antes da abertura */}
                <div className="rounded-md border border-amber-400/50 bg-amber-50/60 dark:bg-amber-500/10 p-2 space-y-1">
                  <div className="grid grid-cols-[1fr_140px] gap-2 items-center">
                    <Label className="text-sm">🪙 Reserva de troco (já estava na gaveta)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={(closeForm as any).closing_change_reserve ?? ""}
                      placeholder="0,00"
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d.,-]/g, "");
                        setCloseForm({ ...closeForm, closing_change_reserve: raw } as any);
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-amber-800 dark:text-amber-200 italic">
                    Use quando havia dinheiro na gaveta no início do dia que não foi registrado na abertura. Soma ao Esperado em dinheiro.
                  </div>
                </div>

                {/* Dinheiro na gaveta */}
                <div className="grid grid-cols-[1fr_auto_140px] gap-2 items-center">
                  <Label className="text-sm">💰 Dinheiro na gaveta</Label>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    Esperado: <strong className="text-foreground">{fmt(closeSummary.expectedCash)}</strong>
                  </span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={closeForm.closing_cash}
                    placeholder="0,00"
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d.,-]/g, "");
                      setCloseForm({ ...closeForm, closing_cash: raw });
                    }}
                  />
                </div>

                {/* Conta unificada (PIX + cartão) */}
                {(() => {
                  const expectedAccount = roundMoney(closeSummary.expectedPix + closeSummary.expectedCard);
                  return (
                    <div className="space-y-1">
                      <div className="grid grid-cols-[1fr_auto_140px] gap-2 items-center">
                        <Label className="text-sm">🏦 Saldo em conta (PIX + cartão)</Label>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          Esperado: <strong className="text-foreground">{fmt(expectedAccount)}</strong>
                        </span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={closeForm.closing_account ?? ""}
                          placeholder="0,00"
                          onChange={(e) => {
                            // Aceita vírgula OU ponto. Mantém string crua para
                            // permitir digitação livre, e distribui o valor
                            // numérico exato (sem reformatar para .toFixed) para
                            // não perder centavos durante a digitação.
                            const raw = e.target.value.replace(/[^\d.,-]/g, "");
                            const normalized = raw.replace(",", ".");
                            const total = Number(normalized);
                            const safeTotal = Number.isFinite(total) ? total : 0;
                            setCloseForm({
                              ...closeForm,
                              closing_account: raw,
                              closing_pix: String(safeTotal),
                              closing_card: "0",
                            });
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* placeholder removed-details */}


              {/* ETAPA 3 — RESULTADO (consolidado: dinheiro vs conta) */}
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
                <div className="font-bold mb-1 flex items-center gap-2">
                  <CheckCircle2 size={16} /> Resultado do fechamento
                </div>
                <div className="text-[11px] text-muted-foreground italic mb-2">
                  Comparação direta entre o esperado pelo sistema e o real informado.
                </div>

                {/* 💰🏦 Saldo final consolidado: Caixa físico vs Conta digital */}
                {(() => {
                  // "Informado" = APENAS o que o operador digitou manualmente.
                  // Se um campo está vazio, tratamos como "não informado" e
                  // não calculamos diferença (evita alertas falsos).
                  const cashTyped = (closeForm.closing_cash ?? "").toString().trim() !== "";
                  const pixTyped = (closeForm.closing_pix ?? "").toString().trim() !== "";
                  const cardTyped = (closeForm.closing_card ?? "").toString().trim() !== "";
                  const accountTyped = pixTyped || cardTyped;

                  const declaredCash = parseMoneyInput(closeForm.closing_cash);
                  const declaredPix = parseMoneyInput(closeForm.closing_pix);
                  const declaredCard = parseMoneyInput(closeForm.closing_card);
                  const expectedAccount = roundMoney(closeSummary.expectedPix + closeSummary.expectedCard);
                  const declaredAccount = roundMoney(declaredPix + declaredCard);
                  const diffCashTotal = roundMoney(declaredCash - closeSummary.expectedCash);
                  const diffAccount = roundMoney(declaredAccount - expectedAccount);

                  const renderStatus = (diff: number, typed: boolean) => {
                    if (!typed) return <span className="text-muted-foreground italic">Aguardando valor informado…</span>;
                    const abs = Math.abs(diff);
                    if (abs < 0.01) return <span className="text-emerald-700 font-bold">✔ Tudo conferido</span>;
                    return <span className="text-amber-800 font-bold">⚠️ Diferença a conferir</span>;
                  };

                  const diffNode = (diff: number, typed: boolean) => {
                    if (!typed) return <span className="text-muted-foreground">—</span>;
                    const abs = Math.abs(diff);
                    if (abs < 0.01) return <span className="text-foreground">{fmt(0)}</span>;
                    const isSurplus = diff > 0;
                    const cls = abs > 20 ? "text-destructive" : isSurplus ? "text-emerald-700" : "text-amber-700";
                    return (
                      <span className={cls}>
                        {isSurplus ? `+ ${fmt(abs)} (sobra)` : `− ${fmt(abs)} (falta)`}
                      </span>
                    );
                  };

                  const informedNode = (value: number, typed: boolean) =>
                    typed ? (
                      <strong className="text-foreground text-sm">{fmt(value)}</strong>
                    ) : (
                      <span className="text-muted-foreground italic text-xs">não informado</span>
                    );

                  return (
                    <>
                      <hr className="my-2 border-border" />
                      <div className="font-bold text-sm flex items-center gap-2">
                        🧾 Saldo final — quanto deveria ter na gaveta e no banco
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {/* CAIXA FÍSICO */}
                        <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-500/5 p-3 space-y-1 text-xs">
                          <div className="font-bold text-sm">💰 Caixa físico (dinheiro)</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>Esperado<br/><strong className="text-foreground text-sm">{fmt(closeSummary.expectedCash)}</strong></div>
                            <div>Contado<br/>{informedNode(declaredCash, cashTyped)}</div>
                            <div>Diferença<br/><strong className="text-sm">{diffNode(diffCashTotal, cashTyped)}</strong></div>
                          </div>
                          <div className="pt-1 text-[11px]">{renderStatus(diffCashTotal, cashTyped)}</div>
                        </div>

                        {/* CONTA DIGITAL */}
                        <div className="rounded-lg border-2 border-sky-500/40 bg-sky-500/5 p-3 space-y-1 text-xs">
                          <div className="font-bold text-sm">🏦 Saldo em conta (PIX + Cartão)</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>Esperado<br/><strong className="text-foreground text-sm">{fmt(expectedAccount)}</strong></div>
                            <div>Informado<br/>{informedNode(declaredAccount, accountTyped)}</div>
                            <div>Diferença<br/><strong className="text-sm">{diffNode(diffAccount, accountTyped)}</strong></div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                            <div className="rounded bg-background/60 px-2 py-1">
                              📲 PIX esperado: <strong>{fmt(closeSummary.expectedPix)}</strong>
                            </div>
                            <div className="rounded bg-background/60 px-2 py-1">
                              💳 Cartão esperado: <strong>{fmt(closeSummary.expectedCard)}</strong>
                            </div>
                          </div>
                          <div className="pt-1 text-[11px]">{renderStatus(diffAccount, accountTyped)}</div>
                        </div>
                      </div>
                    </>
                  );
                })()}

                <hr className="my-2 border-border" />
                <div className="font-bold">📊 Resultado financeiro</div>
                <Row label="Faturamento (vendas)" value={fmt(closeSummary.grossRevenue)} />
                <Row label="− Total de gastos" value={fmt(closeSummary.expensesTotal)} negative />
                <Row label="= Lucro bruto" value={fmt(closeSummary.netRevenue)} bold />
                <Row
                  label={`− Custo dos produtos${closeSummary.cogsIsEstimate ? " (estimado)" : ""}`}
                  value={fmt(closeSummary.productsCost)}
                  negative
                />
                <Row
                  label={`= Lucro líquido${closeSummary.cogsIsEstimate ? " (estimado)" : ""}`}
                  value={fmt(closeSummary.netAfterCogs)}
                  bold
                  warn={closeSummary.cogsIsEstimate}
                />
                {closeSummary.cogsIsEstimate && closeSummary.totalSoldUnits > 0 && (
                  <div className="text-[11px] text-amber-700 italic">
                    ⚠️ {closeSummary.missingCostUnits} de {closeSummary.totalSoldUnits} itens vendidos sem custo cadastrado — valor aproximado (~35% do preço).
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
                <div className="ml-auto flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => reprintRegister(r)}>
                    <Printer size={14} className="mr-1" /> Imprimir
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    // 🔧 Abrir o MODAL REAL de Abertura, pré-preenchido, em modo edição
                    const oM = (r.notes || "").match(/\[Aberto por:\s*([^\]]+)\]/);
                    setEditingRegBackup(register);
                    setEditingRegId(r.id);
                    setRegister(r);
                    setOpenForm({
                      cash: String(r.opening_cash ?? 0),
                      card: String(r.opening_card ?? 0),
                      pix: String(r.opening_pix ?? 0),
                      change_reserve: String(r.opening_change_reserve ?? 0),
                      notes: "",
                      responsible_name: oM ? oM[1].trim() : "",
                    });
                    setShowHistory(false);
                    setShowOpen(true);
                  }}>
                    <Pencil size={14} className="mr-1" /> Editar Abertura
                  </Button>
                  {r.closed_at ? (
                    <Button size="sm" variant="outline" onClick={() => {
                      // 🔧 Abrir o MODAL REAL de Fechamento, pré-preenchido, em modo edição
                      const cM = (r.notes || "").match(/\[Fechado por:\s*([^\]]+)\]/);
                      setEditingRegBackup(register);
                      setEditingRegId(r.id);
                      setRegister(r);
                      setCloseForm(closeFormFromRegister(r, cM ? cM[1].trim() : ""));
                      setShowHistory(false);
                      setShowClose(true);
                    }}>
                      <Pencil size={14} className="mr-1" /> Editar Fechamento
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => {
                        // Fechar um caixa que ainda está aberto (ex.: do dia anterior)
                        setEditingRegBackup(register);
                        setEditingRegId(r.id);
                        setRegister(r);
                        setCloseForm(closeFormFromRegister(r, ""));
                        setShowHistory(false);
                        setShowClose(true);
                      }}
                    >
                      <Lock size={14} className="mr-1" /> Fechar Caixa
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistory(false)}>Fechar</Button>
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

  // ✅ FONTE DA VERDADE: se o caixa já foi fechado, usar os valores persistidos
  // (expected_* salvos no momento do fechamento, que JÁ consideram abertura − gastos por método).
  // Para caixas abertos (preview), recai no cálculo dinâmico abertura + vendas − gastos por método.
  const expensesByMethod = { cash: 0, pix: 0, card: 0 };
  expensesByMethod[reg.expense_employees_method] += reg.expense_employees || 0;
  expensesByMethod[reg.expense_couriers_method]  += reg.expense_couriers  || 0;
  expensesByMethod[reg.expense_purchases_method] += reg.expense_purchases || 0;
  expensesByMethod[reg.expense_gasoline_method]  += reg.expense_gasoline  || 0;
  expensesByMethod[reg.expense_ads_method]       += reg.expense_ads       || 0;
  expensesByMethod[reg.expense_other_method]     += reg.expense_other     || 0;

  const isClosedSnapshot = reg.status === "closed" && (reg.expected_cash != null || reg.expected_pix != null || reg.expected_card != null);
  const expectedCash = isClosedSnapshot
    ? Number(reg.expected_cash || 0)
    : (reg.opening_cash || 0) + (reg.opening_change_reserve || 0) + totals.cash - expensesByMethod.cash;
  const expectedPix = isClosedSnapshot
    ? Number(reg.expected_pix || 0)
    : (reg.opening_pix || 0) + totals.pix - expensesByMethod.pix;
  const expectedCard = isClosedSnapshot
    ? Number(reg.expected_card || 0)
    : (reg.opening_card || 0) + totals.card - expensesByMethod.card;
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
  const html = makeTightThermalPrintHtml(`<!doctype html><html><head><meta charset="utf-8"/>
<title>Relatorio Caixa ${reg.business_day}</title>
<style>
@page { size: 80mm auto; margin: 0 !important; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { margin: 0 !important; padding: 0 !important; border: 0 !important; min-height: 0 !important; height: auto !important; }
body { font-family: Arial, sans-serif; font-weight: 900; color: #000; font-size: 12px; width: 80mm; overflow: visible; }
h1 { font-size: 14px; text-align: center; margin: 4px 0; }
.row { display: flex; justify-content: space-between; }
hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
.warn { color: #b45309; }
.big { font-size: 13px; }
</style></head><body>
<h1>RELATÓRIO DE CAIXA</h1>
<div class="row"><span>${reg.business_day}</span><strong>${reg.status === "open" ? "ABERTO" : "FECHADO"}</strong></div>
${openedBy || closedBy ? `<div class="row" style="font-size:11px;"><span>${openedBy ? `Abert.: ${openedBy}` : ""}</span><span>${closedBy ? `Fech.: ${closedBy}` : ""}</span></div>` : ""}
<hr/>
<div class="row"><span>Pedidos:</span><strong>${stats.completed}${stats.cancelled > 0 ? ` (${stats.cancelled} canc.)` : ""}</strong></div>
${topItems.length > 0 ? `<div class="row"><span>Mais vendido:</span><strong>${topItems[0].name} ${topItems[0].qty}×</strong></div>` : ""}
<hr/>
<div><strong>VENDAS</strong></div>
<div class="row"><span>Dinheiro:</span><span>${f(totals.cash)}</span></div>
<div class="row"><span>PIX:</span><span>${f(totals.pix)}</span></div>
<div class="row"><span>Cartão:</span><span>${f(totals.card)}</span></div>
<div class="row"><span>BRUTO:</span><strong>${f(summary.grossRevenue)}</strong></div>
<hr/>
<div><strong>GASTOS</strong></div>
${reg.expense_employees > 0 ? `<div class="row"><span>Funcionários:</span><span>${f(reg.expense_employees)}</span></div>` : ""}
${reg.expense_couriers > 0 ? `<div class="row"><span>Entregadores:</span><span>${f(reg.expense_couriers)}</span></div>` : ""}
${reg.expense_purchases > 0 ? `<div class="row"><span>Compras:</span><span>${f(reg.expense_purchases)}</span></div>` : ""}
${reg.expense_gasoline > 0 ? `<div class="row"><span>Gasolina:</span><span>${f(reg.expense_gasoline)}</span></div>` : ""}
${reg.expense_ads > 0 ? `<div class="row"><span>Anúncios:</span><span>${f(reg.expense_ads)}</span></div>` : ""}
${reg.expense_other > 0 ? `<div class="row"><span>Outros:</span><span>${f(reg.expense_other)}</span></div>` : ""}
<div class="row"><span>TOTAL:</span><strong>${f(summary.expensesTotal)}</strong></div>
<hr/>
${(() => {
  // Só considerar como "informado" os campos que o operador realmente digitou.
  // Quando o valor declarado é 0 e o esperado também é 0, tratamos como "—".
  // Quando o valor declarado é 0 mas o esperado é > 0, consideramos não informado.
  const cashInformed = Number(reg.closing_cash) > 0 || Number(summary.expectedCash) === 0;
  const pixInformed  = Number(reg.closing_pix)  > 0 || Number(summary.expectedPix)  === 0;
  const cardInformed = Number(reg.closing_card) > 0 || Number(summary.expectedCard) === 0;
  const dash = "—";
  const declaredAccount = Number(reg.closing_pix) + Number(reg.closing_card);
  const accountInformed = pixInformed || cardInformed;
  const diffCashShown = cashInformed ? `<strong>${f(summary.diffCash)}</strong>` : `<strong>${dash}</strong>`;
  const diffPixShown  = pixInformed  ? `<strong>${f(summary.diffPix)}</strong>`  : `<strong>${dash}</strong>`;
  const diffCardShown = cardInformed ? `<strong>${f(summary.diffCard)}</strong>` : `<strong>${dash}</strong>`;
  const declCash = cashInformed ? f(reg.closing_cash) : dash;
  const declPix  = pixInformed  ? f(reg.closing_pix)  : dash;
  const declCard = cardInformed ? f(reg.closing_card) : dash;
  // Diferença total apenas para campos informados
  let diffTotalReal = 0;
  if (cashInformed) diffTotalReal += summary.diffCash;
  if (pixInformed)  diffTotalReal += summary.diffPix;
  if (cardInformed) diffTotalReal += summary.diffCard;
  const anyInformed = cashInformed || pixInformed || cardInformed;
  // Saldo final usa o VALOR REAL INFORMADO quando houver; caso contrário, "—"
  const finalCash = cashInformed ? f(reg.closing_cash) : dash;
  const finalAccount = accountInformed ? f(declaredAccount) : dash;
  return `
<div><strong>CONFERÊNCIA (Esp. / Inf. / Dif.)</strong></div>
<div class="row"><span>💰 Dinheiro:</span><span>${f(summary.expectedCash)} / ${declCash} / ${diffCashShown}</span></div>
<div class="row"><span>📲 PIX:</span><span>${f(summary.expectedPix)} / ${declPix} / ${diffPixShown}</span></div>
<div class="row"><span>💳 Cartão:</span><span>${f(summary.expectedCard)} / ${declCard} / ${diffCardShown}</span></div>
<div class="row big ${anyInformed && Math.abs(diffTotalReal) > 0.01 ? "warn" : ""}"><span>DIFERENÇA:</span><strong>${anyInformed ? f(diffTotalReal) : dash}</strong></div>
<hr/>
<div><strong>RESULTADO</strong></div>
<div class="row"><span>Bruto:</span><span>${f(summary.grossRevenue)}</span></div>
<div class="row"><span>− Gastos:</span><span class="warn">${f(summary.expensesTotal)}</span></div>
<div class="row big"><span>LÍQUIDO:</span><strong>${f(summary.netRevenue)}</strong></div>
<div class="row"><span>− Custo prod.${summary.cogsIsEstimate ? " (est.)" : ""}:</span><span class="warn">${f(summary.productsCost)}</span></div>
<div class="row big ${summary.cogsIsEstimate ? "warn" : ""}"><span>LUCRO${summary.cogsIsEstimate ? " EST." : ""}:</span><strong>${f(summary.netAfterCogs)}</strong></div>
<hr/>
<div><strong>SALDO FINAL (valores informados)</strong></div>
<div class="row big"><span>💰 Gaveta:</span><strong>${finalCash}</strong></div>
<div class="row big"><span>🏦 Conta:</span><strong>${finalAccount}</strong></div><hr/>`;
})()}
<div class="separator thermal-cut-marker" data-thermal-cut="true" data-thermal-user-cut="true" style="border-top:1px dashed #000;margin:0;padding:0;"></div>
<script>
(function(){
  var copies = 10, done = 0, gap = 1200;
  function fire(){
    if (done >= copies) { try { window.close(); } catch(e){} return; }
    try { window.focus(); } catch(e){}
    try { window.prepareTightThermalPrintPage && window.prepareTightThermalPrintPage(); } catch(e){}
    setTimeout(function(){
      try { window.prepareTightThermalPrintPage && window.prepareTightThermalPrintPage(); } catch(e){}
      try { window.print(); } catch(e){}
      setTimeout(function(){ done++; fire(); }, gap);
    }, 180);
  }
  window.onload = function(){ setTimeout(fire, 500); };
})();
</script>
</body></html>`, 80);
  const w = window.open("", "_print_caixa_" + Date.now(), "width=320,height=120");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
