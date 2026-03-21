import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { useAuth } from "@/contexts/AuthContext";

interface RestockList {
  id: string;
  title: string;
  notes: string;
  status: string;
  updated_at: string;
}

interface RestockItem {
  id: string;
  ingredient_id: string | null;
  ingredient_name: string;
  unit: string;
  quantity: number;
  last_price: number;
  estimated_total: number;
  checked: boolean;
  sort_order: number;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
}

const AdminRestock = () => {
  const db = supabase as any;
  const { toast } = useToast();
  const { storeId } = useStore();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [draftList, setDraftList] = useState<RestockList | null>(null);
  const [items, setItems] = useState<RestockItem[]>([]);
  const [search, setSearch] = useState("");

  const createDraftList = async () => {
    const title = `Reposição ${new Date().toLocaleDateString("pt-BR")}`;
    const { data, error } = await db
      .from("restock_lists")
      .insert({
        store_id: storeId ?? null,
        created_by: user?.id,
        title,
        notes: "",
        status: "draft",
      })
      .select("*")
      .single();

    if (error) throw error;
    return data as RestockList;
  };

  const getDraftList = async () => {
    let query = db
      .from("restock_lists")
      .select("*")
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1);

    query = storeId ? query.eq("store_id", storeId) : query.is("store_id", null);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return (data as RestockList | null) ?? null;
  };

  const getIngredients = async () => {
    let query = db.from("ingredients").select("id, name, unit, cost_per_unit").order("name");
    query = storeId ? query.eq("store_id", storeId) : query.is("store_id", null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Ingredient[];
  };

  const getRestockItems = async (restockListId: string) => {
    const { data, error } = await db
      .from("restock_items")
      .select("*")
      .eq("restock_list_id", restockListId)
      .order("sort_order")
      .order("ingredient_name");

    if (error) throw error;
    return (data || []) as RestockItem[];
  };

  const syncItemsFromIngredients = async (restockListId: string) => {
    const [ingredients, existingItems] = await Promise.all([
      getIngredients(),
      getRestockItems(restockListId),
    ]);

    const existingByIngredient = new Map(
      existingItems
        .filter((item) => item.ingredient_id)
        .map((item) => [item.ingredient_id as string, item]),
    );

    const inserts = ingredients
      .filter((ingredient) => !existingByIngredient.has(ingredient.id))
      .map((ingredient, index) => ({
        restock_list_id: restockListId,
        store_id: storeId ?? null,
        ingredient_id: ingredient.id,
        ingredient_name: ingredient.name,
        unit: ingredient.unit,
        quantity: 1,
        last_price: Number(ingredient.cost_per_unit) || 0,
        checked: false,
        sort_order: existingItems.length + index,
      }));

    const updates = ingredients
      .map((ingredient) => {
        const existing = existingByIngredient.get(ingredient.id);
        if (!existing) return null;

        const nextPrice = Number(ingredient.cost_per_unit) || 0;
        const changed =
          existing.ingredient_name !== ingredient.name ||
          existing.unit !== ingredient.unit ||
          Number(existing.last_price) !== nextPrice;

        if (!changed) return null;

        return db
          .from("restock_items")
          .update({
            ingredient_name: ingredient.name,
            unit: ingredient.unit,
            last_price: nextPrice,
          })
          .eq("id", existing.id);
      })
      .filter(Boolean);

    if (inserts.length > 0) {
      const { error } = await db.from("restock_items").insert(inserts);
      if (error) throw error;
    }

    if (updates.length > 0) {
      const results = await Promise.all(updates);
      const failed = results.find((result: any) => result.error);
      if (failed?.error) throw failed.error;
    }

    return { ingredientsCount: ingredients.length, newItems: inserts.length };
  };

  const loadDraft = async (showSyncToast = false) => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const existingDraft = await getDraftList();
      const resolvedDraft = existingDraft ?? (await createDraftList());
      const syncResult = await syncItemsFromIngredients(resolvedDraft.id);
      const freshItems = await getRestockItems(resolvedDraft.id);
      const latestDraft = (await getDraftList()) ?? resolvedDraft;

      setDraftList(latestDraft);
      setItems(freshItems);

      if (showSyncToast) {
        toast({
          title: syncResult.newItems > 0 ? "Reposição atualizada" : "Reposição sincronizada",
          description:
            syncResult.newItems > 0
              ? `${syncResult.newItems} item(ns) novo(s) foram adicionados à lista de reposição.`
              : `Todos os ${syncResult.ingredientsCount} ingredientes já estavam disponíveis na lista.`,
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao carregar reposição",
        description: error instanceof Error ? error.message : "Não foi possível carregar a seção.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    void loadDraft(false);
  }, [storeId, user?.id]);

  const handleRefresh = async () => {
    setSyncing(true);
    await loadDraft(true);
  };

  const saveListPatch = async (patch: Partial<RestockList>) => {
    if (!draftList) return;

    setDraftList((current) => (current ? { ...current, ...patch } : current));
    const { error } = await db.from("restock_lists").update(patch).eq("id", draftList.id);

    if (error) {
      toast({
        title: "Erro ao salvar relatório",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateLocalItem = (itemId: string, patch: Partial<RestockItem>) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...patch,
              estimated_total:
                (patch.quantity ?? item.quantity) * (patch.last_price ?? item.last_price),
            }
          : item,
      ),
    );
  };

  const saveItemPatch = async (itemId: string, patch: Partial<RestockItem>) => {
    updateLocalItem(itemId, patch);
    const { error } = await db.from("restock_items").update(patch).eq("id", itemId);

    if (error) {
      toast({
        title: "Erro ao salvar item",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => !normalizedSearch || item.ingredient_name.toLowerCase().includes(normalizedSearch));
  }, [items, search]);

  const selectedItems = useMemo(() => items.filter((item) => item.checked), [items]);
  const selectedCount = selectedItems.length;
  const estimatedTotal = selectedItems.reduce((sum, item) => sum + Number(item.estimated_total || item.quantity * item.last_price), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 print:hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">Reposição</h2>
            <p className="text-sm text-muted-foreground">
              Marque os ingredientes que precisam ser comprados, ajuste a quantidade e use o último valor pago como referência do relatório.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={syncing}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-opacity disabled:opacity-60"
            >
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> Atualizar itens
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Printer size={16} /> Imprimir relatório
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Itens marcados</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{selectedCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimativa total</p>
            <p className="mt-1 text-2xl font-bold text-foreground">R$ {estimatedTotal.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Última atualização</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {draftList?.updated_at ? new Date(draftList.updated_at).toLocaleString("pt-BR") : "Agora"}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.4fr,1fr]">
          <input
            value={draftList?.title ?? ""}
            onChange={(event) => setDraftList((current) => (current ? { ...current, title: event.target.value } : current))}
            onBlur={(event) => void saveListPatch({ title: event.target.value.trim() || "Reposição" })}
            placeholder="Título do relatório"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          />
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar ingrediente"
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm"
            />
          </div>
        </div>

        <textarea
          value={draftList?.notes ?? ""}
          onChange={(event) => setDraftList((current) => (current ? { ...current, notes: event.target.value } : current))}
          onBlur={(event) => void saveListPatch({ notes: event.target.value })}
          placeholder="Observações do relatório de reposição"
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card print:border-0 print:shadow-none">
        <div className="border-b border-border px-4 py-3 print:px-0">
          <h3 className="text-base font-bold text-foreground">Relatório de reposição</h3>
          <p className="text-sm text-muted-foreground">
            {draftList?.title || "Reposição"} • {new Date().toLocaleDateString("pt-BR")}
          </p>
        </div>

        <div className="p-4 print:px-0 print:py-3">
          {draftList?.notes ? (
            <div className="mb-4 rounded-xl border border-border bg-background p-3 text-sm text-foreground">
              <strong>Observações:</strong> {draftList.notes}
            </div>
          ) : null}

          {selectedItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
              Nenhum item marcado para compra.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-2 font-medium text-muted-foreground">Item</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">Qtd.</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">Último valor</th>
                    <th className="pl-2 py-2 text-right font-medium text-muted-foreground">Estimativa</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map((item) => (
                    <tr key={item.id} className="border-b border-border/60">
                      <td className="py-2 pr-2 font-medium text-foreground">{item.ingredient_name}</td>
                      <td className="px-2 py-2 text-right text-foreground">{Number(item.quantity).toFixed(2)} {item.unit}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">R$ {Number(item.last_price).toFixed(2)}</td>
                      <td className="pl-2 py-2 text-right font-semibold text-foreground">R$ {Number(item.estimated_total || item.quantity * item.last_price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="pt-4 text-right text-sm font-semibold text-foreground">Total estimado</td>
                    <td className="pl-2 pt-4 text-right text-base font-bold text-foreground">R$ {estimatedTotal.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 print:hidden">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">Itens disponíveis</h3>
            <p className="text-sm text-muted-foreground">Todos os ingredientes cadastrados entram automaticamente aqui para seleção.</p>
          </div>
          <p className="text-sm text-muted-foreground">{filteredItems.length} item(ns)</p>
        </div>

        <div className="space-y-2">
          {filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
              Nenhum ingrediente encontrado.
            </div>
          ) : (
            filteredItems.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-[auto,1fr,140px,160px,140px] md:items-center">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) => void saveItemPatch(item.id, { checked: event.target.checked })}
                    className="h-4 w-4 rounded border-border bg-background text-primary"
                  />
                  Comprar
                </label>

                <div>
                  <p className="font-semibold text-foreground">{item.ingredient_name}</p>
                  <p className="text-xs text-muted-foreground">Unidade: {item.unit}</p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Quantidade</p>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.quantity}
                      onChange={(event) => updateLocalItem(item.id, { quantity: Math.max(0, Number(event.target.value) || 0) })}
                      onBlur={(event) => void saveItemPatch(item.id, { quantity: Math.max(0, Number(event.target.value) || 0) })}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">{item.unit}</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Último valor pago</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">R$ {Number(item.last_price).toFixed(2)}</p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimativa</p>
                  <p className="mt-2 text-sm font-bold text-foreground">R$ {Number(item.estimated_total || item.quantity * item.last_price).toFixed(2)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminRestock;
