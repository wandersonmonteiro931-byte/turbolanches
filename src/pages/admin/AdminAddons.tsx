import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Search, Package, Check, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";

interface Addon {
  id: string;
  name: string;
  price: number;
  active: boolean;
  sort_order: number;
  apply_to_all: boolean;
  product_id: string | null;
}

interface ProductOption {
  id: string;
  name: string;
  is_combo: boolean;
  category_id: string | null;
  image_url: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface AddonLink {
  addon_id: string;
  product_id: string;
}

const AdminAddons = () => {
  const { storeId } = useStore();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [links, setLinks] = useState<AddonLink[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAddonForm, setShowAddonForm] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [addonForm, setAddonForm] = useState({ name: "", price: "0", active: true, apply_to_all: false });
  const { toast } = useToast();

  const fetchData = async () => {
    const addonsQuery = supabase.from("product_addons").select("*").order("sort_order").order("name");
    const productsQuery = supabase.from("products").select("id, name, is_combo, category_id, image_url").eq("active", true).order("name");
    const linksQuery = supabase.from("addon_product_links").select("addon_id, product_id");
    const catsQuery = supabase.from("categories").select("id, name").eq("active", true).order("sort_order");

    if (storeId) {
      addonsQuery.eq("store_id", storeId);
      productsQuery.eq("store_id", storeId);
      linksQuery.eq("store_id", storeId);
      catsQuery.eq("store_id", storeId);
    }

    const [addonsRes, productsRes, linksRes, catsRes] = await Promise.all([addonsQuery, productsQuery, linksQuery, catsQuery]);
    if (addonsRes.data) setAddons(addonsRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (linksRes.data) setLinks(linksRes.data);
    if (catsRes.data) setCategories(catsRes.data);
  };

  useEffect(() => { fetchData(); }, [storeId]);

  // Get addons assigned to a product (global + linked)
  const getAddonsForProduct = (productId: string) => {
    const linkedAddonIds = links.filter((l) => l.product_id === productId).map((l) => l.addon_id);
    return addons.filter((a) => a.apply_to_all || linkedAddonIds.includes(a.id));
  };

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !selectedCategory || p.category_id === selectedCategory;
    return matchSearch && matchCat;
  });

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedProductIds(filteredProducts.map((p) => p.id));
  const clearSelection = () => setSelectedProductIds([]);

  // Addon assignment: toggle an addon for all selected products
  const toggleAddonForSelected = async (addon: Addon) => {
    if (selectedProductIds.length === 0) return;

    // Check if all selected products already have this addon
    const allHave = selectedProductIds.every((pid) => {
      const linkedIds = links.filter((l) => l.product_id === pid).map((l) => l.addon_id);
      return addon.apply_to_all || linkedIds.includes(addon.id);
    });

    if (addon.apply_to_all) {
      toast({ title: "Este adicional é global (todos os produtos)" });
      return;
    }

    if (allHave) {
      // Remove links for selected products
      for (const pid of selectedProductIds) {
        await supabase.from("addon_product_links").delete().eq("addon_id", addon.id).eq("product_id", pid);
      }
      toast({ title: `"${addon.name}" removido de ${selectedProductIds.length} produto(s)` });
    } else {
      // Add links for selected products that don't have it
      const existingPids = links.filter((l) => l.addon_id === addon.id).map((l) => l.product_id);
      const toAdd = selectedProductIds.filter((pid) => !existingPids.includes(pid));
      if (toAdd.length > 0) {
        await supabase.from("addon_product_links").insert(
          toAdd.map((pid) => ({ addon_id: addon.id, product_id: pid, store_id: storeId }))
        );
      }
      toast({ title: `"${addon.name}" adicionado a ${selectedProductIds.length} produto(s)` });
    }
    fetchData();
  };

  // CRUD addon
  const openNewAddon = () => {
    setEditingAddon(null);
    setAddonForm({ name: "", price: "0", active: true, apply_to_all: false });
    setShowAddonForm(true);
  };

