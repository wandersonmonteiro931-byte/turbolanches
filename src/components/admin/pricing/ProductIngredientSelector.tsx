import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { normalizeIngredientUnit, type IngredientMeasureUnit } from "./ingredientCalculation";
import { getCompatibleMeasurementUnits, getDefaultMeasurementUnit } from "./measurement";
import { formatCurrency } from "./pricingMoney";
import { normalizeSearch } from "@/lib/searchNormalize";

interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
}

interface SelectedIngredientLine {
  ingredient_id: string;
  quantity: number;
}

interface ProductIngredientSelectorProps {
  ingredients: IngredientOption[];
  selectedLines: SelectedIngredientLine[];
  quantityDrafts: Record<string, string>;
  selectedUnits: Record<string, IngredientMeasureUnit>;
  onQuantityChange: (ingredientId: string, value: string) => void;
  onQuantitySave: (ingredientId: string) => void;
  onToggle: (ingredientId: string, checked: boolean) => void;
  onUnitChange: (ingredientId: string, unit: IngredientMeasureUnit) => void;
}

const ProductIngredientSelector = ({
  ingredients,
  selectedLines,
  quantityDrafts,
  selectedUnits,
  onQuantityChange,
  onQuantitySave,
  onToggle,
  onUnitChange,
}: ProductIngredientSelectorProps) => {
  const [search, setSearch] = useState("");

  const lineMap = useMemo(
    () => new Map(selectedLines.map((line) => [line.ingredient_id, line])),
    [selectedLines],
  );

  const filteredIngredients = useMemo(() => {
    const normalized = search.trim();
    if (!normalized) return ingredients;

    return ingredients.filter((ingredient) => normalizeSearch(ingredient.name).includes(normalized));
  }, [ingredients, search]);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Selecionar ingredientes</p>
        <p className="text-xs text-muted-foreground">Marque vários ingredientes e ajuste a quantidade usada em cada item.</p>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pesquisar ingrediente"
          className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-3 text-sm"
        />
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {filteredIngredients.map((ingredient) => {
          const selectedLine = lineMap.get(ingredient.id);
          const checked = Boolean(selectedLine);
          const unitOptions = getCompatibleMeasurementUnits(ingredient.unit);
          const selectedUnit = selectedUnits[ingredient.id] ?? getDefaultMeasurementUnit(ingredient.unit);

          return (
            <div
              key={ingredient.id}
              className="grid gap-3 rounded-lg border border-border bg-card p-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center"
            >
              <div className="flex items-start gap-3">
                <Checkbox checked={checked} onCheckedChange={(value) => onToggle(ingredient.id, value === true)} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{ingredient.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(Number(ingredient.cost_per_unit || 0))} / {ingredient.unit}
                  </p>
                </div>
              </div>

              <div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">Quantidade</p>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      disabled={!checked}
                      value={quantityDrafts[ingredient.id] ?? (selectedLine ? String(selectedLine.quantity) : "1")}
                      onChange={(event) => onQuantityChange(ingredient.id, event.target.value)}
                      onBlur={() => void onQuantitySave(ingredient.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">Unidade</p>
                    <select
                      value={selectedUnit}
                      onChange={(event) => onUnitChange(ingredient.id, normalizeIngredientUnit(event.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredIngredients.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card px-3 py-4 text-center text-sm text-muted-foreground">
            Nenhum ingrediente encontrado.
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductIngredientSelector;