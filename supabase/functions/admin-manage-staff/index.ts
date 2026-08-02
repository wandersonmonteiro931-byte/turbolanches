import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const allowedRoles = new Set(["admin", "seller", "cashier"]);
const STAFF_LOGIN_DOMAIN = "equipe.turbolanches.local";

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "");

const translateAuthError = (message: string) => {
  const text = String(message || "");
  if (/known to be weak|easy to guess|pwned|leaked/i.test(text)) {
    return "Senha muito fraca ou vazada. Use uma senha diferente, com letras, números e um símbolo (ex.: Turbo@2026).";
  }
  if (/already been registered|already registered|already exists/i.test(text)) {
    return "Já existe uma conta com este e-mail ou usuário de acesso.";
  }
  if (/password should be at least|at least 6/i.test(text)) {
    return "A senha precisa ter no mínimo 6 caracteres.";
  }
  return text || "Erro ao salvar a conta";
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Não autenticado" }, 401);

    const { data: canManage, error: permissionError } = await userClient.rpc("can_manage_staff", {
      _user_id: user.id,
    });
    if (permissionError || !canManage) return json({ error: "Sem permissão para gerenciar contas da equipe" }, 403);

    const payload = await req.json();
    const action = String(payload?.action || "create");

    const countAdmins = async () => {
      const { count, error } = await adminClient
        .from("staff_members")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (error) throw error;
      return count || 0;
    };

    if (action === "delete") {
      const staffMemberId = String(payload?.staff_member_id || "");
      if (!staffMemberId) return json({ error: "Conta da equipe não informada" }, 400);

      const { data: member, error: memberError } = await adminClient
        .from("staff_members")
        .select("id, user_id, role")
        .eq("id", staffMemberId)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member) return json({ error: "Conta não encontrada" }, 404);
      if (member.user_id === user.id) return json({ error: "Você não pode excluir a própria conta" }, 400);
      if (member.role === "admin" && (await countAdmins()) <= 1) {
        return json({ error: "O administrador é obrigatório e não pode ser excluído. Crie outro administrador antes." }, 400);
      }

      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(member.user_id);
      if (deleteUserError) throw deleteUserError;
      return json({ success: true });
    }


    if (action === "update") {
      const staffMemberId = String(payload?.staff_member_id || "");
      if (!staffMemberId) return json({ error: "Conta da equipe não informada" }, 400);

      const { data: member, error: memberError } = await adminClient
        .from("staff_members")
        .select("id, user_id, email, username, role")
        .eq("id", staffMemberId)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member) return json({ error: "Conta não encontrada" }, 404);

      const displayName = String(payload?.display_name || "").trim();
      const role = String(payload?.role || "");
      if (!displayName) return json({ error: "Informe o nome do funcionário" }, 400);
      if (!allowedRoles.has(role)) return json({ error: "Tipo de conta inválido" }, 400);

      const rawEmail = String(payload?.email || "").trim().toLowerCase();
      const username = normalizeUsername(String(payload?.username || ""));
      const employeeCode = String(payload?.employee_code || "").trim().toUpperCase();
      const password = String(payload?.password || "");
      const storeId = payload?.store_id ? String(payload.store_id) : null;
      const permissions = Array.isArray(payload?.permissions)
        ? [...new Set(payload.permissions.map((value: unknown) => String(value)).filter(Boolean))]
        : [];
      if (!permissions.includes("/admin")) return json({ error: "O acesso ao Dashboard é obrigatório" }, 400);
      if (password && password.length < 6) {
        return json({ error: "A nova senha precisa ter no mínimo 6 caracteres" }, 400);
      }

      const loginEmail = rawEmail || (username ? `${username}@${STAFF_LOGIN_DOMAIN}` : member.email);
      if (!loginEmail) return json({ error: "Informe e-mail ou usuário de acesso" }, 400);

      const authUpdate: Record<string, unknown> = {
        email: loginEmail,
        email_confirm: true,
        user_metadata: { full_name: displayName, staff_role: role },
      };
      if (password) authUpdate.password = password;

      const { error: authError } = await adminClient.auth.admin.updateUserById(member.user_id, authUpdate);
      if (authError) return json({ error: translateAuthError(authError.message) }, 400);

      const { error: updateError } = await adminClient
        .from("staff_members")
        .update({
          display_name: displayName,
          role,
          store_id: storeId,
          email: loginEmail,
          username: username || null,
          employee_code: employeeCode || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", staffMemberId);
      if (updateError) throw updateError;

      const { error: clearError } = await adminClient
        .from("staff_section_permissions")
        .delete()
        .eq("staff_member_id", staffMemberId);
      if (clearError) throw clearError;

      const { error: permissionsError } = await adminClient.from("staff_section_permissions").insert(
        permissions.map((sectionPath: string) => ({
          staff_member_id: staffMemberId,
          section_path: sectionPath,
          can_access: true,
        })),
      );
      if (permissionsError) throw permissionsError;

      return json({ success: true });
    }

    if (action !== "create") return json({ error: "Ação inválida" }, 400);


    const displayName = String(payload?.display_name || "").trim();
    const rawEmail = String(payload?.email || "").trim().toLowerCase();
    const username = normalizeUsername(String(payload?.username || ""));
    const employeeCode = String(payload?.employee_code || "").trim().toUpperCase();
    const email = rawEmail || (username ? `${username}@${STAFF_LOGIN_DOMAIN}` : "");
    const password = String(payload?.password || "");
    const role = String(payload?.role || "seller");
    const storeId = payload?.store_id ? String(payload.store_id) : null;
    const permissions = Array.isArray(payload?.permissions)
      ? [...new Set(payload.permissions.map((value: unknown) => String(value)).filter(Boolean))]
      : [];

    if (!displayName || !email || password.length < 6) {
      return json({ error: "Informe nome, e-mail ou usuário, e uma senha com no mínimo 6 caracteres" }, 400);
    }
    if (!allowedRoles.has(role)) return json({ error: "Tipo de conta inválido" }, 400);
    if (!permissions.includes("/admin")) return json({ error: "O acesso ao Dashboard é obrigatório" }, 400);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName, staff_role: role },
    });
    if (createError) return json({ error: translateAuthError(createError.message) }, 400);
    const newUser = created.user;
    if (!newUser) return json({ error: "Usuário não foi criado" }, 500);

    try {
      await adminClient.from("profiles").update({ full_name: displayName }).eq("user_id", newUser.id);

      const { error: roleError } = await adminClient.from("user_roles").insert({
        user_id: newUser.id,
        role: "admin",
        store_id: storeId,
      });
      if (roleError) throw roleError;

      const { data: member, error: memberError } = await adminClient
        .from("staff_members")
        .insert({
          store_id: storeId,
          user_id: newUser.id,
          role,
          display_name: displayName,
          email,
          username: username || null,
          employee_code: employeeCode || null,
          is_active: true,
          created_by: user.id,
        })
        .select("id, user_id, role, display_name, employee_code, username")
        .single();
      if (memberError) throw memberError;

      const { error: permissionsError } = await adminClient.from("staff_section_permissions").insert(
        permissions.map((sectionPath: string) => ({
          staff_member_id: member.id,
          section_path: sectionPath,
          can_access: true,
        })),
      );
      if (permissionsError) throw permissionsError;

      return json({ success: true, member });
    } catch (error) {
      await adminClient.auth.admin.deleteUser(newUser.id);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
