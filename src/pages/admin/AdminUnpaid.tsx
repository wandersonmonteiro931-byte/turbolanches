import { useEffect, useState, useCallback } from "react";
import { Plus, CheckCircle2, Trash2, Clock, AlertCircle, Pencil, Check, X as XIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatDateTimeBR } from "@/lib/brasiliaTime";

interface UnpaidExpense {
  id: string;
  category: string;
  name: string;
  amount: number;
  source: string;
  registered_at: string;
  paid: boolean;
  paid_at: string | null;
  paid_method: string | null;
  notes: string;
}

const CATEGORIES = [
  { value: "funcionario", label: "Funcionário" },
  { value: "entregador", label: "Entregador" },
  { value: "compras", label: "Compras" },
  { value: "gas", label: "Gás" },
  { value: "gasolina", label: "Gasolina" },
  { value: "anuncios", label: "Anúncios" },
  { value: "outros", label: "Outros" },
];

const PAID_METHODS = [
  { value: "cash", label: "💰 Dinheiro" },
  { value: "pix", label: "📲 PIX" },
  { value: "card", label: "💳 Cartão" },
];

const fmt = (n: number) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
const catLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;

export default function AdminUnpaid() {
  const { storeId } = useStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<UnpaidExpense[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ category: "outros", name: "", amount: "", notes: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; notes: string }>({ name: "", notes: "" });

  const startEdit = (it: UnpaidExpense) => {
    setEditingId(it.id);
    setEditForm({ name: it.name || "", notes: it.notes || "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", notes: "" });
  };

  const saveEdit = async (id: string) => {
    if (!editForm.name.trim()) {
      toast({ title: "Nome não pode ficar vazio", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("unpaid_expenses" as any)
      .update({ name: editForm.name.trim(), notes: editForm.notes.trim() } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅ Atualizado!" });
    cancelEdit();
    fetchItems();
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("unpaid_expenses" as any)
      .select("*")
      .order("registered_at", { ascending: false });
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    setItems((data as any[] ?? []) as UnpaidExpense[]);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const addNew = async () => {
    const amount = parseFloat(form.amount.replace(",", "."));
    if (!form.name.trim() || isNaN(amount) || amount <= 0) {
      toast({ title: "Preencha nome e valor", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("unpaid_expenses" as any).insert({
      store_id: storeId,
      category: form.category,
      name: form.name.trim(),
      amount,
      source: "manual",
      notes: form.notes.trim(),
      created_by: user?.id ?? null,
    } as any);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setForm({ category: "outros", name: "", amount: "", notes: "" });
    setShowNew(false);
    toast({ title: "✅ Não pago registrado!" });
    fetchItems();
  };

  const markPaid = async (id: string, method: string) => {
    const { error } = await supabase
      .from("unpaid_expenses" as any)
      .update({ paid: true, paid_at: new Date().toISOString(), paid_method: method } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao marcar como pago", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅ Marcado como pago!" });
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Remover este registro?")) return;
    await supabase.from("unpaid_expenses" as any).delete().eq("id", id);
    toast({ title: "Removido" });
    fetchItems();
  };

  const pending = items.filter(i => !i.paid);
  const paid = items.filter(i => i.paid);
  const visible = showHistory ? paid : pending;
  const totalPending = pending.reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertCircle className="text-amber-500" /> Não Pagos
          </h1>
          <p className="text-sm text-muted-foreground">
            Gastos pendentes de pagamento (funcionários, fornecedores, etc.)
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground flex items-center gap-2"
        >
          <Plus size={16} /> Novo
        </button>
      </div>

      {/* Total pendente */}
      <div className="rounded-2xl border-2 border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-amber-700 dark:text-amber-300">
            Total pendente de pagamento
          </p>
          <p className="text-3xl font-bold text-amber-900 dark:text-amber-100 mt-1">
            {fmt(totalPending)}
          </p>
        </div>
        <Clock size={48} className="text-amber-500/40" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setShowHistory(false)}
          className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px ${
            !showHistory ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
        >
          Pendentes ({pending.length})
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px ${
            showHistory ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
        >
          Histórico Pagos ({paid.length})
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-6">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">
          {showHistory ? "Nenhum pagamento registrado ainda." : "🎉 Nenhuma pendência!"}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map(it => (
            <div
              key={it.id}
              className={`rounded-xl border p-3 ${
                it.paid
                  ? "border-emerald-400/30 bg-emerald-50/50 dark:bg-emerald-500/5"
                  : "border-amber-400/40 bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      {catLabel(it.category)}
                    </span>
                    {it.source !== "manual" && (
                      <span className="text-[9px] font-bold uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        {it.source === "cash_register" ? "Fechamento" : it.source}
                      </span>
                    )}
                    {it.paid ? (
                      <span className="text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                        ✅ Pago via {PAID_METHODS.find(p => p.value === it.paid_method)?.label || it.paid_method}
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded animate-pulse">
                        ⏳ Pendente
                      </span>
                    )}
                  </div>
                  {editingId === it.id ? (
                    <div className="mt-2 space-y-2">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="Nome (ex: João - Funcionário)"
                        className="w-full rounded-lg border border-amber-400 bg-background px-2 py-1.5 text-sm font-bold text-foreground"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editForm.notes}
                        onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === "Enter") saveEdit(it.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        placeholder="Observação (opcional)"
                        className="w-full rounded-lg border border-amber-400 bg-background px-2 py-1.5 text-xs text-foreground"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => saveEdit(it.id)}
                          className="rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-600 flex items-center gap-1"
                        >
                          <Check size={12} /> Salvar
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-bold text-foreground flex items-center gap-1"
                        >
                          <XIcon size={12} /> Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-base font-bold text-foreground mt-1 break-words">{it.name}</p>
                      {it.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">{it.notes}</p>
                      )}
                    </>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Registrado: {formatDateTimeBR(it.registered_at)}
                    {it.paid && it.paid_at && ` • Pago: ${formatDateTimeBR(it.paid_at)}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xl font-bold ${it.paid ? "text-emerald-600" : "text-destructive"}`}>
                    {fmt(it.amount)}
                  </span>
                  {!it.paid && (
                    <div className="flex gap-1">
                      {PAID_METHODS.map(m => (
                        <button
                          key={m.value}
                          onClick={() => markPaid(it.id, m.value)}
                          className="rounded-lg bg-emerald-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-600"
                          title={`Marcar como pago via ${m.label}`}
                        >
                          {m.label.split(" ")[0]}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1">
                    {editingId !== it.id && (
                      <button
                        onClick={() => startEdit(it)}
                        className="rounded p-1 hover:bg-primary/10"
                        title="Editar nome / observação"
                      >
                        <Pencil size={14} className="text-primary" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteItem(it.id)}
                      className="rounded p-1 hover:bg-destructive/10"
                    >
                      <Trash2 size={14} className="text-destructive" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal NOVO */}
      {showNew && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowNew(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-5 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Plus size={20} /> Novo Não Pago
            </h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">Categoria</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">
                Nome (ex: João - Funcionário, Mercado X)
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Nome do gasto / pessoa"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">Observações (opcional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowNew(false)}
                className="flex-1 rounded-lg border border-border bg-background py-2 text-sm font-bold text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={addNew}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground"
              >
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
