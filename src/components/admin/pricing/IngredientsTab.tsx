import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
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
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState({ name: "", unit: "unidade", cost_per_unit: "" });

  const fetch = async () => {
    let q = supabase.from("ingredients").select("*").order("name");
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    if (data) setItems(data as Ingredient[]);
  };

  useEffect(() => { fetch(); }, [storeId]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", unit: "unidade", cost_per_unit: "" });
    setShowForm(true);
  };

  const openEdit = (i: Ingredient) => {
    setEditing(i);
    setForm({ name: i.name, unit: i.unit, cost_per_unit: String(i.cost_per_unit) });
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
    fetch();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("ingredients").delete().eq("id", id);
    toast({ title: "Ingrediente removido!" });
    fetch();
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} ingredientes</p>
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={16} /> Novo
        </button>
      </div>

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
            <button onClick={handleSave} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">Salvar</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.map((i) => (
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
