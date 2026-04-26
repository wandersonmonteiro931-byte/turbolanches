/**
 * Roteador de impressão: tenta QZ Tray (ESC/POS) primeiro; se falhar ou
 * estiver desabilitado, devolve `false` para o chamador cair no popup HTML.
 *
 * Renderiza o MESMO template salvo em receipt_templates (com tags
 * [CENTRO], [GRANDE], [TXTMEDIO], [QUADRADONEGRITO], [ITENS], etc),
 * mantendo o layout configurado pelo admin.
 */

import { supabase } from "@/integrations/supabase/client";
import { getThermalPrintSettings } from "./thermalPrintSettings";
import { renderTemplateToEscPos, type ItemForTemplate } from "./escposTemplate";
import { isQzAvailable, printRawEscPos } from "./qzTray";

interface PrintOrderViaQzOptions {
  tipo?: string;
  copies?: number;
}

const fmt = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

const resolveType = (tipo: string): string => {
  if (tipo === "cozinha" || tipo === "entrega") return "pedido";
  if (tipo === "cliente") return "obrigado";
  if (tipo === "mesa_cliente") return "mesa";
  return tipo;
};

const DEFAULT_LABELS: Record<string, string> = {
  pedido: "PEDIDO",
  mesa: "MESA",
  mesa_conta: "CONTA MESA",
  mesa_cobrar: "COBRAR MESA",
  obrigado: "OBRIGADO!",
  entregador: "FECHAMENTO DE ROTA",
};

const formatPrintAddress = (value: string) => value.toLocaleUpperCase("pt-BR");

// Fallback minimalista — só usado se o template do banco não existir
const FALLBACK_TEMPLATE = `[CENTRO][NOMELOJA][/CENTRO]
[CENTRO][TIPOCOMANDA][/CENTRO]
[CENTRO][GRANDE][NUMEROPEDIDO][/GRANDE][/CENTRO]
[DATAHORAPEDIDO]
---
Cliente: [NOMECLIENTE]
Telefone: [TELEFONECLIENTE]
[ENDEREÇO]
---
[ITENS]
---
SUBTOTAL: [SUBTOTAL]
ENTREGA: [TAXAENTREGA]
DESCONTO: [DESCONTO]
TOTAL: [TOTAL]
[FORMAPAGTO]
[CENTRO]TOTAL A RECEBER: [TOTALRECEBER][/CENTRO]
---
[OBS]
[CENTRO]*** [DELIVERYRETIRADAVIAGEM] ***[/CENTRO]
`;

