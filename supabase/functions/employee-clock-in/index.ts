// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json();
    const {
      employee_code,
      punch_type,
      lat,
      lng,
      selfie_base64,
      face_match_score,
      device_info,
    } = body || {};

    if (!employee_code || !punch_type || !["in", "out"].includes(punch_type)) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find employee
    const { data: emp, error: empErr } = await sb
      .from("employees")
      .select("id, store_id, full_name, active, face_descriptor")
      .eq("employee_code", employee_code.toUpperCase())
      .maybeSingle();

    if (empErr || !emp) {
      return new Response(JSON.stringify({ error: "Funcionário não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!emp.active) {
      return new Response(JSON.stringify({ error: "Funcionário inativo" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load store settings
    const { data: settings } = await sb
      .from("time_clock_settings")
      .select("*")
      .eq("store_id", emp.store_id)
      .maybeSingle();

    let distance_meters: number | null = null;

    if (settings?.require_geolocation) {
      if (typeof lat !== "number" || typeof lng !== "number") {
        return new Response(JSON.stringify({ error: "Localização obrigatória" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (settings.store_lat == null || settings.store_lng == null) {
        return new Response(
          JSON.stringify({ error: "Localização da loja não configurada. Avise o administrador." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      distance_meters = haversineMeters(
        Number(settings.store_lat),
        Number(settings.store_lng),
        lat,
        lng,
      );
      if (distance_meters > settings.allowed_radius_meters) {
        return new Response(
          JSON.stringify({
            error: `Você está a ${Math.round(distance_meters)}m da loja. Máximo permitido: ${settings.allowed_radius_meters}m.`,
            distance_meters,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else if (typeof lat === "number" && typeof lng === "number" && settings?.store_lat != null) {
      distance_meters = haversineMeters(
        Number(settings.store_lat),
        Number(settings.store_lng),
        lat,
        lng,
      );
    }

    if (settings?.require_face_match) {
      if (!emp.face_descriptor) {
        return new Response(
          JSON.stringify({ error: "Cadastro facial pendente. Avise o administrador." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const threshold = Number(settings.face_match_threshold ?? 0.55);
      if (typeof face_match_score !== "number" || face_match_score > threshold) {
        return new Response(
          JSON.stringify({
            error: "Reconhecimento facial não confirmado. Tente novamente em local iluminado.",
            face_match_score,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Upload selfie if provided
    let selfie_url = "";
    if (selfie_base64 && typeof selfie_base64 === "string") {
      try {
        const base64 = selfie_base64.replace(/^data:image\/\w+;base64,/, "");
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const path = `${emp.id}/${Date.now()}.jpg`;
        const { error: upErr } = await sb.storage
          .from("clock-selfies")
          .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
        if (!upErr) selfie_url = path;
      } catch (e) {
        console.error("selfie upload failed", e);
      }
    }

    // Determine business_day (cutoff 06:00 Brasilia)
    const now = new Date();
    const brasiliaOffsetMs = -3 * 60 * 60 * 1000;
    const localMs = now.getTime() + brasiliaOffsetMs;
    const local = new Date(localMs);
    if (local.getUTCHours() < 6) local.setUTCDate(local.getUTCDate() - 1);
    const business_day = local.toISOString().slice(0, 10);

    // Insert punch
    const { data: punch, error: punchErr } = await sb
      .from("time_clock_punches")
      .insert({
        store_id: emp.store_id,
        employee_id: emp.id,
        punch_type,
        lat,
        lng,
        distance_meters,
        selfie_url,
        face_match_score,
        device_info: device_info || "",
        business_day,
      })
      .select()
      .single();

    if (punchErr) {
      console.error("punch insert failed", punchErr);
      return new Response(JSON.stringify({ error: "Falha ao registrar ponto" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        punch,
        employee: { id: emp.id, full_name: emp.full_name },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
