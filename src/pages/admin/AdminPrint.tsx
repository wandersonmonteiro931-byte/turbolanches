import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { ReceiptTemplate } from "@/hooks/useReceiptTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";
import {
  buildAdminPrintDocument,
  stripFormattingTags,
} from "@/lib/adminPrintTemplates";

const ITEM_BLOCK_TOKENS = ["[ITENS]", "[ITEM]"] as const;
const ITEM_TEMPLATE_TOKENS = [
  ...ITEM_BLOCK_TOKENS,
  "[PRODUTO]",
  "[PRODUTOS]",
  "[QNTITENS]",
  "[QUANTIDADEPROD]",
  "[VALORITEM]",
  "[PREÇOPROD]",
  "[OBSITEM]",
] as const;

const replaceTokens = (text: string, variables: Record<string, string>) => {
  let result = text;

  for (let pass = 0; pass < 2; pass += 1) {
    for (const [token, value] of Object.entries(variables)) {
      result = result.split(token).join(value);
    }
  }

  return result;
};

const hasItemTemplateTokens = (text: string) => ITEM_TEMPLATE_TOKENS.some((token) => text.includes(token));

const getTemplateForItemsLine = (rawLine: string) => {
  let lineWithoutItems = rawLine;

  for (const token of ITEM_BLOCK_TOKENS) {
    lineWithoutItems = lineWithoutItems.split(token).join("");
  }

  lineWithoutItems = lineWithoutItems.trim();
  if (!lineWithoutItems) return null;

  const visibleContent = stripFormattingTags(lineWithoutItems);
  const hasItemVars = ITEM_TEMPLATE_TOKENS.some((token) => lineWithoutItems.includes(token));

  return visibleContent || hasItemVars ? lineWithoutItems : null;
};

const shouldHideOptionalItemLine = (rawLine: string, variables: Record<string, string>) => {
  if (!rawLine.includes("[OBSITEM]")) return false;

  const itemObservation = variables["[OBSITEM]"] ?? "";
  if (itemObservation.trim()) return false;

  const remainingContent = stripFormattingTags(replaceTokens(rawLine, { ...variables, "[OBSITEM]": "" }))
    .replace(/\s+/g, " ")
    .trim();

  return !remainingContent || /^obs(item)?\s*:?$/i.test(remainingContent);
};

const LEGACY_RECEIPT_PRINT_CSS = `
  body {
    padding: 0 !important;
    margin: 0 !important;
    letter-spacing: 0 !important;
  }
  .print-root {
    padding: 0 !important;
    margin: 0 !important;
  }
  .print-document {
    padding: 0 !important;
    margin: 0 !important;
  }
  .print-section {
    padding: 0 !important;
    margin: 0 !important;
  }
  .separator {
    border-top-width: 1px !important;
    margin: 1mm 0 !important;
  }
  .info,
  .grand-total,
  .txt-medio {
    font-size: 9px !important;
    line-height: 1.18 !important;
    margin: 0.5mm 0 !important;
    font-weight: 900 !important;
  }
  .txt-pequeno {
    font-size: 8px !important;
    line-height: 1.12 !important;
    margin: 0.3mm 0 !important;
    font-weight: 700 !important;
  }
  .txt-gigante,
  .pedido-destaque {
    font-size: 9px !important;
    line-height: 1.18 !important;
    margin: 0.5mm 0 !important;
    letter-spacing: 0 !important;
    text-align: inherit !important;
  }
  .tipo-label {
    display: block !important;
    width: 100% !important;
    font-size: 22px !important;
    line-height: 1.02 !important;
    margin: 0.8mm 0 1mm !important;
    padding: 2mm 0 1.5mm !important;
    border: 2px solid #000 !important;
    letter-spacing: 0.5px !important;
  }
  .box-highlight {
    display: block !important;
    width: 100% !important;
    font-size: 11px !important;
    line-height: 1.25 !important;
    margin: 0.5mm 0 !important;
    padding: 0.8mm 1.5mm !important;
    border: 2.5px solid #000 !important;
    font-weight: 900 !important;
  }
  .inline-border {
    display: block !important;
    width: 100% !important;
    font-size: 9px !important;
    line-height: 1.12 !important;
    margin: 0.5mm 0 !important;
    padding: 1mm 1.5mm !important;
    border: 1.5px solid #000 !important;
  }
  .txt-borda-preta {
    font-size: 9px !important;
    line-height: 1.12 !important;
    padding: 1mm !important;
    letter-spacing: 0 !important;
  }
`;

