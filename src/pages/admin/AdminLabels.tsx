import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw, Sticker } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SourceKind = "ingredient" | "product" | "manual";
type ValidityMode = "manual" | "automatic";

interface ProductRow { id: string; name: string; active: boolean; }
interface IngredientRow { id: string; name: string; unit: string; }

interface GeneratedLabel {
  name: string;
  sourceLabel: string;
  manufacturedOn: string;
  validUntil: string;
  responsible: string;
  copies: number;
  widthMm: number;
  heightMm: number;
  showBorder: boolean;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const formatDate = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const addDays = (value: string, days: number) => {
  const parsedDate = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return value;
  parsedDate.setDate(parsedDate.getDate() + days);
  return parsedDate.toISOString().slice(0, 10);
};

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const buildLabelsPrintHTML = (label: GeneratedLabel) => {
  const labelMarkup = Array.from({ length: label.copies }, (_, index) => {
    const borderStyle = label.showBorder ? "1px solid #111111" : "1px solid transparent";
    return `
      <article class="thermal-label" style="width:${label.widthMm}mm; min-height:${label.heightMm}mm; border:${borderStyle};">
        <div class="row"><span class="label">PRODUTO:</span><span class="value">${escapeHtml(label.name)}</span></div>
        <div class="row"><span class="label">FABRICAÇÃO:</span><span class="value">${escapeHtml(formatDate(label.manufacturedOn))}</span></div>
        <div class="row"><span class="label">VALIDADE:</span><span class="value">${escapeHtml(formatDate(label.validUntil))}</span></div>
        <div class="row"><span class="label">RESP:</span><span class="value">${escapeHtml(label.responsible)}</span></div>
        ${label.copies > 1 ? `<div class="copy">Etiqueta ${index + 1}/${label.copies}</div>` : ""}
      </article>`;
  }).join("");

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Etiquetas térmicas</title>
      <style>
        @page { size: ${label.widthMm}mm ${label.heightMm}mm; margin: 1mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #ffffff; color: #000000; font-family: Arial, sans-serif; }
        .sheet { display: flex; flex-direction: column; gap: 1mm; }
        .thermal-label { padding: 2mm; display: flex; flex-direction: column; gap: 1.4mm; page-break-after: always; break-after: page; overflow: hidden; }
        .row { display: flex; flex-direction: column; align-items: flex-start; gap: 0.4mm; text-align: left; line-height: 1.15; }
        .label { font-size: 8.5pt; font-weight: 700; }
        .value { font-size: 10pt; font-weight: 700; word-break: break-word; }
        .copy { margin-top: auto; font-size: 7pt; text-align: left; }
      </style>
    </head>
    <body>
      <main class="sheet">${labelMarkup}</main>
      <script>window.onload = function () { window.print(); };</script>
    </body>
  </html>`;
};

const AdminLabels = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceKind, setSourceKind] = useState<SourceKind>("ingredient");
  const [validityMode, setValidityMode] = useState<ValidityMode>("manual");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [customName, setCustomName] = useState("");
  const [manufacturedOn, setManufacturedOn] = useState(todayIso());
  const [validUntil, setValidUntil] = useState(todayIso());
  const [shelfLifeDays, setShelfLifeDays] = useState("1");
  const [responsible, setResponsible] = useState("");
  const [copies, setCopies] = useState("1");
  const [labelWidthMm, setLabelWidthMm] = useState("50");
  const [labelHeightMm, setLabelHeightMm] = useState("30");
  const [showBorder, setShowBorder] = useState(true);
  const [generatedLabel, setGeneratedLabel] = useState<GeneratedLabel | null>(null);

  const fetchData = async () => {
    try {
      const productsQuery = supabase.from("products").select("id, name, active").order("name");
      const ingredientsQuery = supabase.from("ingredients").select("id, name, unit").order("name");
      const [productsRes, ingredientsRes] = await Promise.all([
        storeId ? productsQuery.eq("store_id", storeId) : productsQuery,
        storeId ? ingredientsQuery.eq("store_id", storeId) : ingredientsQuery,
      ]);
      if (productsRes.error) throw productsRes.error;
      if (ingredientsRes.error) throw ingredientsRes.error;
      setProducts((productsRes.data ?? []) as ProductRow[]);
      setIngredients((ingredientsRes.data ?? []) as IngredientRow[]);
      setSelectedProductId((current) => current || productsRes.data?.[0]?.id || "");
      setSelectedIngredientId((current) => current || ingredientsRes.data?.[0]?.id || "");
    } catch (error) {
      toast({ title: "Erro ao carregar etiquetas", description: error instanceof Error ? error.message : "Não foi possível carregar produtos e ingredientes.", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void fetchData(); }, [storeId]);
  useEffect(() => {
    const defaultResponsible = user?.user_metadata?.full_name || user?.email || "";
    setResponsible((current) => (current.trim() ? current : defaultResponsible));
  }, [user]);

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const selectedIngredient = ingredients.find((ingredient) => ingredient.id === selectedIngredientId) ?? null;

  const resolvedName = useMemo(() => {
    if (sourceKind === "manual") return customName.trim();
    if (sourceKind === "product") return selectedProduct?.name ?? "";
    return selectedIngredient?.name ?? "";
  }, [customName, selectedIngredient?.name, selectedProduct?.name, sourceKind]);

  const resolvedSourceLabel = useMemo(() => {
    if (sourceKind === "manual") return "Manual";
    if (sourceKind === "product") return "Produto";
    return selectedIngredient ? `Ingrediente • ${selectedIngredient.unit}` : "Ingrediente";
  }, [selectedIngredient, sourceKind]);

  const resolvedValidity = useMemo(() => validityMode === "automatic" ? addDays(manufacturedOn, Math.max(0, Number(shelfLifeDays) || 0)) : validUntil, [manufacturedOn, shelfLifeDays, validUntil, validityMode]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const handleGenerate = () => {
    const nextLabel: GeneratedLabel = {
      name: resolvedName,
      sourceLabel: resolvedSourceLabel,
      manufacturedOn,
      validUntil: resolvedValidity,
      responsible: responsible.trim(),
      copies: Math.max(1, Number(copies) || 1),
      widthMm: Math.max(40, Number(labelWidthMm) || 50),
      heightMm: Math.max(25, Number(labelHeightMm) || 30),
      showBorder,
    };

    if (!nextLabel.name.trim()) {
      toast({ title: "Selecione um item", description: "Escolha o produto/ingrediente ou digite um nome manual.", variant: "destructive" });
      return;
    }
    if (!nextLabel.manufacturedOn || !nextLabel.validUntil) {
      toast({ title: "Preencha as datas", description: "Informe fabricação e validade antes de gerar a etiqueta.", variant: "destructive" });
      return;
    }
    if (!nextLabel.responsible.trim()) {
      toast({ title: "Informe o responsável", description: "Preencha quem preparou o item para gerar a etiqueta.", variant: "destructive" });
      return;
    }

    setGeneratedLabel(nextLabel);
    toast({ title: "Etiqueta pronta", description: `${nextLabel.copies} etiqueta(s) geradas para impressão térmica.` });
  };

  const handlePrint = () => {
    const labelToPrint = generatedLabel;
    if (!labelToPrint) {
      handleGenerate();
      return;
    }

    const printWindow = window.open("", "_blank", "width=480,height=720");
    if (!printWindow) {
      toast({ title: "Permita pop-ups", description: "O navegador precisa abrir a impressão térmica em uma janela limpa.", variant: "destructive" });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildLabelsPrintHTML(labelToPrint));
    printWindow.document.close();
  };

  const previewLabel = generatedLabel ?? {
    name: resolvedName || "Nome do item",
    sourceLabel: resolvedSourceLabel,
    manufacturedOn,
    validUntil: resolvedValidity,
    responsible: responsible || "Responsável",
    copies: Math.max(1, Number(copies) || 1),
    widthMm: Math.max(40, Number(labelWidthMm) || 50),
    heightMm: Math.max(25, Number(labelHeightMm) || 30),
    showBorder,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2"><div className="flex items-center gap-2"><CardTitle className="text-xl">Etiquetas térmicas</CardTitle><Badge variant="secondary">50x30 mm</Badge></div><CardDescription>Gere etiquetas simples para ingredientes manipulados e produtos preparados, com fabricação, validade e responsável, prontas para impressora térmica.</CardDescription></div>
          <div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={handleRefresh} disabled={refreshing}><RefreshCw className={cn(refreshing && "animate-spin")} />Atualizar itens</Button><Button size="lg" onClick={handleGenerate}><Sticker />Gerar etiqueta</Button><Button size="lg" variant="outline" onClick={handlePrint}><Printer />Imprimir</Button></div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader><CardTitle>Configuração rápida</CardTitle><CardDescription>Em até 3 cliques você gera e imprime a etiqueta.</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3"><Label>Origem do item</Label><div className="flex flex-wrap gap-2">{([{ value: "ingredient", label: "Ingrediente" }, { value: "product", label: "Produto" }, { value: "manual", label: "Texto manual" }] as const).map((option) => <Button key={option.value} type="button" variant={sourceKind === option.value ? "default" : "outline"} onClick={() => setSourceKind(option.value)}>{option.label}</Button>)}</div></div>

            {sourceKind === "ingredient" ? <div className="space-y-2"><Label htmlFor="ingredient">Ingrediente</Label><select id="ingredient" value={selectedIngredientId} onChange={(event) => setSelectedIngredientId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} • {ingredient.unit}</option>)}</select></div> : null}
            {sourceKind === "product" ? <div className="space-y-2"><Label htmlFor="product">Produto</Label><select id="product" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.active ? "" : " • oculto"}</option>)}</select></div> : null}
            {sourceKind === "manual" ? <div className="space-y-2"><Label htmlFor="custom-name">Nome do item</Label><Input id="custom-name" value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Ex.: Carne temperada" /></div> : null}

            <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="manufacturedOn">Data de fabricação</Label><Input id="manufacturedOn" type="date" value={manufacturedOn} onChange={(event) => setManufacturedOn(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="responsible">Responsável</Label><Input id="responsible" value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="Nome de quem preparou" /></div></div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap gap-2"><Button type="button" variant={validityMode === "manual" ? "default" : "outline"} onClick={() => setValidityMode("manual")}>Validade manual</Button><Button type="button" variant={validityMode === "automatic" ? "default" : "outline"} onClick={() => setValidityMode("automatic")}>Validade automática</Button></div>
              {validityMode === "manual" ? <div className="space-y-2"><Label htmlFor="validUntil">Validade</Label><Input id="validUntil" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></div> : <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-end"><div className="space-y-2"><Label htmlFor="shelfLifeDays">Dias de validade</Label><Input id="shelfLifeDays" type="number" min="0" value={shelfLifeDays} onChange={(event) => setShelfLifeDays(event.target.value)} /></div><div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground">Válido até <strong>{formatDate(resolvedValidity)}</strong></div></div>}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2"><Label htmlFor="copies">Quantidade de etiquetas</Label><Input id="copies" type="number" min="1" value={copies} onChange={(event) => setCopies(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="labelWidthMm">Largura (mm)</Label><Input id="labelWidthMm" type="number" min="40" value={labelWidthMm} onChange={(event) => setLabelWidthMm(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="labelHeightMm">Altura (mm)</Label><Input id="labelHeightMm" type="number" min="25" value={labelHeightMm} onChange={(event) => setLabelHeightMm(event.target.value)} /></div><label className="flex h-10 items-center gap-3 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground"><input type="checkbox" checked={showBorder} onChange={(event) => setShowBorder(event.target.checked)} className="h-4 w-4" />Borda fina</label></div>

            {loading ? <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">Carregando produtos e ingredientes...</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pré-visualização térmica</CardTitle><CardDescription>Preto e branco, alinhada à esquerda, com margens mínimas e pronta para impressora de etiqueta.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm"><span className="font-semibold text-foreground">{previewLabel.copies} etiqueta(s)</span><Badge variant="outline">{previewLabel.sourceLabel}</Badge></div>
            <div className="grid gap-3">{Array.from({ length: Math.min(previewLabel.copies, 6) }, (_, index) => <article key={`${previewLabel.name}-${index}`} className="rounded-xl bg-white p-4 text-left text-black shadow-sm" style={{ width: `${previewLabel.widthMm * 2.2}px`, minHeight: `${previewLabel.heightMm * 2.2}px`, border: previewLabel.showBorder ? "1px solid #111111" : "1px solid transparent" }}><div className="space-y-2 text-[12px] leading-tight"><div><div className="font-bold">PRODUTO:</div><div className="font-semibold">{previewLabel.name || "Nome do item"}</div></div><div><div className="font-bold">FABRICAÇÃO:</div><div className="font-semibold">{formatDate(previewLabel.manufacturedOn)}</div></div><div><div className="font-bold">VALIDADE:</div><div className="font-semibold">{formatDate(previewLabel.validUntil)}</div></div><div><div className="font-bold">RESP:</div><div className="font-semibold">{previewLabel.responsible || "Responsável"}</div></div></div></article>)}</div>
            {previewLabel.copies > 6 ? <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">Mostrando 6 prévias. Na impressão sairão {previewLabel.copies} etiquetas completas.</div> : null}
            <Button className="w-full" size="lg" onClick={handlePrint}><Printer />Imprimir {previewLabel.copies} etiqueta(s)</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLabels;