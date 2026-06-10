import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  parseFreeReceiptLayout,
  type FreeReceiptElement,
  type FreeReceiptLayout,
} from "@/components/admin/FreeReceiptEditor";
import { getThermalPrintSettings } from "@/lib/thermalPrintSettings";
import { isQzAvailable, printRawEscPos } from "@/lib/qzTray";

const FREE_RECEIPT_STORAGE_KEY = "turbo_comanda_livre_layout";
const FREE_RECEIPT_PRINT_PAYLOAD_KEY = "turbo_comanda_livre_print_payload";

const renderElementStyle = (el: FreeReceiptElement) => {
  const borderWidth = Number(el.borderWidth ?? 0) || 0;

  return {
    position: "absolute" as const,
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
    boxSizing: "border-box" as const,
    border:
      borderWidth > 0 && el.borderStyle !== "none"
        ? `${borderWidth}px ${el.borderStyle || "solid"} ${el.borderColor || "#000000"}`
        : "none",
    borderRadius: `${Number(el.borderRadius ?? 0) || 0}mm`,
    opacity: Number(el.opacity ?? 1) || 1,
  };
};

const readLocalLayout = () => {
  try {
    const sessionLayout = window.sessionStorage.getItem(FREE_RECEIPT_PRINT_PAYLOAD_KEY) || "";
    if (sessionLayout) return sessionLayout;
    return window.localStorage.getItem(FREE_RECEIPT_STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

const clearPrintPayload = () => {
  try {
    window.sessionStorage.removeItem(FREE_RECEIPT_PRINT_PAYLOAD_KEY);
  } catch {
    // Ignora navegadores que bloqueiam sessionStorage.
  }
};

const waitForPrintImages = async () => {
  if (typeof document === "undefined") return;

  const images = Array.from(document.images || []);
  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    }),
  );
};

