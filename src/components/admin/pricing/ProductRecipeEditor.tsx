import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";

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
}

const ProductRecipeEditor = ({ productId }: Props) => {
  const { storeId } = useStore();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [adding, setAdding] = useState(false);
  const [selectedIngId, setSelectedIngId] = useState("");
  const [qty, setQty] = useState("1");

  useEffect(() => {
    const load = async () => {
      const filters = storeId ? { store_id: storeId } : {};
      const [ingRes, piRes] = await Promise.all([
        supabase.from("ingredients").select("*").match(filters).order("name"),
        supabase.from("product_ingredients").select("*").eq("product_id", productId).match(filters),
      ]);
      const ings = (ingRes.data || []) as Ingredient[];
      setIngredients(ings);
      const ingMap = new Map(ings.map((i) => [i.id, i]));
      const existingLines = ((piRes.data || []) as any[]).map((pi) => {
        const ing = ingMap.get(pi.ingredient_id);
        return {
          id: pi.id,
          ingredient_id: pi.ingredient_id,
          quantity: Number(pi.quantity),
          name: ing?.name || "?",
          unit: ing?.unit || "",
          cost: Number(pi.quantity) * Number(ing?.cost_per_unit || 0),
        };
      });
      setLines(existingLines);
    };
    load();
  }, [productId, storeId]);

  const totalCost = lines.reduce((s, l) => s + (l.cost || 0), 0);

  const handleAdd = async () => {
    if (!selectedIngId) return;
    const quantity = parseFloat(qty) || 1;
    const payload: any = { product_id: productId, ingredient_id: selectedIngId, quantity };
    if (storeId) payload.store_id = storeId;
    const { data } = await supabase.from("product_ingredients").insert(payload).select().single();
    if (data) {
      const ing = ingredients.find((i) => i.id === selectedIngId);
      setLines([...lines, {
        id: data.id,
        ingredient_id: selectedIngId,
        quantity,
        name: ing?.name,
        unit: ing?.unit,
        cost: quantity * Number(ing?.cost_per_unit || 0),
      }]);
    }
    setAdding(false);
    setSelectedIngId("");
    setQty("1");
  };

  const handleRemove = async (lineId: string | undefined) => {
    if (!lineId) return;
    await supabase.from("product_ingredients").delete().eq("id", lineId);
    setLines(lines.filter((l) => l.id !== lineId));
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-foreground">Ficha Técnica</label>
        <span className="text-xs font-bold text-primary">Custo: R$ {totalCost.toFixed(2)}</span>
      </div>

      {lines.length === 0 && !adding && (
        <p className="text-[11px] text-muted-foreground">Nenhum ingrediente vinculado.</p>
      )}

      {lines.map((l) => (
        <div key={l.id} className="flex items-center gap-2 text-xs">
          <span className="flex-1 text-foreground">{l.name} — {l.quantity} {l.unit}</span>
          <span className="text-muted-foreground">R$ {(l.cost || 0).toFixed(2)}</span>
          <button onClick={() => handleRemove(l.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
        </div>
      ))}

      {adding ? (
        <div className="space-y-2">
          <select value={selectedIngId} onChange={(e) => setSelectedIngId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">Selecione ingrediente</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} (R$ {Number(i.cost_per_unit).toFixed(2)}/{i.unit})</option>)}
          </select>
          <input type="number" step="0.01" placeholder="Quantidade" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Adicionar</button>
            <button onClick={() => setAdding(false)} className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground">Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Plus size={14} /> Adicionar ingrediente
        </button>
      )}
    </div>
  );
};

export default ProductRecipeEditor;
