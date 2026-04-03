import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, X, Navigation } from "lucide-react";

interface Props {
  courierId: string;
  courierName: string;
  onClose: () => void;
}

interface LocationData {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  accuracy: number;
  updated_at: string;
}

export default function CourierTrackingModal({ courierId, courierName, onClose }: Props) {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLocation = async () => {
    const { data } = await supabase
      .from("courier_locations" as any)
      .select("lat, lng, speed, heading, accuracy, updated_at")
      .eq("courier_id", courierId)
      .maybeSingle();
    if (data) {
      setLocation(data as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLocation();

    const ch = supabase
      .channel(`tracking-${courierId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "courier_locations",
        filter: `courier_id=eq.${courierId}`,
      }, (payload: any) => {
        const d = payload.new;
        if (d) {
          setLocation({
            lat: Number(d.lat),
            lng: Number(d.lng),
            speed: Number(d.speed || 0),
            heading: Number(d.heading || 0),
            accuracy: Number(d.accuracy || 0),
            updated_at: d.updated_at,
          });
        }
      })
      .subscribe();

    // Also poll every 3s as fallback
    const interval = setInterval(fetchLocation, 3000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(interval);
    };
  }, [courierId]);

  const timeSince = (dateStr: string) => {
    const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s atrás`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}min atrás`;
    return `${Math.floor(mins / 60)}h atrás`;
  };

  const openInMaps = () => {
    if (!location) return;
    window.open(`https://www.google.com/maps?q=${location.lat},${location.lng}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Navigation size={20} className="text-primary" />
            Rastrear Entregador
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <div className="text-center space-y-1">
          <p className="text-sm font-bold text-foreground">🚚 {courierName}</p>
        </div>

        {loading ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Buscando localização...</p>
          </div>
        ) : !location ? (
          <div className="py-8 text-center space-y-2">
            <MapPin size={32} className="mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Localização não disponível. O entregador precisa ativar o rastreamento no celular.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Latitude</span>
                <span className="font-mono font-bold text-foreground">{location.lat.toFixed(6)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Longitude</span>
                <span className="font-mono font-bold text-foreground">{location.lng.toFixed(6)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Velocidade</span>
                <span className="font-bold text-foreground">
                  {location.speed > 0 ? `${(location.speed * 3.6).toFixed(0)} km/h` : "Parado"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Precisão</span>
                <span className="font-bold text-foreground">~{location.accuracy.toFixed(0)}m</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Atualizado</span>
                <span className="font-bold text-primary">{timeSince(location.updated_at)}</span>
              </div>
            </div>

            <button
              onClick={openInMaps}
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground flex items-center justify-center gap-2"
            >
              <MapPin size={16} />
              Abrir no Google Maps
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-foreground"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