  const openEditAddon = (a: Addon) => {
    setEditingAddon(a);
    setAddonForm({ name: a.name, price: String(a.price), active: a.active, apply_to_all: a.apply_to_all });
    setShowAddonForm(true);
  };

  const saveAddon = async () => {
    const payload = {
      name: addonForm.name,
      price: parseFloat(addonForm.price) || 0,
      active: addonForm.active,
      apply_to_all: addonForm.apply_to_all,
      product_id: null as string | null,
      sort_order: editingAddon ? editingAddon.sort_order : addons.length,
      store_id: storeId,
    };

    if (editingAddon) {
      await supabase.from("product_addons").update(payload).eq("id", editingAddon.id);
      if (addonForm.apply_to_all) {
        await supabase.from("addon_product_links").delete().eq("addon_id", editingAddon.id);
      }
    } else {
      const { data } = await supabase.from("product_addons").insert(payload).select("id").single();
      if (data && !addonForm.apply_to_all && selectedProductIds.length > 0) {
        await supabase.from("addon_product_links").insert(
          selectedProductIds.map((pid) => ({ addon_id: data.id, product_id: pid, store_id: storeId }))
        );
      }
    }

    toast({ title: editingAddon ? "Adicional atualizado!" : "Adicional criado!" });
    setShowAddonForm(false);
    fetchData();
  };

  const deleteAddon = async (id: string) => {
    await supabase.from("addon_product_links").delete().eq("addon_id", id);
    await supabase.from("product_addons").delete().eq("id", id);
    toast({ title: "Adicional removido!" });
    fetchData();
  };

  // Addons available for selected products (union)
  const selectedAddons = (() => {
    if (selectedProductIds.length === 0) return addons;
    const addonMap = new Map<string, Addon>();
    addons.forEach((a) => {
      if (a.apply_to_all) {
        addonMap.set(a.id, a);
      }
    });
    selectedProductIds.forEach((pid) => {
      links.filter((l) => l.product_id === pid).forEach((l) => {
        const addon = addons.find((a) => a.id === l.addon_id);
        if (addon) addonMap.set(addon.id, addon);
      });
    });
    return Array.from(addonMap.values());
  })();

  // Check if addon is linked to ALL selected products
  const isAddonLinkedToAll = (addonId: string) => {
    const addon = addons.find((a) => a.id === addonId);
    if (!addon) return false;
    if (addon.apply_to_all) return true;
    return selectedProductIds.every((pid) =>
      links.some((l) => l.addon_id === addonId && l.product_id === pid)
    );
  };

