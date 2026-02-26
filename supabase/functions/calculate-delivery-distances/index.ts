import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

const ANAPOLIS_CENTER = { lat: -16.3281, lng: -48.9534 };
const MAX_DISTANCE_FROM_CITY_CENTER_KM = 40;
const MAX_DISTANCE_FROM_STORE_KM = 40;

type NominatimAddress = {
  city?: string;
  town?: string;
  municipality?: string;
  county?: string;
  state?: string;
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  quarter?: string;
};

type NominatimPlace = {
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
};

type GeocodeResult =
  | { status: "ok"; coords: { lat: number; lng: number }; resolvedNeighborhood?: string }
  | { status: "retry" }
  | { status: "not_found" };

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isCondominiumLike(name: string): boolean {
  return /\b(condominio|condomínio)\b/i.test(name);
}

function stripCondominiumWords(name: string): string {
  return name.replace(/\b(condominio|condomínio|residencial)\b/gi, "").replace(/\s+/g, " ").trim();
}

function resolveNeighborhood(address?: NominatimAddress): string | undefined {
  if (!address) return undefined;
  return (
    address.neighbourhood ||
    address.suburb ||
    address.city_district ||
    address.quarter ||
    undefined
  );
}

function isInsideAnapolis(place: NominatimPlace, lat: number, lng: number): boolean {
  const address = place.address;
  const cityBlob = [address?.city, address?.town, address?.municipality, address?.county]
    .filter(Boolean)
    .join(" ");
  const normalizedCity = normalizeText(cityBlob);
  const fromCenter = haversineKm(ANAPOLIS_CENTER.lat, ANAPOLIS_CENTER.lng, lat, lng);

  // Regra principal: resultado explicitamente em Anápolis e dentro do raio urbano
  if (normalizedCity.includes("anapolis") && fromCenter <= MAX_DISTANCE_FROM_CITY_CENTER_KM) {
    return true;
  }

  // Fallback: alguns resultados não trazem city/county, mas ficam no centro urbano
  return fromCenter <= 12;
}

async function geocode(query: string): Promise<GeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=pt-BR&countrycodes=br&limit=5&dedupe=1&bounded=1&viewbox=-49.18,-16.20,-48.78,-16.56&q=${encodeURIComponent(query)}`;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "TurboLanches/1.0" },
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const waitMs = 1000 * Math.pow(2, attempt - 1);
          console.warn(`Geocode temporary HTTP ${res.status} for: ${query}. Retry in ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }
        return { status: "retry" };
      }

      if (!res.ok) {
        console.error(`Geocode HTTP error ${res.status} for: ${query}`);
        return { status: "not_found" };
      }

      const data = (await res.json()) as NominatimPlace[];
      for (const place of data || []) {
        const lat = Number(place.lat);
        const lng = Number(place.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (!isInsideAnapolis(place, lat, lng)) continue;

        return {
          status: "ok",
          coords: { lat, lng },
          resolvedNeighborhood: resolveNeighborhood(place.address),
        };
      }

      return { status: "not_found" };
    } catch (e) {
      if (attempt < maxRetries) {
        const waitMs = 1000 * Math.pow(2, attempt - 1);
        console.warn(`Geocode network error for: ${query}. Retry in ${waitMs}ms`, e);
        await sleep(waitMs);
        continue;
      }
      return { status: "retry" };
    }
  }

  return { status: "retry" };
}

