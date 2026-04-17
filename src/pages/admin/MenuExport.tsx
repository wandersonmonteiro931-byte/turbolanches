import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { useStoreLogo } from "@/hooks/useStoreLogo";

interface Category {
  id: string;
  name: string;
  icon: string;
  image_url: string | null;
  sort_order: number;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  category_id: string | null;
  active: boolean;
  sort_order: number;
}

const MenuExport = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredientsByProduct, setIngredientsByProduct] = useState<Record<string, string[]>>({});
  const [storeName, setStoreName] = useState("Cardápio");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const logoUrl = useStoreLogo();

  useEffect(() => {
    const load = async () => {
      const [catRes, prodRes, settingsRes, prodIngRes, ingRes] = await Promise.all([
        supabase.from("categories").select("*").eq("active", true).order("sort_order"),
        supabase.from("products").select("*").eq("active", true).order("sort_order"),
        supabase.from("store_settings").select("store_display_name").limit(1).single(),
        supabase.from("product_ingredients").select("product_id, ingredient_id"),
        supabase.from("ingredients").select("id, name"),
      ]);
      setCategories(catRes.data ?? []);
      setProducts(prodRes.data ?? []);
      if (settingsRes.data?.store_display_name) setStoreName(settingsRes.data.store_display_name);

      // Build product -> ingredient names map
      const ingMap = new Map<string, string>((ingRes.data ?? []).map((i: any) => [i.id, i.name]));
      const byProduct: Record<string, string[]> = {};
      (prodIngRes.data ?? []).forEach((pi: any) => {
        const name = ingMap.get(pi.ingredient_id);
        if (!name) return;
        if (!byProduct[pi.product_id]) byProduct[pi.product_id] = [];
        byProduct[pi.product_id].push(name);
      });
      setIngredientsByProduct(byProduct);

      setLoading(false);
    };
    load();
  }, []);

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleExport = async () => {
    if (!ref.current) return;
    setExporting(true);
    try {
      // Wait for images to load
      const imgs = ref.current.querySelectorAll("img");
      await Promise.all(
        Array.from(imgs).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) return resolve();
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
        ),
      );

      const dataUrl = await toPng(ref.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "cardapio-alta-qualidade.png";
      a.click();
    } catch (err) {
      console.error("Export error:", err);
    }
    setExporting(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">Pré-visualização do Cardápio</h1>
          <div className="flex gap-2">
            <button
              onClick={() => window.history.back()}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Voltar
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {exporting ? "Exportando..." : "📥 Salvar PNG"}
            </button>
          </div>
        </div>

        {/* Exportable area */}
        <div
          ref={ref}
          style={{
            background: "#fff",
            padding: "32px 24px",
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
            width: "600px",
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo"
                crossOrigin="anonymous"
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 16,
                  objectFit: "cover",
                  margin: "0 auto 12px",
                  display: "block",
                }}
              />
            )}
            <h1
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: "#1a1a1a",
                margin: 0,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {storeName}
            </h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>CARDÁPIO</p>
          </div>

          {/* Categories & Products */}
          {categories.map((cat) => {
            const catProducts = products.filter((p) => p.category_id === cat.id);
            if (catProducts.length === 0) return null;
            return (
              <div key={cat.id} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    borderBottom: "2px solid #EA1D2C",
                    paddingBottom: 6,
                    marginBottom: 12,
                  }}
                >
                  <h2
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: "#1a1a1a",
                      margin: 0,
                    }}
                  >
                    {cat.icon ? `${cat.icon} ` : ""}
                    {cat.name}
                  </h2>
                </div>

                {catProducts.map((product) => (
                  <div
                    key={product.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 0",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    {product.image_url && (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        crossOrigin="anonymous"
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 10,
                          objectFit: "cover",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#1a1a1a",
                          margin: 0,
                        }}
                      >
                        {product.name}
                      </p>
                      {product.description && (
                        <p
                          style={{
                            fontSize: 11,
                            color: "#888",
                            margin: "2px 0 0",
                            lineHeight: 1.3,
                          }}
                        >
                          {product.description}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {product.original_price && product.original_price > product.price && (
                        <p
                          style={{
                            fontSize: 11,
                            color: "#bbb",
                            textDecoration: "line-through",
                            margin: 0,
                          }}
                        >
                          {fmt(product.original_price)}
                        </p>
                      )}
                      <p
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: "#EA1D2C",
                          margin: 0,
                        }}
                      >
                        {fmt(product.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Footer */}
          <div style={{ textAlign: "center", marginTop: 20, paddingTop: 16, borderTop: "1px solid #eee" }}>
            <p style={{ fontSize: 11, color: "#aaa", margin: 0 }}>
              Preços sujeitos a alteração • {storeName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MenuExport;
