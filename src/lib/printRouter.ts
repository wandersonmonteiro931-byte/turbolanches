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
import { getPrintMode } from "./printModePreference";
import { printWifiEscPos } from "./wifiPrinter";

interface PrintOrderViaQzOptions {
  tipo?: string;
  copies?: number;
}

const fmt = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

const normalizeTextForQzTemplate = (value: string) =>
  String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[🔒🔓]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const resolveType = (tipo: string): string => {
  if (tipo === "cozinha" || tipo === "entrega") return "pedido";
  if (tipo === "cliente") return "obrigado";
  if (tipo === "mesa_cliente") return "mesa";
  return tipo;
};

const PRINT_DEDUPE_WINDOW_MS = 5000;
const printDedupeMap = new Map<string, number>();

const shouldSkipDuplicatePrint = (key: string) => {
  const now = Date.now();
  const last = printDedupeMap.get(key) || 0;

  if (now - last < PRINT_DEDUPE_WINDOW_MS) {
    console.warn("[QZ] impressão duplicada bloqueada:", key);
    return true;
  }

  printDedupeMap.set(key, now);

  // Limpa registros antigos para não crescer indefinidamente.
  for (const [mapKey, mapTime] of printDedupeMap.entries()) {
    if (now - mapTime > PRINT_DEDUPE_WINDOW_MS * 3) {
      printDedupeMap.delete(mapKey);
    }
  }

  return false;
};

const DEFAULT_LABELS: Record<string, string> = {
  pedido: "PEDIDO",
  mesa: "MESA",
  mesa_conta: "CONTA MESA",
  mesa_cobrar: "COBRAR MESA",
  obrigado: "OBRIGADO!",
  entregador: "FECHAMENTO DE ROTA",
  panfleto: "PANFLETO",
};

const formatPrintAddress = (value: string) => value.toLocaleUpperCase("pt-BR");

const cleanAddressPart = (value: unknown) => String(value ?? "").trim();

const normalizePdvAddressExact = (value: string) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, " ,")
    .replace(/\s+-\s+/g, " - ")
    .trim();

const buildPdvAddressExact = (order: any, fallback: string) => {
  // PDV: imprimir o endereço exatamente como foi digitado/salvo.
  // Não inserir QD, LT, LOTE, complemento ou dados automáticos.
  const directAddress = cleanAddressPart(
    order.address ||
      order.delivery_address ||
      order.customer_address ||
      order.full_address ||
      order.endereco ||
      order.endereco_completo,
  );

  if (directAddress) return normalizePdvAddressExact(directAddress);

  // Se não existir campo completo, monta somente com os campos realmente salvos no pedido,
  // sem inventar QD/LT e sem deixar tudo maiúsculo.
  const street = cleanAddressPart(order.address_street || order.street || order.rua);
  const number = cleanAddressPart(order.address_number || order.number || order.numero);
  const complement = cleanAddressPart(order.address_complement || order.complement || order.complemento);
  const neighborhood = cleanAddressPart(order.address_neighborhood || order.neighborhood || order.bairro);
  const reference = cleanAddressPart(order.address_reference || order.reference || order.referencia);

  const first = street ? `${street}${number ? ` , ${number}` : ""}` : "";
  const second = complement;
  const third = neighborhood;
  const fourth = reference;

  const address = [first, second, third, fourth].filter(Boolean).join(" - ");
  return normalizePdvAddressExact(address || fallback);
};

const normalizeAddressDuplicates = (value: string) => {
  let out = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  // Não converter Q para QD e não converter L/LOTE para LT.
  // Apenas remove repetições idênticas ou equivalentes quando vierem duplicadas no texto.
  out = out.replace(/\b(QD|Q)\s*([A-Z0-9]+)\s+\b(QD|Q)\s*\2\b/gi, (_m, first, num) => `${first.toUpperCase()} ${num}`);
  out = out.replace(
    /\b(LT|L|LOTE)\s*([A-Z0-9]+)\s+\b(LT|L|LOTE)\s*\2\b/gi,
    (_m, first, num) => `${first.toUpperCase()} ${num}`,
  );

  out = out.replace(
    /\b(QD|Q)\s*([A-Z0-9]+)\s*([,|/\-]+)\s*\b(QD|Q)\s*\2\b/gi,
    (_m, first, num) => `${first.toUpperCase()} ${num}`,
  );
  out = out.replace(
    /\b(LT|L|LOTE)\s*([A-Z0-9]+)\s*([,|/\-]+)\s*\b(LT|L|LOTE)\s*\2\b/gi,
    (_m, first, num) => `${first.toUpperCase()} ${num}`,
  );

  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\|\s*\|/g, "|")
    .replace(/\s+\|/g, " |")
    .replace(/\|\s+/g, "| ")
    .trim();
};

