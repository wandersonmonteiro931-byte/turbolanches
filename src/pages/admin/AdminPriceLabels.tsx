import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { buildBatchPrintDocument, type BatchSection } from "@/lib/adminPrintTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";
import { normalizeSearch } from "@/lib/searchNormalize";

interface PriceProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  product_code: number;
  category_id: string | null;
  active: boolean;
}

interface QueueItem {
  productId: string;
  name: string;
  description: string;
  price: number;
  code: number;
  copies: number;
}

interface Category {
  id: string;
  name: string;
}

interface PrintTemplate {
  id?: string;
  body_template?: string;
  store_name?: string;
  label?: string;
  footer_message?: string;
  custom_message?: string;
  body_font_size?: number;
  label_font_size?: number;
  items_font_size?: number;
}

const formatPrice = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

const AdminPriceLabels = () => {
  const [products, setProducts] = useState<PriceProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [labelWidth, setLabelWidth] = useState("60");
  const [labelHeight, setLabelHeight] = useState("40");
  const [labelGap, setLabelGap] = useState("2");
  const [printTemplate, setPrintTemplate] = useState<PrintTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [prodRes, catRes, tplRes] = await Promise.all([
        supabase.from("products").select("id,name,description,price,product_code,category_id,active").order("product_code"),
        supabase.from("categories").select("id,name").order("sort_order"),
        supabase.from("receipt_templates" as any).select("*").eq("template_type", "etiqueta_preco").maybeSingle(),
      ]);
      setProducts((prodRes.data || []) as PriceProduct[]);
      setCategories((catRes.data || []) as Category[]);
      setPrintTemplate((tplRes.data as PrintTemplate) || null);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trimnormalizeSearch();
    return products.filter((p) => {
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (!term) return true;
      return (
        normalizeSearch(p.name).includes(term) ||
        String(p.product_code).includes(term)
      );
    });
  }, [products, search, categoryId]);

  const totalLabels = useMemo(() => queue.reduce((s, q) => s + q.copies, 0), [queue]);

  const addToQueue = (p: PriceProduct) => {
    setQueue((prev) => {
      const existing = prev.find((q) => q.productId === p.id);
      if (existing) {
        return prev.map((q) => (q.productId === p.id ? { ...q, copies: q.copies + 1 } : q));
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          description: p.description || "",
          price: Number(p.price),
          code: p.product_code,
          copies: 1,
        },
      ];
    });
  };

  const updateCopies = (productId: string, copies: number) => {
    setQueue((prev) => prev.map((q) => (q.productId === productId ? { ...q, copies: Math.max(1, copies) } : q)));
  };

  const removeFromQueue = (productId: string) => {
    setQueue((prev) => prev.filter((q) => q.productId !== productId));
  };

  const addAllVisible = () => {
    if (filtered.length === 0) return;
    setQueue((prev) => {
      const map = new Map(prev.map((q) => [q.productId, q]));
      filtered.forEach((p) => {
        if (!map.has(p.id)) {
          map.set(p.id, {
            productId: p.id,
            name: p.name,
            description: p.description || "",
            price: Number(p.price),
            code: p.product_code,
            copies: 1,
          });
        }
      });
      return Array.from(map.values());
    });
    toast.success(`${filtered.length} item(ns) adicionado(s) à fila.`);
  };

  const handlePrint = () => {
    if (queue.length === 0) {
      toast.error("Adicione pelo menos um produto à fila.");
      return;
    }
    const widthMm = parseFloat(labelWidth) || 60;
    const heightMm = parseFloat(labelHeight) || 40;
    const gapMm = parseFloat(labelGap) || 0;

    const win = window.open("", "_blank", "width=480,height=720");
    if (!win) {
      toast.error("Permita pop-ups para este site.");
      return;
    }

    const batchItems: BatchSection[] = queue.flatMap((item) =>
      Array.from({ length: item.copies }, () => ({
        variables: {
          "[NOMEPRODUTO]": item.name,
          "[PRODUTO]": item.name,
          "[PREÇOPROD]": formatPrice(item.price),
          "[VALORITEM]": formatPrice(item.price),
          "[CÓDIGOPROD]": String(item.code),
          "[CODIGOPROD]": String(item.code),
          "[DESCRICAO]": item.description,
        },
      })),
    );

    const html = buildBatchPrintDocument(
      {
        title: "Etiquetas de preço",
        template: printTemplate?.body_template || getDefaultTemplate("etiqueta_preco"),
        variables: {
          "[NOMELOJA]": printTemplate?.store_name || "TURBO LANCHES",
          "[TIPOCOMANDA]": printTemplate?.label || "PREÇO",
          "[RODAPÉ]": printTemplate?.footer_message || "",
          "[DIVULGAÇÃO]": printTemplate?.custom_message || "",
        },
        pageWidthMm: widthMm,
        pageHeightMm: "auto",
        pageMarginMm: 0,
        bodyFontFamily: "Arial, Helvetica, sans-serif",
        bodyFontSizePx: printTemplate?.body_font_size || 11,
        labelFontSizePx: printTemplate?.label_font_size || 22,
        bodyPaddingMm: 0,
        sectionPaddingMm: 0,
        sectionMinHeightMm: heightMm,
        sectionBorder: "none",
        labelGapMm: gapMm,
      },
      batchItems,
    );

    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
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
              <CardTitle className="text-xl">Etiquetas de preço</CardTitle>
              <Badge variant="secondary">{totalLabels} na fila</Badge>
            </div>
            <CardDescription>
              Selecione produtos do catálogo para imprimir comandas com nome, código e preço.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" asChild>
              <Link to="/admin/comandas?tipo=etiqueta_preco">Editar modelo</Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Catálogo</CardTitle>
            <CardDescription>Clique para adicionar à fila de impressão.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou código"
                  className="pl-9"
                />
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{filtered.length} item(ns)</p>
              <Button size="sm" variant="outline" onClick={addAllVisible} disabled={filtered.length === 0}>
                Adicionar todos visíveis
              </Button>
            </div>

            <div className="max-h-[480px] overflow-y-auto rounded-md border border-border">
              {filtered.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((p) => {
                    const inQueue = queue.find((q) => q.productId === p.id);
                    return (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">#{p.product_code}</span>
                            <p className="truncate font-medium">{p.name}</p>
                            {!p.active && <Badge variant="outline" className="text-xs">oculto</Badge>}
                          </div>
                          <p className="text-sm font-bold text-primary">{formatPrice(Number(p.price))}</p>
                        </div>
                        <Button
                          size="sm"
                          variant={inQueue ? "secondary" : "default"}
                          onClick={() => addToQueue(p)}
                        >
                          {inQueue ? `+1 (${inQueue.copies})` : "Adicionar"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fila de impressão</CardTitle>
            <CardDescription>{totalLabels} etiqueta(s) prontas para imprimir.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Largura (mm)</Label>
                <Input value={labelWidth} onChange={(e) => setLabelWidth(e.target.value)} type="number" min="20" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Altura (mm)</Label>
                <Input value={labelHeight} onChange={(e) => setLabelHeight(e.target.value)} type="number" min="15" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Espaço (mm)</Label>
                <Input value={labelGap} onChange={(e) => setLabelGap(e.target.value)} type="number" min="0" />
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto rounded-md border border-border">
              {queue.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma etiqueta na fila.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {queue.map((item) => (
                    <li key={item.productId} className="flex items-center gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">#{item.code} • {formatPrice(item.price)}</p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={item.copies}
                        onChange={(e) => updateCopies(item.productId, Number(e.target.value))}
                        className="h-9 w-16 text-center"
                      />
                      <Button size="icon" variant="ghost" onClick={() => removeFromQueue(item.productId)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {queue.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setQueue([])} className="w-full">
                Limpar fila
              </Button>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handlePrint}
              disabled={queue.length === 0}
            >
              <Printer />
              Imprimir {totalLabels} etiqueta(s)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPriceLabels;
