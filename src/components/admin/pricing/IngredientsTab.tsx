import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, RefreshCw, Search, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { syncIngredientsFromProductDescriptions } from "@/lib/ingredientsSync";
import {
  buildCalculationConfig,
  computeCalculationSummary,
  createEmptyCalculationConfig,
  getPurchaseUnitOptions,
  INGREDIENT_CALCULATION_MODES,
  INGREDIENT_UNITS,
  normalizeCalculationMode,
  normalizeIngredientUnit,
  type IngredientCalculationMode,
  type IngredientCalculationConfig,
  type IngredientMeasureUnit,
} from "./ingredientCalculation";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  calculation_mode?: string | null;
  calculation_config?: unknown;
}

interface IngredientForm {
  name: string;
  calculationMode: IngredientCalculationMode;
  unit: IngredientMeasureUnit;
  referencePrice: string;
  purchaseQuantity: string;
  purchaseUnit: IngredientMeasureUnit;
  packageQuantity: string;
  packagePrice: string;
  unitsPerPackage: string;
  packageContentUnit: IngredientMeasureUnit;
}

const createEmptyForm = (): IngredientForm => {
  const config = createEmptyCalculationConfig();

  return {
    name: "",
    calculationMode: config.mode,
    unit: "unidade",
    referencePrice: config.reference_price,
    purchaseQuantity: config.purchase_quantity,
    purchaseUnit: config.purchase_unit,
    packageQuantity: config.package_quantity,
    packagePrice: config.package_price,
    unitsPerPackage: config.units_per_package,
    packageContentUnit: config.package_content_unit,
  };
};

const buildFormFromIngredient = (item: Ingredient): IngredientForm => {
  const fallbackMode = item.calculation_mode ?? normalizeIngredientUnit(item.unit);
  const config = buildCalculationConfig(item.calculation_config, fallbackMode, item.unit, Number(item.cost_per_unit));
  const storedUnit = normalizeIngredientUnit(item.unit);

  return {
    name: item.name,
    calculationMode: config.mode,
    unit: config.mode === "pacote" ? config.package_content_unit : storedUnit,
    referencePrice: config.reference_price,
    purchaseQuantity: config.purchase_quantity,
    purchaseUnit: config.purchase_unit,
    packageQuantity: config.package_quantity,
    packagePrice: config.package_price,
    unitsPerPackage: config.units_per_package,
    packageContentUnit: config.package_content_unit,
  };
};

const IngredientsTab = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState<IngredientForm>(createEmptyForm());
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
      const matchesUnit = filterUnit === "all" || normalizeIngredientUnit(item.unit) === filterUnit;
      return matchesSearch && matchesUnit;
    });
  }, [items, search, filterUnit]);

  const openNew = () => {
    setEditing(null);
    setForm(createEmptyForm());
    setShowForm(true);
  };

  const openEdit = (item: Ingredient) => {
    setEditing(item);
    setForm(buildFormFromIngredient(item));
    setShowForm(true);
  };

  const savedUnit = form.calculationMode === "pacote" ? form.packageContentUnit : form.unit;
  const purchaseUnitOptions = useMemo(
    () => getPurchaseUnitOptions(form.calculationMode, form.packageContentUnit),
    [form.calculationMode, form.packageContentUnit],
  );

  const calculationConfig = useMemo<IngredientCalculationConfig>(
    () =>
      buildCalculationConfig(
        {
          mode: form.calculationMode,
          reference_price: form.referencePrice,
          purchase_quantity: form.purchaseQuantity,
          purchase_unit: form.purchaseUnit,
          package_quantity: form.packageQuantity,
          package_price: form.packagePrice,
          units_per_package: form.unitsPerPackage,
          package_content_unit: form.packageContentUnit,
        },
        form.calculationMode,
        savedUnit,
        Number.parseFloat(form.referencePrice),
      ),
    [form, savedUnit],
  );

  const { convertedPurchaseQuantity, resolvedCostPerUnit, totalSpent, totalUnits } = useMemo(
    () => computeCalculationSummary(calculationConfig),
    [calculationConfig],
  );

  const handleModeChange = (value: string) => {
    const nextMode = normalizeCalculationMode(value);

    setForm((current) => {
      const nextUnit = nextMode === "pacote" ? current.packageContentUnit : normalizeIngredientUnit(nextMode);
      const nextPurchaseUnit = getPurchaseUnitOptions(nextMode, current.packageContentUnit)[0];

      return {
        ...current,
        calculationMode: nextMode,
        unit: nextUnit,
        purchaseUnit: nextPurchaseUnit,
      };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;

    if (form.calculationMode === "pacote" && resolvedCostPerUnit === null) {
      toast({
        title: "Preencha o cálculo por pacote",
        description: "Informe quantidade comprada, valor pago no pacote e quantas unidades vêm no pacote.",
      });
      return;
    }

    if (form.calculationMode !== "pacote") {
      const referencePrice = Number.parseFloat(form.referencePrice);
      const quantity = Number.parseFloat(form.purchaseQuantity);

      if (!Number.isFinite(referencePrice) || referencePrice <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
        toast({
          title: "Preencha os campos do cálculo",
          description: `Informe o valor por ${form.calculationMode} e a quantidade comprada para salvar.`,
        });
        return;
      }
    }

    const payload: any = {
      name: form.name.trim(),
      unit: savedUnit,
      cost_per_unit: resolvedCostPerUnit ?? 0,
      calculation_mode: form.calculationMode,
      calculation_config: calculationConfig,
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
    setForm(createEmptyForm());
    await fetchIngredients();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("ingredients").delete().eq("id", id);
    toast({ title: "Ingrediente removido!" });
    await fetchIngredients();
  };

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
          {INGREDIENT_UNITS.map((unit) => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-sm space-y-3 overflow-y-auto rounded-xl bg-card p-5 shadow-lg">
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
              value={form.calculationMode}
              onChange={(event) => handleModeChange(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            >
              {INGREDIENT_CALCULATION_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>

            {form.calculationMode === "pacote" ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cálculo por pacote</p>
                </div>
                <select
                  value={form.packageContentUnit}
                  onChange={(event) => {
                    const nextUnit = normalizeIngredientUnit(event.target.value);
                    setForm((current) => ({
                      ...current,
                      packageContentUnit: nextUnit,
                      unit: nextUnit,
                      purchaseUnit: nextUnit,
                    }));
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                >
                  {INGREDIENT_UNITS.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
                <input
                  placeholder="Quantidade comprada (pacotes)"
                  type="number"
                  step="0.01"
                  value={form.packageQuantity}
                  onChange={(event) => setForm({ ...form, packageQuantity: event.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
                <input
                  placeholder="Valor pago por pacote (R$)"
                  type="number"
                  step="0.01"
                  value={form.packagePrice}
                  onChange={(event) => setForm({ ...form, packagePrice: event.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
                <input
                  placeholder={`Quantas ${form.packageContentUnit} vêm em cada pacote`}
                  type="number"
                  step="0.01"
                  value={form.unitsPerPackage}
                  onChange={(event) => setForm({ ...form, unitsPerPackage: event.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
                <div className="space-y-1 rounded-lg border border-border bg-background p-3 text-sm">
                  <p className="text-muted-foreground">Total pago: <span className="font-semibold text-foreground">R$ {totalSpent?.toFixed(2) ?? "0.00"}</span></p>
                  <p className="text-muted-foreground">Total de {form.packageContentUnit}: <span className="font-semibold text-foreground">{totalUnits?.toFixed(2) ?? "0.00"}</span></p>
                  <p className="font-bold text-primary">Valor por {form.packageContentUnit}: R$ {resolvedCostPerUnit?.toFixed(4) ?? "0.0000"}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cálculo por {form.calculationMode}</p>
                <input
                  placeholder={`Valor por ${form.calculationMode} (R$)`}
                  type="number"
                  step="0.01"
                  value={form.referencePrice}
                  onChange={(event) => setForm({ ...form, referencePrice: event.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    placeholder="Quantidade comprada"
                    type="number"
                    step="0.01"
                    value={form.purchaseQuantity}
                    onChange={(event) => setForm({ ...form, purchaseQuantity: event.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                  />
                  {purchaseUnitOptions.length > 1 ? (
                    <select
                      value={form.purchaseUnit}
                      onChange={(event) => setForm({ ...form, purchaseUnit: normalizeIngredientUnit(event.target.value) })}
                      className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                    >
                      {purchaseUnitOptions.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-muted-foreground">
                      {purchaseUnitOptions[0]}
                    </div>
                  )}
                </div>
                <div className="space-y-1 rounded-lg border border-border bg-background p-3 text-sm">
                  <p className="text-muted-foreground">Quantidade convertida em {form.calculationMode}: <span className="font-semibold text-foreground">{convertedPurchaseQuantity?.toFixed(2) ?? "0.00"}</span></p>
                  <p className="text-muted-foreground">Total gasto: <span className="font-semibold text-foreground">R$ {totalSpent?.toFixed(2) ?? "0.00"}</span></p>
                  <p className="font-bold text-primary">Valor salvo por {form.calculationMode}: R$ {resolvedCostPerUnit?.toFixed(4) ?? "0.0000"}</p>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border bg-background p-3 text-sm">
              <p className="text-muted-foreground">Valor que será salvo por {savedUnit}:</p>
              <p className="text-base font-bold text-foreground">R$ {(resolvedCostPerUnit ?? 0).toFixed(4)}</p>
            </div>

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
                <p className="text-xs text-muted-foreground">
                  R$ {Number(item.cost_per_unit).toFixed(4)} / {normalizeIngredientUnit(item.unit)}
                  {normalizeCalculationMode(item.calculation_mode ?? normalizeIngredientUnit(item.unit)) === "pacote" ? " • cálculo por pacote" : ""}
                </p>
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
