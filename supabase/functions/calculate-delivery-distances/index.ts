import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANAPOLIS_CENTER = { lat: -16.3281, lng: -48.9534 };
const MAX_DISTANCE_KM = 50;
const BATCH_SIZE = 8; // small batch to stay within timeout

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

type NominatimPlace = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    city?: string; town?: string; municipality?: string; county?: string;
    state_district?: string;
  };
};

function isInsideAnapolis(place: NominatimPlace, lat: number, lng: number): boolean {
  const addr = place.address;
  const cityBlob = [addr?.city, addr?.town, addr?.municipality, addr?.county, addr?.state_district]
    .filter(Boolean).join(" ");
  const normalizedCity = normalizeText(cityBlob);
  const fromCenter = haversineKm(ANAPOLIS_CENTER.lat, ANAPOLIS_CENTER.lng, lat, lng);
  return normalizedCity.includes("anapolis") && fromCenter <= 45;
}

type GeocodeResult =
  | { status: "ok"; coords: { lat: number; lng: number } }
  | { status: "not_found" };

async function geocodeSingle(query: string): Promise<GeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=pt-BR&countrycodes=br&limit=5&bounded=1&viewbox=-49.18,-16.20,-48.78,-16.56&q=${encodeURIComponent(query)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers: { "User-Agent": "TurboLanches/1.0" }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { status: "not_found" };
    const data = (await res.json()) as NominatimPlace[];
    for (const place of data || []) {
      const lat = Number(place.lat);
      const lng = Number(place.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (isInsideAnapolis(place, lat, lng)) {
        return { status: "ok", coords: { lat, lng } };
      }
    }
    return { status: "not_found" };
  } catch {
    return { status: "not_found" };
  }
}

async function geocodeNeighborhood(neighborhood: string): Promise<GeocodeResult> {
  // Try just 2 queries max to stay fast
  const clean = neighborhood.replace(/\s+/g, " ").trim();
  const noPrefix = clean.replace(/^(bairro|setor)\s+/i, "").trim();
  
  const r1 = await geocodeSingle(`${clean}, Anápolis, GO, Brasil`);
  if (r1.status === "ok") return r1;
  
  await new Promise(r => setTimeout(r, 300));
  
  if (noPrefix !== clean) {
    const r2 = await geocodeSingle(`Bairro ${noPrefix}, Anápolis, GO, Brasil`);
    if (r2.status === "ok") return r2;
  }
  
  return { status: "not_found" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: settings } = await supabase
      .from("store_settings")
      .select("store_address, store_neighborhood, price_per_km, store_lat, store_lng")
      .limit(1).single();

    if (!settings) {
      return new Response(
        JSON.stringify({ success: false, error: "Configurações da loja não encontradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let storeLat = settings.store_lat;
    let storeLng = settings.store_lng;

    if (!storeLat || !storeLng) {
      const storeQuery = `${settings.store_address}, ${settings.store_neighborhood}, Anápolis, GO, Brasil`;
      const storeResult = await geocodeSingle(storeQuery);

      if (storeResult.status === "ok") {
        storeLat = storeResult.coords.lat;
        storeLng = storeResult.coords.lng;
      } else {
        // Fallback to city center
        storeLat = ANAPOLIS_CENTER.lat;
        storeLng = ANAPOLIS_CENTER.lng;
      }

      await supabase.from("store_settings")
        .update({ store_lat: storeLat, store_lng: storeLng })
        .not("id", "is", null);
    }

    const pricePerKm = settings.price_per_km || 2;

    // Count total pending BEFORE processing
    const { count: totalPending } = await supabase
      .from("delivery_zones")
      .select("id", { count: "exact", head: true })
      .is("distance_km", null);

    // Fetch small batch
    const { data: zones } = await supabase
      .from("delivery_zones")
      .select("id, neighborhood")
      .is("distance_km", null)
      .order("neighborhood")
      .limit(BATCH_SIZE);

    if (!zones || zones.length === 0) {
      const { count: failedCount } = await supabase
        .from("delivery_zones")
        .select("id", { count: "exact", head: true })
        .lt("distance_km", 0);

      return new Response(
        JSON.stringify({ success: true, processed: 0, remaining: 0, failed: failedCount || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;

    for (const zone of zones) {
      const geoResult = await geocodeNeighborhood(zone.neighborhood);

      if (geoResult.status !== "ok") {
        await supabase.from("delivery_zones").update({ distance_km: -1 }).eq("id", zone.id);
        processed++;
        console.log(`❌ ${zone.neighborhood}: não encontrado`);
        continue;
      }

      const straightLine = haversineKm(storeLat!, storeLng!, geoResult.coords.lat, geoResult.coords.lng);
      const distance = Math.round(straightLine * 1.3 * 10) / 10;

      if (distance > MAX_DISTANCE_KM) {
        await supabase.from("delivery_zones").update({ distance_km: -1 }).eq("id", zone.id);
        processed++;
        continue;
      }

      const fee = Math.round(distance * pricePerKm);
      await supabase.from("delivery_zones")
        .update({ distance_km: distance, delivery_fee: fee })
        .eq("id", zone.id);

      processed++;
      console.log(`✅ ${zone.neighborhood}: ${distance}km → R$${fee}`);
      await new Promise(r => setTimeout(r, 300));
    }

    const remaining = Math.max(0, (totalPending || 0) - processed);

    const { count: totalFailed } = await supabase
      .from("delivery_zones")
      .select("id", { count: "exact", head: true })
      .lt("distance_km", 0);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        remaining,
        failed: totalFailed || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
