import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

type Role = "system" | "user" | "assistant" | "tool";

type ChatMessage = {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

type ToolResult = {
  ok: boolean;
  summary: string;
  data?: unknown;
};

// Helper: builds a filter that matches store_id = X OR store_id IS NULL (legacy)
function storeFilter(query: any, storeId: string | null) {
  if (storeId) {
    return query.or(`store_id.eq.${storeId},store_id.is.null`);
  }
  return query.is("store_id", null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) {
      return jsonResponse({ error: "Token de autenticação ausente." }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    if (!SUPABASE_URL) {
      return jsonResponse({ error: "SUPABASE_URL is not configured" }, 500);
    }

    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, 500);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "LOVABLE_API_KEY is not configured" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Usuário não autenticado." }, 401);
    }

    const { data: adminRole, error: roleError } = await admin
      .from("user_roles")
      .select("store_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (roleError || !adminRole) {
      return jsonResponse({ error: "Acesso permitido apenas para administradores." }, 403);
    }

    // storeId may be null for legacy setups — that's OK, we use IS NULL filters
    const storeId: string | null = adminRole.store_id ?? await getFallbackStoreId(admin);

    const body = await req.json().catch(() => null);
    const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];
    const sanitizedMessages = incomingMessages
      .filter((message: unknown) => {
        if (!message || typeof message !== "object") return false;
        const role = (message as Record<string, unknown>).role;
        const content = (message as Record<string, unknown>).content;
        return (role === "user" || role === "assistant") && typeof content === "string" && content.trim().length > 0;
      })
      .slice(-12)
      .map((message: Record<string, string>) => ({
        role: message.role as "user" | "assistant",
        content: message.content.trim().slice(0, 4000),
      }));

    if (sanitizedMessages.length === 0) {
      return jsonResponse({ error: "Nenhuma mensagem válida foi enviada." }, 400);
    }

    const context = await loadSystemContext(admin, storeId);
    const actions: string[] = [];

    const aiMessages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Você é uma IA de correção do sistema no painel administrativo. Interprete comandos em português, diagnostique problemas e aplique alterações administrativas em tempo real usando apenas as ferramentas disponíveis. Nunca invente ações executadas. Nunca execute SQL bruto, nunca altere permissões, nunca mexa em roles e nunca prometa mudar código do frontend em produção. Se o pedido exigir mudança de código, explique isso claramente e proponha o ajuste administrativo mais próximo possível.",
      },
      {
        role: "system",
        content: `Contexto atual da loja (use isso para responder com precisão):\n${JSON.stringify(context)}`,
      },
      ...sanitizedMessages,
    ];

    for (let attempt = 0; attempt < 4; attempt++) {
      const aiResponse = await callAiGateway(LOVABLE_API_KEY, aiMessages);
      const assistantMessage = aiResponse?.choices?.[0]?.message;

      if (!assistantMessage) {
        throw new Error("A IA não retornou uma resposta válida.");
      }

      aiMessages.push({
        role: "assistant",
        content: assistantMessage.content ?? "",
        tool_calls: assistantMessage.tool_calls,
      });

      if (!assistantMessage.tool_calls?.length) {
        return jsonResponse({
          message: assistantMessage.content || "Concluído.",
          actions,
        });
      }

      for (const toolCall of assistantMessage.tool_calls) {
        const result = await executeTool({
          admin,
          storeId,
          toolName: toolCall.function.name,
          rawArguments: toolCall.function.arguments,
        });

        actions.push(result.summary);
        aiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(result),
        });
      }
    }

    return jsonResponse({
      message: "Analisei o pedido, mas precisei interromper para evitar uma sequência excessiva de ações. Tente reformular o comando em uma única tarefa por vez.",
      actions,
    });
  } catch (error) {
    console.error("admin-ai-control error:", error);
    const message = error instanceof Error ? error.message : "Erro interno desconhecido.";
    return jsonResponse({ error: message }, 500);
  }
});

async function getFallbackStoreId(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.from("stores").select("id").order("created_at").limit(1).maybeSingle();
  return data?.id ?? null;
}

