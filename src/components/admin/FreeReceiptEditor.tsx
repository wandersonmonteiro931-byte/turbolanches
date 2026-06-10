import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Move, Plus, RotateCcw, Save, Trash2, Type, Upload } from "lucide-react";
import { uploadImage } from "@/lib/uploadImage";
import { toast } from "sonner";

export type FreeReceiptElementType = "text" | "image";

export interface FreeReceiptElement {
  id: string;
  type: FreeReceiptElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  text?: string;
  imageUrl?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold" | "900";
  textAlign?: "left" | "center" | "right";
  color?: string;
  background?: string;
  objectFit?: "contain" | "cover" | "fill";
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: "none" | "solid" | "dashed";
  borderRadius?: number;
  paddingMm?: number;
  opacity?: number;
}

export interface FreeReceiptLayout {
  version: 1;
  paperWidthMm: number;
  designHeightMm: number;
  cutYmm: number;
  background: string;
  elements: FreeReceiptElement[];
}

const DEFAULT_LAYOUT: FreeReceiptLayout = {
  version: 1,
  paperWidthMm: 72,
  designHeightMm: 160,
  cutYmm: 140,
  background: "#ffffff",
  elements: [
    {
      id: "title",
      type: "text",
      x: 4,
      y: 8,
      width: 64,
      height: 16,
      rotation: 0,
      zIndex: 1,
      text: "TURBO LANCHES",
      fontSize: 18,
      fontWeight: "900",
      textAlign: "center",
      color: "#000000",
      background: "transparent",
      borderWidth: 0,
      borderColor: "#000000",
      borderStyle: "solid",
      borderRadius: 0,
      paddingMm: 1,
      opacity: 1,
    },
    {
      id: "line",
      type: "text",
      x: 4,
      y: 30,
      width: 64,
      height: 10,
      rotation: 0,
      zIndex: 2,
      text: "Digite ou adicione imagens livremente",
      fontSize: 9,
      fontWeight: "bold",
      textAlign: "center",
      color: "#000000",
      background: "transparent",
      borderWidth: 0,
      borderColor: "#000000",
      borderStyle: "solid",
      borderRadius: 0,
      paddingMm: 0.8,
      opacity: 1,
    },
  ],
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const parseFreeReceiptLayout = (value?: string | null): FreeReceiptLayout => {
  if (!value) return DEFAULT_LAYOUT;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.version === 1 && Array.isArray(parsed.elements)) {
      return {
        ...DEFAULT_LAYOUT,
        ...parsed,
        paperWidthMm: clamp(Number(parsed.paperWidthMm) || 72, 48, 90),
        designHeightMm: clamp(Number(parsed.designHeightMm) || 160, 60, 600),
        cutYmm: clamp(Number(parsed.cutYmm) || 140, 20, 600),
        elements: parsed.elements.map((el: any, index: number) => ({
          id: String(el.id || `el_${index}`),
          type: el.type === "image" ? "image" : "text",
          x: Number(el.x) || 0,
          y: Number(el.y) || 0,
          width: Number(el.width) || 40,
          height: Number(el.height) || 16,
          rotation: Number(el.rotation) || 0,
          zIndex: Number(el.zIndex) || index + 1,
          text: String(el.text || ""),
          imageUrl: String(el.imageUrl || ""),
          fontSize: Number(el.fontSize) || 12,
          fontWeight:
            el.fontWeight === "normal" || el.fontWeight === "bold" || el.fontWeight === "900" ? el.fontWeight : "bold",
          textAlign:
            el.textAlign === "left" || el.textAlign === "right" || el.textAlign === "center" ? el.textAlign : "center",
          color: String(el.color || "#000000"),
          background: String(el.background || "transparent"),
          objectFit:
            el.objectFit === "cover" || el.objectFit === "fill" || el.objectFit === "contain"
              ? el.objectFit
              : "contain",
          borderWidth: clamp(Number(el.borderWidth ?? 0) || 0, 0, 12),
          borderColor: String(el.borderColor || "#000000"),
          borderStyle:
            el.borderStyle === "dashed" || el.borderStyle === "none" || el.borderStyle === "solid"
              ? el.borderStyle
              : "solid",
          borderRadius: clamp(Number(el.borderRadius ?? 0) || 0, 0, 20),
          paddingMm: clamp(Number(el.paddingMm ?? 0.8) || 0.8, 0, 10),
          opacity: clamp(Number(el.opacity ?? 1) || 1, 0.05, 1),
        })),
      };
    }
  } catch {}
  return DEFAULT_LAYOUT;
};

