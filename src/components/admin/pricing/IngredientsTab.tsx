import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, Search, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import {
  buildCalculationConfig,
  computeCalculationSummary,
  createEmptyCalculationConfig,
  INGREDIENT_CALCULATION_MODES,
  INGREDIENT_UNITS,
  normalizeCalculationMode,
  normalizeIngredientUnit,
  type IngredientCalculationMode,
  type IngredientCalculationConfig,
  type IngredientMeasureUnit,
} from "./ingredientCalculation";
import { formatCurrency, formatMoneyInput, parseRoundedMoney } from "./pricingMoney";
import { normalizeSearch } from "@/lib/searchNormalize";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  calculation_mode?: string | null;
  calculation_config?: unknown;
  is_internal?: boolean;
}

interface IngredientForm {
  name: string;
  calculationMode: IngredientCalculationMode;
  unit: IngredientMeasureUnit;
  referencePrice: string;
  packagePrice: string;
  unitsPerPackage: string;
  packageContentUnit: IngredientMeasureUnit;
  isInternal: boolean;
}

const createEmptyForm = (): IngredientForm => {
  const config = createEmptyCalculationConfig();

  return {
    name: "",
    calculationMode: config.mode,
    unit: "unidade",
    referencePrice: config.reference_price,
    packagePrice: config.package_price,
    unitsPerPackage: config.units_per_package,
    packageContentUnit: config.package_content_unit,
    isInternal: false,
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
    referencePrice: formatMoneyInput(config.reference_price),
    packagePrice: formatMoneyInput(config.package_price),
    unitsPerPackage: config.units_per_package,
    packageContentUnit: config.package_content_unit,
    isInternal: Boolean(item.is_internal),
  };
};

