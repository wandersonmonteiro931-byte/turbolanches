import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, full_name, phone, street, number, neighborhood, quadra, lote, city, state, zip_code } = await req.json();
    if (!full_name || !phone || !street || !number || !neighborhood || !quadra || !lote) {
      return new Response(JSON.stringify({ error: "Preencha todos os campos obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phoneDigits = String(phone).replace(/\D/g, "");
    const finalEmail = email || `cliente.${phoneDigits || crypto.randomUUID()}@turbolanches.local`;
    const finalPassword = password || crypto.randomUUID();

    // Create user with service role (auto-confirms email)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: finalEmail,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { full_name: full_name || "" },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile with provided data
    if (newUser?.user) {
      const updates: Record<string, string> = {
        full_name,
        phone,
        street,
        number,
        neighborhood,
        quadra,
        lote,
        city: city || "Anápolis",
        state: state || "Goiás",
        zip_code: zip_code || "",
      };

      if (Object.keys(updates).length > 0) {
        await adminClient.from("profiles").update(updates).eq("user_id", newUser.user.id);
      }

      // Fetch the created profile
      const { data: profile } = await adminClient
        .from("profiles")
        .select("*")
        .eq("user_id", newUser.user.id)
        .single();

      return new Response(JSON.stringify({ user: newUser.user, profile }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ user: newUser }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