const AdminPrint = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tipo = searchParams.get("tipo") || "pedido";

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [tpl, setTpl] = useState<ReceiptTemplate | null>(null);

  const resolveType = (t: string) => {
    if (t === "cozinha" || t === "entrega") return "pedido";
    if (t === "cliente") return "obrigado";
    return t;
  };

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data: orderData, error: orderErr } = await supabase
        .from("orders").select("*").eq("id", id).single();
      if (orderErr || !orderData) { setError("Pedido não encontrado"); return; }
      setOrder(orderData);

      const tplType = resolveType(tipo);
      const [itemsRes, profileRes, tplRes] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", id),
        supabase.from("profiles").select("full_name, phone, complement, quadra, lote, street, neighborhood, customer_code").eq("user_id", orderData.user_id).single(),
        supabase.from("receipt_templates" as any).select("*").eq("template_type", tplType).single(),
      ]);

      setItems(itemsRes.data || []);
      setProfile(profileRes.data);
      setTpl((tplRes.data as unknown as ReceiptTemplate) || null);
      setReady(true);
    };
    load();
  }, [id, tipo]);

  const printDelayMs = Math.max(0, Number(searchParams.get("delay_ms") || "100") || 100);

  const printableDocument = useMemo(() => {
    if (!ready || !order) return "";

    const createdAt = new Date(order.created_at);
    const dataHoraPedido = createdAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const maxEntrega = new Date(createdAt.getTime() + 45 * 60 * 1000);
    const horarioMax = maxEntrega.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const agora = new Date();
    const dataAgora = agora.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const horarioSaida = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const complemento = order.address_complement || "";
    const quadraLote = [profile?.quadra ? `Qd. ${profile.quadra}` : "", profile?.lote ? `Lt. ${profile.lote}` : ""].filter(Boolean).join(", ");
    const addressLine1 = order.address_street ? `${order.address_street}, ${order.address_number || "S/N"}` : "";
    const addressLine2 = quadraLote || "";
    const addressLine3 = complemento || "";
    const addressLine4 = order.address_neighborhood || "";
    const address = [addressLine1, addressLine2, addressLine3, addressLine4].filter(Boolean).join(" | ") || "Retirada no local";

    const deliveryLabel = order.delivery_type === "delivery" ? "DELIVERY" : order.delivery_type === "pickup" ? "RETIRADA" : order.delivery_type?.toUpperCase() || "DELIVERY";

    const subtotal = Number(order.subtotal);
    const deliveryFee = Number(order.delivery_fee);
    const discount = Number(order.discount) || 0;
    const total = Number(order.total);
    const isFiado = order.payment_method === "fiado";
    const isPix = order.payment_method === "pix";
    const isPixPago = isPix && order.payment_confirmed;
    const isPixEntrega = isPix && !order.payment_confirmed;
    const isPaidOnline = !isFiado && (isPixPago || (!isPix && order.payment_confirmed));
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

    const obsText = order.observations || "";
    const isManualOrder = obsText.includes("[PDV]");
    const manualClienteMatch = obsText.match(/Cliente:\s*([^|]+)/);
    const manualTelMatch = obsText.match(/Tel:\s*([^|]+)/);
    const manualCodeMatch = obsText.match(/Código:\s*(T\d+)/);

    const displayName = isManualOrder ? (manualClienteMatch?.[1]?.trim() || "") : (profile?.full_name || "");
    const displayPhone = isManualOrder ? (manualTelMatch?.[1]?.trim() || "") : (profile?.phone || "");
    const customerCode = isManualOrder ? (manualCodeMatch?.[1]?.trim() || "") : (profile?.customer_code ? `T${String(profile.customer_code).padStart(5, "0")}` : "");

    const storeName = tpl?.store_name || "TURBO LANCHES";
    const resolvedType = resolveType(tipo);
    const tipoLabel = tpl?.label || (resolvedType === "obrigado" ? "OBRIGADO!" : "PEDIDO");
    const divulgacao = tpl?.custom_message || "";
    const rodape = tpl?.footer_message || "";

    const fmt = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

    const couponInfo = order.coupon_code
      ? `${order.coupon_code} (-${fmt(discount)})`
      : "Nenhum";

    const varMap: Record<string, string> = {
      "[NUMEROPEDIDO]": `#${String(order.order_number).padStart(5, "0")}`,
      "[NOMECLIENTE]": displayName || "Não informado",
      "[CODIGOCLIENTE]": customerCode,
      "[TELEFONECLIENTE]": displayPhone || "Não informado",
      "[ENDEREÇO]": address,
      "[FORMAPAGTO]": `${order.payment_method?.toUpperCase()} - ${paymentLabel}`,
      "[TOTALRECEBER]": fmt(totalReceber),
      "[TOTALPAGO]": fmt(totalPago),
      "[SUBTOTAL]": fmt(subtotal),
      "[TOTAL]": fmt(total),
      "[TAXAENTREGA]": fmt(deliveryFee),
      "[DESCONTO]": fmt(discount),
      "[CUPOM]": couponInfo,
      "[TROCO]": troco > 0 ? fmt(troco) : "R$ 0,00",
      "[NOMELOJA]": storeName,
      "[TIPOCOMANDA]": tipoLabel,
      "[DATAHORA]": dataAgora,
      "[DATAAGORA]": dataAgora,
      "[DATAHORAPEDIDO]": dataHoraPedido,
      "[DATAHORAENTREGA]": horarioMax,
      "[DATAHORASAÍDAENTREGA]": horarioSaida,
      "[OBS]": obsText ? `OBS: ${obsText}` : "",
      "[DELIVERYRETIRADAVIAGEM]": deliveryLabel,
      "[RODAPÉ]": rodape,
      "[DIVULGAÇÃO]": divulgacao,
    };

    const buildDefaultItemLines = (item: any) => {
      const lineTotal = Number(item.unit_price) * item.quantity;
      const lines = [`${item.quantity}x ${item.product_name} - ${fmt(lineTotal)}`];
      const addons = Array.isArray(item.addons_json) ? item.addons_json : [];

      addons.forEach((addon: any) => {
        lines.push(`+ ${addon.name}${(addon.quantity || 1) > 1 ? ` x${addon.quantity}` : ""}`);
      });

      if (item.observations?.trim()) {
        lines.push(`Obs: ${item.observations.trim()}`);
      }

      return lines;
    };

    const rawTemplate = tpl?.body_template || getDefaultTemplate(resolvedType);
    const expandedTemplate = rawTemplate
      .split("\n")
      .flatMap((rawLine) => {
        if (!hasItemTemplateTokens(rawLine)) return [rawLine];
        if (items.length === 0) return [];

        const itemTemplate = getTemplateForItemsLine(rawLine);

        return items.flatMap((item) => {
          const lineTotal = Number(item.unit_price) * item.quantity;
          const itemVars = {
            "[PRODUTO]": item.product_name,
            "[PRODUTOS]": item.product_name,
            "[QNTITENS]": String(item.quantity),
            "[QUANTIDADEPROD]": String(item.quantity),
            "[VALORITEM]": fmt(lineTotal),
            "[PREÇOPROD]": fmt(Number(item.unit_price)),
            "[OBSITEM]": item.observations?.trim() || "",
          };

          if (!itemTemplate) {
            return buildDefaultItemLines(item);
          }

          if (shouldHideOptionalItemLine(itemTemplate, itemVars)) {
            return [];
          }

          const expandedLine = replaceTokens(itemTemplate, itemVars);
          return stripFormattingTags(expandedLine).trim() ? [expandedLine] : [];
        });
      })
      .join("\n");

    return buildAdminPrintDocument({
      title: `${tipoLabel} ${String(order.order_number).padStart(5, "0")}`,
      template: expandedTemplate,
      variables: varMap,
      pageWidthMm: 72,
      pageHeightMm: "auto",
      pageMarginMm: 0,
      bodyFontFamily: "'Arial Black', Arial, Helvetica, sans-serif",
      bodyFontSizePx: 9,
      labelFontSizePx: 22,
      bodyPaddingMm: 0,
      sectionPaddingMm: 0,
      extraCss: LEGACY_RECEIPT_PRINT_CSS,
    });
  }, [items, order, profile, ready, tipo, tpl]);

  useEffect(() => {
    if (!printableDocument || !ready) return;

    const timer = setTimeout(() => {
      document.open();
      document.write(printableDocument);
      document.close();
    }, Math.max(60, printDelayMs));

    return () => clearTimeout(timer);
  }, [printDelayMs, printableDocument, ready]);

  if (error) return <div style={{ padding: 20, fontFamily: "monospace" }}>{error}</div>;
  if (!ready || !printableDocument) return <div style={{ padding: 20, fontFamily: "monospace" }}>Preparando impressão...</div>;

  return <div style={{ padding: 20, fontFamily: "monospace" }}>Abrindo impressão...</div>;
};

export default AdminPrint;
