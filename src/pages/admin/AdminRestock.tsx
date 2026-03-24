import { useEffect, useMemo, useState } from "react";
import { CheckCheck, ClipboardList, History, Printer, RefreshCw, Search, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface RestockList {
  id: string;
  title: string;
  notes: string;
  status: string;
  updated_at: string;
  closed_at: string | null;
}

interface RestockItem {
  id: string;
  ingredient_id: string | null;
  ingredient_name: string;
  unit: string;
  quantity: number;
  last_price: number;
  estimated_total: number | null;
  checked: boolean;
  sort_order: number;
  notes: string;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
}

type RestockView = "current" | "history";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatCurrency = (value: number) => currencyFormatter.format(Number.isFinite(value) ? value : 0);

const formatQuantity = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });

const buildCleanShoppingListHTML = (title: string, items: RestockItem[]) => {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.ingredient_name)}</td>
          <td>${escapeHtml(`${formatQuantity(Number(item.quantity))} ${item.unit}`)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
      <style>
        @page { size: auto; margin: 6mm; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111111; background: #ffffff; }
        .sheet { max-width: 480px; margin: 0 auto; padding: 8px; }
        h1 { margin: 0 0 4px; font-size: 22px; }
        p { margin: 0 0 16px; font-size: 13px; color: #525252; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px 0; border-bottom: 1px solid #d4d4d4; text-align: left; font-size: 15px; }
        th:last-child, td:last-child { text-align: right; }
        @media print { .sheet { max-width: none; padding: 0; } }
      </style>
    </head>
    <body>
      <main class="sheet">
        <h1>${escapeHtml(title)}</h1>
        <p>Lista limpa para compra • ${new Date().toLocaleString("pt-BR")}</p>
        <table>
          <thead><tr><th>Item</th><th>Quantidade</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </main>
      <script>window.onload = function () { window.print(); };</script>
    </body>
  </html>`;
};

const AdminRestock = () => {
  const db = supabase as any;
  const { toast } = useToast();
  const { storeId } = useStore();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [view, setView] = useState<RestockView>("current");
  const [draftList, setDraftList] = useState<RestockList | null>(null);
  const [items, setItems] = useState<RestockItem[]>([]);
  const [historyLists, setHistoryLists] = useState<RestockList[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyItemsByList, setHistoryItemsByList] = useState<Record<string, RestockItem[]>>({});
  const [search, setSearch] = useState("");

  const buildListsQuery = () => {
    let query = db.from("restock_lists").select("*");
    query = storeId ? query.eq("store_id", storeId) : query.is("store_id", null);
    return query;
  };

  const createDraftList = async () => {
    const title = `Reposição ${new Date().toLocaleDateString("pt-BR")}`;
    const { data, error } = await db
      .from("restock_lists")
      .insert({ store_id: storeId ?? null, created_by: user?.id, title, notes: "", status: "draft" })
      .select("*")
      .single();
    if (error) throw error;
    return data as RestockList;
  };

  const getDraftList = async () => {
    const { data, error } = await buildListsQuery()
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as RestockList | null) ?? null;
  };

  const getHistoryLists = async () => {
    const { data, error } = await buildListsQuery()
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []) as RestockList[];
  };

  const getIngredients = async () => {
    let query = db.from("ingredients").select("id, name, unit, cost_per_unit").order("name");
    query = storeId ? query.eq("store_id", storeId) : query.is("store_id", null);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Ingredient[];
  };

  const getRestockItems = async (restockListId: string) => {
    const { data, error } = await db
      .from("restock_items")
      .select("*")
      .eq("restock_list_id", restockListId)
      .order("checked", { ascending: false })
      .order("sort_order")
      .order("ingredient_name");
    if (error) throw error;
    return (data ?? []) as RestockItem[];
  };

  const syncItemsFromIngredients = async (restockListId: string) => {
    const [ingredients, existingItems] = await Promise.all([getIngredients(), getRestockItems(restockListId)]);

    const existingByIngredient = new Map(
      existingItems.filter((item) => item.ingredient_id).map((item) => [item.ingredient_id as string, item]),
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
        estimated_total: Number(ingredient.cost_per_unit) || 0,
        checked: false,
        notes: "",
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
            estimated_total: Number((Number(existing.quantity || 0) * nextPrice).toFixed(2)),
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
  };

  const fetchHistoryItems = async (listId: string) => {
    const loadedItems = await getRestockItems(listId);
    setHistoryItemsByList((current) => ({ ...current, [listId]: loadedItems }));
  };

  const loadDashboard = async (preferredHistoryId?: string | null) => {
    if (!user?.id) return;
    setLoading(true);

    try {
      const existingDraft = await getDraftList();
      const resolvedDraft = existingDraft ?? (await createDraftList());
      await syncItemsFromIngredients(resolvedDraft.id);

      const [freshDraftItems, freshDraft, freshHistory] = await Promise.all([
        getRestockItems(resolvedDraft.id),
        getDraftList(),
        getHistoryLists(),
      ]);

      setDraftList(freshDraft ?? resolvedDraft);
      setItems(freshDraftItems);
      setHistoryLists(freshHistory);
      setSelectedHistoryId((current) => {
        if (preferredHistoryId && freshHistory.some((list) => list.id === preferredHistoryId)) return preferredHistoryId;
        if (current && freshHistory.some((list) => list.id === current)) return current;
        return freshHistory[0]?.id ?? null;
      });
    } catch (error) {
      toast({
        title: "Erro ao carregar reposição",
        description: error instanceof Error ? error.message : "Não foi possível carregar a seção.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setSyncing(false);
      setClosingShift(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [storeId, user?.id]);

  useEffect(() => {
    if (!selectedHistoryId || historyItemsByList[selectedHistoryId]) return;
    void fetchHistoryItems(selectedHistoryId).catch((error) => {
      toast({
        title: "Erro ao carregar histórico",
        description: error instanceof Error ? error.message : "Não foi possível carregar esta lista.",
        variant: "destructive",
      });
    });
  }, [historyItemsByList, selectedHistoryId, toast]);

  const persistListPatch = async (patch: Partial<RestockList>) => {
    if (!draftList) return;
    setDraftList((current) => (current ? { ...current, ...patch } : current));
    const { error } = await db.from("restock_lists").update(patch).eq("id", draftList.id);
    if (error) {
      toast({ title: "Erro ao salvar relatório", description: error.message, variant: "destructive" });
    }
  };

  const updateLocalItem = (itemId: string, patch: Partial<RestockItem>) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        const nextItem = { ...item, ...patch };
        return {
          ...nextItem,
          estimated_total: Number((Number(nextItem.quantity || 0) * Number(nextItem.last_price || 0)).toFixed(2)),
        };
      }),
    );
  };

  const saveItemPatch = async (itemId: string, patch: Partial<RestockItem>) => {
    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) return;
    const nextItem = { ...currentItem, ...patch };
    const estimatedTotal = Number((Number(nextItem.quantity || 0) * Number(nextItem.last_price || 0)).toFixed(2));

    updateLocalItem(itemId, patch);

    const { error } = await db
      .from("restock_items")
      .update({ ...patch, estimated_total: estimatedTotal })
      .eq("id", itemId);

    if (error) {
      toast({ title: "Erro ao salvar item", description: error.message, variant: "destructive" });
    }
  };

  const handleRefresh = async () => {
    setSyncing(true);
    await loadDashboard(selectedHistoryId);
    toast({ title: "Itens sincronizados", description: "A lista foi atualizada com os ingredientes cadastrados atualmente." });
  };

  const handleCloseShift = async () => {
    if (!draftList) return;
    const checkedItems = items.filter((item) => item.checked);

    if (checkedItems.length === 0) {
      toast({
        title: "Marque pelo menos um item",
        description: "Selecione o que precisa ser comprado antes de fechar o turno.",
        variant: "destructive",
      });
      return;
    }

    setClosingShift(true);

    try {
      const { error } = await db
        .from("restock_lists")
        .update({
          title: draftList.title.trim() || `Reposição ${new Date().toLocaleDateString("pt-BR")}`,
          notes: draftList.notes,
          status: "closed",
          closed_at: new Date().toISOString(),
        })
        .eq("id", draftList.id);

      if (error) throw error;

      setView("history");
      await loadDashboard(draftList.id);
      toast({ title: "Turno fechado", description: "A lista foi salva no histórico e já está pronta para a compra do dia seguinte." });
    } catch (error) {
      toast({
        title: "Não foi possível fechar o turno",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
      setClosingShift(false);
    }
  };

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...items]
      .filter((item) => !normalizedSearch || item.ingredient_name.toLowerCase().includes(normalizedSearch))
      .sort((left, right) => Number(right.checked) - Number(left.checked) || left.ingredient_name.localeCompare(right.ingredient_name));
  }, [items, search]);

  const currentSelectedItems = useMemo(() => items.filter((item) => item.checked), [items]);
  const selectedHistoryList = historyLists.find((list) => list.id === selectedHistoryId) ?? null;
  const selectedHistoryItems = selectedHistoryId ? historyItemsByList[selectedHistoryId] ?? [] : [];
  const activeList = view === "history" ? selectedHistoryList : draftList;
  const activeItems = view === "history" ? selectedHistoryItems.filter((item) => item.checked) : currentSelectedItems;

  const estimatedTotal = currentSelectedItems.reduce(
    (sum, item) => sum + Number(item.estimated_total ?? Number(item.quantity) * Number(item.last_price)),
    0,
  );

  const handlePrintCleanList = () => {
    if (!activeList || activeItems.length === 0) {
      toast({
        title: "Nada para imprimir",
        description: "Selecione ou feche uma lista com itens marcados antes de gerar a versão limpa.",
        variant: "destructive",
      });
      return;
    }

    const printWindow = window.open("", "_blank", "width=520,height=720");
    if (!printWindow) {
      toast({
        title: "Permita pop-ups",
        description: "O navegador precisa abrir a versão limpa da lista para impressão.",
        variant: "destructive",
      });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildCleanShoppingListHTML(activeList.title || "Lista de compras", activeItems));
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">Compras / Reposição</CardTitle>
              <Badge variant="secondary">Final de turno</Badge>
            </div>
            <CardDescription>
              Marque o que precisa ser comprado, informe quantidade e observações, feche o turno e gere a lista limpa para usar no mercado pelo celular.
            </CardDescription>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={handleRefresh} disabled={syncing}>
              <RefreshCw className={cn(syncing && "animate-spin")} />
              Atualizar itens
            </Button>
            <Button variant="outline" onClick={handlePrintCleanList}>
              <Printer />
              Gerar lista limpa para compra
            </Button>
            <Button onClick={handleCloseShift} disabled={closingShift || currentSelectedItems.length === 0}>
              <CheckCheck />
              {closingShift ? "Fechando turno..." : "Fechar turno e gerar lista de compras"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Itens marcados</p><p className="mt-2 text-3xl font-black text-foreground">{currentSelectedItems.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Estimativa da compra</p><p className="mt-2 text-3xl font-black text-foreground">{formatCurrency(estimatedTotal)}</p></CardContent></Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground"><Sparkles className="h-4 w-4" />Sugestão automática</div>
            <p className="mt-2 text-sm font-semibold text-foreground">Pronto para integrar com estoque mínimo</p>
            <p className="mt-1 text-sm text-muted-foreground">Quando o controle de estoque estiver ativo, esta área pode sugerir automaticamente os itens em nível baixo.</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={view === "current" ? "default" : "outline"} onClick={() => setView("current")}><ClipboardList />Turno atual</Button>
        <Button variant={view === "history" ? "default" : "outline"} onClick={() => setView("history")}><History />Histórico de compras</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
        <div className="space-y-6">
          {view === "current" ? (
            <Card>
              <CardHeader className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                  <Input value={draftList?.title ?? ""} onChange={(event) => setDraftList((current) => (current ? { ...current, title: event.target.value } : current))} onBlur={(event) => void persistListPatch({ title: event.target.value.trim() || "Reposição" })} placeholder="Título da lista" />
                  <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Pesquisar item da compra" /></div>
                </div>
                <Textarea value={draftList?.notes ?? ""} onChange={(event) => setDraftList((current) => (current ? { ...current, notes: event.target.value } : current))} onBlur={(event) => void persistListPatch({ notes: event.target.value })} placeholder="Observações gerais do turno (ex.: compra no fornecedor X, prioridade para embalagens, etc.)" rows={3} />
              </CardHeader>

              <CardContent className="space-y-3">
                {filteredItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">Nenhum ingrediente encontrado.</div>
                ) : filteredItems.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-background p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex flex-1 items-start gap-3">
                        <input type="checkbox" checked={item.checked} onChange={(event) => void saveItemPatch(item.id, { checked: event.target.checked })} className="mt-1 h-5 w-5 rounded border-border bg-background text-primary" />
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2"><p className="text-base font-bold text-foreground">{item.ingredient_name}</p><Badge variant={item.checked ? "default" : "outline"}>{item.unit}</Badge></div>
                          <div className="grid gap-3 sm:grid-cols-[140px_160px_minmax(0,1fr)]">
                            <div className="space-y-2"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quantidade</p><Input type="number" step="0.01" min="0" value={item.quantity} onChange={(event) => updateLocalItem(item.id, { quantity: Math.max(0, Number(event.target.value) || 0) })} onBlur={(event) => void saveItemPatch(item.id, { quantity: Math.max(0, Number(event.target.value) || 0) })} /></div>
                            <div className="space-y-2"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Último valor</p><div className="flex h-10 items-center rounded-md border border-border bg-muted/20 px-3 text-sm font-semibold text-foreground">{formatCurrency(Number(item.last_price))}</div></div>
                            <div className="space-y-2"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Observação do item</p><Textarea value={item.notes ?? ""} onChange={(event) => updateLocalItem(item.id, { notes: event.target.value })} onBlur={(event) => void saveItemPatch(item.id, { notes: event.target.value })} placeholder="Ex.: comprar no fornecedor X" rows={2} /></div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-card px-4 py-3 lg:min-w-[180px]"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Estimativa</p><p className="mt-2 text-xl font-black text-foreground">{formatCurrency(Number(item.estimated_total ?? Number(item.quantity) * Number(item.last_price)))}</p></div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader><CardTitle>Histórico de compras</CardTitle><CardDescription>Visualização rápida das listas fechadas para usar no dia seguinte.</CardDescription></CardHeader>
              <CardContent>
                {!selectedHistoryList ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">Nenhum fechamento de turno disponível ainda.</div>
                ) : selectedHistoryItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">Carregando itens da lista selecionada...</div>
                ) : (
                  <div className="space-y-3">
                    {selectedHistoryItems.filter((item) => item.checked).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border bg-background p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1"><p className="text-base font-bold text-foreground">{item.ingredient_name}</p><p className="text-sm text-muted-foreground">{formatQuantity(Number(item.quantity))} {item.unit} • {formatCurrency(Number(item.last_price))}</p></div><Badge>{formatCurrency(Number(item.estimated_total ?? Number(item.quantity) * Number(item.last_price)))}</Badge></div>
                        {item.notes?.trim() ? <div className="mt-3 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-foreground"><strong>Observação:</strong> {item.notes.trim()}</div> : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Lista limpa para compra</CardTitle><CardDescription>{view === "current" ? "Prévia enxuta da lista atual para mercado e uso no celular." : "Prévia rápida da última lista fechada para o dia seguinte."}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {activeList ? <div className="rounded-2xl border border-border bg-background p-4"><p className="text-base font-bold text-foreground">{activeList.title}</p><p className="mt-1 text-sm text-muted-foreground">{activeList.closed_at ? `Fechado em ${new Date(activeList.closed_at).toLocaleString("pt-BR")}` : "Lista do turno em aberto"}</p></div> : null}
              {activeItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">Nenhum item marcado para compra ainda.</div>
              ) : (
                <div className="space-y-2">{activeItems.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3"><span className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground">{item.ingredient_name}</span><span className="shrink-0 text-sm text-muted-foreground">{formatQuantity(Number(item.quantity))} {item.unit}</span></div>)}</div>
              )}
              <Button className="w-full" variant="outline" onClick={handlePrintCleanList}><Printer />Imprimir lista limpa</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Histórico recente</CardTitle><CardDescription>Abra rapidamente qualquer fechamento anterior.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {historyLists.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">Ainda não existe histórico salvo.</div>
              ) : historyLists.map((list) => {
                const isActive = list.id === selectedHistoryId;
                return (
                  <button key={list.id} type="button" onClick={() => { setSelectedHistoryId(list.id); setView("history"); }} className={cn("w-full rounded-2xl border px-4 py-3 text-left transition-colors", isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted/30") }>
                    <div className="flex items-center justify-between gap-3"><span className="font-semibold">{list.title}</span><Badge variant={isActive ? "secondary" : "outline"}>Fechado</Badge></div>
                    <p className={cn("mt-1 text-sm", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>{new Date(list.closed_at ?? list.updated_at).toLocaleString("pt-BR")}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminRestock;
