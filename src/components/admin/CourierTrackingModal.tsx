import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, X, Navigation, ExternalLink, RefreshCw } from "lucide-react";

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
  const [mapReady, setMapReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  const fetchLocation = useCallback(async () => {
    const { data } = await supabase
      .from("courier_locations" as any)
      .select("lat, lng, speed, heading, accuracy, updated_at")
      .eq("courier_id", courierId)
      .maybeSingle();
    if (data) setLocation(data as any);
    setLoading(false);
  }, [courierId]);

  // Init map imperatively
  useEffect(() => {
    if (!location || mapReady) return;
    const el = mapContainerRef.current;
    if (!el) return;

    let cancelled = false;

    const initMap = async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");

        if (cancelled || !el) return;

        leafletRef.current = L;

        // Fix default icon
        try {
          delete (L.Icon.Default.prototype as any)._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
            iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
            shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
          });
        } catch {}

        const map = L.map(el, {
          center: [location.lat, location.lng],
          zoom: 16,
          zoomControl: true,
          attributionControl: false,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

        const icon = L.icon({
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
        });

        const marker = L.marker([location.lat, location.lng], { icon }).addTo(map);
        marker.bindPopup(courierName);

        mapRef.current = map;
        markerRef.current = marker;
        setMapReady(true);

        // Force resize after render
        setTimeout(() => map.invalidateSize(), 200);
      } catch (err) {
        console.error("Leaflet init error:", err);
      }
    };

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
        markerRef.current = null;
        setMapReady(false);
      }
    };
  }, [location, mapReady, courierName]);

  // Update marker position when location changes
  useEffect(() => {
    if (!mapReady || !location || !mapRef.current || !markerRef.current) return;
    const latlng = [location.lat, location.lng] as [number, number];
    markerRef.current.setLatLng(latlng);
    mapRef.current.setView(latlng, mapRef.current.getZoom(), { animate: true });
  }, [location, mapReady]);

  // Fetch + subscribe
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

    const interval = setInterval(fetchLocation, 3000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(interval);
    };
  }, [courierId, fetchLocation]);

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Navigation size={20} className="text-primary" />
            Rastrear Entregador
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <p className="text-center text-sm font-bold text-foreground">🚚 {courierName}</p>

        {loading ? (
          <div className="py-8 text-center">
            <RefreshCw size={20} className="mx-auto animate-spin text-primary mb-2" />
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
            <div
              ref={mapContainerRef}
              className="rounded-xl overflow-hidden border border-border"
              style={{ height: 280, width: "100%" }}
            />

            <div className="rounded-xl border border-border bg-muted/30 p-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Velocidade</span>
                <p className="font-bold text-foreground">
                  {location.speed > 0 ? `${(location.speed * 3.6).toFixed(0)} km/h` : "Parado"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Precisão</span>
                <p className="font-bold text-foreground">~{location.accuracy.toFixed(0)}m</p>
              </div>
              <div className="col-span-2 flex items-center justify-between">
                <span className="text-muted-foreground">Atualizado</span>
                <span className="font-bold text-primary">{timeSince(location.updated_at)}</span>
              </div>
            </div>

            <button
              onClick={openInMaps}
              className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-foreground flex items-center justify-center gap-2"
            >
              <ExternalLink size={14} />
              Abrir no Google Maps
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
