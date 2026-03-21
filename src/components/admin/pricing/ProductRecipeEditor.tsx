import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { normalizeIngredientUnit, type IngredientMeasureUnit } from "./ingredientCalculation";
import {
  convertMeasurementQuantity,
  formatMeasurementQuantityInput,
  getCompatibleMeasurementUnits,
  getDefaultMeasurementUnit,
} from "./measurement";
import { formatCurrency, formatMoneyInput, parseRoundedMoney, roundMoney } from "./pricingMoney";
import ProductIngredientSelector from "./ProductIngredientSelector";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
}

interface RecipeLine {
  id?: string;
  ingredient_id: string;
  quantity: number;
  name?: string;
  unit?: string;
  cost?: number;
}

interface ComboProductOption {
  id: string;
  name: string;
  active: boolean;
  is_combo: boolean;
}

interface ComboLine {
  id?: string;
  component_product_id: string;
  quantity: number;
}

interface ProductCostMapEntry {
  name: string;
  baseCost: number;
  isCombo?: boolean;
}

interface Props {
  productId: string;
  onChange?: (payload: ProductRecipeEditorChange) => void;
  allowBulkIngredientSelection?: boolean;
  enableComboComponents?: boolean;
  productCostMap?: Record<string, ProductCostMapEntry>;
}

export interface ProductRecipeEditorChange {
  productId: string;
  manualCost: number;
  lines: Array<{
    id?: string;
    ingredient_id: string;
    quantity: number;
  }>;
  comboLines?: Array<{
    id?: string;
    component_product_id: string;
    quantity: number;
  }>;
}