const loadImageSafe = async (src: string): Promise<HTMLImageElement | null> => {
  if (!src) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const lines: string[] = [];

  for (const paragraph of String(text || "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }

    if (line) lines.push(line);
  }

  return lines;
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const renderLayoutToCanvas = async (layout: FreeReceiptLayout, heightMm: number) => {
  /*
    POS-80 / JP80H normalmente imprime 576 dots úteis em papel 80mm.
    Usamos 576 para a largura, e calculamos a altura pela linha de corte.
    Isso evita o navegador/PDF redimensionar e faz a imagem sair mais fiel na QZ Tray.
  */
  const widthDots = layout.paperWidthMm >= 78 ? 576 : Math.round(layout.paperWidthMm * 7.2);
  const pxPerMm = widthDots / layout.paperWidthMm;
  const heightDots = Math.max(8, Math.ceil(heightMm * pxPerMm));

  const canvas = document.createElement("canvas");
  canvas.width = widthDots;
  canvas.height = heightDots;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado neste navegador.");

  // Desativar suavização para texto e bordas nítidos na térmica
  ctx.imageSmoothingEnabled = false;
  (ctx as CanvasRenderingContext2D & { textRendering?: string }).textRendering = "geometricPrecision";

  ctx.fillStyle = layout.background || "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const elements = layout.elements.slice().sort((a, b) => a.zIndex - b.zIndex);

  for (const el of elements) {
    const x = el.x * pxPerMm;
    const y = el.y * pxPerMm;
    const w = el.width * pxPerMm;
    const h = el.height * pxPerMm;
    const bw = Number(el.borderWidth ?? 0) || 0;
    const radius = (Number(el.borderRadius ?? 0) || 0) * pxPerMm;
    const opacity = Number(el.opacity ?? 1) || 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, opacity));
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(((el.rotation || 0) * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);

    if (el.background && el.background !== "transparent") {
      ctx.fillStyle = el.background;
      drawRoundedRect(ctx, 0, 0, w, h, radius);
      ctx.fill();
    }

    if (bw > 0 && el.borderStyle !== "none") {
      ctx.strokeStyle = el.borderColor || "#000000";
      ctx.lineWidth = bw;
      if (el.borderStyle === "dashed") ctx.setLineDash([bw * 3, bw * 2]);
      drawRoundedRect(ctx, bw / 2, bw / 2, Math.max(0, w - bw), Math.max(0, h - bw), radius);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const pad = (Number(el.paddingMm ?? (el.type === "image" ? 0 : 0.8)) || 0) * pxPerMm;
    const contentX = pad;
    const contentY = pad;
    const contentW = Math.max(1, w - pad * 2);
    const contentH = Math.max(1, h - pad * 2);

    if (el.type === "image") {
      const img = await loadImageSafe(el.imageUrl || "");
      if (img) {
        let dx = contentX;
        let dy = contentY;
        let dw = contentW;
        let dh = contentH;

        if (el.objectFit === "contain") {
          const scale = Math.min(contentW / img.width, contentH / img.height);
          dw = img.width * scale;
          dh = img.height * scale;
          dx = contentX + (contentW - dw) / 2;
          dy = contentY + (contentH - dh) / 2;
        } else if (el.objectFit === "cover") {
          const scale = Math.max(contentW / img.width, contentH / img.height);
          dw = img.width * scale;
          dh = img.height * scale;
          dx = contentX + (contentW - dw) / 2;
          dy = contentY + (contentH - dh) / 2;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.imageSmoothingEnabled = false;
      }
    } else {
      const fontSize = Math.max(4, Number(el.fontSize || 12));
      const weight = el.fontWeight || "bold";
      const pxFont = fontSize * (pxPerMm / 3.78);
      const lineHeight = pxFont * 1.18;

      ctx.fillStyle = el.color || "#000000";
      ctx.font = `${weight} ${pxFont}px Arial, Helvetica, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = el.textAlign || "center";

      const lines = wrapText(ctx, el.text || "", contentW);
      const totalTextH = lines.length * lineHeight;
      let ty = contentY + contentH / 2 - totalTextH / 2 + lineHeight / 2;

      const tx =
        el.textAlign === "left" ? contentX : el.textAlign === "right" ? contentX + contentW : contentX + contentW / 2;

      for (const line of lines) {
        ctx.fillText(line, tx, ty);
        ty += lineHeight;
      }
    }

    ctx.restore();
  }

  return canvas;
};

const getOtsuThreshold = (histogram: Uint32Array, total: number) => {
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 170;

  for (let i = 0; i < 256; i += 1) {
    wB += histogram[i];
    if (wB === 0) continue;

    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  return Math.max(150, Math.min(210, threshold + 18));
};

const canvasToEscPosRaster = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas inválido.");

  const width = canvas.width;
  const height = canvas.height;
  const bytesPerRow = Math.ceil(width / 8);
  const imageData = ctx.getImageData(0, 0, width, height).data;
  const raster = new Uint8Array(bytesPerRow * height);

  // 1) Converter para luminância e calcular corte automático.
  // Para térmica, pontilhado/dither deixa arte preto-e-branco com aspecto borrado;
  // limiar puro preserva letras, logos e bordas como a imagem real.
  const lum = new Uint8ClampedArray(width * height);
  const histogram = new Uint32Array(256);
  for (let i = 0, p = 0; i < lum.length; i += 1, p += 4) {
    const r = imageData[p];
    const g = imageData[p + 1];
    const b = imageData[p + 2];
    const a = imageData[p + 3];
    const value = a < 30 ? 255 : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lum[i] = value;
    histogram[value] += 1;
  }

  const threshold = getOtsuThreshold(histogram, lum.length);

  // 2) Preto/branco direto, sem difusão de erro: mais nítido em térmica.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (lum[i] < threshold) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        raster[byteIndex] |= 0x80 >> (x & 7);
      }
    }
  }

  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  const header = [0x1b, 0x40, 0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH];
  const footer = [0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00];

  const out = new Uint8Array(header.length + raster.length + footer.length);
  out.set(header, 0);
  out.set(raster, header.length);
  out.set(footer, header.length + raster.length);

  return out;
};

const AdminFreePrint = () => {
  const [layout, setLayout] = useState<FreeReceiptLayout | null>(null);
  const [rasterUrl, setRasterUrl] = useState("");
  const [printReady, setPrintReady] = useState(false);
  const [error, setError] = useState("");
  const [printed, setPrinted] = useState(false);
  const jobStartedRef = useRef(false);
  const printFiredRef = useRef(false);

  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get("mode") || "pdf";
  const copies = Math.max(1, Math.min(20, Number(searchParams.get("copies") || 1)));

  useEffect(() => {
    const load = async () => {
      const local = readLocalLayout();
      if (local) {
        setLayout(parseFreeReceiptLayout(local));
        return;
      }

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
    const runPrint = async () => {
      if (!layout || jobStartedRef.current) return;
      jobStartedRef.current = true;

      if (mode !== "pdf") {
        try {
          const settings = getThermalPrintSettings();
          const available = await isQzAvailable();

          if (available && settings.qzPrinterName) {
            const canvas = await renderLayoutToCanvas(layout, printHeightMm);
            const bytes = canvasToEscPosRaster(canvas);
            await printRawEscPos(settings.qzPrinterName, bytes, copies);
            setPrinted(true);
            clearPrintPayload();
            setTimeout(() => window.close(), 800);
            return;
          }
        } catch (err) {
          console.warn("[Comanda LIVRE] QZ raster falhou, usando PDF:", err);
        }
      }

      setPrintReady(true);
    };

    runPrint();
  }, [layout, mode, copies, printHeightMm]);

  useEffect(() => {
    if (!layout || !printReady || printFiredRef.current) return;
    printFiredRef.current = true;

    const firePrint = async () => {
      document.body.dataset.printDocument = "ready";
      await waitForPrintImages();
      setTimeout(() => {
        window.print();
        setPrinted(true);
        clearPrintPayload();
      }, 220);
    };

    firePrint();
  }, [layout, printReady]);

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

        .free-print-raster {
          display: block !important;
          width: ${layout.paperWidthMm}mm !important;
          height: ${printHeightMm}mm !important;
          margin: 0 !important;
          padding: 0 !important;
          object-fit: fill !important;
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
        {rasterUrl ? (
          <img src={rasterUrl} alt="Comanda livre" className="free-print-raster" />
        ) : (
          layout.elements
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
                      padding: `${Number(el.paddingMm ?? 0) || 0}mm`,
                      boxSizing: "border-box",
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
                      padding: `${Number(el.paddingMm ?? 0.8) || 0.8}mm`,
                      boxSizing: "border-box",
                    }}
                  >
                    {el.text}
                  </div>
                )}
              </div>
            ))
        )}
      </div>

      <div className="no-print" style={{ padding: 12, fontFamily: "monospace", textAlign: "center" }}>
        {printed
          ? "Comanda LIVRE enviada para impressão."
          : mode !== "pdf"
            ? "Gerando imagem raster para QZ Tray/POS-80..."
            : "Comanda LIVRE carregada. A impressão será aberta automaticamente."}
      </div>
    </>
  );
};

export default AdminFreePrint;