const IngredientsTab = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState<IngredientForm>(createEmptyForm());
  const [search, setSearch] = useState("");
  const [filterUnit, setFilterUnit] = useState("all");

  const fetchIngredients = async () => {
    let query = supabase.from("ingredients").select("*").order("name");
    if (storeId) query = query.eq("store_id", storeId);
    const { data } = await query;
    if (data) setItems(data as Ingredient[]);
  };

  useEffect(() => {
    void fetchIngredients();
  }, [storeId]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = !search.trim() || normalizeSearch(item.name).includes(normalizeSearch(search));
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
  const calculationConfig = useMemo<IngredientCalculationConfig>(
    () =>
      buildCalculationConfig(
        {
          mode: form.calculationMode,
          reference_price: form.referencePrice,
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

  const { resolvedCostPerUnit, totalSpent, totalUnits } = useMemo(
    () => computeCalculationSummary(calculationConfig),
    [calculationConfig],
  );

  const handleModeChange = (value: string) => {
    const nextMode = normalizeCalculationMode(value);

    setForm((current) => {
      const nextUnit = nextMode === "pacote" ? current.packageContentUnit : normalizeIngredientUnit(nextMode);

      return {
        ...current,
        calculationMode: nextMode,
        unit: nextUnit,
      };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;

    if (form.calculationMode === "pacote" && resolvedCostPerUnit === null) {
      toast({
        title: "Preencha o cálculo por pacote",
        description: "Informe valor pago no pacote e quantas unidades vêm no pacote.",
      });
      return;
    }

    if (form.calculationMode !== "pacote") {
      const referencePrice = parseRoundedMoney(form.referencePrice);

      if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        toast({
          title: "Preencha os campos do cálculo",
          description: `Informe o valor por ${form.calculationMode} para salvar.`,
        });
        return;
      }
    }

    const roundedCostPerUnit = parseRoundedMoney(resolvedCostPerUnit ?? 0) ?? 0;
    const persistedCalculationConfig = {
      ...calculationConfig,
      reference_price: formatMoneyInput(calculationConfig.reference_price),
      package_price: formatMoneyInput(calculationConfig.package_price),
    };

    const payload: any = {
      name: form.name.trim(),
      unit: savedUnit,
      cost_per_unit: roundedCostPerUnit,
      calculation_mode: form.calculationMode,
      calculation_config: persistedCalculationConfig,
      is_internal: form.isInternal,
    };

    if (!editing) payload.store_id = storeId;

    const { error } = editing
      ? await supabase.from("ingredients").update(payload).eq("id", editing.id)
      : await supabase.from("ingredients").insert(payload);

    if (error) {
      toast({ title: "Não foi possível salvar", description: error.message });
      return;
    }

    if (editing) {
      // Sync name/unit to restock_items across the system
      await (supabase as any).from("restock_items").update({
        ingredient_name: form.name.trim(),
        unit: savedUnit,
      }).eq("ingredient_id", editing.id);
      toast({ title: "Ingrediente atualizado!" });
    } else {
      toast({ title: "Ingrediente criado!" });
    }

    setShowForm(false);
    setForm(createEmptyForm());
    await fetchIngredients();
  };

  const handleDelete = async (id: string) => {
    // Remove related restock items first
    await (supabase as any).from("restock_items").delete().eq("ingredient_id", id);
    const { error } = await supabase.from("ingredients").delete().eq("id", id);
    if (error) {
      toast({ title: "Não foi possível remover", description: error.message });
      return;
    }
    toast({ title: "Ingrediente removido!" });
    await fetchIngredients();
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{filteredItems.length} de {items.length} ingredientes</p>
          <p className="text-xs text-muted-foreground">Os ingredientes podem ser editados ou excluídos pelo admin.</p>
        </div>
        <div className="flex items-center gap-2">
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
              <button onClick={() => setShowForm(false)} className="rounded-lg p-2 hover:bg-accent">
                <X size={24} className="text-muted-foreground" />
              </button>
            </div>

            <input
              placeholder="Nome do ingrediente"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            />

            <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isInternal}
                onChange={(event) => setForm({ ...form, isInternal: event.target.checked })}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block font-semibold text-foreground">Insumo interno (não exibir ao cliente)</span>
                <span className="block text-xs text-muted-foreground">
                  Marque para embalagens, sacolas, sachês, bobinas etc. Eles continuam no cálculo de custo, mas não aparecem na lista de ingredientes do cardápio.
                </span>
              </span>
            </label>

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
                    }));
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                >
                  {INGREDIENT_UNITS.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
                <input
                  placeholder="R$ 0,00"
                  type="text"
                  inputMode="decimal"
                  value={form.packagePrice}
                  onChange={(event) => setForm({ ...form, packagePrice: event.target.value })}
                  onBlur={(event) => setForm((current) => ({ ...current, packagePrice: formatMoneyInput(event.target.value) }))}
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
                  <p className="text-muted-foreground">Total pago: <span className="font-semibold text-foreground">{formatCurrency(totalSpent ?? 0)}</span></p>
                  <p className="text-muted-foreground">Total de {form.packageContentUnit}: <span className="font-semibold text-foreground">{totalUnits?.toFixed(2) ?? "0.00"}</span></p>
                  <p className="font-bold text-primary">Valor por {form.packageContentUnit}: {formatCurrency(resolvedCostPerUnit ?? 0)}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cálculo por {form.calculationMode}</p>
                <input
                  placeholder="R$ 0,00"
                  type="text"
                  inputMode="decimal"
                  value={form.referencePrice}
                  onChange={(event) => setForm({ ...form, referencePrice: event.target.value })}
                  onBlur={(event) => setForm((current) => ({ ...current, referencePrice: formatMoneyInput(event.target.value) }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
                <div className="space-y-1 rounded-lg border border-border bg-background p-3 text-sm">
                  <p className="text-muted-foreground">Valor informado por {form.calculationMode}: <span className="font-semibold text-foreground">{formatCurrency(totalSpent ?? 0)}</span></p>
                  <p className="font-bold text-primary">Valor salvo por {form.calculationMode}: {formatCurrency(resolvedCostPerUnit ?? 0)}</p>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border bg-background p-3 text-sm">
              <p className="text-muted-foreground">Valor que será salvo por {savedUnit}:</p>
              <p className="text-base font-bold text-foreground">{formatCurrency(resolvedCostPerUnit ?? 0)}</p>
            </div>

            <button onClick={handleSave} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-border bg-card">
        {filteredItems.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Nenhum ingrediente encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-3 pl-4 pr-2 font-medium text-muted-foreground">Ingrediente</th>
                <th className="px-2 py-3 font-medium text-muted-foreground">Unidade</th>
                <th className="px-2 py-3 font-medium text-muted-foreground">Cálculo</th>
                <th className="px-2 py-3 text-right font-medium text-muted-foreground">Custo</th>
                <th className="py-3 pl-2 pr-4 text-right font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const calculationMode = normalizeCalculationMode(item.calculation_mode ?? normalizeIngredientUnit(item.unit));

                return (
                  <tr key={item.id} className="border-b border-border/50 last:border-b-0">
                    <td className="py-3 pl-4 pr-2 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span>{item.name}</span>
                        {item.is_internal && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                            Interno
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">{normalizeIngredientUnit(item.unit)}</td>
                    <td className="px-2 py-3 text-muted-foreground">{calculationMode}</td>
                    <td className="px-2 py-3 text-right text-foreground">{formatCurrency(Number(item.cost_per_unit))}</td>
                    <td className="py-3 pl-2 pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground hover:text-foreground">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => void handleDelete(item.id)} className="p-1.5 text-muted-foreground hover:text-destructive">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default IngredientsTab;