export const tryPrintOrderViaQz = async (
  orderId: string,
  options: PrintOrderViaQzOptions = {},
): Promise<boolean> => {
  const settings = getThermalPrintSettings();
  if (!settings.qzEnabled || !settings.qzPrinterName) return false;

  try {
    const available = await isQzAvailable();
    if (!available) {
      console.warn("[QZ] Tray indisponível, caindo no popup HTML");
      return false;
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders").select("*").eq("id", orderId).single();
    if (orderErr || !order) {
      console.warn("[QZ] pedido não encontrado", orderId);
      return false;
    }

    const tipoIn = options.tipo || "pedido";
    const isTableOrder = order.delivery_type === "mesa";
    const resolvedType = isTableOrder && resolveType(tipoIn) === "pedido"
      ? "mesa"
      : resolveType(tipoIn);

    const [itemsRes, profileRes, tplRes, courierRes] = await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", orderId),
      supabase.from("profiles").select("full_name, phone, customer_code, quadra, lote").eq("user_id", order.user_id).maybeSingle(),
      supabase.from("receipt_templates" as any).select("*").eq("template_type", resolvedType).maybeSingle(),
      order.courier_id
        ? supabase.from("couriers").select("name").eq("id", order.courier_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const items = itemsRes.data || [];
    const profile: any = profileRes.data;
    const tpl: any = tplRes.data;
    const courierName: string = (courierRes as any)?.data?.name || "";

    const rawTableCode = (order.table_code as string)
      || (order.observations?.match(/Mesa:\s*(#?MESA\d+)/i)?.[1] ?? "#MESA--");
    const tableCode = rawTableCode.startsWith("#")
      ? rawTableCode.toUpperCase()
      : `#${rawTableCode.toUpperCase()}`;

    const obsText: string = order.observations || "";
    const isManualOrder = obsText.includes("[PDV]");
    const manualName = obsText.match(/Cliente:\s*([^|]+)/)?.[1]?.trim();
    const manualPhone = obsText.match(/Tel:\s*([^|]+)/)?.[1]?.trim();
    const manualCode = obsText.match(/Código:\s*(T\d+)/)?.[1]?.trim();

    const displayName = isManualOrder ? (manualName || "") : (profile?.full_name || "");
    const displayPhone = isManualOrder ? (manualPhone || "") : (profile?.phone || "");
    const customerCode = isManualOrder
      ? (manualCode || "")
      : (profile?.customer_code ? `T${String(profile.customer_code).padStart(5, "0")}` : "");

    const quadraLote = [
      profile?.quadra ? `Qd. ${profile.quadra}` : "",
      profile?.lote ? `Lt. ${profile.lote}` : "",
    ].filter(Boolean).join(", ");
    const addressParts = [
      order.address_street ? `${order.address_street}, ${order.address_number || "S/N"}` : "",
      quadraLote,
      order.address_complement || "",
      order.address_neighborhood || "",
    ].filter(Boolean);
    const address = isTableOrder
      ? tableCode
      : formatPrintAddress(addressParts.join(" | ") || "Retirada no local");

    const subtotal = Number(order.subtotal) || 0;
    const deliveryFee = Number(order.delivery_fee) || 0;
    const discount = Number(order.discount) || 0;
    const total = Number(order.total) || 0;
    const isFiado = order.payment_method === "fiado";
    const isPix = order.payment_method === "pix";
    const isPixPago = isPix && order.payment_confirmed;
    const isPixEntrega = isPix && !order.payment_confirmed;
    const isMesaConta = resolvedType === "mesa_conta";
    const isPaidOnline = !isFiado && !isMesaConta && (isPixPago || (!isPix && order.payment_confirmed));
    const totalReceber = isPaidOnline ? 0 : total;
    const totalPago = isPaidOnline ? total : 0;
    const changeFor = order.change_for ? Number(order.change_for) : 0;
    const troco = !isPaidOnline && !isFiado && changeFor > total ? changeFor - total : 0;

    const paymentLabel = isFiado
      ? "FIADO"
      : isPixEntrega
        ? "PIX ENTREGA"
        : isPixPago
          ? "PIX PAGO"
          : isPaidOnline
            ? "PAGO ONLINE"
            : "PAGO NA ENTREGA";

    const deliveryLabel = isTableOrder
      ? "MESA"
      : order.delivery_type === "delivery"
        ? "DELIVERY"
        : order.delivery_type === "pickup"
          ? "RETIRADA"
          : (order.delivery_type || "DELIVERY").toUpperCase();

    const dateTime = new Date(order.created_at).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const agora = new Date();
    const dataAgora = agora.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const cleanObs = obsText
      .split("|")
      .map((p: string) => p.trim())
      .filter((p: string) => p && p !== "[PDV]" && !/^Cliente:/i.test(p) && !/^Tel:/i.test(p) && !/^Código:/i.test(p) && !/^Mesa:/i.test(p))
      .join(" | ");

    const storeName = tpl?.store_name || "TURBO LANCHES";
    const tipoLabel = tpl?.label || DEFAULT_LABELS[resolvedType] || "PEDIDO";
    const couponInfo = order.coupon_code
      ? `${order.coupon_code} (-${fmt(discount)})`
      : "Nenhum";

    const variables: Record<string, string> = {
      "[NUMEROPEDIDO]": isTableOrder ? tableCode : `#${String(order.order_number).padStart(5, "0")}`,
      "[MESA]": tableCode,
      "[NOMECLIENTE]": displayName || "Não informado",
      "[CODIGOCLIENTE]": customerCode,
      "[TELEFONECLIENTE]": displayPhone || "Não informado",
      "[ENDEREÇO]": address,
      "[ENDERECO]": address,
      "[FORMAPAGTO]": `${(order.payment_method || "").toUpperCase()} - ${paymentLabel}`,
      "[TOTALRECEBER]": fmt(totalReceber),
      "[TOTALPAGO]": fmt(totalPago),
      "[SUBTOTAL]": fmt(subtotal),
      "[TOTAL]": fmt(total),
      "[TAXAENTREGA]": fmt(deliveryFee),
      "[DESCONTO]": fmt(discount),
      "[CUPOM]": couponInfo,
      "[TROCO]": troco > 0 ? `DEVOLVER: ${fmt(troco)}` : "R$ 0,00",
      "[NOMELOJA]": storeName,
      "[TIPOCOMANDA]": tipoLabel,
      "[DATAHORA]": dataAgora,
      "[DATAAGORA]": dataAgora,
      "[DATAHORAPEDIDO]": dateTime,
      "[OBS]": cleanObs ? `OBS: ${cleanObs}` : "",
      "[DELIVERYRETIRADAVIAGEM]": deliveryLabel,
      "[NOMEENTREGADOR]": "",
      "[RODAPÉ]": tpl?.footer_message || "",
      "[DIVULGAÇÃO]": tpl?.custom_message || "",
    };

    const itemsForTpl: ItemForTemplate[] = items.map((it: any) => ({
      productName: it.product_name,
      quantity: it.quantity,
      unitPrice: Number(it.unit_price),
      observations: it.observations,
      addons: Array.isArray(it.addons_json) ? it.addons_json : [],
    }));

    const template: string = (tpl?.body_template as string) || FALLBACK_TEMPLATE;

    const bytes = renderTemplateToEscPos(
      { template, variables, items: itemsForTpl },
      {
        columns: settings.qzColumns,
        codepage: settings.qzCodepage,
        feedLines: settings.qzFeedLines,
      },
    );

    await printRawEscPos(settings.qzPrinterName, bytes, options.copies || 1);
    return true;
  } catch (err) {
    console.error("[QZ] erro ao imprimir, fallback para HTML", err);
    return false;
  }
};
