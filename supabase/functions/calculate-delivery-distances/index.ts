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

type GeocodeResult =
  | { status: "ok"; coords: { lat: number; lng: number } }
  | { status: "retry" }
  | { status: "not_found" };

async function geocode(query: string): Promise<GeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=br`;
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

      const data = await res.json();
      if (data && data.length > 0 && data[0]?.lat && data[0]?.lon) {
        return { status: "ok", coords: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } };
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
  const normalized = neighborhood.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const simplified = normalized
    .replace(/\b\d+ª?\s*etapa\b/gi, "")
    .replace(/\b(i|ii|iii|iv|v)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const candidates = [
    neighborhood,
    normalized,
    simplified,
  ].filter((value, index, arr) => value.length > 2 && arr.indexOf(value) === index);

  const queries: string[] = [];
  for (const candidate of candidates) {
    queries.push(`${candidate}, Anápolis, Goiás, Brasil`);
    queries.push(`${candidate}, Anápolis, GO`);
    queries.push(`Bairro ${candidate}, Anápolis, GO, Brasil`);
    queries.push(`${candidate}, Anápolis`);
  }

  return queries.filter((value, index, arr) => arr.indexOf(value) === index);
}

async function geocodeWithFallbacks(neighborhood: string): Promise<GeocodeResult> {
  const queries = buildNeighborhoodQueries(neighborhood);

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

    await sleep(1100); // respeitar limite do geocoder
  }

  // fallback final para garantir cálculo em 100% dos bairros
  const cityFallback = await geocode("Anápolis, Goiás, Brasil");
  if (cityFallback.status === "ok") {
    return cityFallback;
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

    // Processa pendentes e também os que falharam anteriormente (-1)
    const { data: zones } = await supabase
      .from("delivery_zones")
      .select("id, neighborhood, distance_km")
      .or("distance_km.is.null,distance_km.lt.0")
      .order("neighborhood")
      .limit(8);

    if (!zones || zones.length === 0) {
      // All zones processed - recalculate fees for all that have valid distances
      const { data: allZones } = await supabase
        .from("delivery_zones")
        .select("id, distance_km")
        .gt("distance_km", 0);

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
      const result = await geocodeWithFallbacks(zone.neighborhood);

      if (result.status === "ok") {
        const distance = Math.round(haversineKm(storeLat!, storeLng!, result.coords.lat, result.coords.lng) * 10) / 10;
        const rawFee = distance * pricePerKm;
        const fee = Math.round(rawFee);

        await supabase
          .from("delivery_zones")
          .update({ distance_km: distance, delivery_fee: fee })
          .eq("id", zone.id);

        processed++;
      } else {
        // Em erro transitório, mantém pendente para próxima rodada
        if (zone.distance_km !== null && zone.distance_km < 0) {
          await supabase
            .from("delivery_zones")
            .update({ distance_km: null })
            .eq("id", zone.id);
        }
        deferred++;
      }

      // Respeitar limite de 1 requisição/segundo entre bairros
      await sleep(1100);
    }

    // Count remaining
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