async function loadSystemContext(admin: ReturnType<typeof createClient>, storeId: string | null) {
  const settingsQuery = storeFilter(
    admin.from("store_settings").select("id, is_open, use_schedule, store_display_name, whatsapp_name, whatsapp_number, store_logo_url, prep_time_minutes, delivery_time_minutes, pickup_time_minutes"),
    storeId
  ).limit(1).maybeSingle();

  const scratchQuery = storeFilter(
    admin.from("scratch_settings").select("id, is_enabled, min_order_value, fallback_message"),
    storeId
  ).limit(1).maybeSingle();

  const receiptQuery = storeFilter(
    admin.from("receipt_templates").select("template_type, label, custom_message, footer_message, updated_at"),
    storeId
  ).order("template_type");

  const siteQuery = storeFilter(
    admin.from("site_content").select("key, value, content_type, updated_at"),
    storeId
  ).order("key").limit(20);

  const ordersQuery = storeId
    ? admin.from("orders").select("order_number, status, total, payment_method, delivery_type, coupon_code, created_at").or(`store_id.eq.${storeId},store_id.is.null`).order("created_at", { ascending: false }).limit(8)
    : admin.from("orders").select("order_number, status, total, payment_method, delivery_type, coupon_code, created_at").is("store_id", null).order("created_at", { ascending: false }).limit(8);

  const [storeSettingsRes, scratchSettingsRes, receiptTemplatesRes, siteContentRes, recentOrdersRes] = await Promise.all([
    settingsQuery,
    scratchQuery,
    receiptQuery,
    siteQuery,
    ordersQuery,
  ]);

  return {
    store_id: storeId,
    store_settings: storeSettingsRes.data,
    scratch_settings: scratchSettingsRes.data,
    receipt_templates: receiptTemplatesRes.data ?? [],
    site_content: siteContentRes.data ?? [],
    recent_orders: recentOrdersRes.data ?? [],
  };
}

async function callAiGateway(apiKey: string, messages: ChatMessage[]) {
  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      tools: getToolDefinitions(),
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Limite de uso da IA atingido no momento. Tente novamente em instantes.");
    }
    if (response.status === 402) {
      throw new Error("Os créditos da IA foram esgotados. Adicione saldo no workspace para continuar.");
    }
    const text = await response.text();
    throw new Error(`Falha na IA [${response.status}]: ${text}`);
  }

  return await response.json();
}

function getToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "read_system_area",
        description: "Lê uma área específica do sistema da loja para diagnosticar ou confirmar dados antes de alterar.",
        parameters: {
          type: "object",
          properties: {
            area: {
              type: "string",
              enum: ["store_settings", "scratch_settings", "receipt_templates", "site_content", "recent_orders"],
            },
            key: { type: "string" },
            template_type: { type: "string" },
            order_number: { type: "number" },
          },
          required: ["area"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "toggle_store_open",
        description: "Abre ou fecha a loja manualmente em tempo real.",
        parameters: {
          type: "object",
          properties: {
            is_open: { type: "boolean" },
          },
          required: ["is_open"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_store_settings",
          description: "Atualiza configurações operacionais da loja (WhatsApp, tempos, agenda). NÃO altera nome nem logo da loja - estes só podem ser editados manualmente em Configurações.",
          parameters: {
            type: "object",
            properties: {
              whatsapp_name: { type: "string" },
              whatsapp_number: { type: "string" },
              prep_time_minutes: { type: "number" },
            delivery_time_minutes: { type: "number" },
            pickup_time_minutes: { type: "number" },
            use_schedule: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "upsert_site_content",
        description: "Cria ou atualiza um conteúdo editável do site por chave.",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string" },
            value: { type: "string" },
            content_type: { type: "string", enum: ["text", "image"] },
          },
          required: ["key", "value"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_receipt_template",
        description: "Atualiza uma comanda/template de impressão da loja.",
        parameters: {
          type: "object",
          properties: {
            template_type: { type: "string", enum: ["pedido", "obrigado"] },
            store_name: { type: "string" },
            label: { type: "string" },
            custom_message: { type: "string" },
            footer_message: { type: "string" },
            body_template: { type: "string" },
            items_font_size: { type: "number" },
            label_font_size: { type: "number" },
          },
          required: ["template_type"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_scratch_settings",
        description: "Atualiza as regras e mensagens da raspadinha da loja.",
        parameters: {
          type: "object",
          properties: {
            is_enabled: { type: "boolean" },
            min_order_value: { type: "number" },
            fallback_message: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "upsert_coupon",
        description: "Cria ou atualiza um cupom da loja.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string" },
            value: { type: "number" },
            type: { type: "string", enum: ["percentage", "fixed"] },
            min_order: { type: "number" },
            max_uses: { type: "number" },
            active: { type: "boolean" },
            starts_at: { type: "string" },
            expires_at: { type: "string" },
          },
          required: ["code"],
          additionalProperties: false,
        },
      },
    },
  ];
}

async function executeTool({
  admin,
  storeId,
  toolName,
  rawArguments,
}: {
  admin: ReturnType<typeof createClient>;
  storeId: string | null;
  toolName: string;
  rawArguments: string;
}): Promise<ToolResult> {
  const args = safeParseArguments(rawArguments);

  switch (toolName) {
    case "read_system_area":
      return await readSystemArea(admin, storeId, args);
    case "toggle_store_open":
      return await toggleStoreOpen(admin, storeId, args);
    case "update_store_settings":
      return await updateStoreSettings(admin, storeId, args);
    case "upsert_site_content":
      return await upsertSiteContent(admin, storeId, args);
    case "update_receipt_template":
      return await updateReceiptTemplate(admin, storeId, args);
    case "update_scratch_settings":
      return await updateScratchSettings(admin, storeId, args);
    case "upsert_coupon":
      return await upsertCoupon(admin, storeId, args);
    default:
      throw new Error(`Ferramenta não suportada: ${toolName}`);
  }
}

async function findRowByStore(admin: ReturnType<typeof createClient>, table: string, storeId: string | null, extraFilters?: (q: any) => any) {
  let query = admin.from(table).select("id");
  query = storeFilter(query, storeId);
  if (extraFilters) query = extraFilters(query);
  const { data } = await query.limit(1).maybeSingle();
  return data?.id as string | null;
}

async function readSystemArea(admin: ReturnType<typeof createClient>, storeId: string | null, args: Record<string, unknown>) {
  const area = String(args.area || "");

  if (area === "store_settings") {
    const { data } = await storeFilter(
      admin.from("store_settings").select("id, is_open, use_schedule, store_display_name, whatsapp_name, whatsapp_number, store_logo_url, prep_time_minutes, delivery_time_minutes, pickup_time_minutes"),
      storeId
    ).limit(1).maybeSingle();
    return { ok: true, summary: "Configurações da loja lidas.", data };
  }

  if (area === "scratch_settings") {
    const { data } = await storeFilter(
      admin.from("scratch_settings").select("id, is_enabled, min_order_value, fallback_message"),
      storeId
    ).limit(1).maybeSingle();
    return { ok: true, summary: "Regras da raspadinha lidas.", data };
  }

  if (area === "receipt_templates") {
    let query = storeFilter(
      admin.from("receipt_templates").select("template_type, label, custom_message, footer_message, body_template, items_font_size, label_font_size, updated_at"),
      storeId
    ).order("template_type");

    if (typeof args.template_type === "string" && args.template_type) {
      query = query.eq("template_type", args.template_type);
    }

    const { data } = await query;
    return { ok: true, summary: "Comandas lidas.", data };
  }

  if (area === "site_content") {
    let query = storeFilter(
      admin.from("site_content").select("key, value, content_type, updated_at"),
      storeId
    ).order("key");

    if (typeof args.key === "string" && args.key) {
      query = query.eq("key", args.key);
    }

    const { data } = await query.limit(25);
    return { ok: true, summary: "Conteúdos do site lidos.", data };
  }

  if (area === "recent_orders") {
    let query = storeId
      ? admin.from("orders").select("order_number, status, total, payment_method, delivery_type, coupon_code, created_at").or(`store_id.eq.${storeId},store_id.is.null`)
      : admin.from("orders").select("order_number, status, total, payment_method, delivery_type, coupon_code, created_at").is("store_id", null);
    
    query = query.order("created_at", { ascending: false }).limit(10);

    if (typeof args.order_number === "number") {
      query = query.eq("order_number", args.order_number);
    }

    const { data } = await query;
    return { ok: true, summary: "Pedidos recentes lidos.", data };
  }

  throw new Error("Área de leitura inválida.");
}

async function toggleStoreOpen(admin: ReturnType<typeof createClient>, storeId: string | null, args: Record<string, unknown>) {
  if (typeof args.is_open !== "boolean") {
    throw new Error("is_open deve ser boolean.");
  }

  const rowId = await findRowByStore(admin, "store_settings", storeId);
  if (!rowId) throw new Error("Configuração da loja não encontrada.");

  const timestamp = new Date().toISOString();
  const payload = {
    is_open: args.is_open,
    opened_at: args.is_open ? timestamp : null,
    closed_at: args.is_open ? null : timestamp,
  };

  const { error } = await admin.from("store_settings").update(payload).eq("id", rowId);
  if (error) throw error;

  return {
    ok: true,
    summary: args.is_open ? "Loja aberta manualmente em tempo real." : "Loja fechada manualmente em tempo real.",
    data: payload,
  };
}

async function updateStoreSettings(admin: ReturnType<typeof createClient>, storeId: string | null, args: Record<string, unknown>) {
  const allowedKeys = [
    "store_display_name", "whatsapp_name", "whatsapp_number", "store_logo_url",
    "prep_time_minutes", "delivery_time_minutes", "pickup_time_minutes", "use_schedule",
  ] as const;

  const payload = pickDefined(args, allowedKeys);
  if (Object.keys(payload).length === 0) {
    throw new Error("Nenhum campo válido foi informado para store_settings.");
  }

  const rowId = await findRowByStore(admin, "store_settings", storeId);
  if (!rowId) throw new Error("Configuração da loja não encontrada.");

  const { error } = await admin.from("store_settings").update(payload).eq("id", rowId);
  if (error) throw error;

  return {
    ok: true,
    summary: `Configurações da loja atualizadas: ${Object.keys(payload).join(", ")}.`,
    data: payload,
  };
}

async function upsertSiteContent(admin: ReturnType<typeof createClient>, storeId: string | null, args: Record<string, unknown>) {
  const key = String(args.key || "").trim();
  const value = String(args.value || "");
  const contentType = args.content_type === "image" ? "image" : "text";

  if (!key) throw new Error("A chave do conteúdo é obrigatória.");

  const rowId = await findRowByStore(admin, "site_content", storeId, (q: any) => q.eq("key", key));

  const payload = {
    key,
    value,
    content_type: contentType,
    updated_at: new Date().toISOString(),
    store_id: storeId,
  };

  if (rowId) {
    const { error } = await admin.from("site_content").update(payload).eq("id", rowId);
    if (error) throw error;
  } else {
    const { error } = await admin.from("site_content").insert(payload);
    if (error) throw error;
  }

  return { ok: true, summary: `Conteúdo \`${key}\` salvo em tempo real.`, data: payload };
}

async function updateReceiptTemplate(admin: ReturnType<typeof createClient>, storeId: string | null, args: Record<string, unknown>) {
  const templateType = String(args.template_type || "").trim();
  if (!templateType) throw new Error("template_type é obrigatório.");

  const allowedKeys = ["store_name", "label", "custom_message", "footer_message", "body_template", "items_font_size", "label_font_size"] as const;
  const payload = pickDefined(args, allowedKeys);
  if (Object.keys(payload).length === 0) throw new Error("Nenhum campo válido foi informado para a comanda.");

  const rowId = await findRowByStore(admin, "receipt_templates", storeId, (q: any) => q.eq("template_type", templateType));
  if (!rowId) throw new Error(`Comanda ${templateType} não encontrada.`);

  const { error } = await admin.from("receipt_templates").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", rowId);
  if (error) throw error;

  return { ok: true, summary: `Comanda ${templateType} atualizada em tempo real.`, data: payload };
}

async function updateScratchSettings(admin: ReturnType<typeof createClient>, storeId: string | null, args: Record<string, unknown>) {
  const allowedKeys = ["is_enabled", "min_order_value", "fallback_message"] as const;
  const payload = pickDefined(args, allowedKeys);
  if (Object.keys(payload).length === 0) throw new Error("Nenhum campo válido foi informado para a raspadinha.");

  const rowId = await findRowByStore(admin, "scratch_settings", storeId);

  if (rowId) {
    const { error } = await admin.from("scratch_settings").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", rowId);
    if (error) throw error;
  } else {
    const { error } = await admin.from("scratch_settings").insert({ ...payload, store_id: storeId, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  return { ok: true, summary: `Regras da raspadinha atualizadas: ${Object.keys(payload).join(", ")}.`, data: payload };
}

async function upsertCoupon(admin: ReturnType<typeof createClient>, storeId: string | null, args: Record<string, unknown>) {
  const code = String(args.code || "").trim().toUpperCase();
  if (!code) throw new Error("O código do cupom é obrigatório.");

  const allowedKeys = ["value", "type", "min_order", "max_uses", "active", "starts_at", "expires_at"] as const;
  const payload = pickDefined(args, allowedKeys);

  const rowId = await findRowByStore(admin, "coupons", storeId, (q: any) => q.eq("code", code));

  if (rowId) {
    const { error } = await admin.from("coupons").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", rowId);
    if (error) throw error;
    return { ok: true, summary: `Cupom ${code} atualizado em tempo real.`, data: payload };
  }

  const insertPayload = {
    code,
    value: typeof payload.value === "number" ? payload.value : 0,
    type: typeof payload.type === "string" ? payload.type : "percentage",
    min_order: typeof payload.min_order === "number" ? payload.min_order : 0,
    max_uses: typeof payload.max_uses === "number" ? payload.max_uses : null,
    active: typeof payload.active === "boolean" ? payload.active : true,
    starts_at: typeof payload.starts_at === "string" ? payload.starts_at : new Date().toISOString(),
    expires_at: typeof payload.expires_at === "string" ? payload.expires_at : null,
    store_id: storeId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("coupons").insert(insertPayload);
  if (error) throw error;

  return { ok: true, summary: `Cupom ${code} criado em tempo real.`, data: insertPayload };
}

function safeParseArguments(rawArguments: string) {
  try {
    const parsed = JSON.parse(rawArguments || "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function pickDefined<T extends readonly string[]>(source: Record<string, unknown>, keys: T) {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function extractBearerToken(header: string | null) {
  if (!header) return "";
  return header.replace("Bearer ", "").trim();
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