const buildPdvAddress = (order: any, fallback: string) => {
  // PDV: nunca montar quadra/lote automaticamente.
  // Usa somente o endereço completo salvo/digitado no pedido.
  const directAddress = cleanAddressPart(
    order.address ||
      order.delivery_address ||
      order.customer_address ||
      order.full_address ||
      order.endereco ||
      order.endereco_completo,
  );

  if (directAddress) {
    return formatPrintAddress(normalizeAddressDuplicates(directAddress));
  }

  // Se não houver endereço completo salvo, usa apenas os campos básicos digitados,
  // sem inventar QD, LT, LOTE ou complemento automático.
  const street = cleanAddressPart(order.address_street || order.street || order.rua);
  const number = cleanAddressPart(order.address_number || order.number || order.numero);
  const neighborhood = cleanAddressPart(order.address_neighborhood || order.neighborhood || order.bairro);
  const reference = cleanAddressPart(order.address_reference || order.reference || order.referencia);

  const parts = [street ? `${street}${number ? `, ${number}` : ""}` : "", neighborhood, reference].filter(Boolean);

  return formatPrintAddress(normalizeAddressDuplicates(parts.join(" | ") || fallback));
};

const buildOrderAddress = (order: any, isDeliveryType: boolean, fallback: string, isPdvOrder = false) => {
  if (!isDeliveryType) return fallback;

  if (isPdvOrder) {
    return buildPdvAddressExact(order, fallback);
  }

  const directAddress = cleanAddressPart(
    order.address ||
      order.delivery_address ||
      order.customer_address ||
      order.full_address ||
      order.endereco ||
      order.endereco_completo,
  );

  const parts = [
    cleanAddressPart(order.address_street || order.street || order.rua),
    cleanAddressPart(order.address_number || order.number || order.numero || "S/N"),
    cleanAddressPart(order.address_complement || order.complement || order.complemento),
    cleanAddressPart(order.address_neighborhood || order.neighborhood || order.bairro),
    cleanAddressPart(order.address_reference || order.reference || order.referencia),
  ].filter(Boolean);

  const composed = parts.length > 0 ? parts.join(" | ") : "";
  return formatPrintAddress(normalizeAddressDuplicates(directAddress || composed || fallback));
};

const highlightQzValue = (value: string) => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return `[DESTAQUE]${clean}[/DESTAQUE]`;
};

const hasPriorityText = (value: unknown) => /prioridade|urgente|preferencial|atrasado|atraso/i.test(String(value || ""));

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

