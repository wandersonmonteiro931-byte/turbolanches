import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { ReceiptTemplate } from "@/hooks/useReceiptTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";
import { buildAdminPrintDocument, stripFormattingTags, escapeHtml } from "@/lib/adminPrintTemplates";

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

const cleanSystemObservation = (value: string) =>
  value
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part && part !== "[PDV]" && !/^Mesa:\s*#?MESA\d+/i.test(part))
    .join(" | ");

const formatPrintAddress = (value: string) => value.toLocaleUpperCase("pt-BR");

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

const stripEmojisFromPrintHtml = (html: string) =>
  String(html || "")
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[📦🛵🚚🛍️🍔🍕✅❌⚠️🧾💰🔒🔓🔥⭐❤️❤]/g, "");

const AdminPrint = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tipo = searchParams.get("tipo") || "pedido";
  const kitchenMode = searchParams.get("kitchen") || "";

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
    if (t === "mesa_cliente") return "mesa";
    return t;
  };

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data: orderData, error: orderErr } = await supabase.from("orders").select("*").eq("id", id).single();
      if (orderErr || !orderData) {
        setError("Pedido não encontrado");
        return;
      }
      setOrder(orderData);

      const tplType = orderData.delivery_type === "mesa" && resolveType(tipo) === "pedido" ? "mesa" : resolveType(tipo);
      const [itemsRes, profileRes, tplRes] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", id),
        supabase
          .from("profiles")
          .select("full_name, phone, complement, street, neighborhood, customer_code")
          .eq("user_id", orderData.user_id)
          .single(),
        supabase
          .from("receipt_templates" as any)
          .select("*")
          .eq("template_type", tplType)
          .single(),
      ]);

      const orderItems = itemsRes.data || [];
      setItems(kitchenMode === "new" ? orderItems.filter((item: any) => !item.sent_to_kitchen) : orderItems);
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
  }, [id, tipo, kitchenMode]);

  const printDelayMs = Math.max(0, Number(searchParams.get("delay_ms") || "100") || 100);
  const repeatCount = Math.max(1, Math.min(20, Number(searchParams.get("copies") || "1") || 1));
  const keepOpen = searchParams.get("keep_open") === "1";
  const thermalWidthMm = Math.max(40, Math.min(110, Number(searchParams.get("thermal_width_mm") || "72") || 72));
  const thermalHeightMm = Math.max(0, Math.min(500, Number(searchParams.get("thermal_height_mm") || "0") || 0));
  const thermalCutOffsetMm = Math.max(0, Math.min(80, Number(searchParams.get("thermal_cut_offset_mm") || "0") || 0));

  // POS-80 quase nunca imprime os 72/80mm inteiros. A área útil real costuma ser menor.
  // Para impedir corte da margem direita no PDF/popup, o documento é renderizado com largura segura.
  const safeThermalWidthMm = Math.max(58, Math.min(66, thermalWidthMm - 6));

  const printedRef = useRef(false);

  const printableDocument = useMemo(() => {
    if (!ready || !order) return "";

    const createdAt = new Date(order.created_at);
    const dataHoraPedido = createdAt.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const maxEntrega = new Date(createdAt.getTime() + 45 * 60 * 1000);
    const horarioMax = maxEntrega.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const agora = new Date();
    const dataAgora = agora.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const horarioSaida = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const complemento = order.address_complement || "";
    // Não adicionar quadra/lote do cadastro automaticamente na impressão.
    // A impressão deve usar apenas o endereço salvo no pedido.
    const addressLine1 = order.address_street ? `${order.address_street}, ${order.address_number || "S/N"}` : "";
    const addressLine2 = complemento || "";
    const addressLine3 = order.address_neighborhood || "";
    const isTableOrder = order.delivery_type === "mesa";
    const rawTableCode = order.table_code || (order.observations?.match(/Mesa:\s*(#?MESA\d+)/i)?.[1] ?? "#MESA--");
    const tableCode = rawTableCode.startsWith("#") ? rawTableCode.toUpperCase() : `#${rawTableCode.toUpperCase()}`;
    const address = isTableOrder
      ? tableCode
      : formatPrintAddress(
          [addressLine1, addressLine2, addressLine3].filter(Boolean).join(" | ") || "Retirada no local",
        );

    const deliveryLabel = isTableOrder
      ? "MESA"
      : order.delivery_type === "delivery"
        ? "DELIVERY"
        : order.delivery_type === "pickup"
          ? "RETIRADA"
          : order.delivery_type?.toUpperCase() || "DELIVERY";

    const subtotal = Number(order.subtotal);
    const deliveryFee = Number(order.delivery_fee);
    const discount = Number(order.discount) || 0;
    const total = Number(order.total);
    const isFiado = order.payment_method === "fiado";
    const isPix = order.payment_method === "pix";
    const isPixPago = isPix && order.payment_confirmed;
    const isPixEntrega = isPix && !order.payment_confirmed;
    const isMesaConta = resolveType(tipo) === "mesa_conta";
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

    const obsText = order.observations || "";
    const printableObsText = cleanSystemObservation(obsText);
    const isManualOrder = obsText.includes("[PDV]");
    const manualClienteMatch = obsText.match(/Cliente:\s*([^|]+)/);
    const manualTelMatch = obsText.match(/Tel:\s*([^|]+)/);
    const manualCodeMatch = obsText.match(/Código:\s*(T\d+)/);

    const displayName = isManualOrder ? manualClienteMatch?.[1]?.trim() || "" : profile?.full_name || "";
    const displayPhone = isManualOrder ? manualTelMatch?.[1]?.trim() || "" : profile?.phone || "";
    const customerCode = isManualOrder
      ? manualCodeMatch?.[1]?.trim() || ""
      : profile?.customer_code
        ? `T${String(profile.customer_code).padStart(5, "0")}`
        : "";

    const storeName = tpl?.store_name || "TURBO LANCHES";
    const resolvedType = isTableOrder && resolveType(tipo) === "pedido" ? "mesa" : resolveType(tipo);
    const defaultLabels: Record<string, string> = {
      pedido: "PEDIDO",
      mesa: "MESA",
      mesa_conta: "CONTA MESA",
      mesa_cobrar: "COBRAR MESA",
      obrigado: "OBRIGADO!",
      entregador: "FECHAMENTO DE ROTA",
      etiquetas: "ETIQUETA",
      reposicao: "LISTA DE COMPRAS",
    };
    const tipoLabel = tpl?.label || defaultLabels[resolvedType] || "PEDIDO";
    const divulgacao = tpl?.custom_message || "";
    const rodape = tpl?.footer_message || "";

    const fmt = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

    const couponInfo = order.coupon_code ? `${order.coupon_code} (-${fmt(discount)})` : "Nenhum";

    const templateImageUrl = String((tpl as any)?.print_image_url || "").trim();
    const templateImageMode = String((tpl as any)?.print_image_mode || "none");
    const templateImageWidthMm = Number((tpl as any)?.print_image_width_mm || (templateImageMode === "logo" ? 32 : 64));
    const logoUrl = templateImageMode === "logo" ? templateImageUrl : "";
    const fullImageUrl = templateImageMode === "full" ? templateImageUrl : "";

    const varMap: Record<string, string> = {
      "[NUMEROPEDIDO]": isTableOrder ? tableCode : `#${String(order.order_number).padStart(5, "0")}`,
      "[MESA]": tableCode,
      "[NOMECLIENTE]": displayName || "Não informado",
      "[CODIGOCLIENTE]": customerCode,
      "[TELEFONECLIENTE]": displayPhone || "Não informado",
      "[ENDEREÇO]": address,
      "[ENDERECO]": address,
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
      "[OBS]": printableObsText ? `OBS: ${printableObsText}` : "",
      "[DELIVERYRETIRADAVIAGEM]": deliveryLabel,
      "[RODAPÉ]": rodape,
      "[DIVULGAÇÃO]": divulgacao,
      "[NOMEENTREGADOR]": courierName || "",
      "[LOGOLOJA]": logoUrl,
      "[LOGOLOJA_LARGURA]": String(templateImageWidthMm),
      "[IMAGEM]": fullImageUrl,
      "[IMAGEMPANFLETO]": fullImageUrl,
      "[IMAGEM_LARGURA]": String(templateImageWidthMm),
    };

    const formatCode = () => "";
    const formatAddonsText = (item: any) => {
      const addons = Array.isArray(item.addons_json) ? item.addons_json : [];
      return addons
        .map((addon: any) => `+ ${addon.name}${(addon.quantity || 1) > 1 ? ` x${addon.quantity}` : ""}`)
        .join(" | ");
    };
    const getAddonsTotal = (item: any) => {
      const addons = Array.isArray(item.addons_json) ? item.addons_json : [];
      return addons.reduce(
        (sum: number, addon: any) => sum + (Number(addon.price) || 0) * (Number(addon.quantity) || 1),
        0,
      );
    };

    const buildItemsTableHtml = () => {
      if (items.length === 0) return "";
      const fmt2 = fmt;
      let rows = "";
      items.forEach((item) => {
        const lineTotal = Number(item.unit_price) * item.quantity + getAddonsTotal(item);
        const codePrefix = formatCode();
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
          const codeStr = "";
          const addonsText = formatAddonsText(item);
          const obsWithAddons = [addonsText, item.observations?.trim() ? `Obs: ${item.observations.trim()}` : ""]
            .filter(Boolean)
            .map((value) => `[FUNDPRETO]${value}[/FUNDPRETO]`)
            .join(" ");
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

    const templateImageUrl = String((tpl as any)?.print_image_url || "").trim();
    const templateImageMode = String((tpl as any)?.print_image_mode || "none");
    const templateImageWidthMm = Number((tpl as any)?.print_image_width_mm || (templateImageMode === "logo" ? 32 : 64));
    const logoUrl = templateImageMode === "logo" ? templateImageUrl : "";
    const fullImageUrl = templateImageMode === "full" ? templateImageUrl : "";

    const bodyFontSize = (tpl as any)?.body_font_size ?? 11;

    return buildAdminPrintDocument({
      title: `${tipoLabel} ${String(order.order_number).padStart(5, "0")}`,
      template: expandedTemplate,
      variables: varMap,
      blocks: blocksMap,
      pageWidthMm: safeThermalWidthMm,
      pageHeightMm: thermalHeightMm > 0 ? thermalHeightMm : "auto",
      pageMarginMm: 0,
      repeatCount,
      bodyFontFamily: "Arial, Helvetica, sans-serif",
      bodyFontSizePx: bodyFontSize,
      labelFontSizePx: tpl?.label_font_size ?? 22,
      bodyPaddingMm: 0,
      sectionPaddingMm: 0,
      extraCss: `${LEGACY_RECEIPT_PRINT_CSS}\n.print-root,.print-document,.print-section{max-width:100%!important;overflow:hidden!important;}
.print-document{box-sizing:border-box!important;}
.print-section{box-sizing:border-box!important;}
.txt-borda-preta,.inline-border,.box-highlight,.print-frame,.print-frame-strong,.print-frame-rect{max-width:100%!important;width:100%!important;box-sizing:border-box!important;overflow:hidden!important;}
.info,.grand-total,.center,.txt-grande,.txt-medio,.txt-pequeno,.txt-gigante,.pedido-destaque{max-width:100%!important;overflow:hidden!important;overflow-wrap:anywhere!important;word-break:break-word!important;}\n.print-document::after{content:"";display:block;height:${thermalCutOffsetMm}mm;}`,
    });
  }, [
    items,
    order,
    profile,
    ready,
    repeatCount,
    thermalCutOffsetMm,
    safeThermalWidthMm,
    thermalHeightMm,
    thermalWidthMm,
    tipo,
    tpl,
  ]);

  useEffect(() => {
    if (!printableDocument || !ready) return;
    if (printedRef.current) return;
    printedRef.current = true;

    const timer = setTimeout(
      () => {
        try {
          document.open();
          document.write(stripEmojisFromPrintHtml(printableDocument));
          document.close();
        } catch (e) {
          console.error("[AdminPrint] write error", e);
          return;
        }

        // The injected document triggers window.print() and closes only after the
        // browser reports afterprint. Closing by timeout can cancel thermal jobs.
      },
      Math.max(60, printDelayMs),
    );

    return () => clearTimeout(timer);
  }, [keepOpen, printDelayMs, printableDocument, ready]);

  if (error) return <div style={{ padding: 20, fontFamily: "monospace" }}>{error}</div>;
  if (!ready || !printableDocument) {
    return (
      <div style={{ padding: 20, fontFamily: "monospace" }}>
        <style>{`@media print { body, #root { background: #fff !important; } body * { visibility: hidden !important; } } [data-lovable], a[href*="lovable"], #lovable-badge, [id*="lovable"], [class*="lovable"] { display:none !important; visibility:hidden !important; }`}</style>
        Carregando comanda...
      </div>
    );
  }

  return <div style={{ padding: 20, fontFamily: "monospace" }}>Abrindo impressão...</div>;
};

export default AdminPrint;
