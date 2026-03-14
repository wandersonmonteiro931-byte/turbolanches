import { useState, useEffect, useRef } from "react";
import { MapPin, Search, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DeliveryZone {
  neighborhood: string;
  delivery_fee: number;
  active: boolean;
  temp_free_delivery: boolean;
}

interface Props {
  value: string;
  onChange: (neighborhood: string, fee?: number) => void;
  placeholder?: string;
  className?: string;
  /** If true, allows selecting inactive zones (for admin) */
  allowInactive?: boolean;
  /** Change this value to force a data refresh */
  refreshKey?: number;
}

const NeighborhoodAutocomplete = ({
  value,
  onChange,
  placeholder = "Bairro",
  className = "",
  allowInactive = false,
  refreshKey = 0,
}: Props) => {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchZones = async () => {
      const { data } = await supabase
        .from("delivery_zones")
        .select("neighborhood, delivery_fee, active, temp_free_delivery")
        .order("neighborhood");
      if (data) setZones(data as DeliveryZone[]);
    };

    void fetchZones();
  }, [refreshKey]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = zones.filter((z) => z.neighborhood.toLowerCase().includes(query.toLowerCase()));

  const handleSelect = (zone: DeliveryZone) => {
    if (!zone.active && !allowInactive) return;
    setQuery(zone.neighborhood);
    onChange(zone.neighborhood, zone.temp_free_delivery ? 0 : zone.delivery_fee);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className={`flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 ${className}`}>
        <Search size={14} className="shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onChange(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {filtered.map((zone) => {
            const blocked = !zone.active && !allowInactive;
            const isPromoFree = Boolean(zone.temp_free_delivery);

            return (
              <button
                key={zone.neighborhood}
                type="button"
                onClick={() => handleSelect(zone)}
                disabled={blocked}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors ${
                  blocked ? "cursor-not-allowed bg-muted/30 opacity-50" : "cursor-pointer hover:bg-muted"
                } ${zone.neighborhood.toLowerCase() === query.toLowerCase() ? "bg-primary/5" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {blocked ? (
                    <Ban size={14} className="shrink-0 text-destructive" />
                  ) : (
                    <MapPin size={14} className="shrink-0 text-primary" />
                  )}
                  <span className={`truncate ${blocked ? "text-muted-foreground" : "text-foreground"}`}>{zone.neighborhood}</span>
                </div>

                <div className="ml-2 shrink-0 text-right">
                  {blocked ? (
                    <span className="text-[10px] font-semibold text-destructive">Não atendido</span>
                  ) : isPromoFree ? (
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-primary">Grátis</div>
                      <div className="text-[10px] font-semibold text-primary/80">Promoção</div>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-primary">R$ {Number(zone.delivery_fee).toFixed(2).replace(".", ",")}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && query.length > 0 && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card p-3 shadow-lg">
          <p className="text-center text-xs text-muted-foreground">Nenhum bairro encontrado</p>
        </div>
      )}
    </div>
  );
};

export default NeighborhoodAutocomplete;
