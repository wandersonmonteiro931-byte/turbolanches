import { useEffect, useMemo, useState } from "react";
import { Package, Printer, RefreshCw, Search, UtensilsCrossed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type SourceTab = "products" | "ingredients";

interface ProductRow {
  id: string;
  name: string;
  category_id: string | null;
  active: boolean;
}

interface IngredientRow {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
}

interface CategoryRow {
  id: string;
  name: string;
}

interface SelectableItem {
  id: string;
  name: string;
  type: SourceTab;
  helper: string;
  active?: boolean;
}

interface LabelFormState {
  copies: string;
  manufacturedOn: string;
  shelfLife: string;
  packedAt: string;
  openedAt: string;
  useBy: string;
  validUntil: string;
  notes: string;
}

const printStyles = `
  @page {
    size: 60mm auto;
    margin: 4mm;
  }

  .labels-sheet {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .label-card {
    border: 1px dashed hsl(var(--border));
    background: hsl(var(--card));
    color: hsl(var(--card-foreground));
    border-radius: 1rem;
    padding: 0.875rem;
    min-height: 180px;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .label-line {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 12px;
    line-height: 1.35;
  }

  .label-line-label {
    color: hsl(var(--muted-foreground));
    font-weight: 600;
  }

  .label-line-value {
    text-align: right;
    font-weight: 700;
  }

  @media print {
    body {
      background: hsl(var(--background));
    }

    .labels-toolbar,
    .labels-selector,
    .labels-config,
    .labels-preview-header,
    .labels-empty-screen {
      display: none !important;
    }

    .labels-preview-card {
      border: 0 !important;
      box-shadow: none !important;
      background: transparent !important;
    }

    .labels-sheet {
      display: flex;
      flex-direction: column;
      gap: 3mm;
    }

    .label-card {
      width: 100%;
      min-height: 34mm;
      border-style: solid;
      border-color: hsl(var(--foreground) / 0.22);
      border-radius: 3mm;
      padding: 3.5mm;
    }
  }
`;

const formatDate = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const formatDateTime = (value: string) => {
  if (!value) return "";
  const [date, time] = value.split("T");
  const formattedDate = formatDate(date);
  const formattedTime = time?.slice(0, 5);
  return [formattedDate, formattedTime].filter(Boolean).join(" ");
};

const AdminLabels = () => {
  const { storeId } = useStore();
  const { toast } = useToast();

  const [sourceTab, setSourceTab] = useState<SourceTab>("products");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([]);
  const [form, setForm] = useState<LabelFormState>({
    copies: "1",
    manufacturedOn: "",
    shelfLife: "",
    packedAt: "",
    openedAt: "",
    useBy: "",
    validUntil: "",
    notes: "",
  });

  const fetchData = async () => {
    try {
      const productsQuery = supabase.from("products").select("id, name, category_id, active").order("name");
      const ingredientsQuery = supabase.from("ingredients").select("id, name, unit, cost_per_unit").order("name");
      const categoriesQuery = supabase.from("categories").select("id, name").order("sort_order");

      const [productsRes, ingredientsRes, categoriesRes] = await Promise.all([
        (storeId ? productsQuery.eq("store_id", storeId) : productsQuery),
        (storeId ? ingredientsQuery.eq("store_id", storeId) : ingredientsQuery),
        (storeId ? categoriesQuery.eq("store_id", storeId) : categoriesQuery),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (ingredientsRes.error) throw ingredientsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setProducts((productsRes.data ?? []) as ProductRow[]);
      setIngredients((ingredientsRes.data ?? []) as IngredientRow[]);
      setCategories((categoriesRes.data ?? []) as CategoryRow[]);
    } catch (error) {
      toast({
        title: "Erro ao carregar etiquetas",
        description: error instanceof Error ? error.message : "Não foi possível carregar os dados para impressão.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [storeId]);

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  const productItems = useMemo<SelectableItem[]>(
    () =>
      products.map((product) => ({
        id: product.id,
        name: product.name,
        type: "products",
        helper: product.category_id ? categoryMap.get(product.category_id) || "Sem categoria" : "Sem categoria",
        active: product.active,
      })),
    [categoryMap, products],
  );

  const ingredientItems = useMemo<SelectableItem[]>(
    () =>
      ingredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        type: "ingredients",
        helper: `Unidade: ${ingredient.unit}`,
      })),
    [ingredients],
  );

  const currentItems = sourceTab === "products" ? productItems : ingredientItems;
  const selectedIds = sourceTab === "products" ? selectedProductIds : selectedIngredientIds;

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return currentItems.filter((item) => {
      if (!normalizedSearch) return true;
      return item.name.toLowerCase().includes(normalizedSearch) || item.helper.toLowerCase().includes(normalizedSearch);
    });
  }, [currentItems, search]);

  const selectedItems = useMemo(
    () => currentItems.filter((item) => selectedIds.includes(item.id)),
    [currentItems, selectedIds],
  );

  const copies = Math.max(1, Number(form.copies) || 1);

  const labelsToPrint = useMemo(
    () =>
      selectedItems.flatMap((item) =>
        Array.from({ length: copies }, (_, index) => ({
          ...item,
          copyIndex: index + 1,
          copyCount: copies,
        })),
      ),
    [copies, selectedItems],
  );

  const toggleItem = (itemId: string, checked: boolean) => {
    const update = (current: string[]) =>
      checked ? Array.from(new Set([...current, itemId])) : current.filter((value) => value !== itemId);

    if (sourceTab === "products") {
      setSelectedProductIds(update);
      return;
    }

    setSelectedIngredientIds(update);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const detailLines = [
    { label: "Data de fabricação", value: formatDate(form.manufacturedOn) },
    { label: "Validade", value: formatDate(form.shelfLife) },
    { label: "Embalado em", value: formatDateTime(form.packedAt) },
    { label: "Aberto em", value: formatDateTime(form.openedAt) },
    { label: "Usar até", value: formatDateTime(form.useBy) },
    { label: "Válido até", value: formatDate(form.validUntil) },
  ].filter((line) => line.value);

  return (
    <div className="space-y-6">
      <style>{printStyles}</style>

      <div className="labels-toolbar flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground">Etiquetas</h2>
          <p className="text-sm text-muted-foreground">
            Selecione ingredientes ou produtos e imprima etiquetas com fabricação, validade, embalado em, aberto em e usar até.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            Atualizar
          </Button>
          <Button onClick={() => window.print()} disabled={labelsToPrint.length === 0}>
            <Printer />
            Imprimir etiquetas
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="labels-selector">
          <CardHeader className="space-y-4">
            <div>
              <CardTitle className="text-lg">Itens para etiqueta</CardTitle>
              <CardDescription>
                Escolha o tipo de item e marque o que deve entrar na impressão.
              </CardDescription>
            </div>

            <Tabs value={sourceTab} onValueChange={(value) => setSourceTab(value as SourceTab)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="products">Produtos</TabsTrigger>
                <TabsTrigger value="ingredients">Ingredientes</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder={sourceTab === "products" ? "Pesquisar produto..." : "Pesquisar ingrediente..."}
              />
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="rounded-xl border border-dashed border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                Carregando itens...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum item encontrado.
              </div>
            ) : (
              <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
                {filteredItems.map((item) => {
                  const checked = selectedIds.includes(item.id);
                  const isProduct = item.type === "products";

                  return (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:bg-muted/40"
                    >
                      <Checkbox checked={checked} onCheckedChange={(value) => toggleItem(item.id, value === true)} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
                          <Badge variant={isProduct ? "default" : "secondary"}>
                            {isProduct ? "Produto" : "Ingrediente"}
                          </Badge>
                          {isProduct && item.active === false ? <Badge variant="outline">Oculto</Badge> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{item.helper}</p>
                      </div>
                      {isProduct ? <UtensilsCrossed className="h-4 w-4 text-muted-foreground" /> : <Package className="h-4 w-4 text-muted-foreground" />}
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="labels-config">
            <CardHeader>
              <CardTitle className="text-lg">Campos da etiqueta</CardTitle>
              <CardDescription>
                Os dados preenchidos abaixo serão repetidos em todas as etiquetas selecionadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="copies">Cópias por item</Label>
                  <Input
                    id="copies"
                    type="number"
                    min="1"
                    value={form.copies}
                    onChange={(event) => setForm((current) => ({ ...current, copies: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manufacturedOn">Data de fabricação</Label>
                  <Input
                    id="manufacturedOn"
                    type="date"
                    value={form.manufacturedOn}
                    onChange={(event) => setForm((current) => ({ ...current, manufacturedOn: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shelfLife">Validade</Label>
                  <Input
                    id="shelfLife"
                    type="date"
                    value={form.shelfLife}
                    onChange={(event) => setForm((current) => ({ ...current, shelfLife: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="packedAt">Embalado em</Label>
                  <Input
                    id="packedAt"
                    type="datetime-local"
                    value={form.packedAt}
                    onChange={(event) => setForm((current) => ({ ...current, packedAt: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openedAt">Aberto em</Label>
                  <Input
                    id="openedAt"
                    type="datetime-local"
                    value={form.openedAt}
                    onChange={(event) => setForm((current) => ({ ...current, openedAt: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="useBy">Usar até</Label>
                  <Input
                    id="useBy"
                    type="datetime-local"
                    value={form.useBy}
                    onChange={(event) => setForm((current) => ({ ...current, useBy: event.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="validUntil">Válido até</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={form.validUntil}
                    onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Ex.: manter refrigerado, consumir preferencialmente gelado..."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="labels-preview-card">
            <CardHeader className="labels-preview-header">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-lg">Pré-visualização</CardTitle>
                  <CardDescription>
                    {selectedItems.length} item(ns) selecionado(s) • {labelsToPrint.length} etiqueta(s) prontas para impressão
                  </CardDescription>
                </div>
                <Button onClick={() => window.print()} disabled={labelsToPrint.length === 0}>
                  <Printer />
                  Imprimir agora
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {labelsToPrint.length === 0 ? (
                <div className="labels-empty-screen rounded-xl border border-dashed border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                  Selecione pelo menos um produto ou ingrediente para gerar as etiquetas.
                </div>
              ) : (
                <div className="labels-sheet">
                  {labelsToPrint.map((item) => (
                    <article key={`${item.type}-${item.id}-${item.copyIndex}`} className="label-card">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-base font-black leading-tight text-foreground">{item.name}</div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={item.type === "products" ? "default" : "secondary"}>
                                {item.type === "products" ? "Produto" : "Ingrediente"}
                              </Badge>
                              <Badge variant="outline">{item.helper}</Badge>
                            </div>
                          </div>
                          {copies > 1 ? <span className="text-[11px] font-semibold text-muted-foreground">{item.copyIndex}/{item.copyCount}</span> : null}
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        {detailLines.map((line) => (
                          <div key={`${item.id}-${line.label}`} className="label-line">
                            <span className="label-line-label">{line.label}</span>
                            <span className="label-line-value">{line.value}</span>
                          </div>
                        ))}

                        {form.notes.trim() ? (
                          <div className="space-y-1 rounded-lg border border-border/70 bg-muted/30 p-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Observações</div>
                            <p className="text-xs font-medium leading-relaxed text-foreground">{form.notes.trim()}</p>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminLabels;