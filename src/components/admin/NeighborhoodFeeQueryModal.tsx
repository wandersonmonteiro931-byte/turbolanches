import { useEffect, useRef, useState } from "react";
import { X, Search, Edit2, Save, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { normalizeSearch } from "@/lib/searchNormalize";

interface Zone {
  id: string;
  neighborhood: string;
  delivery_fee: number;
  active: boolean;
  temp_free_delivery: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NeighborhoodFeeQueryModal({ open, onClose }: Props) {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [zones, setZones] = useState<Zone[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const refocusSearch = () => {
    setEditingId(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const fetchZones = async () => {
    let q = supabase
      .from("delivery_zones")
      .select("id, neighborhood, delivery_fee, active, temp_free_delivery")
      .order("neighborhood");
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    if (data) setZones(data as Zone[]);
  };

  useEffect(() => {
    if (!open) return;
    void fetchZones();
    const channel = supabase
      .channel("zone-fee-query-modal")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_zones" }, () => void fetchZones())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, storeId]);

  if (!open) return null;

  const filtered = zones.filter((z) => normalizeSearch(z.neighborhood).includes(normalizeSearch(query)));

  const startEdit = (z: Zone) => {
    setEditingId(z.id);
    setEditValue(Number(z.delivery_fee).toFixed(2).replace(".", ","));
  };

  const saveEdit = async (id: string) => {
    const v = parseFloat(editValue.replace(",", "."));
    if (isNaN(v) || v < 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("delivery_zones")
      .update({ delivery_fee: v })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅ Taxa atualizada em todo o sistema!" });
    setEditingId(null);
    void fetchZones();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-card p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">🔎 Consultar Taxa de Entrega</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            ref={searchRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite o bairro..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Nenhum bairro encontrado</p>
          ) : (
            filtered.map((z) => (
              <div
                key={z.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  z.active ? "border-border bg-background" : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{z.neighborhood}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {!z.active && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive">
                        <Ban size={10} /> Inativo
                      </span>
                    )}
                    {z.temp_free_delivery && (
                      <span className="text-[10px] font-bold text-emerald-600">🎁 Promo Grátis</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {editingId === z.id ? (
                    <>
                      <span className="text-xs font-bold text-muted-foreground">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editValue}
                        onChange={(e) => {
                          // Allow only digits and a single separator (, or .)
                          let v = e.target.value.replace(/[^\d.,]/g, "");
                          // Keep only the first separator
                          const firstSep = v.search(/[.,]/);
                          if (firstSep !== -1) {
                            v = v.slice(0, firstSep + 1) + v.slice(firstSep + 1).replace(/[.,]/g, "");
                          }
                          setEditValue(v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveEdit(z.id);
                          if (e.key === "Escape") refocusSearch();
                        }}
                        onBlur={() => refocusSearch()}
                        autoFocus
                        className="w-20 rounded border border-border bg-background px-2 py-1 text-sm font-bold text-foreground"
                      />
                      <button
                        onClick={() => saveEdit(z.id)}
                        className="rounded-lg bg-primary p-1.5 text-primary-foreground hover:bg-primary/90"
                      >
                        <Save size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-bold text-primary tabular-nums">
                        R$ {Number(z.delivery_fee).toFixed(2).replace(".", ",")}
                      </span>
                      <button
                        onClick={() => startEdit(z)}
                        className="rounded-lg border border-border p-1.5 text-foreground hover:bg-muted"
                        title="Editar taxa"
                      >
                        <Edit2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
