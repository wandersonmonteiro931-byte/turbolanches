import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";

interface ExtraCost {
  id: string;
  name: string;
  cost_type: string;
  value: number;
}

const ExtraCostsTab = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [items, setItems] = useState<ExtraCost[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExtraCost | null>(null);
  const [form, setForm] = useState({ name: "", cost_type: "fixed", value: "" });

  const fetchData = async () => {
    let q = supabase.from("extra_costs").select("*").order("name");
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    if (data) setItems(data as ExtraCost[]);
  };

  useEffect(() => { fetchData(); }, [storeId]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", cost_type: "fixed", value: "" });
    setShowForm(true);
  };

  const openEdit = (c: ExtraCost) => {
    setEditing(c);
    setForm({ name: c.name, cost_type: c.cost_type, value: String(c.value) });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload: any = {
      name: form.name.trim(),
      cost_type: form.cost_type,
      value: parseFloat(form.value) || 0,
    };
    if (!editing && storeId) payload.store_id = storeId;
    if (editing) {
      await supabase.from("extra_costs").update(payload).eq("id", editing.id);
      toast({ title: "Custo atualizado!" });
    } else {
      await supabase.from("extra_costs").insert(payload);
      toast({ title: "Custo criado!" });
    }
    setShowForm(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("extra_costs").delete().eq("id", id);
    toast({ title: "Custo removido!" });
    fetchData();
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} custos extras</p>
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={16} /> Novo
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">{editing ? "Editar" : "Novo"} Custo Extra</h3>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <input placeholder="Nome (ex: Embalagem)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
            <select value={form.cost_type} onChange={(e) => setForm({ ...form, cost_type: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
              <option value="fixed">Fixo (R$)</option>
              <option value="percentage">Percentual (%)</option>
            </select>
            <input placeholder={form.cost_type === "fixed" ? "Valor (R$)" : "Percentual (%)"} type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
            <button onClick={handleSave} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">Salvar</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {c.cost_type === "fixed" ? `R$ ${Number(c.value).toFixed(2)}` : `${Number(c.value).toFixed(1)}%`}
              </p>
            </div>
            <button onClick={() => openEdit(c)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={16} /></button>
            <button onClick={() => handleDelete(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExtraCostsTab;
