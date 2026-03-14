import { useEffect, useState, useRef } from "react";
import { Plus, Pencil, Trash2, X, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/admin/ImageUpload";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  category_id: string | null;
  active: boolean;
  popular: boolean;
  is_combo: boolean;
  sort_order: number;
}

interface Category {
  id: string;
  name: string;
}

const AdminProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const { toast } = useToast();
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const [form, setForm] = useState({
    name: "", description: "", price: "", original_price: "",
    image_url: "", category_id: "", active: true, popular: false, is_combo: false, sort_order: "0",
  });

  const fetchData = async () => {
    const [prodRes, catRes] = await Promise.all([
      supabase.from("products").select("*").order("sort_order").order("name"),
      supabase.from("categories").select("id, name").order("sort_order"),
    ]);
    if (prodRes.data) setProducts(prodRes.data);
    if (catRes.data) setCategories(catRes.data);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", description: "", price: "", original_price: "", image_url: "", category_id: "", active: true, popular: false, is_combo: false, sort_order: "0" });
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description || "", price: String(p.price),
      original_price: p.original_price ? String(p.original_price) : "",
      image_url: p.image_url || "", category_id: p.category_id || "",
      active: p.active, popular: p.popular, sort_order: String(p.sort_order ?? 0),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name, description: form.description, price: parseFloat(form.price),
      original_price: form.original_price ? parseFloat(form.original_price) : null,
      image_url: form.image_url, category_id: form.category_id || null,
      active: form.active, popular: form.popular, sort_order: parseInt(form.sort_order) || 0,
    };
    if (editing) {
      await supabase.from("products").update(payload).eq("id", editing.id);
      toast({ title: "Produto atualizado!" });
    } else {
      await supabase.from("products").insert(payload);
      toast({ title: "Produto criado!" });
    }
    setShowForm(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("products").delete().eq("id", id);
    toast({ title: "Produto removido!" });
    fetchData();
  };

  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) return;
    const reordered = [...products];
    const [moved] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, moved);
    dragItem.current = null;
    dragOver.current = null;
    setProducts(reordered);

    const updates = reordered.map((p, i) => supabase.from("products").update({ sort_order: i }).eq("id", p.id));
    await Promise.all(updates);
    toast({ title: "Ordem atualizada!" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{products.length} produtos</p>
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={16} /> Novo
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">{editing ? "Editar Produto" : "Novo Produto"}</h3>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
              <textarea placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" rows={3} />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Preço" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
                <input placeholder="Preço original" type="number" step="0.01" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
              </div>
              <label className="text-sm font-medium text-foreground">Imagem do Produto</label>
              <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} folder="products" />
              <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.popular} onChange={(e) => setForm({ ...form, popular: e.target.checked })} /> Popular
                </label>
              </div>
              <button onClick={handleSave} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">Salvar</button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">☰ Arraste para reordenar</p>
      <div className="space-y-2">
        {products.map((p, idx) => (
          <div
            key={p.id}
            draggable
            onDragStart={() => { dragItem.current = idx; }}
            onDragEnter={() => { dragOver.current = idx; }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={handleDragEnd}
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing active:opacity-70 transition-opacity"
          >
            <GripVertical size={18} className="shrink-0 text-muted-foreground" />
            {p.image_url && <img src={p.image_url} alt={p.name} className="h-12 w-12 rounded-lg object-cover" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
              <p className="text-xs text-muted-foreground">R$ {Number(p.price).toFixed(2)}</p>
            </div>
            <button
              onClick={async () => {
                await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
                fetchData();
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${p.active ? "bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700" : "bg-red-100 text-red-700 hover:bg-emerald-100 hover:text-emerald-700"}`}
            >
              {p.active ? "✓ Visível" : "✕ Oculto"}
            </button>
            <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={16} /></button>
            <button onClick={() => handleDelete(p.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminProducts;
