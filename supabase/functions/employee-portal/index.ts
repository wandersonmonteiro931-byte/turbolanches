// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { action, employee_code, payload } = await req.json();
    if (!employee_code) {
      return new Response(JSON.stringify({ error: "Código obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const code = String(employee_code).toUpperCase().trim();
    const { data: emp } = await sb
      .from("employees")
      .select("id, store_id, full_name, employee_code, active, photo_url, role, face_descriptor")
      .eq("employee_code", code)
      .maybeSingle();

    if (!emp || !emp.active) {
      return new Response(JSON.stringify({ error: "Código inválido ou inativo" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "auth") {
      const { data: settings } = await sb
        .from("time_clock_settings")
        .select("store_lat, store_lng, allowed_radius_meters, require_face_match, require_geolocation, face_match_threshold")
        .eq("store_id", emp.store_id)
        .maybeSingle();
      return new Response(
        JSON.stringify({ employee: emp, settings: settings || null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "history") {
      const { data: punches } = await sb
        .from("time_clock_punches")
        .select("id, punch_type, punched_at, business_day, distance_meters")
        .eq("employee_id", emp.id)
        .order("punched_at", { ascending: false })
        .limit(100);
      const { data: payslips } = await sb
        .from("payslips")
        .select("id, reference_month, reference_year, gross_amount, net_amount, pdf_url, notes, created_at")
        .eq("employee_id", emp.id)
        .order("reference_year", { ascending: false })
        .order("reference_month", { ascending: false });
      return new Response(
        JSON.stringify({ punches: punches || [], payslips: payslips || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "payslip_url") {
      const { payslip_id } = payload || {};
      const { data: ps } = await sb
        .from("payslips")
        .select("pdf_url, employee_id")
        .eq("id", payslip_id)
        .maybeSingle();
      if (!ps || ps.employee_id !== emp.id) {
        return new Response(JSON.stringify({ error: "Holerite não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: signed } = await sb.storage.from("payslips").createSignedUrl(ps.pdf_url, 300);
      return new Response(
        JSON.stringify({ url: signed?.signedUrl || null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
