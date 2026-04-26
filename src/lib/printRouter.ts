/**
 * Roteador de impressão: tenta QZ Tray (ESC/POS) primeiro; se falhar ou
 * estiver desabilitado, devolve `false` para o chamador cair no popup HTML.
 *
 * Uso típico:
 *   const ok = await tryPrintOrderViaQz(orderId, { tipo: "pedido", copies: 2 });
 *   if (!ok) openPrintUrl(`/admin/imprimir/${orderId}?...`);
 */

import { supabase } from "@/integrations/supabase/client";
import { getThermalPrintSettings } from "./thermalPrintSettings";
import { buildOrderEscPos, type EscPosOrderInput } from "./escposBuilder";
import { isQzAvailable, printRawEscPos } from "./qzTray";

interface PrintOrderViaQzOptions {
  tipo?: string; // "pedido" | "obrigado" | "mesa" | etc — usado para escolher template
  copies?: number;
}

const fmt = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

const resolveTemplateType = (tipo: string, deliveryType?: string | null): string => {
  if (tipo === "cozinha" || tipo === "entrega") return "pedido";
  if (tipo === "cliente") return "obrigado";
  if (tipo === "mesa_cliente") return "mesa";
  if (deliveryType === "mesa" && tipo === "pedido") return "mesa";
  return tipo;
};

export const tryPrintOrderViaQz = async (
  orderId: string,
  options: PrintOrderViaQzOptions = {},
): Promise<boolean> => {
  const settings = getThermalPrintSettings();
  if (!settings.qzEnabled || !settings.qzPrinterName) return false;

  try {
    // 1. Verifica QZ disponível
    const available = await isQzAvailable();
    if (!available) {
      console.warn("[QZ] Tray indisponível, caindo no popup HTML");
      return false;
    }

    // 2. Busca pedido + itens + perfil + template
    const { data: order, error: orderErr } = await supabase
      .from("orders").select("*").eq("id", orderId).single();
    if (orderErr || !order) {
      console.warn("[QZ] pedido não encontrado", orderId);
      return false;
    }

    const tplType = resolveTemplateType(options.tipo || "pedido", order.delivery_type);

    const [itemsRes, profileRes, tplRes] = await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", orderId),
      supabase.from("profiles").select("full_name, phone, customer_code").eq("user_id", order.user_id).single(),
      supabase.from("receipt_templates" as any).select("*").eq("template_type", tplType).maybeSingle(),
    ]);

    const items = itemsRes.data || [];
    const profile = profileRes.data;
    const tpl: any = tplRes.data;

    // 3. Monta payload genérico
    const isTable = order.delivery_type === "mesa";
    const orderNumber = isTable
      ? (order.table_code || `#MESA${order.order_number}`)
      : `#${String(order.order_number).padStart(5, "0")}`;

    const dateTime = new Date(order.created_at).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const obs = order.observations || "";
    const isManual = obs.includes("[PDV]");
    const manualName = obs.match(/Cliente:\s*([^|]+)/)?.[1]?.trim();
    const manualPhone = obs.match(/Tel:\s*([^|]+)/)?.[1]?.trim();

    const customerName = isManual ? manualName : profile?.full_name;
    const customerPhone = isManual ? manualPhone : profile?.phone;
    const customerCode = profile?.customer_code
      ? `T${String(profile.customer_code).padStart(5, "0")}`
      : undefined;

    const addressParts = [
      order.address_street ? `${order.address_street}, ${order.address_number || "S/N"}` : "",
      order.address_complement || "",
      order.address_neighborhood || "",
    ].filter(Boolean);
    const address = isTable ? "" : addressParts.join(" - ");

    const isFiado = order.payment_method === "fiado";
    const isPix = order.payment_method === "pix";
    const isPaid = !isFiado && (order.payment_confirmed === true);
    const paymentLabel = isFiado
      ? "FIADO"
      : isPix && !order.payment_confirmed
        ? "PIX ENTREGA"
        : isPix && order.payment_confirmed
          ? "PIX PAGO"
          : isPaid
            ? "PAGO ONLINE"
            : "PAGO NA ENTREGA";

    const deliveryLabel = isTable
      ? "MESA"
      : order.delivery_type === "delivery"
        ? "DELIVERY"
        : order.delivery_type === "pickup"
          ? "RETIRADA"
          : (order.delivery_type || "DELIVERY").toUpperCase();

    const cleanObs = obs
      .split("|")
      .map((p: string) => p.trim())
      .filter((p: string) => p && p !== "[PDV]" && !/^Cliente:/i.test(p) && !/^Tel:/i.test(p) && !/^Código:/i.test(p) && !/^Mesa:/i.test(p))
      .join(" | ");

    const payload: EscPosOrderInput = {
      storeName: tpl?.store_name || "TURBO LANCHES",
      orderLabel: tpl?.label || (isTable ? "MESA" : "PEDIDO"),
      orderNumber,
      dateTime,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      customerCode,
      address: address || undefined,
      deliveryLabel,
      items: items.map((it: any) => ({
        name: it.product_name,
        quantity: it.quantity,
        unitPrice: Number(it.unit_price),
        observations: it.observations,
        addons: Array.isArray(it.addons_json) ? it.addons_json : [],
      })),
      subtotal: Number(order.subtotal) || 0,
      deliveryFee: Number(order.delivery_fee) || 0,
      discount: Number(order.discount) || 0,
      total: Number(order.total) || 0,
      paymentMethod: order.payment_method || "",
      paymentLabel,
      changeFor: order.change_for ? Number(order.change_for) : undefined,
      observations: cleanObs || undefined,
      customMessage: tpl?.custom_message || undefined,
      footerMessage: tpl?.footer_message || undefined,
    };

    // 4. Gera bytes ESC/POS e envia
    const bytes = buildOrderEscPos(payload, {
      columns: settings.qzColumns,
      codepage: settings.qzCodepage,
      feedLines: settings.qzFeedLines,
    });

    await printRawEscPos(settings.qzPrinterName, bytes, options.copies || 1);
    return true;
  } catch (err) {
    console.error("[QZ] erro ao imprimir, fallback para HTML", err);
    return false;
  }
};

export const __unused = (_: unknown) => fmt(0);