function buildNeighborhoodQueries(neighborhood: string): string[] {
  const original = neighborhood.replace(/\s+/g, " ").trim();
  const withoutPrefix = original.replace(/^(bairro|setor)\s+/i, "").trim();
  const withoutStage = withoutPrefix
    .replace(/\b\d+\s*(?:ª|a)?\s*etapa\b/gi, "")
    .replace(/\b(i|ii|iii|iv|v)\s*etapa\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const noAccentOriginal = original.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const noAccentWithoutStage = withoutStage.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const aliasOriginal = original
    .replace(/elisios/gi, "eliseos")
    .replace(/eliseos/gi, "elisios")
    .trim();

  const candidates = Array.from(
    new Set([
      original,
      withoutPrefix,
      withoutStage,
      noAccentOriginal,
      noAccentWithoutStage,
      aliasOriginal,
    ].filter((v) => v.length > 2))
  );

  const queries: string[] = [];
  for (const candidate of candidates) {
    queries.push(`${candidate}, Anápolis, Goiás, Brasil`);
    queries.push(`Bairro ${candidate}, Anápolis, Goiás, Brasil`);
    queries.push(`${candidate}, Anápolis, GO, Brasil`);

    if (isCondominiumLike(candidate)) {
      const stripped = stripCondominiumWords(candidate);
      if (stripped.length > 2) {
        queries.push(`Bairro ${stripped}, Anápolis, Goiás, Brasil`);
        queries.push(`${stripped}, Anápolis, GO, Brasil`);
      }
    }
  }

  return Array.from(new Set(queries)).slice(0, 12);
}

async function geocodeWithFallbacks(neighborhood: string): Promise<GeocodeResult> {
  const queries = buildNeighborhoodQueries(neighborhood).slice(0, 8);
  let hadRetry = false;

  for (const query of queries) {
    console.log(`Geocoding: ${query}`);
    const result = await geocode(query);

    if (result.status === "ok") {
      return result;
    }

    if (result.status === "retry") {
      hadRetry = true;
    }

    await sleep(1100);
  }

  return hadRetry ? { status: "retry" } : { status: "not_found" };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get store settings
    const { data: settings } = await supabase
      .from("store_settings")
      .select("store_address, store_neighborhood, price_per_km, store_lat, store_lng")
      .limit(1)
      .single();

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
        const simpleQuery = `${settings.store_neighborhood}, Anápolis, GO, Brasil`;
        const fallback = await geocode(simpleQuery);

        if (fallback.status !== "ok") {
          const storeError = fallback.status === "retry"
            ? "Serviço de geocodificação temporariamente indisponível. Tente novamente em instantes."
            : "Não foi possível localizar o endereço da hamburgueria.";

          return new Response(
            JSON.stringify({ success: false, error: storeError }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        storeLat = fallback.coords.lat;
        storeLng = fallback.coords.lng;
      }

      await supabase
        .from("store_settings")
        .update({ store_lat: storeLat, store_lng: storeLng })
        .not("id", "is", null);

      await sleep(1100);
    }

    const pricePerKm = settings.price_per_km || 2;

    // Primeiro corrige outliers; depois processa pendentes
    const { data: outlierZones } = await supabase
      .from("delivery_zones")
      .select("id, neighborhood, distance_km")
      .gt("distance_km", 40)
      .order("distance_km", { ascending: false })
      .limit(4);

    const zones = (outlierZones && outlierZones.length > 0)
      ? outlierZones
      : (await supabase
          .from("delivery_zones")
          .select("id, neighborhood, distance_km")
          .or("distance_km.is.null,distance_km.lt.0")
          .order("neighborhood")
          .limit(4)).data;

    if (!zones || zones.length === 0) {
      // All zones processed - recalculate fees for all that have valid distances
      const { data: allZones } = await supabase
        .from("delivery_zones")
        .select("id, distance_km")
        .gt("distance_km", 0)
        .lte("distance_km", MAX_DISTANCE_FROM_STORE_KM);

      if (allZones) {
        for (const z of allZones) {
          const rawFee = z.distance_km! * pricePerKm;
          const fee = Math.round(rawFee);
          await supabase
            .from("delivery_zones")
            .update({ delivery_fee: fee })
            .eq("id", z.id);
        }
      }

      // Count failed ones
      const { count: failedCount } = await supabase
        .from("delivery_zones")
        .select("id", { count: "exact", head: true })
        .lt("distance_km", 0);

      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0, 
          remaining: 0, 
          failed: failedCount || 0,
          message: "Todas as taxas atualizadas!" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let deferred = 0;

    for (const zone of zones) {
      const firstResult = await geocodeWithFallbacks(zone.neighborhood);

      if (firstResult.status === "ok") {
        let targetCoords = firstResult.coords;

        // Condomínios: usar coordenada do bairro de localização quando disponível
        if (isCondominiumLike(zone.neighborhood) && firstResult.resolvedNeighborhood) {
          const resolved = firstResult.resolvedNeighborhood;
          if (normalizeText(resolved) !== normalizeText(zone.neighborhood)) {
            const neighborhoodResult = await geocodeWithFallbacks(resolved);
            if (neighborhoodResult.status === "ok") {
              targetCoords = neighborhoodResult.coords;
            }
          }
        }

        let distance = Math.round(haversineKm(storeLat!, storeLng!, targetCoords.lat, targetCoords.lng) * 10) / 10;

        // Guarda de segurança: ignora resultados fora da cidade
        if (distance > MAX_DISTANCE_FROM_STORE_KM) {
          console.warn(`Discarding outlier distance for ${zone.neighborhood}: ${distance}km`);
          await supabase
            .from("delivery_zones")
            .update({ distance_km: null })
            .eq("id", zone.id);

          deferred++;
          await sleep(1100);
          continue;
        }

        const rawFee = distance * pricePerKm;
        const fee = Math.round(rawFee);

        await supabase
          .from("delivery_zones")
          .update({ distance_km: distance, delivery_fee: fee })
          .eq("id", zone.id);

        processed++;
      } else {
        // Mantém pendente para próxima rodada (retry/not_found)
        await supabase
          .from("delivery_zones")
          .update({ distance_km: null })
          .eq("id", zone.id);

        deferred++;
      }

      // Respeitar limite de 1 requisição/segundo entre bairros
      await sleep(1100);
    }

    // Count remaining
    const { count } = await supabase
      .from("delivery_zones")
      .select("id", { count: "exact", head: true })
      .or("distance_km.is.null,distance_km.gt.40");

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
        message: count
          ? `${processed} processados, ${count} restantes...`
          : "Todos os bairros processados!",
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
