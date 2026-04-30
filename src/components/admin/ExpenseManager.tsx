import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Plus, Trash2, X, AlertCircle } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
}

const CATEGORIES = [
  { value: "diario", label: "Diário (Entrega Fixa + Taxas)" },
  { value: "funcionario", label: "Funcionário" },
  { value: "gas", label: "Gás" },
  { value: "outros", label: "Outros" },
];

const PAY_METHODS = [
  { value: "cash", label: "💰 Dinheiro" },
  { value: "pix", label: "📲 PIX" },
  { value: "card", label: "💳 Cartão" },
  { value: "unpaid", label: "⏳ Não pago" },
];

interface Props {
  selectedDate: Date;
  onClose: () => void;
}

export default function ExpenseManager({ selectedDate, onClose }: Props) {
  const { storeId } = useStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [newCategory, setNewCategory] = useState("outros");
  const [newDescription, setNewDescription] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newMethod, setNewMethod] = useState<string>("cash");

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const fetchExpenses = useCallback(async () => {
    let q = supabase
      .from("report_expenses" as any)
      .select("*")
      .eq("expense_date", dateStr)
      .order("created_at", { ascending: true });
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    setExpenses((data as any[] ?? []).map((e: any) => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: Number(e.amount),
      expense_date: e.expense_date,
    })));
  }, [dateStr, storeId]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const addExpense = async () => {
    const amount = parseFloat(newAmount);
    if (!newDescription.trim() || isNaN(amount) || amount <= 0) {
      toast({ title: "Preencha descrição e valor", variant: "destructive" });
      return;
    }

    if (newMethod === "unpaid") {
      // Não pago — vai para a tabela unpaid_expenses
      const { error } = await supabase.from("unpaid_expenses" as any).insert({
        store_id: storeId,
        category: newCategory,
        name: newDescription.trim(),
        amount,
        source: "report_expenses",
        notes: `Registrado em Gastos do Dia (${dateStr})`,
        created_by: user?.id ?? null,
      } as any);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
      setNewDescription("");
      setNewAmount("");
      toast({ title: "⏳ Registrado em Não Pagos!" });
      return;
    }

    await supabase.from("report_expenses" as any).insert({
      category: newCategory,
      description: newDescription.trim(),
      amount,
      expense_date: dateStr,
      store_id: storeId,
    } as any);
    setNewDescription("");
    setNewAmount("");
    toast({ title: "✅ Gasto adicionado!" });
    fetchExpenses();
  };

  const deleteExpense = async (id: string) => {
    await supabase.from("report_expenses" as any).delete().eq("id", id);
    toast({ title: "Gasto removido" });
    fetchExpenses();
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const catLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-card p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">💰 Gastos do Dia - {format(selectedDate, "dd/MM/yyyy")}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        {/* Add new expense */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-bold text-foreground">Adicionar Gasto</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Valor (R$)"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <input
            type="text"
            placeholder="Descrição do gasto..."
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addExpense()}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <select
            value={newMethod}
            onChange={e => setNewMethod(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm font-medium ${
              newMethod === "unpaid"
                ? "border-amber-400 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-100"
                : "border-border bg-background text-foreground"
            }`}
          >
            {PAY_METHODS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {newMethod === "unpaid" && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
              <AlertCircle size={12} />
              Será registrado na seção <strong>Não Pagos</strong> e não entrará nos cálculos do dia.
            </p>
          )}
          <button
            onClick={addExpense}
            className="w-full rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground flex items-center justify-center gap-2"
          >
            <Plus size={14} /> Adicionar
          </button>
        </div>

        {/* List */}
        {expenses.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">Nenhum gasto cadastrado para este dia</p>
        ) : (
          <div className="space-y-2">
            {expenses.map(e => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">{catLabel(e.category)}</span>
                  <p className="text-sm font-medium text-foreground truncate">{e.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-bold text-destructive">- R$ {e.amount.toFixed(2).replace(".",",")}</span>
                  <button onClick={() => deleteExpense(e.id)} className="rounded p-1 hover:bg-destructive/10">
                    <Trash2 size={14} className="text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/30 p-3 flex justify-between items-center">
          <span className="text-sm font-bold text-foreground">Total de Gastos</span>
          <span className="text-lg font-bold text-destructive">R$ {total.toFixed(2).replace(".",",")}</span>
        </div>

        <button onClick={onClose} className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">
          Fechar
        </button>
      </div>
    </div>
  );
}
