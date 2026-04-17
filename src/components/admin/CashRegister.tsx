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

  const [register, setRegister] = useState<CashRegister | null>(null);
  const [loading, setLoading] = useState(true);
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

  // Live clock — updates every second for the open-time counter and current date/time labels
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Open form
  const [openForm, setOpenForm] = useState({
    cash: "0", card: "0", change_reserve: "0", notes: "",
  });

  // Close form
  const [closeForm, setCloseForm] = useState({
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
  });

  const todayBusinessDay = formatBusinessDate(nowBrasilia());

  /** Fetch today's register, plus the previous day's if it's still open (must close first) */
  const fetchRegister = useCallback(async () => {
    setLoading(true);
    if (!storeId) {
      setRegister(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("cash_registers")
      .select("*")
      .eq("store_id", storeId)
      .order("business_day", { ascending: false })
      .limit(5);

    const list = (data || []) as CashRegister[];
    const today = list.find((r) => r.business_day === todayBusinessDay);
    const previousOpen = list.find((r) => r.business_day !== todayBusinessDay && r.status === "open");

    // Priority: previous-day-open (must close first), else today's
    setRegister(previousOpen || today || null);
    setLoading(false);
  }, [storeId, todayBusinessDay]);

  /** Compute the day's payment breakdown based on delivered orders */
  const fetchPaymentTotals = useCallback(async (businessDay: string) => {
    if (!storeId) return;
    const { start, end } = getBusinessDayRange(new Date(businessDay + "T12:00:00"));
    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, payment_method, total, status")
      .gte("created_at", start)
      .lte("created_at", end)
      .eq("store_id", storeId)
      .in("status", ["delivered", "ready", "delivering", "preparing"]);

    const totals: PaymentBreakdown = { pix: 0, card: 0, cash: 0, other: 0, total: 0 };
    const orderIds: string[] = [];
    (ordersData || []).forEach((o: any) => {
      orderIds.push(o.id);
      const m = String(o.payment_method || "").toLowerCase();
      const t = Number(o.total) || 0;
      totals.total += t;
      if (m === "pix") totals.pix += t;
      else if (m.includes("card") || m.includes("cart") || m.includes("debit") || m.includes("credit")) totals.card += t;
      else if (m.includes("dinheiro") || m === "cash" || m === "money") totals.cash += t;
      else totals.other += t;
    });
    setPaymentTotals(totals);

    // Compute Cost of Goods Sold (COGS) for the day
    if (orderIds.length === 0) {
      setProductsCostInfo({ totalCost: 0, missingCount: 0, totalProducts: 0 });
      return;
    }
    const { data: itemsData } = await supabase
      .from("order_items")
      .select("product_id, quantity")
      .in("order_id", orderIds);

    const productQty = new Map<string, number>();
    let totalUnits = 0;
    (itemsData || []).forEach((it: any) => {
      if (!it.product_id) return;
      const q = Number(it.quantity) || 0;
      totalUnits += q;
      productQty.set(it.product_id, (productQty.get(it.product_id) || 0) + q);
    });

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

  const handleOpen = async () => {
    if (!storeId || !user) {
      toast({
        title: "Não foi possível abrir o caixa",
        description: !storeId ? "Loja não identificada." : "Usuário não autenticado.",
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
      notes: openForm.notes,
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
    setOpenForm({ cash: "0", card: "0", change_reserve: "0", notes: "" });
    await fetchRegister();
  };

  const handleClose = async () => {
    if (!storeId || !user || !register) return;
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
      notes: closeForm.notes,
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
    await fetchRegister();
    // Imprime relatório automaticamente após fechar
    const reportData: CashRegister = {
      ...register,
      ...payload,
    } as CashRegister;
    printRegisterReport(reportData, paymentTotals, closeSummary);
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
    const { data } = await supabase
      .from("orders")
      .select("payment_method, total, status")
      .gte("created_at", start)
      .lte("created_at", end)
      .eq("store_id", reg.store_id)
      .in("status", ["delivered", "ready", "delivering", "preparing"]);
    const totals: PaymentBreakdown = { pix: 0, card: 0, cash: 0, other: 0, total: 0 };
    (data || []).forEach((o: any) => {
      const m = String(o.payment_method || "").toLowerCase();
      const t = Number(o.total) || 0;
      totals.total += t;
      if (m === "pix") totals.pix += t;
      else if (m.includes("card") || m.includes("cart") || m.includes("debit") || m.includes("credit")) totals.card += t;
      else if (m.includes("dinheiro") || m === "cash" || m === "money") totals.cash += t;
      else totals.other += t;
    });
    const summary = computeSummary(reg, totals);
    printRegisterReport(reg, totals, summary);
  };

  /** Save edits to a saved register */
  const saveRegisterEdits = async () => {
    if (!editingReg) return;
    const { id, ...rest } = editingReg as any;
    const { error } = await supabase
      .from("cash_registers")
      .update({
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
        notes: rest.notes || "",
      })
      .eq("id", id);
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
                <div>Dinheiro: <strong>{fmt(register.opening_cash)}</strong></div>
                <div>Máquina/Conta: <strong>{fmt(register.opening_card)}</strong></div>
                <div>Troco reserva: <strong>{fmt(register.opening_change_reserve)}</strong></div>
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
                ].map(([key, label]) => (
                  <div key={key} className="grid grid-cols-2 gap-2 items-center">
                    <Label className="text-sm">{label}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={(closeForm as any)[key]}
                      onChange={(e) => setCloseForm({ ...closeForm, [key]: e.target.value })}
                    />
                  </div>
                ))}
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
                <div className="font-bold mb-2 flex items-center gap-2">
                  <CheckCircle2 size={16} /> Resumo / Quebra de caixa
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
                  <Button size="sm" variant="outline" onClick={() => setEditingReg({ ...r })}>
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

      {/* EDIT MODAL */}
      <Dialog open={!!editingReg} onOpenChange={(o) => !o && setEditingReg(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Caixa — {editingReg?.business_day}</DialogTitle>
          </DialogHeader>
          {editingReg && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["opening_cash", "Abertura: Dinheiro"],
                  ["opening_card", "Abertura: Máquina/Conta"],
                  ["opening_change_reserve", "Abertura: Troco reserva"],
                  ["expense_employees", "Gasto: Funcionários"],
                  ["expense_couriers", "Gasto: Entregadores"],
                  ["expense_purchases", "Gasto: Compras"],
                  ["expense_gasoline", "Gasto: Gasolina"],
                  ["expense_ads", "Gasto: Anúncios/Divulgação"],
                  ["expense_other", "Gasto: Outros"],
                  ["closing_pix", "Fechamento: PIX"],
                  ["closing_card", "Fechamento: Cartão"],
                  ["closing_cash", "Fechamento: Dinheiro"],
                ].map(([k, l]) => (
                  <div key={k}>
                    <Label className="text-xs">{l}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={(editingReg as any)[k] ?? 0}
                      onChange={(e) => setEditingReg({ ...editingReg, [k]: Number(e.target.value) } as any)}
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Input
                  value={editingReg.notes || ""}
                  onChange={(e) => setEditingReg({ ...editingReg, notes: e.target.value })}
                />
              </div>
            </div>
          )}
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
function computeSummary(reg: CashRegister, totals: PaymentBreakdown) {
  const expensesTotal =
    (reg.expense_employees || 0) + (reg.expense_couriers || 0) + (reg.expense_purchases || 0) +
    (reg.expense_gasoline || 0) + (reg.expense_other || 0);
  const declaredPix = reg.closing_pix || 0;
  const declaredCard = reg.closing_card || 0;
  const declaredCash = reg.closing_cash || 0;
  const declaredTotal = declaredPix + declaredCard + declaredCash;
  const expectedCash = (reg.opening_cash || 0) + (reg.opening_change_reserve || 0) + totals.cash - expensesTotal;
  const expectedPix = totals.pix;
  const expectedCard = (reg.opening_card || 0) + totals.card;
  const expectedTotal = expectedCash + expectedPix + expectedCard;
  return {
    expensesTotal, declaredTotal, expectedTotal, expectedCash, expectedPix, expectedCard,
    diffCash: declaredCash - expectedCash, diffPix: declaredPix - expectedPix,
    diffCard: declaredCard - expectedCard, diffTotal: declaredTotal - expectedTotal,
    grossRevenue: totals.total, netRevenue: totals.total - expensesTotal,
  };
}

function printRegisterReport(reg: CashRegister, totals: PaymentBreakdown, summary: ReturnType<typeof computeSummary>) {
  const f = (n: number) => `R$ ${(Number(n) || 0).toFixed(2).replace(".", ",")}`;
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
</style></head><body>
<h1>RELATÓRIO DE CAIXA</h1>
<div class="row"><span>Dia:</span><strong>${reg.business_day}</strong></div>
<div class="row"><span>Status:</span><strong>${reg.status === "open" ? "ABERTO" : "FECHADO"}</strong></div>
<hr/>
<div><strong>ABERTURA</strong></div>
<div class="row"><span>Data/Hora:</span><span>${formatDateTimeBR(reg.opened_at)}</span></div>
<div class="row"><span>Dinheiro:</span><span>${f(reg.opening_cash)}</span></div>
<div class="row"><span>Máquina/Conta:</span><span>${f(reg.opening_card)}</span></div>
<div class="row"><span>Troco reserva:</span><span>${f(reg.opening_change_reserve)}</span></div>
${reg.closed_at ? `<hr/><div><strong>FECHAMENTO</strong></div>
<div class="row"><span>Data/Hora:</span><span>${formatDateTimeBR(reg.closed_at)}</span></div>` : ""}
<hr/>
<div><strong>GASTOS</strong></div>
<div class="row"><span>Funcionários:</span><span>${f(reg.expense_employees)}</span></div>
<div class="row"><span>Entregadores:</span><span>${f(reg.expense_couriers)}</span></div>
<div class="row"><span>Compras:</span><span>${f(reg.expense_purchases)}</span></div>
<div class="row"><span>Gasolina:</span><span>${f(reg.expense_gasoline)}</span></div>
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
<div><strong>SALDO DECLARADO</strong></div>
<div class="row"><span>PIX:</span><span>${f(reg.closing_pix)}</span></div>
<div class="row"><span>Cartão:</span><span>${f(reg.closing_card)}</span></div>
<div class="row"><span>Dinheiro:</span><span>${f(reg.closing_cash)}</span></div>
<div class="row"><span>TOTAL DECLARADO:</span><strong>${f(summary.declaredTotal)}</strong></div>
<hr/>
<div><strong>RECONCILIAÇÃO</strong></div>
<div class="row"><span>Esperado:</span><span>${f(summary.expectedTotal)}</span></div>
<div class="row"><span>Declarado:</span><span>${f(summary.declaredTotal)}</span></div>
<div class="row ${Math.abs(summary.diffTotal) > 0.01 ? "warn" : ""}"><span>Diferença:</span><strong>${f(summary.diffTotal)}</strong></div>
<div class="row"><span>· PIX:</span><span>${f(summary.diffPix)}</span></div>
<div class="row"><span>· Cartão:</span><span>${f(summary.diffCard)}</span></div>
<div class="row"><span>· Dinheiro:</span><span>${f(summary.diffCash)}</span></div>
<hr/>
<div class="row"><span>LUCRO LÍQUIDO:</span><strong>${f(summary.netRevenue)}</strong></div>
${reg.notes ? `<hr/><div><strong>Observações:</strong> ${reg.notes}</div>` : ""}
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
  const w = window.open("", "_print_caixa_" + Date.now(), "width=380,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