const serializeLayout = (layout: FreeReceiptLayout) => JSON.stringify(layout, null, 2);
const newId = () => `el_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

interface FreeReceiptEditorProps {
  value?: string | null;
  onChange: (next: string) => void;
}

const FreeReceiptEditor = ({ value, onChange }: FreeReceiptEditorProps) => {
  const [layout, setLayout] = useState<FreeReceiptLayout>(() => parseFreeReceiptLayout(value));
  const [selectedId, setSelectedId] = useState<string | null>(
    () => parseFreeReceiptLayout(value).elements[0]?.id ?? null,
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingCut, setDraggingCut] = useState(false);
  const [resizing, setResizing] = useState<any>(null);
  const [rotating, setRotating] = useState<any>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; elX: number; elY: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSerializedRef = useRef<string>(serializeLayout(layout));
  const pendingSerializedRef = useRef<string | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const flushPendingChange = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    if (!pendingSerializedRef.current) return;
    const next = pendingSerializedRef.current;
    pendingSerializedRef.current = null;
    onChangeRef.current(next);
  }, []);

  // Push initial serialization to parent so the form's body_template is in sync
  // even if the user clicks Salvar without editing anything.
  useEffect(() => {
    onChangeRef.current(lastSerializedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof value !== "string") return;
    if (value === lastSerializedRef.current) return;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    pendingSerializedRef.current = null;
    const parsed = parseFreeReceiptLayout(value);
    const reserialized = serializeLayout(parsed);
    if (reserialized === lastSerializedRef.current) return;
    lastSerializedRef.current = reserialized;
    setLayout(parsed);
    setSelectedId((current) => current || parsed.elements[0]?.id || null);
  }, [value]);

  useEffect(() => {
    const serialized = serializeLayout(layout);
    if (serialized === lastSerializedRef.current) return;
    lastSerializedRef.current = serialized;
    pendingSerializedRef.current = serialized;

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      if (!pendingSerializedRef.current) return;
      const next = pendingSerializedRef.current;
      pendingSerializedRef.current = null;
      onChangeRef.current(next);
    }, 160);

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [layout]);

  const selected = layout.elements.find((el) => el.id === selectedId) || null;

  const updateLayout = (updater: (current: FreeReceiptLayout) => FreeReceiptLayout) => {
    setLayout((current) => {
      const next = updater(current);
      return {
        ...next,
        cutYmm: clamp(next.cutYmm, 15, next.designHeightMm),
        designHeightMm: Math.max(next.designHeightMm, next.cutYmm),
      };
    });
  };

  const updateSelected = (patch: Partial<FreeReceiptElement>) => {
    if (!selectedId) return;
    updateLayout((current) => ({
      ...current,
      elements: current.elements.map((el) => (el.id === selectedId ? { ...el, ...patch } : el)),
    }));
  };

  const changeSelectedNumber = (key: keyof FreeReceiptElement, delta: number, min = -999, max = 999) => {
    if (!selected) return;
    const currentValue = Number((selected as any)[key] ?? 0);
    updateSelected({ [key]: clamp(currentValue + delta, min, max) } as Partial<FreeReceiptElement>);
  };

  const addText = () => {
    const id = newId();
    updateLayout((current) => ({
      ...current,
      elements: [
        ...current.elements,
        {
          id,
          type: "text",
          x: 6,
          y: Math.min(current.cutYmm - 15, 20 + current.elements.length * 8),
          width: current.paperWidthMm - 12,
          height: 14,
          rotation: 0,
          zIndex: current.elements.length + 1,
          text: "Novo texto",
          fontSize: 12,
          fontWeight: "bold",
          textAlign: "center",
          color: "#000000",
          background: "transparent",
          borderWidth: 0,
          borderColor: "#000000",
          borderStyle: "solid",
          borderRadius: 0,
          paddingMm: 0.8,
          opacity: 1,
        },
      ],
    }));
    setSelectedId(id);
  };

  const addImage = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImage(file, "receipt-free");
      if (!url) {
        toast.error("Não foi possível enviar a imagem.");
        return;
      }

      const id = newId();
      updateLayout((current) => ({
        ...current,
        elements: [
          ...current.elements,
          {
            id,
            type: "image",
            x: 8,
            y: Math.min(current.cutYmm - 35, 18 + current.elements.length * 8),
            width: current.paperWidthMm - 16,
            height: 35,
            rotation: 0,
            zIndex: current.elements.length + 1,
            imageUrl: url,
            objectFit: "contain",
            background: "transparent",
            borderWidth: 0,
            borderColor: "#000000",
            borderStyle: "solid",
            borderRadius: 0,
            paddingMm: 0,
            opacity: 1,
          },
        ],
      }));
      setSelectedId(id);
      toast.success("Imagem adicionada na comanda livre.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const id = newId();
    updateLayout((current) => ({
      ...current,
      elements: [
        ...current.elements,
        {
          ...selected,
          id,
          x: selected.x + 3,
          y: selected.y + 3,
          zIndex: current.elements.length + 1,
        },
      ],
    }));
    setSelectedId(id);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    updateLayout((current) => ({
      ...current,
      elements: current.elements.filter((el) => el.id !== selectedId),
    }));
    setSelectedId(null);
  };

  const moveLayer = (dir: "front" | "back") => {
    if (!selected) return;
    const values = layout.elements.map((el) => el.zIndex);
    const nextZ = dir === "front" ? Math.max(...values, 0) + 1 : Math.min(...values, 0) - 1;
    updateSelected({ zIndex: nextZ });
  };

  const getPointMm = (event: any) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * layout.paperWidthMm,
      y: ((event.clientY - rect.top) / rect.height) * layout.designHeightMm,
    };
  };

  const startDrag = (event: any, el: FreeReceiptElement) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(el.id);
    setDraggingId(el.id);
    const p = getPointMm(event);
    setDragStart({ x: p.x, y: p.y, elX: el.x, elY: el.y });
  };

  const startResize = (event: any, el: FreeReceiptElement, handle: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(el.id);
    const p = getPointMm(event);
    setResizing({
      id: el.id,
      handle,
      startX: p.x,
      startY: p.y,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
    });
  };

  const startRotate = (event: any, el: FreeReceiptElement) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(el.id);
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const centerX = rect.left + ((el.x + el.width / 2) / layout.paperWidthMm) * rect.width;
    const centerY = rect.top + ((el.y + el.height / 2) / layout.designHeightMm) * rect.height;
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);

    setRotating({
      id: el.id,
      centerX,
      centerY,
      startAngle,
      rotation: el.rotation || 0,
    });
  };

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (resizing) {
        const p = getPointMm(event);
        const dx = p.x - resizing.startX;
        const dy = p.y - resizing.startY;

        updateLayout((current) => ({
          ...current,
          elements: current.elements.map((el) => {
            if (el.id !== resizing.id) return el;

            let nextX = resizing.x;
            let nextY = resizing.y;
            let nextW = resizing.width;
            let nextH = resizing.height;

            if (resizing.handle.includes("e")) nextW = resizing.width + dx;
            if (resizing.handle.includes("s")) nextH = resizing.height + dy;
            if (resizing.handle.includes("w")) {
              nextX = resizing.x + dx;
              nextW = resizing.width - dx;
            }
            if (resizing.handle.includes("n")) {
              nextY = resizing.y + dy;
              nextH = resizing.height - dy;
            }

            nextW = clamp(nextW, 4, current.paperWidthMm * 2);
            nextH = clamp(nextH, 4, current.designHeightMm);
            nextX = clamp(nextX, -20, current.paperWidthMm + 20);
            nextY = clamp(nextY, -20, current.designHeightMm + 20);

            return { ...el, x: nextX, y: nextY, width: nextW, height: nextH };
          }),
        }));
        return;
      }

      if (rotating) {
        const angle = Math.atan2(event.clientY - rotating.centerY, event.clientX - rotating.centerX) * (180 / Math.PI);
        const delta = angle - rotating.startAngle;
        updateLayout((current) => ({
          ...current,
          elements: current.elements.map((el) =>
            el.id === rotating.id ? { ...el, rotation: Math.round(rotating.rotation + delta) } : el,
          ),
        }));
        return;
      }

      if (draggingCut) {
        const p = getPointMm(event);
        updateLayout((current) => ({ ...current, cutYmm: clamp(p.y, 20, current.designHeightMm) }));
        return;
      }

      if (!draggingId || !dragStart) return;
      const p = getPointMm(event);
      const dx = p.x - dragStart.x;
      const dy = p.y - dragStart.y;

      updateLayout((current) => ({
        ...current,
        elements: current.elements.map((el) =>
          el.id === draggingId
            ? {
                ...el,
                x: clamp(dragStart.elX + dx, -20, current.paperWidthMm + 20),
                y: clamp(dragStart.elY + dy, -20, current.designHeightMm + 20),
              }
            : el,
        ),
      }));
    };

    const onUp = () => {
      setDraggingId(null);
      setDraggingCut(false);
      setResizing(null);
      setRotating(null);
      setDragStart(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingId, dragStart, draggingCut, resizing, rotating, layout.paperWidthMm, layout.designHeightMm]);

  const renderElement = (el: FreeReceiptElement) => {
    const selectedClass = selectedId === el.id ? "ring-2 ring-primary ring-offset-1" : "ring-1 ring-transparent";
    const borderWidth = Number(el.borderWidth ?? 0) || 0;
    const commonStyle = {
      position: "absolute" as const,
      left: `${el.x}mm`,
      top: `${el.y}mm`,
      width: `${el.width}mm`,
      height: `${el.height}mm`,
      transform: `rotate(${el.rotation}deg)`,
      transformOrigin: "center center",
      zIndex: el.zIndex,
      cursor: draggingId === el.id ? "grabbing" : "grab",
      overflow: "hidden",
      background: el.background || "transparent",
      color: el.color || "#000",
      boxSizing: "border-box" as const,
      border:
        borderWidth > 0 && el.borderStyle !== "none"
          ? `${borderWidth}px ${el.borderStyle || "solid"} ${el.borderColor || "#000000"}`
          : "none",
      borderRadius: `${Number(el.borderRadius ?? 0) || 0}mm`,
      opacity: Number(el.opacity ?? 1) || 1,
    };

    return (
      <div
        key={el.id}
        onMouseDown={(event) => startDrag(event, el)}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedId(el.id);
        }}
        className={`group ${selectedClass}`}
        style={commonStyle}
      >
        {el.type === "image" ? (
          <img
            src={el.imageUrl}
            alt=""
            draggable={false}
            className="h-full w-full select-none"
            style={{
              objectFit: el.objectFit === "fill" ? "fill" : el.objectFit || "contain",
              padding: `${Number(el.paddingMm ?? 0) || 0}mm`,
              boxSizing: "border-box",
            }}
          />
        ) : (
          <div
            className="flex h-full w-full whitespace-pre-wrap break-words"
            style={{
              alignItems: "center",
              justifyContent: el.textAlign === "right" ? "flex-end" : el.textAlign === "left" ? "flex-start" : "center",
              textAlign: el.textAlign || "center",
              fontSize: `${el.fontSize || 12}px`,
              fontWeight: el.fontWeight || "bold",
              lineHeight: 1.15,
              padding: `${Number(el.paddingMm ?? 0.8) || 0.8}mm`,
              boxSizing: "border-box",
            }}
          >
            {el.text}
          </div>
        )}

        {selectedId === el.id ? (
          <>
            <button
              type="button"
              onMouseDown={(event) => startRotate(event, el)}
              className="absolute -top-7 left-1/2 z-[10000] h-5 w-5 -translate-x-1/2 rounded-full bg-red-600 text-[10px] font-black text-white shadow"
              title="Arraste para girar"
            >
              ↻
            </button>

            {[
              ["nw", "-left-2 -top-2 cursor-nwse-resize"],
              ["n", "left-1/2 -top-2 -translate-x-1/2 cursor-ns-resize"],
              ["ne", "-right-2 -top-2 cursor-nesw-resize"],
              ["e", "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize"],
              ["se", "-right-2 -bottom-2 cursor-nwse-resize"],
              ["s", "left-1/2 -bottom-2 -translate-x-1/2 cursor-ns-resize"],
              ["sw", "-left-2 -bottom-2 cursor-nesw-resize"],
              ["w", "-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize"],
            ].map(([handle, cls]) => (
              <button
                key={handle}
                type="button"
                onMouseDown={(event) => startResize(event, el, handle)}
                className={`absolute z-[10000] h-4 w-4 rounded-sm border border-white bg-red-600 shadow ${cls}`}
                title="Arraste para aumentar/diminuir"
              />
            ))}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4 rounded-2xl border border-primary/20 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black">Editor Livre de Comanda</h3>
          <p className="text-xs text-muted-foreground">
            Monte texto e imagens exatamente onde serão impressos. A linha vermelha define o corte.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addText}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
          >
            <Type size={14} /> Texto
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background disabled:opacity-50"
          >
            <ImageIcon size={14} /> {uploading ? "Enviando..." : "Imagem"}
          </button>
          <button
            type="button"
            onClick={duplicateSelected}
            disabled={!selected}
            className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            Duplicar
          </button>
          <button
            type="button"
            onClick={removeSelected}
            disabled={!selected}
            className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-bold text-destructive disabled:opacity-40"
          >
            <Trash2 size={14} /> Excluir
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) addImage(file);
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="overflow-auto rounded-xl bg-muted p-4">
          <div className="mx-auto w-fit">
            <div
              ref={stageRef}
              onClick={() => setSelectedId(null)}
              className="relative bg-white shadow-2xl"
              style={{
                width: `${layout.paperWidthMm * 5}px`,
                height: `${layout.designHeightMm * 5}px`,
                background: layout.background,
              }}
            >
              <div
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDraggingCut(true);
                }}
                className="absolute left-0 right-0 z-[9999] flex cursor-row-resize items-center"
                style={{ top: `${layout.cutYmm}mm` }}
                title="Arraste para definir onde o papel será cortado"
              >
                <div className="h-[2px] flex-1 bg-red-600" />
                <div className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                  CORTE {layout.cutYmm.toFixed(1)}mm
                </div>
                <div className="h-[2px] flex-1 bg-red-600" />
              </div>

              {layout.elements
                .slice()
                .sort((a, b) => a.zIndex - b.zIndex)
                .map(renderElement)}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border bg-background p-3">
          <div className="flex items-center gap-2 text-sm font-black">
            <Move size={16} /> Propriedades
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-semibold">
              Papel mm
              <input
                type="number"
                value={layout.paperWidthMm}
                onChange={(e) => updateLayout((c) => ({ ...c, paperWidthMm: clamp(Number(e.target.value), 48, 90) }))}
                className="h-9 w-full rounded border bg-background px-2"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Altura mm
              <input
                type="number"
                value={layout.designHeightMm}
                onChange={(e) =>
                  updateLayout((c) => ({ ...c, designHeightMm: clamp(Number(e.target.value), 60, 600) }))
                }
                className="h-9 w-full rounded border bg-background px-2"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold col-span-2">
              Linha de corte mm
              <input
                type="number"
                value={Number(layout.cutYmm.toFixed(1))}
                onChange={(e) =>
                  updateLayout((c) => ({ ...c, cutYmm: clamp(Number(e.target.value), 20, c.designHeightMm) }))
                }
                className="h-9 w-full rounded border bg-background px-2"
              />
            </label>
          </div>

          {selected ? (
            <>
              <div className="border-t pt-3 text-xs font-bold text-muted-foreground">Item selecionado</div>
              <div className="grid grid-cols-2 gap-2">
                {(["x", "y", "width", "height", "rotation"] as const).map((key) => (
                  <label key={key} className="space-y-1 text-xs font-semibold">
                    {key === "rotation" ? "Girar" : key.toUpperCase()}
                    <input
                      type="number"
                      value={Number(Number(selected[key] || 0).toFixed(1))}
                      onChange={(e) => updateSelected({ [key]: Number(e.target.value) } as Partial<FreeReceiptElement>)}
                      className="h-9 w-full rounded border bg-background px-2"
                    />
                  </label>
                ))}
                <label className="space-y-1 text-xs font-semibold">
                  Camada
                  <input
                    type="number"
                    value={Number(selected.zIndex)}
                    onChange={(e) => updateSelected({ zIndex: Number(e.target.value) })}
                    className="h-9 w-full rounded border bg-background px-2"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => changeSelectedNumber("width", -2, 5, 300)}
                  className="rounded border px-2 py-2 text-xs font-bold"
                >
                  Largura -
                </button>
                <button
                  type="button"
                  onClick={() => changeSelectedNumber("width", 2, 5, 300)}
                  className="rounded border px-2 py-2 text-xs font-bold"
                >
                  Largura +
                </button>
                <button
                  type="button"
                  onClick={() => changeSelectedNumber("height", -2, 5, 300)}
                  className="rounded border px-2 py-2 text-xs font-bold"
                >
                  Altura -
                </button>
                <button
                  type="button"
                  onClick={() => changeSelectedNumber("height", 2, 5, 300)}
                  className="rounded border px-2 py-2 text-xs font-bold"
                >
                  Altura +
                </button>
                <button
                  type="button"
                  onClick={() => changeSelectedNumber("rotation", -5, -360, 360)}
                  className="rounded border px-2 py-2 text-xs font-bold"
                >
                  Girar -5°
                </button>
                <button
                  type="button"
                  onClick={() => changeSelectedNumber("rotation", 5, -360, 360)}
                  className="rounded border px-2 py-2 text-xs font-bold"
                >
                  Girar +5°
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs font-semibold">
                  Borda px
                  <input
                    type="number"
                    value={Number(selected.borderWidth ?? 0)}
                    onChange={(e) => updateSelected({ borderWidth: clamp(Number(e.target.value), 0, 12) })}
                    className="h-9 w-full rounded border bg-background px-2"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Raio da borda mm
                  <input
                    type="number"
                    value={Number(selected.borderRadius ?? 0)}
                    onChange={(e) => updateSelected({ borderRadius: clamp(Number(e.target.value), 0, 20) })}
                    className="h-9 w-full rounded border bg-background px-2"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Estilo da borda
                  <select
                    value={selected.borderStyle || "solid"}
                    onChange={(e) =>
                      updateSelected({ borderStyle: e.target.value as FreeReceiptElement["borderStyle"] })
                    }
                    className="h-9 w-full rounded border bg-background px-2"
                  >
                    <option value="none">Sem borda</option>
                    <option value="solid">Contínua</option>
                    <option value="dashed">Tracejada</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Cor da borda
                  <input
                    type="color"
                    value={selected.borderColor || "#000000"}
                    onChange={(e) => updateSelected({ borderColor: e.target.value })}
                    className="h-9 w-full rounded border bg-background"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Espaço interno mm
                  <input
                    type="number"
                    value={Number(selected.paddingMm ?? (selected.type === "image" ? 0 : 0.8))}
                    onChange={(e) => updateSelected({ paddingMm: clamp(Number(e.target.value), 0, 10) })}
                    className="h-9 w-full rounded border bg-background px-2"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Opacidade
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    max="1"
                    value={Number(selected.opacity ?? 1)}
                    onChange={(e) => updateSelected({ opacity: clamp(Number(e.target.value), 0.05, 1) })}
                    className="h-9 w-full rounded border bg-background px-2"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => moveLayer("front")}
                  className="rounded border px-2 py-2 text-xs font-bold"
                >
                  Frente
                </button>
                <button
                  type="button"
                  onClick={() => moveLayer("back")}
                  className="rounded border px-2 py-2 text-xs font-bold"
                >
                  Fundo
                </button>
              </div>

              {selected.type === "text" ? (
                <div className="space-y-2">
                  <label className="space-y-1 text-xs font-semibold">
                    Texto
                    <textarea
                      value={selected.text || ""}
                      onChange={(e) => updateSelected({ text: e.target.value })}
                      className="min-h-[90px] w-full rounded border bg-background p-2 text-xs"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs font-semibold">
                      Fonte
                      <input
                        type="number"
                        value={selected.fontSize || 12}
                        onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })}
                        className="h-9 w-full rounded border bg-background px-2"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-semibold">
                      Peso
                      <select
                        value={selected.fontWeight || "bold"}
                        onChange={(e) =>
                          updateSelected({ fontWeight: e.target.value as FreeReceiptElement["fontWeight"] })
                        }
                        className="h-9 w-full rounded border bg-background px-2"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Negrito</option>
                        <option value="900">Muito forte</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-semibold">
                      Alinhar
                      <select
                        value={selected.textAlign || "center"}
                        onChange={(e) =>
                          updateSelected({ textAlign: e.target.value as FreeReceiptElement["textAlign"] })
                        }
                        className="h-9 w-full rounded border bg-background px-2"
                      >
                        <option value="left">Esquerda</option>
                        <option value="center">Centro</option>
                        <option value="right">Direita</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-semibold">
                      Cor do texto
                      <input
                        type="color"
                        value={selected.color || "#000000"}
                        onChange={(e) => updateSelected({ color: e.target.value })}
                        className="h-9 w-full rounded border bg-background"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-semibold col-span-2">
                      Fundo do item
                      <input
                        type="color"
                        value={
                          selected.background && selected.background !== "transparent" ? selected.background : "#ffffff"
                        }
                        onChange={(e) => updateSelected({ background: e.target.value })}
                        className="h-9 w-full rounded border bg-background"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs font-semibold">
                    Encaixe
                    <select
                      value={selected.objectFit || "contain"}
                      onChange={(e) => updateSelected({ objectFit: e.target.value as FreeReceiptElement["objectFit"] })}
                      className="h-9 w-full rounded border bg-background px-2"
                    >
                      <option value="contain">Inteira</option>
                      <option value="cover">Preencher</option>
                      <option value="fill">Esticar</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="mt-5 flex items-center justify-center gap-2 rounded border px-2 py-2 text-xs font-bold"
                  >
                    <Upload size={14} /> Trocar
                  </button>
                  <label className="space-y-1 text-xs font-semibold col-span-2">
                    Fundo da imagem
                    <input
                      type="color"
                      value={
                        selected.background && selected.background !== "transparent" ? selected.background : "#ffffff"
                      }
                      onChange={(e) => updateSelected({ background: e.target.value })}
                      className="h-9 w-full rounded border bg-background"
                    />
                  </label>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              Clique em um texto ou imagem para editar tamanho, posição, rotação, borda, fundo e camada.
            </div>
          )}

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <b>Importante:</b> agora cada item pode ter borda, raio, espaço interno, fundo, ajuste de tamanho e rotação.
          </div>
        </div>
      </div>
    </div>
  );
};

export default FreeReceiptEditor;
