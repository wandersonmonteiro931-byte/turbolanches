import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, RefreshCw, Search, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { syncIngredientsFromProductDescriptions } from "@/lib/ingredientsSync";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
}

const UNITS = ["unidade", "kg", "g", "ml", "litro", "fatia", "sachê"];

const EMPTY_FORM = {
  name: "",
  unit: "unidade",
  cost_per_unit: "",
  qty_purchased: "",
  use_package: false,
  package_quantity: "",
  package_price: "",
  units_per_package: "",
};

const IngredientsTab = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [filterUnit, setFilterUnit] = useState("all");

  const fetchIngredients = async () => {
    setLoading(true);
    let query = supabase.from("ingredients").select("*").order("name");
    if (storeId) query = query.eq("store_id", storeId);
    const { data } = await query;
    if (data) setItems(data as Ingredient[]);
    setLoading(false);
  };

  const syncIngredients = async (showToast = true) => {
    setSyncing(true);
    const result = await syncIngredientsFromProductDescriptions(storeId);
    await fetchIngredients();
    setSyncing(false);

    if (!showToast) return;

    toast({
      title: result.createdIngredients > 0 ? "Ingredientes sincronizados!" : "Ingredientes já atualizados",
      description:
        result.createdIngredients > 0
          ? `${result.createdIngredients} ingrediente(s) novo(s) foram puxados automaticamente das descrições dos itens.`
          : `Foram encontrados ${result.detectedIngredients} ingrediente(s) nas descrições, sem necessidade de novo cadastro.`,
    });
  };

  useEffect(() => {
    void syncIngredients(false);
  }, [storeId]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = !search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase());
      const matchesUnit = filterUnit === "all" || item.unit === filterUnit;
      return matchesSearch && matchesUnit;
    });
  }, [items, search, filterUnit]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (item: Ingredient) => {
    setEditing(item);
    setForm({
      ...EMPTY_FORM,
      name: item.name,
      unit: item.unit,
      cost_per_unit: String(item.cost_per_unit),
    });
    setShowForm(true);
  };

  const packageQuantity = parseFloat(form.package_quantity);
  const packagePrice = parseFloat(form.package_price);
  const unitsPerPackage = parseFloat(form.units_per_package);
  const totalUnitsFromPackage =
    !Number.isNaN(packageQuantity) && !Number.isNaN(unitsPerPackage)
      ? packageQuantity * unitsPerPackage
      : null;
  const totalPackagePaid =
    !Number.isNaN(packageQuantity) && !Number.isNaN(packagePrice)
      ? packageQuantity * packagePrice
      : null;
  const calculatedPackageUnitCost =
    totalUnitsFromPackage && totalPackagePaid !== null && totalUnitsFromPackage > 0
      ? totalPackagePaid / totalUnitsFromPackage
      : null;

  const handleSave = async () => {
    if (!form.name.trim()) return;

    const resolvedCost = form.use_package && calculatedPackageUnitCost !== null
      ? calculatedPackageUnitCost
      : parseFloat(form.cost_per_unit) || 0;

    const payload: { name: string; unit: string; cost_per_unit: number; store_id?: string | null } = {
      name: form.name.trim(),
      unit: form.unit,
      cost_per_unit: resolvedCost,
    };

    if (!editing) payload.store_id = storeId;

    if (editing) {
      await supabase.from("ingredients").update(payload).eq("id", editing.id);
      toast({ title: "Ingrediente atualizado!" });
    } else {
      await supabase.from("ingredients").insert(payload);
      toast({ title: "Ingrediente criado!" });
    }

    setShowForm(false);
    setForm(EMPTY_FORM);
    await fetchIngredients();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("ingredients").delete().eq("id", id);
    toast({ title: "Ingrediente removido!" });
    await fetchIngredients();
  };

  const totalSpent = (() => {
    const quantity = parseFloat(form.qty_purchased);
    const costPerUnit = parseFloat(form.cost_per_unit);
    if (Number.isNaN(quantity) || Number.isNaN(costPerUnit)) return null;
    return quantity * costPerUnit;
  })();

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{filteredItems.length} de {items.length} ingredientes</p>
          <p className="text-xs text-muted-foreground">Os ingredientes são puxados automaticamente das descrições dos itens e podem ser editados ou excluídos pelo admin.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void syncIngredients(true)}
            disabled={syncing || loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-opacity disabled:opacity-60"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Atualizar
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <Plus size={16} /> Novo
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar ingrediente"
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm"
          />
        </div>
        <select
          value={filterUnit}
          onChange={(event) => setFilterUnit(event.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="all">Todas as unidades</option>
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-xl bg-card p-5 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">{editing ? "Editar" : "Novo"} Ingrediente</h3>
              <button onClick={() => setShowForm(false)}>
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>

            <input
              placeholder="Nome do ingrediente"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            />

            <select
              value={form.unit}
              onChange={(event) => setForm({ ...form, unit: event.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>

            <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.use_package}
                onChange={(event) => setForm({ ...form, use_package: event.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              <Package size={16} className="text-primary" />
              Usar cálculo por pacote
            </label>

            {form.use_package ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opção de pacote</p>
                <input
                  placeholder="Quantidade comprada"
                  type="number"
                  step="0.01"
                  value={form.package_quantity}
                  onChange={(event) => setForm({ ...form, package_quantity: event.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
                <input
                  placeholder="Valor pago no pacote (R$)"
                  type="number"
                  step="0.01"
                  value={form.package_price}
                  onChange={(event) => setForm({ ...form, package_price: event.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
                <input
                  placeholder={`Quantas ${form.unit} vem no pacote`}
                  type="number"
                  step="0.01"
                  value={form.units_per_package}
                  onChange={(event) => setForm({ ...form, units_per_package: event.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />

                <div className="rounded-lg border border-border bg-background p-3 text-sm space-y-1">
                  <p className="text-muted-foreground">Total pago: <span className="font-semibold text-foreground">R$ {totalPackagePaid?.toFixed(2) ?? "0.00"}</span></p>
                  <p className="text-muted-foreground">Total de unidades: <span className="font-semibold text-foreground">{totalUnitsFromPackage?.toFixed(2) ?? "0.00"} {form.unit}</span></p>
                  <p className="font-bold text-primary">Valor por {form.unit}: R$ {calculatedPackageUnitCost?.toFixed(4) ?? "0.0000"}</p>
                </div>
              </div>
            ) : (
              <>
                <input
                  placeholder="Custo por unidade (R$)"
                  type="number"
                  step="0.01"
                  value={form.cost_per_unit}
                  onChange={(event) => setForm({ ...form, cost_per_unit: event.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />

                <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calculadora automática</p>
                  <input
                    placeholder={`Quantidade comprada (${form.unit})`}
                    type="number"
                    step="0.01"
                    value={form.qty_purchased}
                    onChange={(event) => setForm({ ...form, qty_purchased: event.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                  />
                  <p className="text-sm text-muted-foreground">Ex.: 3 kg × R$ 35,00 = R$ 105,00</p>
                  {totalSpent !== null && (
                    <p className="text-sm font-bold text-primary">Total gasto: R$ {totalSpent.toFixed(2)}</p>
                  )}
                </div>
              </>
            )}

            {!form.use_package && null}

            <button onClick={handleSave} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            Nenhum ingrediente encontrado.
          </div>
        ) : (
          filteredItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">R$ {Number(item.cost_per_unit).toFixed(4)} / {item.unit}</p>
              </div>
              <button onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground hover:text-foreground">
                <Pencil size={16} />
              </button>
              <button onClick={() => void handleDelete(item.id)} className="p-1.5 text-muted-foreground hover:text-destructive">
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default IngredientsTab;