  const isAddonLinkedToSome = (addonId: string) => {
    const addon = addons.find((a) => a.id === addonId);
    if (!addon) return false;
    if (addon.apply_to_all) return true;
    return selectedProductIds.some((pid) =>
      links.some((l) => l.addon_id === addonId && l.product_id === pid)
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{products.length} produtos · {addons.length} adicionais</p>
        <button onClick={openNewAddon} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={16} /> Novo Adicional
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Products list */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Package size={16} className="text-primary" /> Produtos
          </h3>

          {/* Search & filter */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <Search size={14} className="text-muted-foreground" />
              <input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
            </div>
          </div>

          {/* Category chips */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setSelectedCategory(null)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${!selectedCategory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              Todos
            </button>
            {categories.map((c) => (
              <button key={c.id} onClick={() => setSelectedCategory(c.id)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${selectedCategory === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {c.name}
              </button>
            ))}
          </div>

          {/* Selection actions */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {selectedProductIds.length > 0 ? `${selectedProductIds.length} selecionado(s)` : "Selecione produtos para gerenciar adicionais"}
            </p>
            <div className="flex gap-1">
              <button onClick={selectAll} className="rounded border border-border px-2 py-0.5 text-[10px] font-bold text-foreground hover:bg-muted">Todos</button>
              {selectedProductIds.length > 0 && (
                <button onClick={clearSelection} className="rounded border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground hover:bg-muted">Limpar</button>
              )}
            </div>
          </div>

          {/* Product list */}
          <div className="max-h-[60vh] overflow-auto space-y-1">
            {filteredProducts.map((p) => {
              const selected = selectedProductIds.includes(p.id);
              const productAddons = getAddonsForProduct(p.id);
              return (
                <button key={p.id} onClick={() => toggleProduct(p.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                    selected ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted/50"
                  }`}>
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    selected ? "border-primary bg-primary" : "border-border bg-background"
                  }`}>
                    {selected && <Check size={12} className="text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                    {productAddons.length > 0 && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {productAddons.map((a) => a.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.is_combo && (
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-foreground">COMBO</span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {productAddons.length}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Addons panel */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">
              {selectedProductIds.length > 0
                ? `Adicionais (${selectedProductIds.length} produto${selectedProductIds.length > 1 ? "s" : ""})`
                : "Todos os Adicionais"}
            </h3>
            <button onClick={openNewAddon} className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-[11px] font-bold text-foreground hover:bg-primary/10">
              <Plus size={12} /> Criar
            </button>
          </div>

          {selectedProductIds.length > 0 && (
            <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              Clique nos adicionais abaixo para vincular/desvincular dos produtos selecionados
            </p>
          )}

          <div className="max-h-[60vh] overflow-auto space-y-1.5">
            {addons.map((a) => {
              const linkedToAll = selectedProductIds.length > 0 && isAddonLinkedToAll(a.id);
              const linkedToSome = selectedProductIds.length > 0 && isAddonLinkedToSome(a.id) && !linkedToAll;

              return (
                <div key={a.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                    linkedToAll ? "border-primary/30 bg-primary/5" : linkedToSome ? "border-amber-400/30 bg-amber-50/50 dark:bg-amber-900/10" : "border-border bg-background"
                  }`}>

                  {/* Toggle button (only when products selected) */}
                  {selectedProductIds.length > 0 && !a.apply_to_all && (
                    <button onClick={() => toggleAddonForSelected(a)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        linkedToAll ? "border-primary bg-primary" : linkedToSome ? "border-amber-500 bg-amber-500" : "border-border bg-background hover:border-primary/50"
                      }`}>
                      {(linkedToAll || linkedToSome) && <Check size={12} className="text-primary-foreground" />}
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-foreground truncate">{a.name}</p>
                      {a.apply_to_all && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">GLOBAL</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      R$ {a.price.toFixed(2).replace(".", ",")}
                    </p>
                  </div>

                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${a.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                    {a.active ? "Visível" : "Oculto"}
                  </span>

                  <button onClick={() => openEditAddon(a)} className="p-1 text-muted-foreground hover:text-foreground">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => deleteAddon(a.id)} className="p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            {addons.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum adicional cadastrado</p>
            )}
          </div>
        </div>
      </div>

      {/* Addon Form Modal */}
      {showAddonForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">{editingAddon ? "Editar" : "Novo"} Adicional</h3>
              <button onClick={() => setShowAddonForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Nome (ex: Bacon extra)" value={addonForm.name}
                onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground" />
              <input placeholder="Preço" type="number" step="0.01" value={addonForm.price}
                onChange={(e) => setAddonForm({ ...addonForm, price: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground" />
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={addonForm.active}
                  onChange={(e) => setAddonForm({ ...addonForm, active: e.target.checked })} />
                Visível no cardápio
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={addonForm.apply_to_all}
                  onChange={(e) => setAddonForm({ ...addonForm, apply_to_all: e.target.checked })} />
                Aplicar a todos os produtos (global)
              </label>
              {!addonForm.apply_to_all && selectedProductIds.length > 0 && !editingAddon && (
                <p className="text-[11px] text-muted-foreground bg-muted rounded-lg px-3 py-2">
                  Será vinculado aos {selectedProductIds.length} produto(s) selecionado(s)
                </p>
              )}
              <button onClick={saveAddon}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAddons;
