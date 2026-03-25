import { useEffect, useMemo, useState } from "react";
import { CheckCheck, ClipboardList, History, Plus, Printer, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { useReceiptTemplates } from "@/hooks/useReceiptTemplates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildAdminPrintDocument, escapeHtml } from "@/lib/adminPrintTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";
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
  checked: boolean;
  sort_order: number;
  notes: string;
}

type RestockView = "current" | "history";

const formatQuantity = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });

const UNIT_OPTIONS = ["unidade", "kg", "g", "litro", "ml", "pacote", "caixa", "dúzia"];

const AdminRestock = () => {
  const db = supabase as any;
  const { toast } = useToast();
  const { storeId } = useStore();
  const { user } = useAuth();
  const { data: templates } = useReceiptTemplates();

  const [loading, setLoading] = useState(true);
  const [closingShift, setClosingShift] = useState(false);
  const [view, setView] = useState<RestockView>("current");
  const [draftList, setDraftList] = useState<RestockList | null>(null);
  const [items, setItems] = useState<RestockItem[]>([]);
  const [historyLists, setHistoryLists] = useState<RestockList[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyItemsByList, setHistoryItemsByList] = useState<Record<string, RestockItem[]>>({});
  const [search, setSearch] = useState("");

  // Manual add form
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("unidade");
  const [showAddForm, setShowAddForm] = useState(false);

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
        return { ...item, ...patch };
      }),
    );
  };

  const saveItemPatch = async (itemId: string, patch: Partial<RestockItem>) => {
    updateLocalItem(itemId, patch);
    const { error } = await db.from("restock_items").update(patch).eq("id", itemId);
    if (error) {
      toast({ title: "Erro ao salvar item", description: error.message, variant: "destructive" });
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim() || !draftList) return;

    const { data, error } = await db.from("restock_items").insert({
      restock_list_id: draftList.id,
      store_id: storeId ?? null,
      ingredient_name: newItemName.trim(),
      unit: newItemUnit,
      quantity: 1,
      checked: true,
      notes: "",
      sort_order: items.length,
    }).select("*").single();

    if (error) {
      toast({ title: "Erro ao adicionar item", description: error.message, variant: "destructive" });
      return;
    }

    setItems((current) => [...current, data as RestockItem]);
    setNewItemName("");
    setShowAddForm(false);
    toast({ title: "Item adicionado!" });
  };

  const handleDeleteItem = async (itemId: string) => {
    const { error } = await db.from("restock_items").delete().eq("id", itemId);
    if (error) {
      toast({ title: "Erro ao remover item", description: error.message, variant: "destructive" });
      return;
    }
    setItems((current) => current.filter((item) => item.id !== itemId));
    toast({ title: "Item removido!" });
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
      toast({ title: "Turno fechado", description: "A lista foi salva no histórico." });
    } catch (error) {
      toast({
        title: "Não foi possível fechar o turno",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
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
  const totalSelectedQuantity = useMemo(
    () => currentSelectedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [currentSelectedItems],
  );
  const selectedHistoryList = historyLists.find((list) => list.id === selectedHistoryId) ?? null;
  const selectedHistoryItems = selectedHistoryId ? historyItemsByList[selectedHistoryId] ?? [] : [];
  const activeList = view === "history" ? selectedHistoryList : draftList;
  const activeItems = view === "history" ? selectedHistoryItems.filter((item) => item.checked) : currentSelectedItems;
  const printTemplate = templates?.find((template) => template.template_type === "reposicao");

  const handlePrintCleanList = () => {
    if (!activeList || activeItems.length === 0) {
      toast({ title: "Nada para imprimir", description: "Adicione itens marcados antes de gerar a lista.", variant: "destructive" });
      return;
    }

    const printWindow = window.open("", "_blank", "width=520,height=720");
    if (!printWindow) {
      toast({ title: "Permita pop-ups", variant: "destructive" });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      buildAdminPrintDocument({
        title: activeList.title || "Lista de compras",
        template: (printTemplate?.body_template || getDefaultTemplate("reposicao"))
          .split("\n")
          .filter((line) => !line.includes("[TOTAL_ESTIMADO]"))
          .join("\n"),
        variables: {
          "[NOMELOJA]": printTemplate?.store_name || "TURBO LANCHES",
          "[TIPOCOMANDA]": printTemplate?.label || "LISTA DE COMPRAS",
          "[TITULO]": activeList.title || "Lista de compras",
          "[DATAHORA]": new Date(activeList.closed_at ?? activeList.updated_at ?? Date.now()).toLocaleString("pt-BR"),
          "[TOTALITENS]": String(activeItems.length),
          "[OBS]": activeList.notes?.trim() ? `OBS: ${activeList.notes.trim()}` : "",
          "[RODAPÉ]": printTemplate?.footer_message || "",
          "[DIVULGAÇÃO]": printTemplate?.custom_message || "",
        },
        blocks: {
          "[LISTA]": `<div class="list-block">${activeItems
            .map(
              (item) => `<div class="list-row"><span class="list-name">${escapeHtml(`${formatQuantity(Number(item.quantity))} ${item.unit} ${item.ingredient_name}`)}</span></div>`,
            )
            .join("")}</div>`,
        },
        pageWidthMm: 72,
        pageHeightMm: "auto",
        pageMarginMm: 0,
        bodyFontFamily: "Arial, Helvetica, sans-serif",
        bodyFontSizePx: printTemplate?.items_font_size || 11,
        labelFontSizePx: printTemplate?.label_font_size || 22,
        bodyPaddingMm: 0,
        sectionPaddingMm: 0,
      }),
    );
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
              Adicione manualmente os itens que precisa comprar, marque quantidades e feche o turno.
            </CardDescription>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" asChild>
              <Link to="/admin/comandas?tipo=reposicao">Editar modelo de impressão</Link>
            </Button>
            <Button variant="outline" onClick={handlePrintCleanList}>
              <Printer />
              Gerar lista limpa
            </Button>
            <Button onClick={handleCloseShift} disabled={closingShift || currentSelectedItems.length === 0}>
              <CheckCheck />
              {closingShift ? "Fechando turno..." : "Fechar turno"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Itens marcados</p><p className="mt-2 text-3xl font-black text-foreground">{currentSelectedItems.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quantidade total</p><p className="mt-2 text-3xl font-black text-foreground">{formatQuantity(totalSelectedQuantity)}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={view === "current" ? "default" : "outline"} onClick={() => setView("current")}><ClipboardList />Turno atual</Button>
        <Button variant={view === "history" ? "default" : "outline"} onClick={() => setView("history")}><History />Histórico</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
        <div className="space-y-6">
          {view === "current" ? (
            <Card>
              <CardHeader className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                  <Input value={draftList?.title ?? ""} onChange={(event) => setDraftList((current) => (current ? { ...current, title: event.target.value } : current))} onBlur={(event) => void persistListPatch({ title: event.target.value.trim() || "Reposição" })} placeholder="Título da lista" />
                  <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Pesquisar item" /></div>
                </div>
                <Textarea value={draftList?.notes ?? ""} onChange={(event) => setDraftList((current) => (current ? { ...current, notes: event.target.value } : current))} onBlur={(event) => void persistListPatch({ notes: event.target.value })} placeholder="Observações gerais do turno" rows={2} />

                {/* Manual add */}
                {showAddForm ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">Nome do item</p>
                      <Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="Ex.: Pão, Carne, Queijo" autoFocus onKeyDown={(e) => e.key === "Enter" && handleAddItem()} />
                    </div>
                    <div className="w-36 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">Unidade</p>
                      <select value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleAddItem} disabled={!newItemName.trim()}><Plus className="h-4 w-4" />Adicionar</Button>
                      <Button variant="ghost" onClick={() => setShowAddForm(false)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => setShowAddForm(true)}><Plus className="h-4 w-4" />Adicionar item manualmente</Button>
                )}
              </CardHeader>

              <CardContent className="space-y-3">
                {filteredItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">Nenhum item adicionado. Clique em "Adicionar item manualmente" acima.</div>
                ) : filteredItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-border bg-background p-4">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-1 items-start gap-3">
                          <input type="checkbox" checked={item.checked} onChange={(event) => void saveItemPatch(item.id, { checked: event.target.checked })} className="mt-1 h-5 w-5 rounded border-border bg-background text-primary" />
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-bold text-foreground">{item.ingredient_name}</p>
                              <Badge variant={item.checked ? "default" : "outline"}>{item.unit}</Badge>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[100px_140px_minmax(0,1fr)]">
                              <div className="space-y-2"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quantidade</p><Input type="number" step="0.01" min="0" value={item.quantity} onChange={(event) => updateLocalItem(item.id, { quantity: Math.max(0, Number(event.target.value) || 0) })} onBlur={(event) => void saveItemPatch(item.id, { quantity: Math.max(0, Number(event.target.value) || 0) })} /></div>
                              <div className="space-y-2"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Unidade</p><select value={item.unit} onChange={(e) => void saveItemPatch(item.id, { unit: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
                              <div className="space-y-2"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Observação</p><Textarea value={item.notes ?? ""} onChange={(event) => updateLocalItem(item.id, { notes: event.target.value })} onBlur={(event) => void saveItemPatch(item.id, { notes: event.target.value })} placeholder="Ex.: comprar no fornecedor X" rows={2} /></div>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => void handleDeleteItem(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader><CardTitle>Histórico de compras</CardTitle><CardDescription>Listas fechadas anteriormente.</CardDescription></CardHeader>
              <CardContent>
                {!selectedHistoryList ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">Nenhum fechamento de turno disponível ainda.</div>
                ) : selectedHistoryItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">Carregando itens...</div>
                ) : (
                  <div className="space-y-3">
                    {selectedHistoryItems.filter((item) => item.checked).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border bg-background p-4">
                        <div className="space-y-1"><p className="text-base font-bold text-foreground">{item.ingredient_name}</p><p className="text-sm text-muted-foreground">{formatQuantity(Number(item.quantity))} {item.unit}</p></div>
                        {item.notes?.trim() ? <div className="mt-3 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-foreground"><strong>Obs:</strong> {item.notes.trim()}</div> : null}
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
            <CardHeader><CardTitle>Lista limpa para compra</CardTitle><CardDescription>{view === "current" ? "Prévia da lista atual." : "Prévia da lista fechada."}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {activeList ? <div className="rounded-2xl border border-border bg-background p-4"><p className="text-base font-bold text-foreground">{activeList.title}</p><p className="mt-1 text-sm text-muted-foreground">{activeList.closed_at ? `Fechado em ${new Date(activeList.closed_at).toLocaleString("pt-BR")}` : "Turno em aberto"}</p></div> : null}
              {activeItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">Nenhum item marcado.</div>
              ) : (
                <div className="space-y-2">{activeItems.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3"><span className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground">{item.ingredient_name}</span><span className="shrink-0 text-sm text-muted-foreground">{formatQuantity(Number(item.quantity))} {item.unit}</span></div>)}</div>
              )}
              <Button className="w-full" variant="outline" onClick={handlePrintCleanList}><Printer />Imprimir lista limpa</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Histórico recente</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {historyLists.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">Ainda não existe histórico.</div>
              ) : historyLists.map((list) => {
                const isActive = list.id === selectedHistoryId;
                return (
                  <button key={list.id} type="button" onClick={() => { setSelectedHistoryId(list.id); setView("history"); }} className={cn("w-full rounded-2xl border px-4 py-3 text-left transition-colors", isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted/30")}>
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
