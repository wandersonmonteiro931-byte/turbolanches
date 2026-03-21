import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "./pricingMoney";

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

interface Props {
  productId: string;
  onChange?: () => void;
}

const ProductRecipeEditor = ({ productId, onChange }: Props) => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [adding, setAdding] = useState(false);
  const [selectedIngId, setSelectedIngId] = useState("");
  const [qty, setQty] = useState("1");

  const fetchData = async () => {
    let ingredientsQuery = supabase.from("ingredients").select("id, name, unit, cost_per_unit").order("name");
    let linesQuery = supabase.from("product_ingredients").select("id, ingredient_id, quantity").eq("product_id", productId);

    if (storeId) {
      ingredientsQuery = ingredientsQuery.eq("store_id", storeId);
      linesQuery = linesQuery.eq("store_id", storeId);
    }

    const [ingRes, linesRes] = await Promise.all([ingredientsQuery, linesQuery]);
    const nextIngredients = (ingRes.data || []) as Ingredient[];
    const ingredientMap = new Map(nextIngredients.map((ingredient) => [ingredient.id, ingredient]));

    setIngredients(nextIngredients);
    setLines(
      ((linesRes.data || []) as Array<{ id: string; ingredient_id: string; quantity: number }>).map((line) => {
        const ingredient = ingredientMap.get(line.ingredient_id);
        const quantity = Number(line.quantity || 0);

        return {
          id: line.id,
          ingredient_id: line.ingredient_id,
          quantity,
          name: ingredient?.name || "Ingrediente removido",
          unit: ingredient?.unit || "unidade",
          cost: quantity * Number(ingredient?.cost_per_unit || 0),
        };
      }),
    );
  };

  useEffect(() => {
    void fetchData();
  }, [productId, storeId]);

  const totalCost = useMemo(() => lines.reduce((sum, line) => sum + (line.cost || 0), 0), [lines]);

  const handleAdd = async () => {
    if (!selectedIngId) return;
    const quantity = parseFloat(qty) || 1;
    if (quantity <= 0) return;

    const payload: any = { product_id: productId, ingredient_id: selectedIngId, quantity };
    if (storeId) payload.store_id = storeId;

    const { data, error } = await supabase.from("product_ingredients").insert(payload).select("id, ingredient_id, quantity").single();

    if (error) {
      toast({ title: "Não foi possível adicionar", description: error.message });
      return;
    }

    if (data) {
      const ingredient = ingredients.find((item) => item.id === selectedIngId);
      setLines((current) => [
        ...current,
        {
          id: data.id,
          ingredient_id: selectedIngId,
          quantity,
          name: ingredient?.name,
          unit: ingredient?.unit,
          cost: quantity * Number(ingredient?.cost_per_unit || 0),
        },
      ]);
      onChange?.();
    }

    setAdding(false);
    setSelectedIngId("");
    setQty("1");
  };

  const handleQuantityChange = async (lineId: string | undefined, nextValue: string) => {
    if (!lineId) return;

    const nextQuantity = Number.parseFloat(nextValue);
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) return;

    const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

    setLines((current) =>
      current.map((line) => {
        if (line.id !== lineId) return line;
        const ingredient = ingredientMap.get(line.ingredient_id);
        return {
          ...line,
          quantity: nextQuantity,
          cost: nextQuantity * Number(ingredient?.cost_per_unit || 0),
        };
      }),
    );

    const { error } = await supabase.from("product_ingredients").update({ quantity: nextQuantity }).eq("id", lineId);
    if (error) {
      toast({ title: "Não foi possível salvar a quantidade", description: error.message });
      await fetchData();
      return;
    }

    onChange?.();
  };

  const handleRemove = async (lineId: string | undefined) => {
    if (!lineId) return;
    const { error } = await supabase.from("product_ingredients").delete().eq("id", lineId);
    if (error) {
      toast({ title: "Não foi possível remover", description: error.message });
      return;
    }

    setLines((current) => current.filter((line) => line.id !== lineId));
    onChange?.();
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-semibold text-foreground">Ficha Técnica</label>
          <p className="text-xs text-muted-foreground">Altere a quantidade e o custo atualiza na hora.</p>
        </div>
        <span className="text-xs font-bold text-primary">Custo: {formatCurrency(totalCost)}</span>
      </div>

      {lines.length === 0 && !adding && (
        <p className="text-[11px] text-muted-foreground">Nenhum ingrediente ou custo vinculado ainda.</p>
      )}

      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.id} className="grid gap-2 rounded-lg border border-border bg-background p-3 text-xs sm:grid-cols-[minmax(0,1fr)_120px_120px_40px] sm:items-center">
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
                value={line.quantity}
                onChange={(event) => void handleQuantityChange(line.id, event.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              />
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

      {adding ? (
        <div className="space-y-2">
          <select value={selectedIngId} onChange={(e) => setSelectedIngId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">Selecione ingrediente</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({formatCurrency(Number(i.cost_per_unit))}/{i.unit})</option>)}
          </select>
          <input type="number" step="0.01" placeholder="Quantidade" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Adicionar</button>
            <button onClick={() => setAdding(false)} className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground">Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Plus size={14} /> Adicionar ingrediente ou custo
        </button>
      )}
    </div>
  );
};

export default ProductRecipeEditor;
