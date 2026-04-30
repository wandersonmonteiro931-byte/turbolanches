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
  dropdownClassName?: string;
  /** If true, allows selecting inactive zones (for admin) */
  allowInactive?: boolean;
  /** Change this value to force a data refresh */
  refreshKey?: number;
  /** Use the kiosk/PDV color palette and typography */
  variant?: "default" | "kiosk";
}

const NeighborhoodAutocomplete = ({
  value,
  onChange,
  placeholder = "Bairro",
  className = "",
  dropdownClassName = "",
  allowInactive = false,
  refreshKey = 0,
  variant = "default",
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

    const channel = supabase
      .channel("delivery_zones_autocomplete")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_zones" }, () => {
        void fetchZones();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
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

  const isKiosk = variant === "kiosk";

  // Kiosk palette mirrors AdminManualOrder (PDV)
  const k = {
    wrapper: "border-[hsl(199_76%_36%)] bg-[hsl(204_80%_16%)]",
    icon: "text-[hsl(198_70%_84%)]",
    input: "text-[12px] font-black uppercase text-[hsl(0_0%_100%)] placeholder:text-[hsl(198_70%_84%)] placeholder:font-bold placeholder:uppercase",
    dropdown: "border-[hsl(199_78%_18%)] bg-[hsl(204_80%_16%)] rounded-none shadow-xl",
    item: "border-b border-[hsl(199_78%_18%)] last:border-b-0",
    itemHover: "hover:bg-[hsl(203_88%_22%)]",
    itemSelected: "bg-[hsl(203_88%_22%)]",
    itemBlocked: "bg-[hsl(204_80%_12%)] opacity-60 cursor-not-allowed",
    name: "text-[12px] font-black uppercase text-[hsl(0_0%_100%)] tracking-wide",
    nameBlocked: "text-[12px] font-black uppercase text-[hsl(198_30%_60%)] tracking-wide line-through",
    price: "text-[12px] font-black text-[hsl(43_95%_55%)]",
    priceFree: "text-[12px] font-black text-[hsl(142_70%_55%)]",
    priceBlocked: "text-[10px] font-black uppercase text-[hsl(0_72%_61%)]",
    promoLabel: "text-[9px] font-black uppercase text-[hsl(142_70%_75%)]",
    empty: "text-[11px] font-black uppercase text-[hsl(198_70%_84%)]",
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className={`flex items-center gap-2 border px-3 py-2.5 ${isKiosk ? k.wrapper : "rounded-lg border-border bg-background"} ${className}`}>
        <Search size={14} className={`shrink-0 ${isKiosk ? k.icon : "text-muted-foreground"}`} />
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
          className={`flex-1 bg-transparent focus:outline-none ${isKiosk ? k.input : "text-sm text-foreground placeholder:text-muted-foreground"}`}
        />
      </div>

      {open && filtered.length > 0 && (
        <div className={`absolute z-50 mt-1 max-h-72 w-full overflow-y-auto border ${isKiosk ? k.dropdown : "rounded-xl border-border bg-card shadow-lg"} ${dropdownClassName}`}>
          {filtered.map((zone) => {
            const blocked = !zone.active && !allowInactive;
            const isPromoFree = Boolean(zone.temp_free_delivery);
            const selected = zone.neighborhood.toLowerCase() === query.toLowerCase();

            const itemClass = isKiosk
              ? `flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${k.item} ${
                  blocked ? k.itemBlocked : `cursor-pointer ${k.itemHover}`
                } ${selected && !blocked ? k.itemSelected : ""}`
              : `flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                  blocked ? "cursor-not-allowed bg-muted/30 opacity-50" : "cursor-pointer hover:bg-muted"
                } ${selected ? "bg-primary/5" : ""}`;

            return (
              <button key={zone.neighborhood} type="button" onClick={() => handleSelect(zone)} disabled={blocked} className={itemClass}>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {blocked ? (
                    <Ban size={14} className={`shrink-0 ${isKiosk ? "text-[hsl(0_72%_61%)]" : "text-admin-primary"}`} />
                  ) : (
                    <MapPin size={14} className={`shrink-0 ${isKiosk ? "text-[hsl(43_95%_55%)]" : "text-primary"}`} />
                  )}
                  <span
                    className={
                      isKiosk
                        ? blocked ? k.nameBlocked : k.name
                        : `whitespace-normal break-words leading-snug ${blocked ? "text-muted-foreground" : "text-foreground"}`
                    }
                  >
                    {zone.neighborhood}
                  </span>
                </div>

                <div className="ml-2 shrink-0 text-right">
                  {blocked ? (
                    <span className={isKiosk ? k.priceBlocked : "text-[10px] font-semibold text-admin-primary"}>Não atendido</span>
                  ) : isPromoFree ? (
                    <div className="space-y-0.5">
                      <div className={isKiosk ? k.priceFree : "text-xs font-bold text-primary"}>Grátis</div>
                      <div className={isKiosk ? k.promoLabel : "text-[10px] font-semibold text-primary/80"}>Promoção</div>
                    </div>
                  ) : (
                    <span className={isKiosk ? k.price : "text-xs font-bold text-primary"}>R$ {Number(zone.delivery_fee).toFixed(2).replace(".", ",")}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && query.length > 0 && filtered.length === 0 && (
        <div className={`absolute z-50 mt-1 w-full p-3 border ${isKiosk ? k.dropdown : "rounded-xl border-border bg-card shadow-lg"}`}>
          <p className={`text-center ${isKiosk ? k.empty : "text-xs text-muted-foreground"}`}>Nenhum bairro encontrado</p>
        </div>
      )}
    </div>
  );
};

export default NeighborhoodAutocomplete;