const ProductRecipeEditor = ({
  productId,
  onChange,
  allowBulkIngredientSelection = false,
  enableComboComponents = false,
  productCostMap,
}: Props) => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [comboProducts, setComboProducts] = useState<ComboProductOption[]>([]);
  const [comboLines, setComboLines] = useState<ComboLine[]>([]);
  const [adding, setAdding] = useState(false);
  const [selectedIngId, setSelectedIngId] = useState("");
  const [qty, setQty] = useState("1");
  const [isComboProduct, setIsComboProduct] = useState(false);
  const [selectedComboProductId, setSelectedComboProductId] = useState("");
  const [comboQty, setComboQty] = useState("1");
  const [manualCostInput, setManualCostInput] = useState("");
  const [savedManualCost, setSavedManualCost] = useState(0);
  const [savingManualCost, setSavingManualCost] = useState(false);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [selectionDrafts, setSelectionDrafts] = useState<Record<string, string>>({});
  const [comboQuantityDrafts, setComboQuantityDrafts] = useState<Record<string, string>>({});
  const [entryUnits, setEntryUnits] = useState<Record<string, IngredientMeasureUnit>>({});

  const ingredientMap = useMemo(() => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])), [ingredients]);
  const comboProductMap = useMemo(() => new Map(comboProducts.map((product) => [product.id, product])), [comboProducts]);
  const selectedIngredientUnitOptions = useMemo(
    () => (selectedIngId ? getCompatibleMeasurementUnits(ingredientMap.get(selectedIngId)?.unit) : ["unidade"]),
    [ingredientMap, selectedIngId],
  );
  const comboDisplayLines = useMemo(
    () =>
      comboLines.map((line) => {
        const product = comboProductMap.get(line.component_product_id);
        const costEntry = productCostMap?.[line.component_product_id];
        const unitCost = Number(costEntry?.baseCost || 0);

        return {
          ...line,
          name: product?.name || costEntry?.name || "Item removido",
          unitCost,
          cost: roundMoney(unitCost * Number(line.quantity || 0)),
        };
      }),
    [comboLines, comboProductMap, productCostMap],
  );

  const getIngredientBaseUnit = (ingredientId: string, lookup = ingredientMap): IngredientMeasureUnit =>
    getDefaultMeasurementUnit(lookup.get(ingredientId)?.unit);

  const formatDisplayQuantity = (
    ingredientId: string,
    baseQuantity: number,
    lookup = ingredientMap,
    unitSelections = entryUnits,
  ) => {
    const baseUnit = getIngredientBaseUnit(ingredientId, lookup);
    const entryUnit = unitSelections[ingredientId] ?? baseUnit;
    const displayQuantity = convertMeasurementQuantity(baseQuantity, baseUnit, entryUnit) ?? baseQuantity;
    return formatMeasurementQuantityInput(displayQuantity);
  };

  const serializeLines = (nextLines: RecipeLine[]) =>
    nextLines.map((line) => ({
      id: line.id,
      ingredient_id: line.ingredient_id,
      quantity: line.quantity,
    }));

  const serializeComboLines = (nextLines: ComboLine[]) =>
    nextLines.map((line) => ({
      id: line.id,
      component_product_id: line.component_product_id,
      quantity: line.quantity,
    }));

  const enrichLine = (
    line: { id?: string; ingredient_id: string; quantity: number },
    lookup = ingredientMap,
  ): RecipeLine => {
    const ingredient = lookup.get(line.ingredient_id);
    const quantity = Number(line.quantity || 0);

    return {
      id: line.id,
      ingredient_id: line.ingredient_id,
      quantity,
      name: ingredient?.name || "Ingrediente removido",
      unit: ingredient?.unit || "unidade",
      cost: quantity * Number(ingredient?.cost_per_unit || 0),
    };
  };

  const emitChange = (nextLines: RecipeLine[], nextManualCost: number, nextComboLines: ComboLine[] = comboLines) => {
    onChange?.({
      productId,
      manualCost: nextManualCost,
      lines: serializeLines(nextLines),
      comboLines: serializeComboLines(nextComboLines),
    });
  };

  const fetchData = async () => {
    let ingredientsQuery = supabase.from("ingredients").select("id, name, unit, cost_per_unit").order("name");
    let linesQuery = supabase.from("product_ingredients").select("id, ingredient_id, quantity").eq("product_id", productId);
    let comboProductsQuery = supabase
      .from("products")
      .select("id, name, active, is_combo")
      .neq("id", productId)
      .order("name");
    let comboLinesQuery = supabase
      .from("product_combo_items")
      .select("id, component_product_id, quantity")
      .eq("product_id", productId)
      .order("sort_order")
      .order("created_at");
    const productQuery = supabase.from("products").select("manual_cost, is_combo").eq("id", productId).maybeSingle();

    if (storeId) {
      ingredientsQuery = ingredientsQuery.eq("store_id", storeId);
      linesQuery = linesQuery.eq("store_id", storeId);
      comboProductsQuery = comboProductsQuery.eq("store_id", storeId);
      comboLinesQuery = comboLinesQuery.eq("store_id", storeId);
    }

    const [ingRes, linesRes, productRes, comboProductsRes, comboLinesRes] = await Promise.all([
      ingredientsQuery,
      linesQuery,
      productQuery,
      comboProductsQuery,
      comboLinesQuery,
    ]);
    const nextIngredients = (ingRes.data || []) as Ingredient[];
    const nextIngredientMap = new Map(nextIngredients.map((ingredient) => [ingredient.id, ingredient]));
    const productData = (productRes.data as { manual_cost?: number | null; is_combo?: boolean | null } | null) || null;
    const nextManualCost = Number(productData?.manual_cost || 0);
    const nextIsComboProduct = enableComboComponents && Boolean(productData?.is_combo);
    const nextEntryUnits = nextIngredients.reduce<Record<string, IngredientMeasureUnit>>((drafts, ingredient) => {
      drafts[ingredient.id] = getDefaultMeasurementUnit(ingredient.unit);
      return drafts;
    }, {});

    setIngredients(nextIngredients);
    setComboProducts((comboProductsRes.data || []) as ComboProductOption[]);
    setIsComboProduct(nextIsComboProduct);
    setEntryUnits(nextEntryUnits);
    setSavedManualCost(nextManualCost);
    setManualCostInput(formatMoneyInput(nextManualCost));
    const nextLines = ((linesRes.data || []) as Array<{ id: string; ingredient_id: string; quantity: number }>).map((line) =>
      enrichLine(line, nextIngredientMap),
    );

    setLines(nextLines);
    setQuantityDrafts(
      nextLines.reduce<Record<string, string>>((drafts, line) => {
        if (line.id) drafts[line.id] = formatDisplayQuantity(line.ingredient_id, line.quantity, nextIngredientMap, nextEntryUnits);
        return drafts;
      }, {}),
    );
    setSelectionDrafts(
      nextLines.reduce<Record<string, string>>((drafts, line) => {
        drafts[line.ingredient_id] = formatDisplayQuantity(line.ingredient_id, line.quantity, nextIngredientMap, nextEntryUnits);
        return drafts;
      }, {}),
    );

    const nextComboLines = ((comboLinesRes.data || []) as Array<{ id: string; component_product_id: string; quantity: number }>).map(
      (line) => ({
        id: line.id,
        component_product_id: line.component_product_id,
        quantity: Number(line.quantity || 0),
      }),
    );
    setComboLines(nextComboLines);
    setComboQuantityDrafts(
      nextComboLines.reduce<Record<string, string>>((drafts, line) => {
        if (line.id) drafts[line.id] = String(line.quantity);
        return drafts;
      }, {}),
    );
  };

  useEffect(() => {
    void fetchData();
  }, [productId, storeId]);

  const totalCost = useMemo(() => lines.reduce((sum, line) => sum + (line.cost || 0), 0), [lines]);
  const comboComponentCost = useMemo(
    () => comboDisplayLines.reduce((sum, line) => sum + Number(line.cost || 0), 0),
    [comboDisplayLines],
  );
  const combinedCost = useMemo(() => totalCost + savedManualCost + comboComponentCost, [comboComponentCost, savedManualCost, totalCost]);

  const insertIngredientLine = async (ingredientId: string, rawQuantity?: string) => {
    const existingLine = lines.find((line) => line.ingredient_id === ingredientId);
    if (existingLine) return existingLine;

    const enteredQuantity = Number.parseFloat(rawQuantity ?? "1") || 1;
    if (enteredQuantity <= 0) return null;

    const baseUnit = getIngredientBaseUnit(ingredientId);
    const entryUnit = entryUnits[ingredientId] ?? baseUnit;
    const quantity = convertMeasurementQuantity(enteredQuantity, entryUnit, baseUnit) ?? enteredQuantity;

    const payload: any = { product_id: productId, ingredient_id: ingredientId, quantity };
    if (storeId) payload.store_id = storeId;

    const { data, error } = await supabase.from("product_ingredients").insert(payload).select("id, ingredient_id, quantity").single();

    if (error) {
      toast({ title: "Não foi possível adicionar", description: error.message });
      return null;
    }

    if (!data) return null;

    const nextLine = enrichLine(
      {
        id: data.id,
        ingredient_id: data.ingredient_id,
        quantity: Number(data.quantity || 0),
      },
      ingredientMap,
    );

    const nextLines = [...lines, nextLine];
    setLines(nextLines);
    setEntryUnits((current) => ({
      ...current,
      [ingredientId]: current[ingredientId] ?? entryUnit,
    }));
    setQuantityDrafts((current) => ({ ...current, [data.id]: formatMeasurementQuantityInput(enteredQuantity) }));
    setSelectionDrafts((current) => ({ ...current, [ingredientId]: formatMeasurementQuantityInput(enteredQuantity) }));
    emitChange(nextLines, savedManualCost, comboLines);

    return nextLine;
  };

  const handleManualCostSave = async (rawValue: string) => {
    const parsedValue = rawValue.trim() ? parseRoundedMoney(rawValue) : 0;

    if (parsedValue === null) {
      toast({ title: "Custo inválido", description: "Informe um valor no formato R$ 0,00." });
      setManualCostInput(formatMoneyInput(savedManualCost));
      return;
    }

    if (parsedValue === savedManualCost) {
      setManualCostInput(formatMoneyInput(parsedValue));
      return;
    }

    setSavingManualCost(true);

    const { error } = await supabase
      .from("products")
      .update({ manual_cost: parsedValue } as any)
      .eq("id", productId);

    setSavingManualCost(false);

    if (error) {
      toast({ title: "Não foi possível salvar o custo", description: error.message });
      setManualCostInput(formatMoneyInput(savedManualCost));
      return;
    }

    setSavedManualCost(parsedValue);
    setManualCostInput(formatMoneyInput(parsedValue));
    emitChange(lines, parsedValue, comboLines);
  };

  const handleAdd = async () => {
    if (!selectedIngId) return;
    const inserted = await insertIngredientLine(selectedIngId, qty);
    if (!inserted) return;

    setAdding(false);
    setSelectedIngId("");
    setQty("1");
  };

  const handleIngredientToggle = async (ingredientId: string, checked: boolean) => {
    if (checked) {
      await insertIngredientLine(ingredientId, selectionDrafts[ingredientId] ?? "1");
      return;
    }

    const existingLine = lines.find((line) => line.ingredient_id === ingredientId);
    if (!existingLine?.id) return;

    const { error } = await supabase.from("product_ingredients").delete().eq("id", existingLine.id);
    if (error) {
      toast({ title: "Não foi possível remover", description: error.message });
      return;
    }

    const nextLines = lines.filter((line) => line.id !== existingLine.id);
    setLines(nextLines);
    setQuantityDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[existingLine.id as string];
      return nextDrafts;
    });
    setSelectionDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[ingredientId];
      return nextDrafts;
    });
    setEntryUnits((current) => {
      const nextUnits = { ...current };
      delete nextUnits[ingredientId];
      return nextUnits;
    });
    emitChange(nextLines, savedManualCost, comboLines);
  };

  const saveLineQuantity = async (line: RecipeLine, rawValue: string | undefined) => {
    if (!line.id) return;

    const enteredQuantity = Number.parseFloat(rawValue ?? "");
    const enteredDisplayValue = formatDisplayQuantity(line.ingredient_id, line.quantity);

    if (!Number.isFinite(enteredQuantity) || enteredQuantity <= 0) {
      setQuantityDrafts((current) => ({
        ...current,
        [line.id as string]: enteredDisplayValue,
      }));
      setSelectionDrafts((current) => ({
        ...current,
        [line.ingredient_id]: enteredDisplayValue,
      }));
      return;
    }

    const baseUnit = getIngredientBaseUnit(line.ingredient_id);
    const entryUnit = entryUnits[line.ingredient_id] ?? baseUnit;
    const nextQuantity = convertMeasurementQuantity(enteredQuantity, entryUnit, baseUnit) ?? enteredQuantity;
    const normalizedEnteredValue = formatMeasurementQuantityInput(enteredQuantity);

    if (nextQuantity === line.quantity) {
      setQuantityDrafts((current) => ({
        ...current,
        [line.id as string]: normalizedEnteredValue,
      }));
      setSelectionDrafts((current) => ({
        ...current,
        [line.ingredient_id]: normalizedEnteredValue,
      }));
      return;
    }

    const nextLines = lines.map((currentLine) => {
      if (currentLine.id !== line.id) return currentLine;
      const ingredient = ingredientMap.get(currentLine.ingredient_id);

      return {
        ...currentLine,
        quantity: nextQuantity,
        cost: nextQuantity * Number(ingredient?.cost_per_unit || 0),
      };
    });

    setLines(nextLines);
    setQuantityDrafts((current) => ({ ...current, [line.id as string]: normalizedEnteredValue }));
    setSelectionDrafts((current) => ({ ...current, [line.ingredient_id]: normalizedEnteredValue }));

    const { error } = await supabase.from("product_ingredients").update({ quantity: nextQuantity }).eq("id", line.id);
    if (error) {
      toast({ title: "Não foi possível salvar a quantidade", description: error.message });
      await fetchData();
      return;
    }

    emitChange(nextLines, savedManualCost);
  };

  const handleQuantitySave = async (lineId: string | undefined) => {
    if (!lineId) return;
    const existingLine = lines.find((line) => line.id === lineId);
    if (!existingLine) return;
    await saveLineQuantity(existingLine, quantityDrafts[lineId]);
  };

  const handleSelectionQuantitySave = async (ingredientId: string) => {
    const existingLine = lines.find((line) => line.ingredient_id === ingredientId);
    if (!existingLine) return;

    await saveLineQuantity(existingLine, selectionDrafts[ingredientId]);
  };

  const handleEntryUnitChange = (ingredientId: string, nextUnit: IngredientMeasureUnit) => {
    const currentUnit = entryUnits[ingredientId] ?? getIngredientBaseUnit(ingredientId);
    const existingLine = lines.find((line) => line.ingredient_id === ingredientId);

    let nextDisplayValue = existingLine
      ? Number.parseFloat(formatDisplayQuantity(ingredientId, existingLine.quantity, ingredientMap, {
          ...entryUnits,
          [ingredientId]: nextUnit,
        }))
      : null;

    const currentDraftValue = Number.parseFloat(selectionDrafts[ingredientId] ?? "");
    if (Number.isFinite(currentDraftValue)) {
      nextDisplayValue = convertMeasurementQuantity(currentDraftValue, currentUnit, nextUnit) ?? currentDraftValue;
    }

    const formattedDisplayValue =
      nextDisplayValue !== null && Number.isFinite(nextDisplayValue) ? formatMeasurementQuantityInput(nextDisplayValue) : "";

    setEntryUnits((current) => ({ ...current, [ingredientId]: nextUnit }));

    if (formattedDisplayValue) {
      setSelectionDrafts((current) => ({ ...current, [ingredientId]: formattedDisplayValue }));

      if (existingLine?.id) {
        setQuantityDrafts((current) => ({ ...current, [existingLine.id]: formattedDisplayValue }));
      }
    }
  };

  const handleRemove = async (lineId: string | undefined) => {
    if (!lineId) return;
    const removedLine = lines.find((line) => line.id === lineId);
    const { error } = await supabase.from("product_ingredients").delete().eq("id", lineId);
    if (error) {
      toast({ title: "Não foi possível remover", description: error.message });
      return;
    }

    const nextLines = lines.filter((line) => line.id !== lineId);
    setLines(nextLines);
    setQuantityDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[lineId];
      return nextDrafts;
    });
    if (removedLine) {
      setSelectionDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[removedLine.ingredient_id];
        return nextDrafts;
      });
      setEntryUnits((current) => {
        const nextUnits = { ...current };
        delete nextUnits[removedLine.ingredient_id];
        return nextUnits;
      });
    }
    emitChange(nextLines, savedManualCost, comboLines);
  };

  const addComboLine = async () => {
    if (!selectedComboProductId || !isComboProduct) return;

    const existingLine = comboLines.find((line) => line.component_product_id === selectedComboProductId);
    if (existingLine) {
      toast({ title: "Item já adicionado", description: "Edite a quantidade do item já vinculado ao combo." });
      return;
    }

    const quantity = Number.parseFloat(comboQty || "1");
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    const payload: any = {
      product_id: productId,
      component_product_id: selectedComboProductId,
      quantity,
      sort_order: comboLines.length,
    };
    if (storeId) payload.store_id = storeId;

    const { data, error } = await supabase
      .from("product_combo_items")
      .insert(payload)
      .select("id, component_product_id, quantity")
      .single();

    if (error) {
      toast({ title: "Não foi possível adicionar o item", description: error.message });
      return;
    }

    if (!data) return;

    const nextComboLines = [
      ...comboLines,
      {
        id: data.id,
        component_product_id: data.component_product_id,
        quantity: Number(data.quantity || 0),
      },
    ];

    setComboLines(nextComboLines);
    setComboQuantityDrafts((current) => ({ ...current, [data.id]: String(Number(data.quantity || 0)) }));
    setSelectedComboProductId("");
    setComboQty("1");
    emitChange(lines, savedManualCost, nextComboLines);
  };

  const saveComboQuantity = async (lineId: string | undefined) => {
    if (!lineId) return;

    const line = comboLines.find((currentLine) => currentLine.id === lineId);
    if (!line) return;

    const quantity = Number.parseFloat(comboQuantityDrafts[lineId] ?? "");
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setComboQuantityDrafts((current) => ({ ...current, [lineId]: String(line.quantity) }));
      return;
    }

    if (quantity === line.quantity) {
      setComboQuantityDrafts((current) => ({ ...current, [lineId]: String(quantity) }));
      return;
    }

    const nextComboLines = comboLines.map((currentLine) =>
      currentLine.id === lineId ? { ...currentLine, quantity } : currentLine,
    );
    setComboLines(nextComboLines);
    setComboQuantityDrafts((current) => ({ ...current, [lineId]: String(quantity) }));

    const { error } = await supabase.from("product_combo_items").update({ quantity }).eq("id", lineId);
    if (error) {
      toast({ title: "Não foi possível salvar o item do combo", description: error.message });
      await fetchData();
      return;
    }

    emitChange(lines, savedManualCost, nextComboLines);
  };

  const removeComboLine = async (lineId: string | undefined) => {
    if (!lineId) return;

    const { error } = await supabase.from("product_combo_items").delete().eq("id", lineId);
    if (error) {
      toast({ title: "Não foi possível remover o item do combo", description: error.message });
      return;
    }

    const nextComboLines = comboLines.filter((line) => line.id !== lineId);
    setComboLines(nextComboLines);
    setComboQuantityDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[lineId];
      return nextDrafts;
    });
    emitChange(lines, savedManualCost, nextComboLines);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-semibold text-foreground">Ficha Técnica</label>
          <p className="text-xs text-muted-foreground">Altere ingredientes ou informe custo direto para itens sem ingredientes.</p>
        </div>
        <span className="text-xs font-bold text-primary">Custo: {formatCurrency(combinedCost)}</span>
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-background p-3 text-xs sm:grid-cols-[minmax(0,1fr)_160px] sm:items-end">
        <div>
          <p className="font-medium text-foreground">Custo direto do item</p>
          <p className="text-muted-foreground">Use para bebidas e produtos sem ingredientes.</p>
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{savingManualCost ? "Salvando..." : "Salva ao sair do campo"}</p>
          <input
            type="text"
            inputMode="decimal"
            placeholder="R$ 0,00"
            value={manualCostInput}
            onChange={(event) => setManualCostInput(event.target.value)}
            onBlur={(event) => void handleManualCostSave(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
        </div>
      </div>

      {isComboProduct && (
        <div className="space-y-3 rounded-lg border border-border bg-background p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Itens do combo</p>
              <p className="text-xs text-muted-foreground">
                O combo usa automaticamente o custo dos itens vinculados; se o custo do sanduíche mudar, o combo acompanha.
              </p>
            </div>
            <span className="text-xs font-bold text-primary">Subtotal do combo: {formatCurrency(comboComponentCost)}</span>
          </div>

          {comboDisplayLines.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Nenhum item vinculado ao combo ainda.</p>
          ) : (
            <div className="space-y-2">
              {comboDisplayLines.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-2 rounded-lg border border-border bg-card p-3 text-xs lg:grid-cols-[minmax(0,1fr)_110px_120px_40px] lg:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{line.name}</p>
                    <p className="text-muted-foreground">Custo unitário: {formatCurrency(line.unitCost)}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">Quantidade</p>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={line.id ? comboQuantityDrafts[line.id] ?? String(line.quantity) : String(line.quantity)}
                      onChange={(event) => {
                        if (!line.id) return;
                        setComboQuantityDrafts((current) => ({ ...current, [line.id as string]: event.target.value }));
                      }}
                      onBlur={() => void saveComboQuantity(line.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">Subtotal</p>
                    <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">
                      {formatCurrency(line.cost)}
                    </div>
                  </div>
                  <button onClick={() => void removeComboLine(line.id)} className="mt-5 text-muted-foreground hover:text-destructive sm:mt-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]">
            <select
              value={selectedComboProductId}
              onChange={(event) => setSelectedComboProductId(event.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">Selecione o item do combo</option>
              {comboProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.is_combo ? " (combo)" : ""}
                  {product.active ? "" : " • oculto"}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              step="1"
              value={comboQty}
              onChange={(event) => setComboQty(event.target.value)}
              placeholder="Qtd."
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
            <button
              onClick={() => void addComboLine()}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
            >
              <Plus size={14} /> Adicionar item
            </button>
          </div>
        </div>
      )}

      {allowBulkIngredientSelection && (
        <ProductIngredientSelector
          ingredients={ingredients}
          selectedLines={lines}
          quantityDrafts={selectionDrafts}
          selectedUnits={entryUnits}
          onQuantityChange={(ingredientId, value) =>
            setSelectionDrafts((current) => ({
              ...current,
              [ingredientId]: value,
            }))
          }
          onQuantitySave={handleSelectionQuantitySave}
          onToggle={handleIngredientToggle}
          onUnitChange={handleEntryUnitChange}
        />
      )}

      {lines.length === 0 && !adding && (
        <p className="text-[11px] text-muted-foreground">Nenhum ingrediente ou custo vinculado ainda.</p>
      )}

      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.id} className="grid gap-2 rounded-lg border border-border bg-background p-3 text-xs lg:grid-cols-[minmax(0,1fr)_120px_120px_120px_40px] lg:items-center">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{line.name}</p>
              <p className="text-muted-foreground">Custo unitário: {formatCurrency((line.cost || 0) / Number(line.quantity || 1))} / {line.unit}</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">Quantidade</p>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={line.id ? quantityDrafts[line.id] ?? String(line.quantity) : String(line.quantity)}
                onChange={(event) => {
                  if (!line.id) return;
                  setQuantityDrafts((current) => ({ ...current, [line.id as string]: event.target.value }));
                }}
                onBlur={() => void handleQuantitySave(line.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">Unidade</p>
              <select
                value={entryUnits[line.ingredient_id] ?? getIngredientBaseUnit(line.ingredient_id)}
                onChange={(event) => handleEntryUnitChange(line.ingredient_id, normalizeIngredientUnit(event.target.value))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                {getCompatibleMeasurementUnits(line.unit).map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">Custo</p>
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground">
                {formatCurrency(line.cost || 0)}
              </div>
            </div>
            <button onClick={() => void handleRemove(line.id)} className="mt-5 text-muted-foreground hover:text-destructive sm:mt-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {!allowBulkIngredientSelection && adding ? (
        <div className="space-y-2">
          <select
            value={selectedIngId}
            onChange={(event) => {
              const nextIngredientId = event.target.value;
              setSelectedIngId(nextIngredientId);

              if (!nextIngredientId) return;

              setEntryUnits((current) => ({
                ...current,
                [nextIngredientId]: current[nextIngredientId] ?? getIngredientBaseUnit(nextIngredientId),
              }));
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Selecione ingrediente</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({formatCurrency(Number(i.cost_per_unit))}/{i.unit})</option>)}
          </select>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
            <input type="number" step="0.01" placeholder="Quantidade" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <select
              value={selectedIngId ? entryUnits[selectedIngId] ?? getIngredientBaseUnit(selectedIngId) : "unidade"}
              onChange={(event) => {
                if (!selectedIngId) return;
                handleEntryUnitChange(selectedIngId, normalizeIngredientUnit(event.target.value));
              }}
              disabled={!selectedIngId}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {selectedIngredientUnitOptions.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Adicionar</button>
            <button onClick={() => setAdding(false)} className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground">Cancelar</button>
          </div>
        </div>
      ) : !allowBulkIngredientSelection ? (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Plus size={14} /> Adicionar ingrediente ou custo
        </button>
      ) : null}
    </div>
  );
};

export default ProductRecipeEditor;
