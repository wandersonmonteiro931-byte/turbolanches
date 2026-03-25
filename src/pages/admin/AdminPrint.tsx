import { useEffect, useState, Fragment } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { ReceiptTemplate } from "@/hooks/useReceiptTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";
import {
  extractTemplateSections,
  renderInlineTemplateMarkup,
  resolveTemplateLineClasses,
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

  // Map legacy types and resolve the actual template type to load
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

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      window.print();
      setTimeout(() => { window.close(); }, 300);
    }, printDelayMs);
    return () => clearTimeout(timer);
  }, [ready, printDelayMs, tipo, id]);

  if (error) return <div style={{ padding: 20, fontFamily: "monospace" }}>{error}</div>;
  if (!ready || !order) return <div style={{ padding: 20, fontFamily: "monospace" }}>Carregando...</div>;

  // ─── Computed values ───
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
  const customerCode = isManualOrder ? (manualCodeMatch?.[1]?.trim() || "") : (profile?.customer_code ? `T${String(profile.customer_code).padStart(5, '0')}` : "");

  const storeName = tpl?.store_name || "TURBO LANCHES";
  const resolvedType = resolveType(tipo);
  const tipoLabel = tpl?.label || (resolvedType === "obrigado" ? "OBRIGADO!" : "PEDIDO");
  const labelFontSize = tpl?.label_font_size || 24;
  const itemsFontSize = tpl?.items_font_size || 14;
  const divulgacao = tpl?.custom_message || "";
  const rodape = tpl?.footer_message || "";

  const fmt = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

  // ─── Variable replacement ───
  const couponInfo = order.coupon_code
    ? `${order.coupon_code} (-${fmt(discount)})`
    : "Nenhum";

  const varMap: Record<string, string> = {
    "[NUMEROPEDIDO]": `#${String(order.order_number).padStart(5, '0')}`,
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

  const replaceVars = (text: string): string => {
    let result = text;
    // Two passes to allow variables inside configured fields (e.g. footer containing [NUMEROPEDIDO])
    for (let pass = 0; pass < 2; pass++) {
      for (const [key, val] of Object.entries(varMap)) {
        result = result.split(key).join(val);
      }
    }
    return result;
  };

  const hasItemTemplateTokens = (text: string) => ITEM_TEMPLATE_TOKENS.some((token) => text.includes(token));

  const removeItemBlockTokens = (text: string) =>
    ITEM_BLOCK_TOKENS.reduce((content, token) => content.split(token).join(""), text);

  const shouldHideOptionalItemLine = (rawLine: string, mergedVars: Record<string, string>) => {
    if (!rawLine.includes("[OBSITEM]")) return false;

    const itemObservation = mergedVars["[OBSITEM]"] ?? "";
    if (itemObservation.trim()) return false;

    const remainingContent = stripFormattingTags(rawLine.replace(/\[OBSITEM\]/g, ""))
      .replace(/\s+/g, " ")
      .trim();

    return !remainingContent || /^obs(item)?\s*:?$/i.test(remainingContent);
  };

  const renderProcessedLine = (
    rawLine: string,
    key: string | number,
    extraVars: Record<string, string> = {},
  ) => {
    let content = rawLine;
    const mergedVars = { ...varMap, ...extraVars };

    if (shouldHideOptionalItemLine(rawLine, mergedVars)) return null;

    for (let pass = 0; pass < 2; pass++) {
      for (const [token, value] of Object.entries(mergedVars)) {
        content = content.split(token).join(value);
      }
    }

    const plainContent = stripFormattingTags(content);
    if (!plainContent.trim()) return null;
    const markup = renderInlineTemplateMarkup(content);
    if (!markup.trim()) return null;

    return (
      <div
        key={key}
        className={resolveTemplateLineClasses(rawLine)}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  };

  // ─── Items renderer ───
  const renderItems = () => (
    <div>
      <div style={{ fontWeight: 900, fontSize: itemsFontSize }}>ITENS:</div>
      {items.map((item) => {
        const lineTotal = Number(item.unit_price) * item.quantity;
        const addons = item.addons_json as any[] | null;
        return (
          <div key={item.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: itemsFontSize, margin: 0 }}>
              <span>{item.quantity}x {item.product_name}</span>
              <span>{fmt(lineTotal)}</span>
            </div>
            {addons?.map((a: any, i: number) => (
              <div key={i} style={{ fontSize: Math.max(itemsFontSize - 2, 8), paddingLeft: 8, fontWeight: 900 }}>
                + {a.name}{(a.quantity || 1) > 1 ? ` x${a.quantity}` : ""}
              </div>
            ))}
            {item.observations && (
              <div style={{ fontSize: Math.max(itemsFontSize - 2, 8), paddingLeft: 8, fontWeight: 900 }}>
                Obs: {item.observations}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const getTemplateForItemsLine = (rawLine: string) => {
    // Remove anchor tokens and trim
    let lineWithoutItems = rawLine;
    for (const token of ITEM_BLOCK_TOKENS) {
      lineWithoutItems = lineWithoutItems.split(token).join("");
    }
    lineWithoutItems = lineWithoutItems.trim();

    if (!lineWithoutItems) return null;

    // Check if there's visible content besides formatting tags
    const visibleContent = stripFormattingTags(lineWithoutItems);
    // Even if visibleContent is only item-variable tokens, that's valid
    const hasItemVars = ITEM_TEMPLATE_TOKENS.some((t) => lineWithoutItems.includes(t));
    if (visibleContent || hasItemVars) return lineWithoutItems;

    return null;
  };

  const renderItemsFromTemplateLine = (line: string, keyPrefix: string | number) => {
    const itemTemplate = getTemplateForItemsLine(line);

    if (!itemTemplate) {
      return <Fragment key={keyPrefix}>{renderItems()}</Fragment>;
    }

    return (
      <Fragment key={keyPrefix}>
        {items.map((item, itemIndex) => {
          const lineTotal = Number(item.unit_price) * item.quantity;
          return renderProcessedLine(itemTemplate, `${keyPrefix}-${item.id}-${itemIndex}`, {
            "[PRODUTO]": item.product_name,
            "[PRODUTOS]": item.product_name,
            "[QNTITENS]": String(item.quantity),
            "[QUANTIDADEPROD]": String(item.quantity),
            "[VALORITEM]": fmt(lineTotal),
            "[PREÇOPROD]": fmt(Number(item.unit_price)),
            "[OBSITEM]": item.observations?.trim() || "",
          });
        })}
      </Fragment>
    );
  };

  // ─── Template parser ───
  const renderTemplate = (template: string) => {
    const lines = template.split("\n");

    return lines.map((rawLine, i) => {
      const line = rawLine.trimEnd();
      if (line.trim() === "---") return <div key={i} className="separator" />;
      if (hasItemTemplateTokens(line)) return renderItemsFromTemplateLine(line, i);
      return renderProcessedLine(line, i);
    });
  };

  const bodyTemplate = tpl?.body_template || "";
  const rawTemplateToRender = bodyTemplate || getDefaultTemplate(resolvedType);
  const templateSections = extractTemplateSections(rawTemplateToRender);

  const styles = `
    @page { size: 72mm auto portrait; margin: 0 !important; padding: 0 !important; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; height: auto !important; width: 72mm !important; }
      .no-print { display: none !important; }
      iframe, [data-lovable], a[href*="lovable"], #lovable-badge, [id*="lovable"], [class*="lovable"] { display: none !important; visibility: hidden !important; }
      body > *:not(#root):not(style) { display: none !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Arial Black', 'Arial', Helvetica, sans-serif;
      font-size: 10px; font-weight: 900; width: 72mm; padding: 1.5mm 2mm; margin: 0;
      color: #000; background: #fff; letter-spacing: 0.2px; line-height: 1.3;
      -webkit-font-smoothing: none; text-rendering: geometricPrecision;
    }
    .center { text-align: center; }
    .print-shell { display: block; }
    .print-section { display: block; overflow: hidden; }
    .print-frame { border: 1.5px solid #000; padding: 1.5mm; }
    .print-frame-strong { border: 3px solid #000; padding: 1.5mm; }
    .print-frame-rect { border-left: 1.5px solid #000; border-right: 1.5px solid #000; border-top: none; border-bottom: none; padding: 0 1.5mm; }
    .separator { border-top: 1.5px dashed #000; margin: 3px 0; }
    .info { font-size: 10px; margin: 1px 0; font-weight: 900; line-height: 1.35; }
    .total-line { display: flex; justify-content: space-between; margin: 1px 0; font-weight: 900; font-size: 10px; }
    .grand-total { font-size: 12px; font-weight: 900; margin: 2px 0; }
    .txt-medio { font-size: 14px; font-weight: 900; margin: 2px 0; line-height: 1.35; }
    .txt-pequeno { font-size: 8px; font-weight: 700; margin: 1px 0; line-height: 1.3; }
    .txt-gigante { font-size: 24px; font-weight: 900; margin: 3px 0; line-height: 1.2; letter-spacing: 0.6px; }
    .txt-borda-preta {
      display: block;
      width: 100%;
      margin: 2px 0;
      padding: 3px 4px;
      background: #000;
      color: #fff;
      font-weight: 900;
      letter-spacing: 0.4px;
    }
    .inline-border {
      display: block;
      width: 100%;
      margin: 2px 0;
      padding: 3px 4px;
      border: 1.5px solid #000;
    }
    .footer { font-size: 9px; text-align: center; margin-top: 4px; font-weight: 900; }
    .print-end { display: block; height: 10mm; min-height: 10mm; width: 100%; overflow: hidden; color: transparent; font-size: 1px; line-height: 10mm; }
    .tipo-label {
      font-size: ${labelFontSize}px; font-weight: 900; text-align: center;
      letter-spacing: 3px; margin: 3px 0; padding: 4px 0; border: 2.5px solid #000; text-transform: uppercase;
    }
    .store-name { font-size: 9px; font-weight: 900; text-align: center; margin: 0; letter-spacing: 1px; }
    .pedido-destaque { font-size: 20px; font-weight: 900; text-align: center; margin: 3px 0; letter-spacing: 2px; }
    .box-highlight { font-size: 11px; font-weight: 900; margin: 3px 0; padding: 4px 3px; border: 2.5px solid #000; line-height: 1.4; }
    .msg-carinho { font-size: 9px; font-weight: 900; text-align: center; margin: 3px 0; font-style: italic; }
  `;

  return (
    <>
      <style>{styles}</style>
      <div>
        <div className="print-shell">
          {templateSections.map((section, index) => (
            <section key={`${section.wrapperClass}-${index}`} className={["print-section", section.wrapperClass].filter(Boolean).join(" ")}>
              {renderTemplate(section.content)}
            </section>
          ))}
        </div>
        <div className="print-end">&nbsp;</div>
      </div>
    </>
  );
};

export default AdminPrint;
