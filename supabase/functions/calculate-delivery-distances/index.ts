import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Coordenadas de referência ──────────────────────────────────────
const ANAPOLIS_CENTER = { lat: -16.3281, lng: -48.9534 };
const MAX_ROAD_DISTANCE_KM = 50; // descarta resultados acima disto

// ── Helpers ────────────────────────────────────────────────────────
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

function isCondominiumLike(name: string): boolean {
  return /\b(condominio|condomínio|residencial)\b/i.test(name);
}

function stripCondominiumWords(name: string): string {
  return name.replace(/\b(condominio|condomínio|residencial|fechado)\b/gi, "").replace(/\s+/g, " ").trim();
}

// ── OSRM: distância por estrada (driving) ──────────────────────────
async function getRoadDistanceKm(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): Promise<number | null> {
  // OSRM espera lng,lat (não lat,lng)
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "TurboLanches/1.0" },
      });

      if (res.status === 429 || res.status >= 500) {
        console.warn(`OSRM HTTP ${res.status}, attempt ${attempt}`);
        await sleep(2000 * attempt);
        continue;
      }

      if (!res.ok) return null;

      const data = await res.json();
      if (data.code === "Ok" && data.routes?.[0]?.distance) {
        const distKm = data.routes[0].distance / 1000;
        return Math.round(distKm * 10) / 10;
      }
      return null;
    } catch (e) {
      console.warn(`OSRM error attempt ${attempt}:`, e);
      await sleep(2000 * attempt);
    }
  }
  return null;
}

// ── Nominatim: geocodificação ──────────────────────────────────────
type NominatimPlace = {
  lat?: string;
  lon?: string;
  address?: {
    city?: string; town?: string; municipality?: string; county?: string;
    suburb?: string; neighbourhood?: string; city_district?: string; quarter?: string;
  };
};

type GeocodeResult =
  | { status: "ok"; coords: { lat: number; lng: number }; resolvedNeighborhood?: string }
  | { status: "retry" }
  | { status: "not_found" };

function isInsideAnapolis(place: NominatimPlace, lat: number, lng: number): boolean {
  const addr = place.address;
  const cityBlob = [addr?.city, addr?.town, addr?.municipality, addr?.county]
    .filter(Boolean).join(" ");
  const normalizedCity = normalizeText(cityBlob);
  const fromCenter = haversineKm(ANAPOLIS_CENTER.lat, ANAPOLIS_CENTER.lng, lat, lng);
  if (normalizedCity.includes("anapolis") && fromCenter <= 40) return true;
  return fromCenter <= 15;
}

async function geocode(query: string): Promise<GeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=pt-BR&countrycodes=br&limit=5&dedupe=1&bounded=1&viewbox=-49.18,-16.20,-48.78,-16.56&q=${encodeURIComponent(query)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "TurboLanches/1.0" } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * attempt);
        continue;
      }
      if (!res.ok) return { status: "not_found" };

      const data = (await res.json()) as NominatimPlace[];
      for (const place of data || []) {
        const lat = Number(place.lat);
        const lng = Number(place.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (!isInsideAnapolis(place, lat, lng)) continue;
        return {
          status: "ok",
          coords: { lat, lng },
          resolvedNeighborhood: place.address?.neighbourhood || place.address?.suburb || undefined,
        };
      }
      return { status: "not_found" };
    } catch (e) {
      await sleep(1500 * attempt);
    }
  }
  return { status: "retry" };
}

function buildQueries(neighborhood: string): string[] {
  const orig = neighborhood.replace(/\s+/g, " ").trim();
  const noPrefix = orig.replace(/^(bairro|setor)\s+/i, "").trim();
  const noStage = noPrefix
    .replace(/\b\d+\s*(?:ª|a)?\s*etapa\b/gi, "")
    .replace(/\b(i{1,3}|iv|v)\s*etapa\b/gi, "")
    .replace(/\s+/g, " ").trim();
  const noAccent = orig.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const candidates = Array.from(new Set([orig, noPrefix, noStage, noAccent].filter(v => v.length > 2)));

  const queries: string[] = [];
  for (const c of candidates) {
    queries.push(`${c}, Anápolis, Goiás, Brasil`);
    queries.push(`Bairro ${c}, Anápolis, GO, Brasil`);
    if (isCondominiumLike(c)) {
      const stripped = stripCondominiumWords(c);
      if (stripped.length > 2) {
        queries.push(`${stripped}, Anápolis, Goiás, Brasil`);
        queries.push(`Bairro ${stripped}, Anápolis, GO`);
      }
    }
  }

  // Fallback genérico: centro de Anápolis
  queries.push("Centro, Anápolis, Goiás, Brasil");

  return Array.from(new Set(queries)).slice(0, 10);
}

