import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { courier_id, code, lat, lng, accuracy, speed, heading } = body || {};

    if (!courier_id || !code || typeof lat !== "number" || typeof lng !== "number") {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return new Response(JSON.stringify({ error: "Coordenadas inválidas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate code matches courier_id and courier is active
    const { data: courier, error: cErr } = await admin
      .from("couriers")
      .select("id, code, active")
      .eq("id", courier_id)
      .maybeSingle();

    if (cErr || !courier || !courier.active || String(courier.code).toUpperCase() !== String(code).trim().toUpperCase()) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await admin
      .from("courier_locations")
      .upsert(
        {
          courier_id,
          lat,
          lng,
          accuracy: typeof accuracy === "number" ? accuracy : 0,
          speed: typeof speed === "number" ? speed : 0,
          heading: typeof heading === "number" ? heading : 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "courier_id" },
      );

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
