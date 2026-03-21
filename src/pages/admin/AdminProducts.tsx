import { useEffect, useState, useRef, useMemo } from "react";
import { Plus, Pencil, Trash2, X, GripVertical, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import ImageUpload from "@/components/admin/ImageUpload";
import ProductRecipeEditor from "@/components/admin/pricing/ProductRecipeEditor";

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
  combo_item_count: number;
  sort_order: number;
}

interface Category {
  id: string;
  name: string;
}

const AdminProducts = () => {
  const { storeId } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const [form, setForm] = useState({
    name: "", description: "", price: "", original_price: "",
    image_url: "", category_id: "", active: true, popular: false, is_combo: false, combo_item_count: "1", sort_order: "0",
  });

  const fetchData = async () => {
    let prodQuery = supabase.from("products").select("*").order("sort_order").order("name");
    let catQuery = supabase.from("categories").select("id, name").order("sort_order");
    if (storeId) {
      prodQuery = prodQuery.eq("store_id", storeId);
      catQuery = catQuery.eq("store_id", storeId);
    }
    const [prodRes, catRes] = await Promise.all([prodQuery, catQuery]);
    if (prodRes.data) setProducts(prodRes.data);
    if (catRes.data) setCategories(catRes.data);
  };

  useEffect(() => { fetchData(); }, [storeId]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
      const matchesCategory = categoryFilter === "all" || p.category_id === categoryFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && p.active) ||
        (statusFilter === "inactive" && !p.active) ||
        (statusFilter === "popular" && p.popular) ||
        (statusFilter === "combo" && p.is_combo);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, search, categoryFilter, statusFilter]);

  const groupedProducts = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    return filteredProducts.reduce<Record<string, Product[]>>((groups, p) => {
      const key = p.category_id ? (catMap.get(p.category_id) || "Sem categoria") : "Sem categoria";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
      return groups;
    }, {});
  }, [filteredProducts, categories]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", description: "", price: "", original_price: "", image_url: "", category_id: "", active: true, popular: false, is_combo: false, combo_item_count: "1", sort_order: "0" });
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description || "", price: String(p.price),
      original_price: p.original_price ? String(p.original_price) : "",
      image_url: p.image_url || "", category_id: p.category_id || "",
      active: p.active, popular: p.popular, is_combo: p.is_combo, combo_item_count: String(p.combo_item_count || 1), sort_order: String(p.sort_order ?? 0),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const payload: any = {
      name: form.name, description: form.description, price: parseFloat(form.price),
      original_price: form.original_price ? parseFloat(form.original_price) : null,
      image_url: form.image_url, category_id: form.category_id || null,
      active: form.active, popular: form.popular, is_combo: form.is_combo, combo_item_count: parseInt(form.combo_item_count) || 1, sort_order: parseInt(form.sort_order) || 0,
    };
    if (!editing && storeId) payload.store_id = storeId;
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

  const getGlobalIndex = (product: Product) => products.indexOf(product);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{filteredProducts.length} de {products.length} produtos</p>
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={16} /> Novo
        </button>
      </div>

      {/* Search & Filters */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar produto..."
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="all">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="all">Todos os filtros</option>
          <option value="active">Somente ativos</option>
          <option value="inactive">Somente ocultos</option>
          <option value="popular">Populares</option>
          <option value="combo">Combos</option>
        </select>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">{editing ? "Editar Produto" : "Novo Produto"}</h3>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-2 hover:bg-accent"><X size={24} className="text-muted-foreground" /></button>
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.popular} onChange={(e) => setForm({ ...form, popular: e.target.checked })} /> Popular
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_combo} onChange={(e) => setForm({ ...form, is_combo: e.target.checked })} />
                  Combo
                </label>
              </div>
              {form.is_combo && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <label className="text-sm font-semibold text-foreground">Quantidade de itens no combo</label>
                  <p className="text-[11px] text-muted-foreground">Os adicionais serão multiplicados por essa quantidade automaticamente</p>
                  <input type="number" min="1" step="1" value={form.combo_item_count}
                    onChange={(e) => setForm({ ...form, combo_item_count: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" placeholder="Ex: 4 (4 sanduíches)" />
                </div>
              )}
              {editing && (
                <ProductRecipeEditor productId={editing.id} />
              )}
              <button onClick={handleSave} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">Salvar</button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">☰ Arraste para reordenar</p>

      {/* Grouped by category */}
      {Object.entries(groupedProducts).length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedProducts).map(([catName, catProducts]) => (
            <div key={catName} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border bg-muted/30 px-4 py-2">
                <h3 className="text-sm font-semibold text-foreground">{catName}</h3>
                <p className="text-xs text-muted-foreground">{catProducts.length} produto(s)</p>
              </div>
              <div className="divide-y divide-border/50">
                {catProducts.map((p) => {
                  const idx = getGlobalIndex(p);
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => { dragItem.current = idx; }}
                      onDragEnter={() => { dragOver.current = idx; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnd={handleDragEnd}
                      className="flex items-center gap-2 p-3 cursor-grab active:cursor-grabbing active:opacity-70 transition-opacity"
                    >
                      <GripVertical size={18} className="shrink-0 text-muted-foreground" />
                      {p.image_url && <img src={p.image_url} alt={p.name} className="h-12 w-12 rounded-lg object-cover" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                          {p.is_combo && (
                            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                              COMBO ({p.combo_item_count}x)
                            </span>
                          )}
                        </div>
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminProducts;
