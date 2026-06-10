import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  parseFreeReceiptLayout,
  type FreeReceiptElement,
  type FreeReceiptLayout,
} from "@/components/admin/FreeReceiptEditor";

const renderElementStyle = (el: FreeReceiptElement): CSSProperties => ({
  position: "absolute",
  left: `${el.x}mm`,
  top: `${el.y}mm`,
  width: `${el.width}mm`,
  height: `${el.height}mm`,
  transform: `rotate(${el.rotation}deg)`,
  transformOrigin: "center center",
  zIndex: el.zIndex,
  overflow: "hidden",
  background: el.background || "transparent",
  color: el.color || "#000000",
  boxSizing: "border-box",
});

const AdminFreePrint = () => {
  const [layout, setLayout] = useState<FreeReceiptLayout | null>(null);
  const [error, setError] = useState("");
  const printedRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("receipt_templates")
        .select("*")
        .eq("template_type", "livre")
        .maybeSingle();

      if (error) {
        setError(error.message || "Erro ao carregar comanda livre.");
        return;
      }

      if (!data?.body_template) {
        setError("Nenhum modelo LIVRE salvo. Volte em Comandas > LIVRE e clique em Salvar.");
        return;
      }

      setLayout(parseFreeReceiptLayout(String(data.body_template || "")));
    };

    load();
  }, []);

  const printHeightMm = useMemo(() => {
    if (!layout) return 100;
    return Math.max(20, Math.min(layout.designHeightMm, layout.cutYmm));
  }, [layout]);

  useEffect(() => {
    if (!layout || printedRef.current) return;
    printedRef.current = true;

    const timer = setTimeout(() => {
      window.print();
    }, 400);

    return () => clearTimeout(timer);
  }, [layout]);

  if (error) {
    return <div style={{ padding: 20, fontFamily: "monospace" }}>{error}</div>;
  }

  if (!layout) {
    return <div style={{ padding: 20, fontFamily: "monospace" }}>Carregando comanda livre...</div>;
  }

  return (
    <>
      <style>{`
        @page {
          size: ${layout.paperWidthMm}mm ${printHeightMm}mm;
          margin: 0;
        }

        html, body, #root {
          margin: 0 !important;
          padding: 0 !important;
          width: ${layout.paperWidthMm}mm !important;
          height: ${printHeightMm}mm !important;
          min-height: ${printHeightMm}mm !important;
          max-height: ${printHeightMm}mm !important;
          overflow: hidden !important;
          background: #fff !important;
        }

        body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .free-print-stage {
          position: relative;
          width: ${layout.paperWidthMm}mm !important;
          height: ${printHeightMm}mm !important;
          overflow: hidden !important;
          background: ${layout.background || "#ffffff"} !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
        }

        .free-print-stage img {
          image-rendering: auto;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        @media screen {
          body {
            background: #e5e5e5 !important;
            padding: 20px !important;
            width: auto !important;
            height: auto !important;
          }

          .free-print-stage {
            box-shadow: 0 18px 40px rgba(0,0,0,.22);
            margin: 0 auto !important;
          }
        }

        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="free-print-stage">
        {layout.elements
          .slice()
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((el) => (
            <div key={el.id} style={renderElementStyle(el)}>
              {el.type === "image" ? (
                <img
                  src={el.imageUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: el.objectFit === "fill" ? "fill" : el.objectFit || "contain",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    display: "flex",
                    alignItems: "center",
                    justifyContent:
                      el.textAlign === "right" ? "flex-end" : el.textAlign === "left" ? "flex-start" : "center",
                    textAlign: el.textAlign || "center",
                    fontFamily: "Arial, Helvetica, sans-serif",
                    fontSize: `${el.fontSize || 12}px`,
                    fontWeight: el.fontWeight || "bold",
                    lineHeight: 1.15,
                    color: el.color || "#000000",
                    padding: "0.8mm",
                    boxSizing: "border-box",
                  }}
                >
                  {el.text}
                </div>
              )}
            </div>
          ))}
      </div>

      <div className="no-print" style={{ padding: 12, fontFamily: "monospace", textAlign: "center" }}>
        Comanda LIVRE carregada. A impressão será aberta automaticamente.
      </div>
    </>
  );
};

export default AdminFreePrint;
