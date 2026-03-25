import { useEffect, useMemo, useState, useCallback } from "react";
import { Printer, Sticker, Plus, Trash2, ListChecks, Save, Pencil, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useReceiptTemplates } from "@/hooks/useReceiptTemplates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { buildBatchPrintDocument, type BatchSection } from "@/lib/adminPrintTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";

type SourceKind = "ingredient" | "product" | "manual";
type ValidityMode = "manual" | "automatic";

interface StorageConfigRow { id: string; name: string; emoji: string; default_temp: string; default_phrase: string; }

interface ProductRow { id: string; name: string; active: boolean; }
interface IngredientRow { id: string; name: string; unit: string; }
interface BrandRow { id: string; name: string; }

interface GeneratedLabel {
  id: string;
  name: string;
  sourceLabel: string;
  manufacturedOn: string;
  validUntil: string;
  responsible: string;
  copies: number;
  widthMm: number;
  heightMm: number;
  storageType: string;
  storageTemp: string;
  storagePhrase: string;
  brand: string;
}

interface SavedLabel {
  id: string;
  name: string;
  source_kind: SourceKind;
  manufactured_on: string;
  valid_until: string;
  validity_mode: ValidityMode;
  shelf_life_days: number;
  responsible: string;
  copies: number;
  width_mm: number;
  height_mm: number;
  storage_type: string;
  storage_temp: string;
  storage_phrase: string;
  brand: string;
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

let labelIdCounter = 0;
const nextLabelId = () => `lbl-${++labelIdCounter}-${Date.now()}`;

// Removed hardcoded DEFAULT_STORAGE_PHRASES - now loaded from DB

const AdminLabels = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: templates } = useReceiptTemplates();

  const [loading, setLoading] = useState(true);
  const [sourceKind, setSourceKind] = useState<SourceKind>("ingredient");
  const [validityMode, setValidityMode] = useState<ValidityMode>("manual");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [storageConfigs, setStorageConfigs] = useState<StorageConfigRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [customName, setCustomName] = useState("");
  const [manufacturedOn, setManufacturedOn] = useState(todayIso());
  const [validUntil, setValidUntil] = useState(todayIso());
  const [shelfLifeDays, setShelfLifeDays] = useState("1");
  const [responsible, setResponsible] = useState("");
  const [labelWidthMm, setLabelWidthMm] = useState("80");
  const [labelHeightMm, setLabelHeightMm] = useState("30");
  const [copies, setCopies] = useState("1");
  const [labelQueue, setLabelQueue] = useState<GeneratedLabel[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [saveLabel, setSaveLabel] = useState(false);

  // Storage type state
  const [storageType, setStorageType] = useState("");
  const [storageTemp, setStorageTemp] = useState("");
  const [storagePhrase, setStoragePhrase] = useState("");

  // Saved labels
  const [savedLabels, setSavedLabels] = useState<SavedLabel[]>([]);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);

  useEffect(() => {
    if (storageType) {
      const cfg = storageConfigs.find(c => c.name.toLowerCase() === storageType.toLowerCase());
      setStoragePhrase((prev) => prev || cfg?.default_phrase || "");
    }
  }, [storageType, storageConfigs]);

  const fetchSavedLabels = useCallback(async () => {
    const query = (supabase as any).from("saved_labels").select("*").order("created_at", { ascending: false });
    const { data, error } = storeId ? await query.eq("store_id", storeId) : await query;
    if (!error && data) setSavedLabels(data as SavedLabel[]);
  }, [storeId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const db = supabase as any;
        const productsQuery = supabase.from("products").select("id, name, active").order("name");
        const ingredientsQuery = supabase.from("ingredients").select("id, name, unit").order("name");
        let brandsQuery = db.from("brands").select("id, name").order("name");
        let storageQuery = db.from("storage_configs").select("id, name, emoji, default_temp, default_phrase").eq("active", true).order("sort_order").order("name");
        const [productsRes, ingredientsRes, brandsRes, storageRes] = await Promise.all([
          storeId ? productsQuery.eq("store_id", storeId) : productsQuery,
          storeId ? ingredientsQuery.eq("store_id", storeId) : ingredientsQuery,
          storeId ? brandsQuery.eq("store_id", storeId) : brandsQuery,
          storeId ? storageQuery.eq("store_id", storeId) : storageQuery,
        ]);
        if (productsRes.error) throw productsRes.error;
        if (ingredientsRes.error) throw ingredientsRes.error;
        setProducts((productsRes.data ?? []) as ProductRow[]);
        setIngredients((ingredientsRes.data ?? []) as IngredientRow[]);
        setBrands((brandsRes.data ?? []) as BrandRow[]);
        setStorageConfigs((storageRes.data ?? []) as StorageConfigRow[]);
        setSelectedProductId((current) => current || productsRes.data?.[0]?.id || "");
        setSelectedIngredientId((current) => current || ingredientsRes.data?.[0]?.id || "");
      } catch (error) {
        toast({ title: "Erro ao carregar dados", description: error instanceof Error ? error.message : "Não foi possível carregar.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
    void fetchSavedLabels();
  }, [storeId, fetchSavedLabels]);

  useEffect(() => {
    const defaultResponsible = user?.user_metadata?.full_name || user?.email || "";
    setResponsible((current) => (current.trim() ? current : defaultResponsible));
  }, [user]);

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const selectedIngredient = ingredients.find((ingredient) => ingredient.id === selectedIngredientId) ?? null;
  const selectedBrand = brands.find((b) => b.id === selectedBrandId) ?? null;
  const printTemplate = templates?.find((template) => template.template_type === "etiquetas");

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

  const handleSaveToDb = async (labelData: { name: string; }) => {
    if (!user) return;
    const payload = {
      store_id: storeId || null,
      user_id: user.id,
      name: labelData.name,
      source_kind: sourceKind,
      manufactured_on: manufacturedOn,
      valid_until: resolvedValidity,
      validity_mode: validityMode,
      shelf_life_days: Math.max(0, Number(shelfLifeDays) || 0),
      responsible: responsible.trim(),
      copies: Math.max(1, Number(copies) || 1),
      width_mm: Math.max(40, Number(labelWidthMm) || 80),
      height_mm: Math.max(25, Number(labelHeightMm) || 30),
      storage_type: storageType,
      storage_temp: storageTemp.trim(),
      storage_phrase: storageType ? storagePhrase.trim() : "",
      brand: selectedBrand?.name ?? "",
    };

    if (editingLabelId) {
      const { error } = await (supabase as any).from("saved_labels").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingLabelId);
      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Etiqueta atualizada!" });
      setEditingLabelId(null);
    } else {
      const { error } = await (supabase as any).from("saved_labels").insert(payload);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Etiqueta salva!" });
    }
    void fetchSavedLabels();
  };

  const handleDeleteSaved = async (id: string) => {
    const { error } = await (supabase as any).from("saved_labels").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Etiqueta excluída" });
    void fetchSavedLabels();
  };

  const handleLoadSaved = (label: SavedLabel) => {
    setEditingLabelId(label.id);
    setSourceKind(label.source_kind as SourceKind);
    setCustomName(label.name);
    setManufacturedOn(label.manufactured_on || todayIso());
    setValidUntil(label.valid_until || todayIso());
    setValidityMode(label.validity_mode as ValidityMode);
    setShelfLifeDays(String(label.shelf_life_days));
    setResponsible(label.responsible);
    setCopies(String(label.copies));
    setLabelWidthMm(String(label.width_mm));
    setLabelHeightMm(String(label.height_mm));
    setStorageType(label.storage_type);
    setStorageTemp(label.storage_temp);
    setStoragePhrase(label.storage_phrase);
    setSaveLabel(true);
    // Set brand by name
    const matchedBrand = brands.find(b => b.name === label.brand);
    setSelectedBrandId(matchedBrand?.id ?? "");
    toast({ title: "Etiqueta carregada para edição" });
  };

  const handleReprintSaved = (label: SavedLabel) => {
    const storageLabel = (type: string) => type ? type.toUpperCase() : "";

    const newLabel: GeneratedLabel = {
      id: nextLabelId(),
      name: label.name,
      sourceLabel: label.source_kind === "manual" ? "Manual" : label.source_kind === "product" ? "Produto" : "Ingrediente",
      manufacturedOn: label.manufactured_on || todayIso(),
      validUntil: label.validity_mode === "automatic"
        ? addDays(label.manufactured_on || todayIso(), label.shelf_life_days)
        : (label.valid_until || todayIso()),
      responsible: label.responsible,
      copies: label.copies,
      widthMm: label.width_mm,
      heightMm: label.height_mm,
      storageType: label.storage_type,
      storageTemp: label.storage_temp,
      storagePhrase: label.storage_phrase,
      brand: label.brand,
    };

    setLabelQueue((prev) => [...prev, newLabel]);
    toast({ title: "Adicionado à fila", description: `${newLabel.copies}x ${newLabel.name}` });
  };

  const handleAddToQueue = () => {
    const newLabel: GeneratedLabel = {
      id: nextLabelId(),
      name: resolvedName,
      sourceLabel: resolvedSourceLabel,
      manufacturedOn,
      validUntil: resolvedValidity,
      responsible: responsible.trim(),
      copies: Math.max(1, Number(copies) || 1),
      widthMm: Math.max(40, Number(labelWidthMm) || 80),
      heightMm: Math.max(25, Number(labelHeightMm) || 30),
      storageType,
      storageTemp: storageTemp.trim(),
      storagePhrase: storageType ? storagePhrase.trim() : "",
      brand: selectedBrand?.name ?? "",
    };

    if (!newLabel.name.trim()) {
      toast({ title: "Selecione um item", description: "Escolha o produto/ingrediente ou digite um nome.", variant: "destructive" });
      return;
    }
    if (!newLabel.manufacturedOn || !newLabel.validUntil) {
      toast({ title: "Preencha as datas", variant: "destructive" });
      return;
    }
    if (!newLabel.responsible.trim()) {
      toast({ title: "Informe o responsável", variant: "destructive" });
      return;
    }

    setLabelQueue((prev) => [...prev, newLabel]);

    if (saveLabel) {
      void handleSaveToDb({ name: newLabel.name });
    }

    toast({ title: "Adicionado à fila", description: `${newLabel.copies}x ${newLabel.name}` });
  };

  const handleRemoveFromQueue = useCallback((id: string) => {
    setLabelQueue((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const handleClearQueue = useCallback(() => {
    setLabelQueue([]);
  }, []);

  const totalLabelsInQueue = useMemo(() => labelQueue.reduce((sum, l) => sum + l.copies, 0), [labelQueue]);

  const handlePrintAll = () => {
    if (labelQueue.length === 0) {
      toast({ title: "Fila vazia", description: "Adicione pelo menos uma etiqueta.", variant: "destructive" });
      return;
    }

    const printWindow = window.open("", "_blank", "width=480,height=720");
    if (!printWindow) {
      toast({ title: "Permita pop-ups", variant: "destructive" });
      return;
    }

    const firstLabel = labelQueue[0];
    const widthMm = firstLabel.widthMm;
    const heightMm = firstLabel.heightMm;

    const storageLabel = (type: string) => type ? type.toUpperCase() : "";

    const batchItems: BatchSection[] = labelQueue.flatMap((label) =>
      Array.from({ length: label.copies }, () => ({
        variables: {
          "[PRODUTO]": label.name,
          "[MARCA]": label.brand || undefined,
          "[DATAFABRICACAO]": formatDate(label.manufacturedOn),
          "[VALIDADE]": formatDate(label.validUntil),
          "[RESPONSAVEL]": label.responsible,
          "[RESFRIADO]": label.storageType === "resfriado" ? "RESFRIADO" : "",
          "[CONGELADO]": label.storageType === "congelado" ? "CONGELADO" : "",
          "[ARMAZENAR]": storageLabel(label.storageType),
          "[GRAUS]": label.storageTemp ? `${label.storageTemp}°C` : "",
          "[FRASEARMAZ]": label.storagePhrase,
        },
      })),
    );

    printWindow.document.open();
    printWindow.document.write(
      buildBatchPrintDocument({
        title: "Etiquetas térmicas",
        template: printTemplate?.body_template || getDefaultTemplate("etiquetas"),
        variables: {
          "[NOMELOJA]": printTemplate?.store_name || "TURBO LANCHES",
          "[TIPOCOMANDA]": printTemplate?.label || "ETIQUETA",
          "[RODAPÉ]": printTemplate?.footer_message || "",
          "[DIVULGAÇÃO]": printTemplate?.custom_message || "",
        },
        pageWidthMm: widthMm,
        pageHeightMm: "auto",
        pageMarginMm: 0,
        bodyFontFamily: "Arial, Helvetica, sans-serif",
        bodyFontSizePx: (printTemplate as any)?.body_font_size || printTemplate?.items_font_size || 11,
        labelFontSizePx: printTemplate?.label_font_size || 22,
        bodyPaddingMm: 0,
        sectionPaddingMm: 0,
        sectionMinHeightMm: heightMm,
        sectionBorder: "none",
      }, batchItems),
    );
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2"><CardTitle className="text-xl">Etiquetas térmicas</CardTitle><Badge variant="secondary">{totalLabelsInQueue} na fila</Badge></div>
            <CardDescription>Os ingredientes e itens exibidos aqui vêm dos cadastros manuais da nova seção de Cadastros.</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" asChild><Link to="/admin/comandas?tipo=etiquetas">Editar modelo</Link></Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>{editingLabelId ? "Editando etiqueta salva" : "Configuração rápida"}</CardTitle>
            <CardDescription>{editingLabelId ? "Edite os campos e clique em salvar ou adicionar à fila." : "Em até 3 cliques você gera e imprime a etiqueta."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3"><Label>Origem do item</Label><div className="flex flex-wrap gap-2">{([{ value: "ingredient", label: "Ingrediente" }, { value: "product", label: "Produto" }, { value: "manual", label: "Texto manual" }] as const).map((option) => <Button key={option.value} type="button" variant={sourceKind === option.value ? "default" : "outline"} onClick={() => setSourceKind(option.value)}>{option.label}</Button>)}</div></div>

            {sourceKind === "ingredient" ? (
              <div className="space-y-2">
                <Label htmlFor="ingredient">Ingrediente</Label>
                {ingredients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum ingrediente cadastrado. <Link to="/admin/cadastros" className="text-primary underline">Cadastre em Cadastros</Link>.</p>
                ) : (
                  <select id="ingredient" value={selectedIngredientId} onChange={(event) => setSelectedIngredientId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} • {ingredient.unit}</option>)}</select>
                )}
              </div>
            ) : null}
            {sourceKind === "product" ? (
              <div className="space-y-2">
                <Label htmlFor="product">Produto</Label>
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item cadastrado. <Link to="/admin/cadastros" className="text-primary underline">Cadastre em Cadastros</Link>.</p>
                ) : (
                  <select id="product" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.active ? "" : " • oculto"}</option>)}</select>
                )}
              </div>
            ) : null}
            {sourceKind === "manual" ? <div className="space-y-2"><Label htmlFor="custom-name">Nome do item</Label><Input id="custom-name" value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Ex.: Carne temperada" /></div> : null}

            {/* Marca (opcional) */}
            <div className="space-y-2">
              <Label htmlFor="brand">Marca (opcional)</Label>
              <select id="brand" value={selectedBrandId} onChange={(e) => setSelectedBrandId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <option value="">Sem marca</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {brands.length === 0 && <p className="text-xs text-muted-foreground">Cadastre marcas em <Link to="/admin/cadastros" className="text-primary underline">Cadastros → Marcas</Link>.</p>}
            </div>

            <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="manufacturedOn">Data de fabricação</Label><Input id="manufacturedOn" type="date" value={manufacturedOn} onChange={(event) => setManufacturedOn(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="responsible">Responsável</Label><Input id="responsible" value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="Nome de quem preparou" /></div></div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap gap-2"><Button type="button" variant={validityMode === "manual" ? "default" : "outline"} onClick={() => setValidityMode("manual")}>Validade manual</Button><Button type="button" variant={validityMode === "automatic" ? "default" : "outline"} onClick={() => setValidityMode("automatic")}>Validade automática</Button></div>
              {validityMode === "manual" ? <div className="space-y-2"><Label htmlFor="validUntil">Validade</Label><Input id="validUntil" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></div> : <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-end"><div className="space-y-2"><Label htmlFor="shelfLifeDays">Dias de validade</Label><Input id="shelfLifeDays" type="number" min="0" value={shelfLifeDays} onChange={(event) => setShelfLifeDays(event.target.value)} /></div><div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground">Válido até <strong>{formatDate(resolvedValidity)}</strong></div></div>}
            </div>

            {/* Armazenamento */}
            <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
              <Label className="text-sm font-semibold">Tipo de armazenamento (opcional)</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={storageType === "" ? "default" : "outline"} onClick={() => { setStorageType(""); setStoragePhrase(""); setStorageTemp(""); }}>Nenhum</Button>
                {storageConfigs.map((cfg) => (
                  <Button key={cfg.id} type="button" variant={storageType === cfg.name.toLowerCase() ? "default" : "outline"} onClick={() => { setStorageType(cfg.name.toLowerCase()); setStoragePhrase(cfg.default_phrase); setStorageTemp(cfg.default_temp); }}>
                    {cfg.emoji} {cfg.name}
                  </Button>
                ))}
                {storageConfigs.length === 0 && <span className="text-xs text-muted-foreground">Cadastre tipos em Cadastros → Armazenamento</span>}
              </div>
              {storageType && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="storageTemp">Temperatura (°C) — opcional</Label>
                    <Input id="storageTemp" value={storageTemp} onChange={(e) => setStorageTemp(e.target.value)} placeholder="Ex: -18 ou 4" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="storagePhrase">Frase de armazenamento</Label>
                    <Input id="storagePhrase" value={storagePhrase} onChange={(e) => setStoragePhrase(e.target.value)} placeholder="Ex: Manter resfriado entre 0°C e 5°C" />
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label htmlFor="copies">Cópias</Label><Input id="copies" type="number" min="1" value={copies} onChange={(event) => setCopies(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="labelWidthMm">Largura (mm)</Label><Input id="labelWidthMm" type="number" min="40" value={labelWidthMm} onChange={(event) => setLabelWidthMm(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="labelHeightMm">Altura (mm)</Label><Input id="labelHeightMm" type="number" min="25" value={labelHeightMm} onChange={(event) => setLabelHeightMm(event.target.value)} /></div></div>

            {/* Salvar etiqueta */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/20 p-4">
              <Switch id="save-label" checked={saveLabel} onCheckedChange={setSaveLabel} />
              <Label htmlFor="save-label" className="cursor-pointer">Salvar etiqueta para reimprimir depois</Label>
            </div>

            <div className="flex gap-3">
              <Button size="lg" className="flex-1" onClick={handleAddToQueue}>
                <Plus className="h-4 w-4" />
                Adicionar à fila
              </Button>
              {editingLabelId && (
                <>
                  <Button size="lg" variant="secondary" onClick={() => void handleSaveToDb({ name: resolvedName })}>
                    <Save className="h-4 w-4" />
                    Salvar alterações
                  </Button>
                  <Button size="lg" variant="ghost" onClick={() => setEditingLabelId(null)}>
                    Cancelar
                  </Button>
                </>
              )}
            </div>

            {loading ? <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">Carregando...</div> : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Fila de impressão */}
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div><CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary" />Fila de impressão ({totalLabelsInQueue})</CardTitle><CardDescription>Todas as etiquetas serão impressas juntas.</CardDescription></div>
              {labelQueue.length > 0 && <Button variant="ghost" size="sm" onClick={handleClearQueue}><Trash2 className="h-4 w-4" />Limpar</Button>}
            </CardHeader>
            <CardContent className="space-y-4">
              {labelQueue.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhuma etiqueta na fila. Configure e clique em "Adicionar à fila".
                </div>
              ) : (
                <div className="space-y-2">
                  {labelQueue.map((label) => (
                    <div key={label.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{label.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {label.copies}x · Fab: {formatDate(label.manufacturedOn)} · Val: {formatDate(label.validUntil)} · {label.responsible}
                          {label.brand ? ` · ${label.brand}` : ""}
                          {label.storageType ? ` · ${storageConfigs.find(c => c.name.toLowerCase() === label.storageType)?.emoji || "📦"} ${label.storageType}` : ""}
                          {label.storageTemp ? ` ${label.storageTemp}°C` : ""}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0">{label.sourceLabel}</Badge>
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleRemoveFromQueue(label.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button className="w-full" size="lg" onClick={handlePrintAll} disabled={labelQueue.length === 0}><Printer />Imprimir {totalLabelsInQueue} etiqueta(s)</Button>
            </CardContent>
          </Card>

          {/* Etiquetas salvas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Save className="h-5 w-5 text-primary" />Etiquetas salvas</CardTitle>
              <CardDescription>Clique para editar ou reimprimir rapidamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {savedLabels.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma etiqueta salva. Ative "Salvar etiqueta" ao adicionar à fila.
                </div>
              ) : (
                savedLabels.map((label) => (
                  <div key={label.id} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{label.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {label.copies}x · {label.responsible}
                        {label.brand ? ` · ${label.brand}` : ""}
                        {label.storage_type ? ` · ${label.storage_type}` : ""}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleReprintSaved(label)} title="Adicionar à fila">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleLoadSaved(label)} title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteSaved(label.id)} title="Excluir">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminLabels;
