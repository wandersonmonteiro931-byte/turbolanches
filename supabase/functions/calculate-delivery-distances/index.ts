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

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TurboLanches/1.0" },
    });
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error("Geocode error:", query, e);
  }
  return null;
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
      const storeCoords = await geocode(storeQuery);
      if (!storeCoords) {
        // Try simpler query
        const simpleQuery = `${settings.store_neighborhood}, Anápolis, GO, Brasil`;
        const fallback = await geocode(simpleQuery);
        if (!fallback) {
          return new Response(
            JSON.stringify({ success: false, error: "Não foi possível localizar o endereço da hamburgueria. Verifique o endereço cadastrado." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        storeLat = fallback.lat;
        storeLng = fallback.lng;
      } else {
        storeLat = storeCoords.lat;
        storeLng = storeCoords.lng;
      }

      // Save store coordinates
      await supabase
        .from("store_settings")
        .update({ store_lat: storeLat, store_lng: storeLng })
        .not("id", "is", null);

      await sleep(1100);
    }

    const pricePerKm = settings.price_per_km || 2;

    // Get zones without distance (batch of 15)
    const { data: zones } = await supabase
      .from("delivery_zones")
      .select("id, neighborhood, distance_km")
      .is("distance_km", null)
      .order("neighborhood")
      .limit(15);

    if (!zones || zones.length === 0) {
      // All zones already have distances, recalculate fees for all
      const { data: allZones } = await supabase
        .from("delivery_zones")
        .select("id, distance_km")
        .not("distance_km", "is", null);

      if (allZones) {
        for (const z of allZones) {
          const rawFee = z.distance_km! * pricePerKm;
          const fee = Math.round(rawFee); // <4 arredonda pra menos, >=5 pra mais
          await supabase
            .from("delivery_zones")
            .update({ delivery_fee: fee })
            .eq("id", z.id);
        }
      }

      return new Response(
        JSON.stringify({ success: true, processed: 0, remaining: 0, message: "Todas as taxas atualizadas!" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;

    for (const zone of zones) {
      const query = `${zone.neighborhood}, Anápolis, GO, Brasil`;
      console.log(`Geocoding: ${query}`);
      const coords = await geocode(query);

      if (coords) {
        const distance = Math.round(haversineKm(storeLat!, storeLng!, coords.lat, coords.lng) * 10) / 10;
        const rawFee = distance * pricePerKm;
        const fee = Math.round(rawFee); // <4 arredonda pra menos, >=5 pra mais

        await supabase
          .from("delivery_zones")
          .update({ distance_km: distance, delivery_fee: fee })
          .eq("id", zone.id);

        processed++;
      } else {
        // Set distance to -1 to mark as failed (won't retry)
        await supabase
          .from("delivery_zones")
          .update({ distance_km: -1 })
          .eq("id", zone.id);
      }

      await sleep(1100); // Nominatim rate limit: 1 req/sec
    }

    // Count remaining
    const { count } = await supabase
      .from("delivery_zones")
      .select("id", { count: "exact", head: true })
      .is("distance_km", null);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        remaining: count || 0,
        message: count ? `${processed} bairros processados, ${count} restantes...` : "Todos os bairros processados!",
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
