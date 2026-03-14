import { useState, useEffect, useRef } from "react";
import { MapPin, Search, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DeliveryZone {
  neighborhood: string;
  delivery_fee: number;
  active: boolean;
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

const NeighborhoodAutocomplete = ({ value, onChange, placeholder = "Bairro", className = "", allowInactive = false }: Props) => {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch ALL zones (including inactive) for display
  useEffect(() => {
    if (loaded) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("delivery_zones")
        .select("neighborhood, delivery_fee, active")
        .order("neighborhood");
      if (data) setZones(data);
      setLoaded(true);
    };
    fetch();
  }, [loaded]);

  // Sync external value
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = zones.filter((z) =>
    z.neighborhood.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (zone: DeliveryZone) => {
    if (!zone.active && !allowInactive) return;
    setQuery(zone.neighborhood);
    onChange(zone.neighborhood, zone.delivery_fee);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className={`flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 ${className}`}>
        <Search size={14} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            // Also propagate raw text so parent stays in sync
            onChange(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {filtered.map((zone) => {
            const isInactive = !zone.active;
            const blocked = isInactive && !allowInactive;

            return (
              <button
                key={zone.neighborhood}
                type="button"
                onClick={() => handleSelect(zone)}
                disabled={blocked}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors ${
                  blocked
                    ? "opacity-50 cursor-not-allowed bg-muted/30"
                    : "hover:bg-muted cursor-pointer"
                } ${zone.neighborhood.toLowerCase() === query.toLowerCase() ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {blocked ? (
                    <Ban size={14} className="text-destructive shrink-0" />
                  ) : (
                    <MapPin size={14} className="text-primary shrink-0" />
                  )}
                  <span className={`truncate ${blocked ? "text-muted-foreground" : "text-foreground"}`}>
                    {zone.neighborhood}
                  </span>
                </div>
                <div className="shrink-0 ml-2">
                  {blocked ? (
                    <span className="text-[10px] font-semibold text-destructive">Não atendido</span>
                  ) : (
                    <span className="text-xs font-bold text-primary">
                      R$ {Number(zone.delivery_fee).toFixed(2).replace(".", ",")}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && query.length > 0 && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card p-3 shadow-lg">
          <p className="text-xs text-muted-foreground text-center">Nenhum bairro encontrado</p>
        </div>
      )}
    </div>
  );
};

export default NeighborhoodAutocomplete;
