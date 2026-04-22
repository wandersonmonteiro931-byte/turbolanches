import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { ReceiptTemplate } from "@/hooks/useReceiptTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";
import {
  buildAdminPrintDocument,
  stripFormattingTags,
  escapeHtml,
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
  "[ADICIONAIS]",
  "[CÓDIGOPROD]",
  "[CODIGOPROD]",
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
    font-family: Arial, Helvetica, sans-serif !important;
    font-weight: 900 !important;
    letter-spacing: 0 !important;
  }
  .print-root, .print-document, .print-section {
    padding: 0 !important;
    margin: 0 !important;
  }
  .separator {
    border-top: 1.5px dashed #000 !important;
    margin: 1.5px 0 !important;
  }
  .txt-borda-preta {
    display: block !important;
    width: 100% !important;
    margin: 1.5px 0 !important;
    padding: 1mm 2mm !important;
    background: #000 !important;
    color: #fff !important;
    font-weight: 900 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .txt-borda-inline {
    display: inline !important;
    padding: 0.3mm 2mm !important;
    background: #000 !important;
    color: #fff !important;
    font-weight: 900 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .inline-border {
    display: block !important;
    width: 100% !important;
    margin: 1.5px 0 !important;
    padding: 0.8mm 1.5mm !important;
    border: 2.5px solid #000 !important;
    font-weight: 900 !important;
  }
  .list-name,
  .list-row {
    font-weight: 900 !important;
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
  const [courierName, setCourierName] = useState("");

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

      // Fetch courier name if assigned
      if (orderData.courier_id) {
        const { data: courierData } = await supabase
          .from("couriers")
          .select("name")
          .eq("id", orderData.courier_id)
          .maybeSingle();
        setCourierName(courierData?.name || "");
      }

      setReady(true);
    };
    load();
  }, [id, tipo]);

  const printDelayMs = Math.max(0, Number(searchParams.get("delay_ms") || "100") || 100);
  const repeatCount = Math.max(1, Math.min(20, Number(searchParams.get("copies") || "1") || 1));
  const keepOpen = searchParams.get("keep_open") === "1";
  const printedRef = useRef(false);

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
    const defaultLabels: Record<string, string> = {
      pedido: "PEDIDO",
      obrigado: "OBRIGADO!",
      entregador: "FECHAMENTO DE ROTA",
      etiquetas: "ETIQUETA",
      reposicao: "LISTA DE COMPRAS",
    };
    const tipoLabel = tpl?.label || defaultLabels[resolvedType] || "PEDIDO";
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
      "[TROCO]": troco > 0 ? `[FUNDPRETO]DEVOLVER: ${fmt(troco)}[/FUNDPRETO]` : "R$ 0,00",
      "[NOMELOJA]": storeName,
      "[TIPOCOMANDA]": tipoLabel,
      "[DATAHORA]": dataAgora,
      "[DATAAGORA]": dataAgora,
      "[DATAHORAPEDIDO]": dataHoraPedido,
      "[DATAHORAENTREGA]": horarioMax,
      "[DATAHORASAÍDAENTREGA]": horarioSaida,
      "[HORASAIDA]": horarioSaida,
      "[OBS]": obsText ? `OBS: ${obsText}` : "",
      "[DELIVERYRETIRADAVIAGEM]": deliveryLabel,
      "[RODAPÉ]": rodape,
      "[DIVULGAÇÃO]": divulgacao,
      "[NOMEENTREGADOR]": courierName || "",
    };

    const shouldShowProductCode = resolvedType !== "pedido";
    const formatCode = (c: any) => (shouldShowProductCode && c != null && c !== "" ? `[${c}] ` : "");
    const formatAddonsText = (item: any) => {
      const addons = Array.isArray(item.addons_json) ? item.addons_json : [];
      return addons.map((addon: any) => `+ ${addon.name}${(addon.quantity || 1) > 1 ? ` x${addon.quantity}` : ""}`).join(" | ");
    };
    const getAddonsTotal = (item: any) => {
      const addons = Array.isArray(item.addons_json) ? item.addons_json : [];
      return addons.reduce((sum: number, addon: any) => sum + (Number(addon.price) || 0) * (Number(addon.quantity) || 1), 0);
    };

    const buildItemsTableHtml = () => {
      if (items.length === 0) return "";
      const fmt2 = fmt;
      let rows = "";
      items.forEach((item) => {
        const lineTotal = Number(item.unit_price) * item.quantity + getAddonsTotal(item);
        const codePrefix = formatCode(item.product_code);
        rows += `<tr><td class="items-qty">${item.quantity}x</td><td class="items-name">${escapeHtml(codePrefix + item.product_name)}</td><td class="items-price">${fmt2(lineTotal)}</td></tr>`;
        const addons = Array.isArray(item.addons_json) ? item.addons_json : [];
        addons.forEach((addon: any) => {
          const addonLabel = `+ ${addon.name}${(addon.quantity || 1) > 1 ? ` x${addon.quantity}` : ""}`;
          rows += `<tr><td></td><td colspan="2" class="items-addon-td">${escapeHtml(addonLabel)}</td></tr>`;
        });
        if (item.observations?.trim()) {
          rows += `<tr><td></td><td colspan="2" class="items-obs-td">Obs: ${escapeHtml(item.observations.trim())}</td></tr>`;
        }
      });
      return `<table class="items-table">${rows}</table>`;
    };

    const itemsHtml = buildItemsTableHtml();

    const rawTemplate = tpl?.body_template || getDefaultTemplate(resolvedType);
    const expandedTemplate = rawTemplate
      .split("\n")
      .flatMap((rawLine) => {
        if (!hasItemTemplateTokens(rawLine)) return [rawLine];
        if (items.length === 0) return [];

        const itemTemplate = getTemplateForItemsLine(rawLine);

        // If the line is just [ITENS] alone, we use the table block
        if (!itemTemplate) {
          return ["[__ITEMS_TABLE_BLOCK__]"];
        }

        return items.flatMap((item) => {
          const lineTotal = Number(item.unit_price) * item.quantity + getAddonsTotal(item);
          const codeStr = shouldShowProductCode && item.product_code != null ? String(item.product_code) : "";
          const addonsText = formatAddonsText(item);
          const obsWithAddons = [addonsText, item.observations?.trim() ? `Obs: ${item.observations.trim()}` : ""].filter(Boolean).map((value) => `[FUNDPRETO]${value}[/FUNDPRETO]`).join(" ");
          const itemVars = {
            "[PRODUTO]": item.product_name,
            "[PRODUTOS]": item.product_name,
            "[QNTITENS]": String(item.quantity),
            "[QUANTIDADEPROD]": String(item.quantity),
            "[VALORITEM]": fmt(lineTotal),
            "[PREÇOPROD]": fmt(Number(item.unit_price)),
            "[OBSITEM]": obsWithAddons,
            "[ADICIONAIS]": addonsText ? `[FUNDPRETO]${addonsText}[/FUNDPRETO]` : "",
            "[CÓDIGOPROD]": codeStr,
            "[CODIGOPROD]": codeStr,
          };

          if (shouldHideOptionalItemLine(itemTemplate, itemVars)) {
            return [];
          }

          const expandedLine = replaceTokens(itemTemplate, itemVars);
          return stripFormattingTags(expandedLine).trim() ? [expandedLine] : [];
        });
      })
      .join("\n");

    const blocksMap: Record<string, string | undefined> = {
      "[__ITEMS_TABLE_BLOCK__]": itemsHtml,
    };

    const bodyFontSize = (tpl as any)?.body_font_size ?? 11;

    return buildAdminPrintDocument({
      title: `${tipoLabel} ${String(order.order_number).padStart(5, "0")}`,
      template: expandedTemplate,
      variables: varMap,
      blocks: blocksMap,
      pageWidthMm: 72,
      pageHeightMm: "auto",
      pageMarginMm: 0,
      repeatCount,
      bodyFontFamily: "Arial, Helvetica, sans-serif",
      bodyFontSizePx: bodyFontSize,
      labelFontSizePx: tpl?.label_font_size ?? 22,
      bodyPaddingMm: 0,
      sectionPaddingMm: 0,
      extraCss: LEGACY_RECEIPT_PRINT_CSS,
    });
  }, [items, order, profile, ready, repeatCount, tipo, tpl]);

  useEffect(() => {
    if (!printableDocument || !ready) return;
    if (printedRef.current) return;
    printedRef.current = true;

    const timer = setTimeout(() => {
      try {
        document.open();
        document.write(printableDocument);
        document.close();
      } catch (e) {
        console.error("[AdminPrint] write error", e);
        return;
      }

      // The injected document already triggers window.print() on load
      // (see buildAdminPrintDocument in adminPrintTemplates.ts).
      // Do NOT call window.print() here, otherwise it prints twice.
      // Just schedule auto-close after the print dialog has had time to handle the job.
      if (!keepOpen) {
        setTimeout(() => {
          try { window.close(); } catch { /* noop */ }
        }, 1500);
      }
    }, Math.max(60, printDelayMs));

    return () => clearTimeout(timer);
  }, [keepOpen, printDelayMs, printableDocument, ready]);

  if (error) return <div style={{ padding: 20, fontFamily: "monospace" }}>{error}</div>;
  if (!ready || !printableDocument) return <div style={{ padding: 20, fontFamily: "monospace" }}>Preparando impressão...</div>;

  return <div style={{ padding: 20, fontFamily: "monospace" }}>Abrindo impressão...</div>;
};

export default AdminPrint;