export const tryPrintOrderViaQz = async (orderId: string, options: PrintOrderViaQzOptions = {}): Promise<boolean> => {
  const tipoIn = options.tipo || "pedido";
  const copies = Math.max(1, Number(options.copies || 1));
  const dedupeKey = `${orderId}:${resolveType(tipoIn)}:${copies}`;

  // Evita duas impressões do mesmo pedido quando duas telas/funções chamam QZ ao mesmo tempo
  // ou quando o botão é clicado duas vezes.
  if (shouldSkipDuplicatePrint(dedupeKey)) return true;

  const settings = getThermalPrintSettings();
  if (!settings.qzEnabled || !settings.qzPrinterName) return false;

  try {
    const available = await isQzAvailable();
    if (!available) {
      console.warn("[QZ] Tray indisponível, caindo no popup HTML");
      return false;
    }

    const { data: order, error: orderErr } = await supabase.from("orders").select("*").eq("id", orderId).single();
    if (orderErr || !order) {
      console.warn("[QZ] pedido não encontrado", orderId);
      return false;
    }

    const orderPriorityFields = order as unknown as {
      priority?: unknown;
      priority_level?: unknown;
      delivery_priority?: unknown;
      observations?: unknown;
    };

    const isTableOrder = order.delivery_type === "mesa";
    const resolvedType = isTableOrder && resolveType(tipoIn) === "pedido" ? "mesa" : resolveType(tipoIn);

    const [itemsRes, profileRes, tplRes, courierRes] = await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", orderId),
      supabase.from("profiles").select("full_name, phone, customer_code").eq("user_id", order.user_id).maybeSingle(),
      supabase
        .from("receipt_templates" as any)
        .select("*")
        .eq("template_type", resolvedType)
        .maybeSingle(),
      order.courier_id
        ? supabase.from("couriers").select("name").eq("id", order.courier_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const items = itemsRes.data || [];
    const profile: any = profileRes.data;
    const tpl: any = tplRes.data;
    const courierName: string = (courierRes as any)?.data?.name || "";

    const rawTableCode =
      (order.table_code as string) || (order.observations?.match(/Mesa:\s*(#?MESA\d+)/i)?.[1] ?? "#MESA--");
    const tableCode = rawTableCode.startsWith("#") ? rawTableCode.toUpperCase() : `#${rawTableCode.toUpperCase()}`;

    const obsText: string = order.observations || "";
    const isManualOrder = obsText.includes("[PDV]");
    const manualName = obsText.match(/Cliente:\s*([^|]+)/)?.[1]?.trim();
    const manualPhone = obsText.match(/Tel:\s*([^|]+)/)?.[1]?.trim();
    const manualCode = obsText.match(/Código:\s*(T\d+)/)?.[1]?.trim();

    const displayName = isManualOrder ? manualName || "" : profile?.full_name || "";
    const displayPhone = isManualOrder ? manualPhone || "" : profile?.phone || "";
    const customerCode = isManualOrder
      ? manualCode || ""
      : profile?.customer_code
        ? `T${String(profile.customer_code).padStart(5, "0")}`
        : "";

    const isDeliveryType = order.delivery_type === "delivery";
    const noAddressLabel =
      order.payment_method === "fiado"
        ? "FIADO"
        : order.delivery_type === "retirada" || order.delivery_type === "pickup"
          ? "RETIRADA"
          : order.delivery_type === "mesa"
            ? "MESA"
            : order.delivery_type === "viagem"
              ? "VIAGEM"
              : (order.delivery_type || "").toUpperCase() || "RETIRADA";
    const address = isTableOrder ? tableCode : buildOrderAddress(order, isDeliveryType, noAddressLabel, isManualOrder);

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
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const agora = new Date();
    const dataAgora = agora.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const horarioSaida = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const maxEntrega = new Date(new Date(order.created_at).getTime() + 45 * 60 * 1000);
    const horarioMax = maxEntrega.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const cleanObs = obsText
      .split("|")
      .map((p: string) => p.trim())
      .filter(
        (p: string) =>
          p &&
          p !== "[PDV]" &&
          !/^Cliente:/i.test(p) &&
          !/^Tel:/i.test(p) &&
          !/^Código:/i.test(p) &&
          !/^Mesa:/i.test(p),
      )
      .join(" | ");

    const storeName = tpl?.store_name || "TURBO LANCHES";
    const tipoLabel = tpl?.label || DEFAULT_LABELS[resolvedType] || "PEDIDO";
    const couponInfo = order.coupon_code ? `${order.coupon_code} (-${fmt(discount)})` : "Nenhum";

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
      "[DATAHORAENTREGA]": horarioMax,
      "[DATAHORASAÍDAENTREGA]": horarioSaida,
      "[HORASAIDA]": horarioSaida,
      "[OBS]": cleanObs ? `OBS: ${cleanObs}` : "",
      "[DELIVERYRETIRADAVIAGEM]": deliveryLabel,
      "[NOMEENTREGADOR]": courierName,
      "[RODAPÉ]": tpl?.footer_message || "",
      "[DIVULGAÇÃO]": tpl?.custom_message || "",
    };

    // Destaques automáticos configurados na tela de Comandas de Impressão.
    // Regra: só aplica na comanda de PEDIDO. Obrigado, entregador, relatórios, mesa e etiquetas não são alterados.
    if (resolvedType === "pedido") {
      if (settings.pedidoHighlightOrderNumber) {
        variables["[NUMEROPEDIDO]"] = highlightQzValue(variables["[NUMEROPEDIDO]"]);
      }

      if (settings.pedidoHighlightDeliveryEstimate) {
        variables["[DATAHORAENTREGA]"] = highlightQzValue(variables["[DATAHORAENTREGA]"]);
      }

      if (
        settings.pedidoHighlightOrderPriority &&
        hasPriorityText(orderPriorityFields.priority || orderPriorityFields.priority_level || orderPriorityFields.observations || "")
      ) {
        variables["[OBS]"] = variables["[OBS]"]
          ? highlightQzValue(variables["[OBS]"])
          : highlightQzValue("PRIORIDADE DO PEDIDO");
      }

      if (
        settings.pedidoHighlightPriorityDeliveries &&
        order.delivery_type === "delivery" &&
        hasPriorityText(`${orderPriorityFields.delivery_priority || ""} ${orderPriorityFields.priority || ""} ${orderPriorityFields.observations || ""}`)
      ) {
        variables["[DELIVERYRETIRADAVIAGEM]"] = highlightQzValue(variables["[DELIVERYRETIRADAVIAGEM]"]);
      }
    }

    const itemsForTpl: ItemForTemplate[] = items.map((it: any) => ({
      productName: it.product_name || it.name || it.product || "ITEM",
      productCode: it.product_code ?? it.product_code_num ?? it.codigo ?? it.code ?? it.product_id ?? "",
      highlightQuantity: resolvedType === "pedido" && settings.pedidoHighlightItemQuantity,
      highlightComplements: resolvedType === "pedido" && settings.pedidoHighlightComplements,
      highlightObservations: resolvedType === "pedido" && settings.pedidoHighlightObservations,
      quantity: it.quantity,
      unitPrice: Number(it.unit_price),
      observations: it.observations,
      addons: Array.isArray(it.addons_json)
        ? it.addons_json
        : typeof it.addons_json === "string"
          ? (() => {
              try {
                const parsed = JSON.parse(it.addons_json);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          : [],
    }));

    const firstItem = itemsForTpl[0];
    const firstItemAddons = firstItem?.addons || [];
    const firstItemAddonsText = firstItemAddons
      .map((a: any) => `+ ${a.name}${(a.quantity || 1) > 1 ? ` x${a.quantity}` : ""}`)
      .join(" | ");
    const firstItemTotal = firstItem
      ? Number(firstItem.unitPrice || 0) * Number(firstItem.quantity || 0) +
        firstItemAddons.reduce((s: number, a: any) => s + (Number(a.price) || 0) * (Number(a.quantity) || 1), 0)
      : 0;

    Object.assign(variables, {
      "[PRODUTO]": firstItem?.productName || "",
      "[PRODUTOS]": firstItem?.productName || "",
      "[QNTITENS]": firstItem ? String(firstItem.quantity) : "",
      "[QUANTIDADEPROD]": firstItem ? String(firstItem.quantity) : "",
      "[VALORITEM]": firstItem ? fmt(firstItemTotal) : "",
      "[PREÇOPROD]": firstItem ? fmt(Number(firstItem.unitPrice || 0)) : "",
      "[PRECOPROD]": firstItem ? fmt(Number(firstItem.unitPrice || 0)) : "",
      "[OBSITEM]": firstItem
        ? [firstItemAddonsText, firstItem.observations?.trim() ? `OBS: ${firstItem.observations.trim()}` : ""]
            .filter(Boolean)
            .join(" ")
        : "",
      "[ADICIONAIS]": firstItemAddonsText,
      "[CÓDIGOPROD]": firstItem?.productCode == null ? "" : String(firstItem.productCode),
      "[CODIGOPROD]": firstItem?.productCode == null ? "" : String(firstItem.productCode),
      "[MARCA]": "",
      "[DATAFABRICACAO]": "",
      "[VALIDADE]": "",
      "[RESPONSAVEL]": "",
      "[TITULO]": "",
      "[TOTALITENS]": String(itemsForTpl.reduce((s, it) => s + Number(it.quantity || 0), 0)),
      "[LISTA]": "",
      "[RESFRIADO]": "",
      "[CONGELADO]": "",
      "[ARMAZENAR]": "",
      "[GRAUS]": "",
      "[FRASEARMAZ]": "",
    });

    const qzVariables: Record<string, string> = {};
    for (const [key, value] of Object.entries(variables)) {
      qzVariables[key] = normalizeTextForQzTemplate(value);
    }

    const template: string = (tpl?.body_template as string) || FALLBACK_TEMPLATE;

    const bytes = renderTemplateToEscPos(
      { template, variables: qzVariables, items: itemsForTpl },
      {
        columns: settings.qzColumns,
        codepage: settings.qzCodepage,
        feedLines: settings.qzFeedLines,
      },
    );

    await printRawEscPos(settings.qzPrinterName, bytes, copies);
    return true;
  } catch (err) {
    console.error("[QZ] erro ao imprimir, fallback para HTML", err);
    return false;
  }
};
