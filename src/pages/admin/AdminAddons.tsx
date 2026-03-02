import { useEffect, useState, useRef } from "react";
import { Plus, Pencil, Trash2, X, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Addon {
  id: string;
  name: string;
  price: number;
  active: boolean;
  sort_order: number;
  apply_to_all: boolean;
  product_id: string | null;
  linked_product_ids: string[];
}

interface ProductOption {
  id: string;
  name: string;
}

const AdminAddons = () => {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Addon | null>(null);
  const { toast } = useToast();
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    price: "0",
    active: true,
    apply_to_all: true,
    selected_products: [] as string[],
  });

  const fetchData = async () => {
    const [addonsRes, productsRes, linksRes] = await Promise.all([
      supabase.from("product_addons").select("*").order("sort_order").order("name"),
      supabase.from("products").select("id, name").order("name"),
      supabase.from("addon_product_links").select("addon_id, product_id"),
    ]);

    const linksMap = new Map<string, string[]>();
    if (linksRes.data) {
      for (const link of linksRes.data) {
        const list = linksMap.get(link.addon_id) || [];
        list.push(link.product_id);
        linksMap.set(link.addon_id, list);
      }
    }

    if (addonsRes.data) {
      setAddons(
        addonsRes.data.map((a: any) => ({
          ...a,
          linked_product_ids: linksMap.get(a.id) || [],
        }))
      );
    }
    if (productsRes.data) setProducts(productsRes.data);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", price: "0", active: true, apply_to_all: true, selected_products: [] });
    setShowForm(true);
  };

  const openEdit = (a: Addon) => {
    setEditing(a);
    setForm({
      name: a.name,
      price: String(a.price),
      active: a.active,
      apply_to_all: a.apply_to_all,
      selected_products: a.linked_product_ids,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name,
      price: parseFloat(form.price) || 0,
      active: form.active,
      apply_to_all: form.apply_to_all,
      product_id: null as string | null,
      sort_order: editing ? editing.sort_order : addons.length,
    };

    let addonId = editing?.id;

    if (editing) {
      await supabase.from("product_addons").update(payload).eq("id", editing.id);
    } else {
      const { data } = await supabase.from("product_addons").insert(payload).select("id").single();
      if (data) addonId = data.id;
    }

    // Update product links
    if (addonId && !form.apply_to_all) {
      await supabase.from("addon_product_links").delete().eq("addon_id", addonId);
      if (form.selected_products.length > 0) {
        const links = form.selected_products.map((pid) => ({
          addon_id: addonId!,
          product_id: pid,
        }));
        await supabase.from("addon_product_links").insert(links);
      }
    } else if (addonId && form.apply_to_all) {
      await supabase.from("addon_product_links").delete().eq("addon_id", addonId);
    }

    toast({ title: editing ? "Adicional atualizado!" : "Adicional criado!" });
    setShowForm(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("product_addons").delete().eq("id", id);
    toast({ title: "Adicional removido!" });
    fetchData();
  };

  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) return;
    const reordered = [...addons];
    const [moved] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, moved);
    dragItem.current = null;
    dragOver.current = null;
    setAddons(reordered);

    const updates = reordered.map((a, i) =>
      supabase.from("product_addons").update({ sort_order: i }).eq("id", a.id)
    );
    await Promise.all(updates);
    toast({ title: "Ordem atualizada!" });
  };

  const toggleProduct = (productId: string) => {
    setForm((prev) => ({
      ...prev,
      selected_products: prev.selected_products.includes(productId)
        ? prev.selected_products.filter((id) => id !== productId)
        : [...prev.selected_products, productId],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{addons.length} adicionais</p>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          <Plus size={16} /> Novo
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">
                {editing ? "Editar" : "Novo"} Adicional
              </h3>
              <button onClick={() => setShowForm(false)}>
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                placeholder="Nome (ex: Bacon extra)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              />
              <input
                placeholder="Preço"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Visível no cardápio
              </label>

              {/* Apply to all or selected */}
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-foreground">Aplicar a:</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="apply"
                    checked={form.apply_to_all}
                    onChange={() => setForm({ ...form, apply_to_all: true })}
                  />
                  Todos os produtos
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="apply"
                    checked={!form.apply_to_all}
                    onChange={() => setForm({ ...form, apply_to_all: false })}
                  />
                  Produtos selecionados
                </label>

                {!form.apply_to_all && (
                  <div className="mt-2 max-h-48 space-y-1 overflow-auto rounded-lg border border-border bg-background p-2">
                    {products.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm py-1">
                        <input
                          type="checkbox"
                          checked={form.selected_products.includes(p.id)}
                          onChange={() => toggleProduct(p.id)}
                        />
                        <span className="text-foreground">{p.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleSave}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <p className="text-xs text-muted-foreground">☰ Arraste para reordenar</p>
      <div className="space-y-2">
        {addons.map((a, idx) => (
          <div
            key={a.id}
            draggable
            onDragStart={() => { dragItem.current = idx; }}
            onDragEnter={() => { dragOver.current = idx; }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={handleDragEnd}
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing active:opacity-70 transition-opacity"
          >
            <GripVertical size={18} className="shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{a.name}</p>
              <p className="text-xs text-muted-foreground">
                R$ {a.price.toFixed(2).replace(".", ",")} ·{" "}
                {a.apply_to_all
                  ? "Todos os produtos"
                  : `${a.linked_product_ids.length} produto(s)`}
              </p>
            </div>
            <button
              onClick={async () => {
                await supabase.from("product_addons").update({ active: !a.active }).eq("id", a.id);
                fetchData();
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                a.active
                  ? "bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700"
                  : "bg-red-100 text-red-700 hover:bg-emerald-100 hover:text-emerald-700"
              }`}
            >
              {a.active ? "✓ Visível" : "✕ Oculto"}
            </button>
            <button onClick={() => openEdit(a)} className="p-1.5 text-muted-foreground hover:text-foreground">
              <Pencil size={16} />
            </button>
            <button onClick={() => handleDelete(a.id)} className="p-1.5 text-muted-foreground hover:text-destructive">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminAddons;
