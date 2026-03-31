import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANAPOLIS_CENTER = { lat: -16.3281, lng: -48.9534 };
const MAX_DISTANCE_KM = 50;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter((t) => t.length > 2);
}

function overlapScore(expected: string, candidate: string): number {
  const expNorm = normalizeText(expected);
  const candNorm = normalizeText(candidate);
  if (!expNorm || !candNorm) return 0;
  if (candNorm === expNorm) return 1;
  if (candNorm.includes(expNorm) || expNorm.includes(candNorm)) return 0.9;
  const expTokens = tokenize(expNorm);
  const candTokens = new Set(tokenize(candNorm));
  if (expTokens.length === 0) return 0;
  let hit = 0;
  for (const token of expTokens) {
    if (candTokens.has(token)) hit++;
  }
  return hit / expTokens.length;
}

type NominatimPlace = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: {
    city?: string; town?: string; municipality?: string; county?: string;
    state?: string; state_district?: string;
    suburb?: string; neighbourhood?: string; city_district?: string; quarter?: string;
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

async function geocode(query: string, expectedNeighborhood: string): Promise<GeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=pt-BR&countrycodes=br&limit=8&dedupe=1&bounded=1&viewbox=-49.18,-16.20,-48.78,-16.56&q=${encodeURIComponent(query)}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { headers: { "User-Agent": "TurboLanches/1.0" }, signal: controller.signal });
      clearTimeout(timeout);
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * attempt); continue; }
      if (!res.ok) return { status: "not_found" };

      const data = (await res.json()) as NominatimPlace[];
      let best: { score: number; lat: number; lng: number } | null = null;

      for (const place of data || []) {
        const lat = Number(place.lat);
        const lng = Number(place.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (!isInsideAnapolis(place, lat, lng)) continue;

        const candidateText = [
          place.name, place.address?.neighbourhood, place.address?.suburb,
          place.address?.quarter, place.address?.city_district, place.display_name,
        ].filter(Boolean).join(" | ");

        const score = overlapScore(expectedNeighborhood, candidateText);
        if (score < 0.45) continue;
        if (!best || score > best.score) {
          best = { score, lat, lng };
        }
      }

      if (best) return { status: "ok", coords: { lat: best.lat, lng: best.lng } };
      return { status: "not_found" };
    } catch (_e) {
      await sleep(1500 * attempt);
    }
  }
  return { status: "not_found" };
}

function buildQueries(neighborhood: string): string[] {
  const orig = neighborhood.replace(/\s+/g, " ").trim();
  const noPrefix = orig.replace(/^(bairro|setor)\s+/i, "").trim();
  const noStage = noPrefix
    .replace(/\b\d+\s*(?:ª|a)?\s*etapa\b/gi, "")
    .replace(/\b(i{1,3}|iv|v)\s*etapa\b/gi, "")
    .replace(/\s+/g, " ").trim();

  const candidates = Array.from(new Set([orig, noPrefix, noStage].filter(v => v.length > 2)));
  const queries: string[] = [];
  for (const c of candidates) {
    queries.push(`${c}, Anápolis, Goiás, Brasil`);
    queries.push(`Bairro ${c}, Anápolis, GO, Brasil`);
  }
  return Array.from(new Set(queries)).slice(0, 6);
}

async function geocodeNeighborhood(neighborhood: string): Promise<GeocodeResult> {
  const queries = buildQueries(neighborhood);
  for (const query of queries) {
    const result = await geocode(query, neighborhood);
    if (result.status === "ok") return result;
    await sleep(400);
  }
  return { status: "not_found" };
}

// ── Handler principal ──────────────────────────────────────────────
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
      const storeResult = await geocode(storeQuery, settings.store_neighborhood || settings.store_address || "loja");

      if (storeResult.status === "ok") {
        storeLat = storeResult.coords.lat;
        storeLng = storeResult.coords.lng;
      } else {
        const fallback = await geocode(`${settings.store_neighborhood}, Anápolis, GO, Brasil`, settings.store_neighborhood || "loja");
        if (fallback.status !== "ok") {
          return new Response(
            JSON.stringify({ success: false, error: "Não foi possível localizar o endereço da loja." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        storeLat = fallback.coords.lat;
        storeLng = fallback.coords.lng;
      }

      await supabase.from("store_settings")
        .update({ store_lat: storeLat, store_lng: storeLng })
        .not("id", "is", null);
      await sleep(400);
    }

    const pricePerKm = settings.price_per_km || 2;

    // ── Buscar zonas pendentes (null distance) ──
    const { data: zones } = await supabase
      .from("delivery_zones")
      .select("id, neighborhood, distance_km")
      .is("distance_km", null)
      .order("neighborhood")
      .limit(50);

    if (!zones || zones.length === 0) {
      // Tudo processado — contar falhas
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
        continue;
      }

      // Haversine × 1.3 (approximation of road distance)
      const straightLine = haversineKm(storeLat!, storeLng!, geoResult.coords.lat, geoResult.coords.lng);
      const distance = Math.round(straightLine * 1.3 * 10) / 10;

      if (distance > MAX_DISTANCE_KM) {
        await supabase.from("delivery_zones").update({ distance_km: -1 }).eq("id", zone.id);
        continue;
      }

      const fee = Math.round(distance * pricePerKm);
      await supabase.from("delivery_zones")
        .update({ distance_km: distance, delivery_fee: fee })
        .eq("id", zone.id);

      processed++;
      console.log(`✅ ${zone.neighborhood}: ${distance}km → R$${fee}`);
      await sleep(200);
    }

    // Contar restantes
    const { count } = await supabase
      .from("delivery_zones")
      .select("id", { count: "exact", head: true })
      .is("distance_km", null);

    const { count: totalFailed } = await supabase
      .from("delivery_zones")
      .select("id", { count: "exact", head: true })
      .lt("distance_km", 0);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        remaining: count || 0,
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