async function geocodeNeighborhood(neighborhood: string): Promise<GeocodeResult> {
  const queries = buildQueries(neighborhood);
  let hadRetry = false;

  for (const query of queries) {
    // Pula o fallback "Centro" a menos que nada funcione
    if (query.startsWith("Centro,") && queries.indexOf(query) < queries.length - 1) {
      // Só usa Centro como último recurso, não pula
    }
    console.log(`Geocoding: ${query}`);
    const result = await geocode(query);
    if (result.status === "ok") return result;
    if (result.status === "retry") hadRetry = true;
    await sleep(1100);
  }

  // Último fallback absoluto: centro geográfico de Anápolis
  return {
    status: "ok",
    coords: { lat: ANAPOLIS_CENTER.lat, lng: ANAPOLIS_CENTER.lng },
    resolvedNeighborhood: "Centro",
  };
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

    // ── Store settings ──
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

    // Geocode store if needed
    if (!storeLat || !storeLng) {
      const storeQuery = `${settings.store_address}, ${settings.store_neighborhood}, Anápolis, GO, Brasil`;
      console.log("Geocoding store:", storeQuery);
      const storeResult = await geocode(storeQuery);

      if (storeResult.status === "ok") {
        storeLat = storeResult.coords.lat;
        storeLng = storeResult.coords.lng;
      } else {
        const fallback = await geocode(`${settings.store_neighborhood}, Anápolis, GO, Brasil`);
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
      await sleep(1100);
    }

    const pricePerKm = settings.price_per_km || 2;

    // ── Buscar zonas pendentes ──
    // Prioridade: outliers (>50km) → negativos → nulos
    const { data: outlierZones } = await supabase
      .from("delivery_zones")
      .select("id, neighborhood, distance_km")
      .gt("distance_km", MAX_ROAD_DISTANCE_KM)
      .order("distance_km", { ascending: false })
      .limit(3);

    const zones = (outlierZones && outlierZones.length > 0)
      ? outlierZones
      : (await supabase
          .from("delivery_zones")
          .select("id, neighborhood, distance_km")
          .or("distance_km.is.null,distance_km.lt.0")
          .order("neighborhood")
          .limit(3)).data;

    if (!zones || zones.length === 0) {
      // Tudo processado — recalcular taxas
      const { data: allZones } = await supabase
        .from("delivery_zones")
        .select("id, distance_km")
        .gt("distance_km", 0)
        .lte("distance_km", MAX_ROAD_DISTANCE_KM);

      if (allZones) {
        for (const z of allZones) {
          const fee = Math.round(z.distance_km! * pricePerKm);
          await supabase.from("delivery_zones").update({ delivery_fee: fee }).eq("id", z.id);
        }
      }

      const { count: failedCount } = await supabase
        .from("delivery_zones")
        .select("id", { count: "exact", head: true })
        .lt("distance_km", 0);

      return new Response(
        JSON.stringify({ success: true, processed: 0, remaining: 0, failed: failedCount || 0, message: "Todas as taxas atualizadas!" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let deferred = 0;

    for (const zone of zones) {
      // 1. Geocodificar o bairro
      const geoResult = await geocodeNeighborhood(zone.neighborhood);

      if (geoResult.status !== "ok") {
        await supabase.from("delivery_zones").update({ distance_km: -1 }).eq("id", zone.id);
        deferred++;
        continue;
      }

      let targetCoords = geoResult.coords;

      // Condomínios: tenta resolver pelo bairro pai
      if (isCondominiumLike(zone.neighborhood) && geoResult.resolvedNeighborhood) {
        const parentName = geoResult.resolvedNeighborhood;
        if (normalizeText(parentName) !== normalizeText(zone.neighborhood)) {
          const parentResult = await geocodeNeighborhood(parentName);
          if (parentResult.status === "ok") {
            targetCoords = parentResult.coords;
          }
        }
      }

      // 2. Calcular distância por estrada (OSRM)
      let distance = await getRoadDistanceKm(storeLat!, storeLng!, targetCoords.lat, targetCoords.lng);

      // Fallback para haversine * 1.3 se OSRM falhar
      if (distance === null) {
        const straightLine = haversineKm(storeLat!, storeLng!, targetCoords.lat, targetCoords.lng);
        distance = Math.round(straightLine * 1.3 * 10) / 10;
        console.log(`OSRM failed for ${zone.neighborhood}, using haversine*1.3: ${distance}km`);
      }

      // Guarda de segurança
      if (distance > MAX_ROAD_DISTANCE_KM) {
        console.warn(`Discarding ${zone.neighborhood}: ${distance}km (too far)`);
        await supabase.from("delivery_zones").update({ distance_km: null }).eq("id", zone.id);
        deferred++;
        await sleep(500);
        continue;
      }

      const fee = Math.round(distance * pricePerKm);
      await supabase.from("delivery_zones")
        .update({ distance_km: distance, delivery_fee: fee })
        .eq("id", zone.id);

      processed++;
      console.log(`✅ ${zone.neighborhood}: ${distance}km → R$${fee}`);

      await sleep(1200);
    }

    // Contar restantes
    const { count } = await supabase
      .from("delivery_zones")
      .select("id", { count: "exact", head: true })
      .or(`distance_km.is.null,distance_km.gt.${MAX_ROAD_DISTANCE_KM}`);

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
        deferred,
        message: count ? `${processed} processados, ${count} restantes...` : "Todos os bairros processados!",
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
