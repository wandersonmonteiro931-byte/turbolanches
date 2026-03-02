import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/admin/ImageUpload";

interface Category {
  id: string;
  name: string;
  icon: string;
  image_url: string | null;
  sort_order: number;
  active: boolean;
}

const AdminCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({ name: "", icon: "", image_url: "", sort_order: "0", active: true });

  const fetchData = async () => {
    const { data } = await supabase.from("categories").select("*").order("sort_order");
    if (data) setCategories(data);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", icon: "", image_url: "", sort_order: "0", active: true });
    setShowForm(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, icon: c.icon, image_url: c.image_url || "", sort_order: String(c.sort_order), active: c.active });
    setShowForm(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name,
      icon: form.icon,
      image_url: form.image_url || null,
      sort_order: parseInt(form.sort_order) || 0,
      active: form.active,
    };

    if (editing) {
      await supabase.from("categories").update(payload).eq("id", editing.id);
      toast({ title: "Categoria atualizada!" });
    } else {
      await supabase.from("categories").insert(payload);
      toast({ title: "Categoria criada!" });
    }
    setShowForm(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("categories").delete().eq("id", id);
    toast({ title: "Categoria removida!" });
    fetchData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{categories.length} categorias</p>
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={16} /> Nova
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">{editing ? "Editar" : "Nova"} Categoria</h3>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
              <input placeholder="Ícone (emoji)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
              <label className="text-sm font-medium text-foreground">Imagem da Categoria</label>
              <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} folder="categories" />
              <input placeholder="Ordem" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativa
              </label>
              <button onClick={handleSave} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">Salvar</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
            {c.image_url ? (
              <img src={c.image_url} alt={c.name} className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <span className="text-2xl">{c.icon}</span>
            )}
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">{c.name}</p>
              <p className="text-xs text-muted-foreground">Ordem: {c.sort_order}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
              {c.active ? "Ativa" : "Inativa"}
            </span>
            <button onClick={() => openEdit(c)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={16} /></button>
            <button onClick={() => handleDelete(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminCategories;
