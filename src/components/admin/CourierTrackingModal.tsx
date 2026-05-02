import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, X, Navigation, ExternalLink, RefreshCw } from "lucide-react";

interface Props {
  courierId: string;
  courierName: string;
  destinationAddress?: string;
  destinationNeighborhood?: string;
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

export default function CourierTrackingModal({ courierId, courierName, destinationAddress, destinationNeighborhood, onClose }: Props) {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const initDoneRef = useRef(false);
  const locationHistoryRef = useRef<[number, number][]>([]);
  const trailLineRef = useRef<any>(null);

  const fetchLocation = useCallback(async () => {
    const { data } = await supabase
      .from("courier_locations" as any)
      .select("lat, lng, speed, heading, accuracy, updated_at")
      .eq("courier_id", courierId)
      .maybeSingle();
    if (data) setLocation(data as any);
    setLoading(false);
  }, [courierId]);

  // Geocode destination once
  const geocodeDestination = useCallback(async (L: any, map: any) => {
    if (!destinationAddress || destMarkerRef.current) return;
    const query = `${destinationAddress}${destinationNeighborhood ? ", " + destinationNeighborhood : ""}`;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
      const results = await res.json();
      if (results.length > 0) {
        const destLat = parseFloat(results[0].lat);
        const destLng = parseFloat(results[0].lon);

        const destIcon = L.divIcon({
          className: "",
          html: `<div style="background:#ef4444;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏠</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        destMarkerRef.current = L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
        destMarkerRef.current.bindPopup(`Destino: ${query}`);

        // Draw route line from courier to destination
        if (markerRef.current) {
          const courierPos = markerRef.current.getLatLng();
          routeLineRef.current = L.polyline(
            [[courierPos.lat, courierPos.lng], [destLat, destLng]],
            { color: "#ef4444", weight: 3, dashArray: "8, 8", opacity: 0.7 }
          ).addTo(map);

          // Fit bounds to show both markers
          const bounds = L.latLngBounds([courierPos, [destLat, destLng]]);
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      }
    } catch {}
  }, [destinationAddress, destinationNeighborhood]);

  // Init map ONCE when first location arrives
  useEffect(() => {
    if (!location || initDoneRef.current) return;
    const el = mapContainerRef.current;
    if (!el) return;

    let cancelled = false;

    const initMap = async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");

        if (cancelled || !el) return;

        leafletRef.current = L;

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

        // Init trail
        locationHistoryRef.current = [[location.lat, location.lng]];
        trailLineRef.current = L.polyline([[location.lat, location.lng]], {
          color: "#3b82f6",
          weight: 3,
          opacity: 0.6,
        }).addTo(map);

        mapRef.current = map;
        markerRef.current = marker;
        initDoneRef.current = true;

        setTimeout(() => map.invalidateSize(), 200);

        // Geocode destination
        geocodeDestination(L, map);
      } catch (err) {
        console.error("Leaflet init error:", err);
      }
    };

    initMap();

    return () => {
      cancelled = true;
    };
  }, [location, courierName, geocodeDestination]);

  // Update marker position when location changes (no map recreate)
  useEffect(() => {
    if (!initDoneRef.current || !location || !mapRef.current || !markerRef.current) return;
    const latlng: [number, number] = [location.lat, location.lng];
    markerRef.current.setLatLng(latlng);
    mapRef.current.setView(latlng, mapRef.current.getZoom(), { animate: true });

    // Update trail
    locationHistoryRef.current.push(latlng);
    if (trailLineRef.current) {
      trailLineRef.current.setLatLngs(locationHistoryRef.current);
    }

    // Update route line to destination
    if (routeLineRef.current && destMarkerRef.current) {
      const destPos = destMarkerRef.current.getLatLng();
      routeLineRef.current.setLatLngs([latlng, [destPos.lat, destPos.lng]]);
    }
  }, [location]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
        markerRef.current = null;
        destMarkerRef.current = null;
        routeLineRef.current = null;
        trailLineRef.current = null;
        initDoneRef.current = false;
      }
    };
  }, []);

  // Request fresh location from courier device via broadcast
  const requestFreshLocation = useCallback(() => {
    supabase.channel(`ping-courier-${courierId}`).send({
      type: "broadcast",
      event: "location_ping",
      payload: { requestedAt: Date.now() },
    });
    // Also fetch DB immediately
    fetchLocation();
  }, [courierId, fetchLocation]);

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
        {destinationAddress && (
          <p className="text-center text-xs text-muted-foreground">📍 {destinationAddress}{destinationNeighborhood ? ` - ${destinationNeighborhood}` : ""}</p>
        )}

        {loading ? (
          <div className="py-8 text-center flex flex-col items-center">
            <TurboLoader size={80} />
            <p className="mt-2 text-sm text-muted-foreground">Buscando localização...</p>
          </div>
        ) : !location ? (
          <div className="py-8 text-center space-y-2">
            <MapPin size={32} className="mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Localização não disponível. O entregador precisa abrir o portal no celular ao menos uma vez.
            </p>
            <button
              onClick={fetchLocation}
              className="mx-auto mt-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground flex items-center justify-center gap-2 hover:bg-muted"
            >
              <RefreshCw size={14} />
              Tentar Novamente
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              ref={mapContainerRef}
              className="rounded-xl overflow-hidden border border-border"
              style={{ height: 300, width: "100%" }}
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

            <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
              <span className="inline-block w-4 h-0.5 bg-blue-500 rounded" /> Trajeto percorrido
              {destinationAddress && <><span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-red-500" /> Rota até destino</>}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { requestFreshLocation(); if (mapRef.current) mapRef.current.invalidateSize(); }}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground flex items-center justify-center gap-2 hover:bg-muted"
              >
                <RefreshCw size={14} />
                Atualizar Localização
              </button>
              <button
                onClick={openInMaps}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground flex items-center justify-center gap-2 hover:bg-muted"
              >
                <ExternalLink size={14} />
                Google Maps
              </button>
            </div>
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
