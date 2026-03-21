import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
}

const UNITS = ["unidade", "kg", "g", "ml", "litro", "fatia", "sachê"];

const IngredientsTab = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState({ name: "", unit: "unidade", cost_per_unit: "", qty_purchased: "" });
  const [search, setSearch] = useState("");
  const [filterUnit, setFilterUnit] = useState("all");

  const fetchIngredients = async () => {
    setLoading(true);
    let q = supabase.from("ingredients").select("*").order("name");
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    if (data) setItems(data as Ingredient[]);
    setLoading(false);
  };

  useEffect(() => { fetchIngredients(); }, [storeId]);

  const filtered = useMemo(() => {
    let list = items;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(s));
    }
    if (filterUnit !== "all") {
      list = list.filter((i) => i.unit === filterUnit);
    }
    return list;
  }, [items, search, filterUnit]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", unit: "unidade", cost_per_unit: "", qty_purchased: "" });
    setShowForm(true);
  };

  const openEdit = (i: Ingredient) => {
    setEditing(i);
    setForm({ name: i.name, unit: i.unit, cost_per_unit: String(i.cost_per_unit), qty_purchased: "" });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload: any = {
      name: form.name.trim(),
      unit: form.unit,
      cost_per_unit: parseFloat(form.cost_per_unit) || 0,
    };
    if (!editing && storeId) payload.store_id = storeId;
    if (editing) {
      await supabase.from("ingredients").update(payload).eq("id", editing.id);
      toast({ title: "Ingrediente atualizado!" });
    } else {
      await supabase.from("ingredients").insert(payload);
      toast({ title: "Ingrediente criado!" });
    }
    setShowForm(false);
    fetchIngredients();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("ingredients").delete().eq("id", id);
    toast({ title: "Ingrediente removido!" });
    fetchIngredients();
  };

  // Compute total spent for an ingredient given qty_purchased
  const computeTotal = () => {
    const qty = parseFloat(form.qty_purchased);
    const cost = parseFloat(form.cost_per_unit);
    if (!qty || !cost || isNaN(qty) || isNaN(cost)) return null;
    return qty * cost;
  };

  const totalSpent = computeTotal();

  return (
    <div className="space-y-4 mt-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground whitespace-nowrap">{filtered.length} de {items.length}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchIngredients}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <Plus size={16} /> Novo
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar ingrediente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2.5 text-sm"
          />
        </div>
        <select
          value={filterUnit}
          onChange={(e) => setFilterUnit(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="all">Todas unidades</option>
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">{editing ? "Editar" : "Novo"} Ingrediente</h3>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <input placeholder="Nome (ex: Bacon)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <input placeholder="Custo por unidade (R$)" type="number" step="0.01" value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />

            {/* Calculadora de gasto */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Calculadora de gasto</p>
              <input
                placeholder={`Quantidade comprada (${form.unit})`}
                type="number"
                step="0.01"
                value={form.qty_purchased}
                onChange={(e) => setForm({ ...form, qty_purchased: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              {totalSpent !== null && (
                <p className="text-sm font-bold text-primary">
                  Total gasto: R$ {totalSpent.toFixed(2)}
                </p>
              )}
            </div>

            <button onClick={handleSave} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">Salvar</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum ingrediente encontrado.</p>
        )}
        {filtered.map((i) => (
          <div key={i.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{i.name}</p>
              <p className="text-xs text-muted-foreground">R$ {Number(i.cost_per_unit).toFixed(2)} / {i.unit}</p>
            </div>
            <button onClick={() => openEdit(i)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={16} /></button>
            <button onClick={() => handleDelete(i.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IngredientsTab;
