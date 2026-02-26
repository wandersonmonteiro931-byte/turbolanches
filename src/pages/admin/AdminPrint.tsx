import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AdminPrint = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tipo = searchParams.get("tipo") || "cozinha"; // "cozinha" | "entrega" | "cliente"

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

      if (orderErr || !orderData) {
        setError("Pedido não encontrado");
        return;
      }
      setOrder(orderData);

      const [itemsRes, profileRes] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", id),
        supabase.from("profiles").select("full_name, phone, complement, quadra, lote, customer_code").eq("user_id", orderData.user_id).single(),
      ]);

      setItems(itemsRes.data || []);
      setProfile(profileRes.data);
      setReady(true);
    };

    load();
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      window.print();
      setTimeout(() => { window.close(); }, 1000);
    }, 600);
    return () => clearTimeout(timer);
  }, [ready]);

  if (error) return <div style={{ padding: 20, fontFamily: "monospace" }}>{error}</div>;
  if (!ready || !order) return <div style={{ padding: 20, fontFamily: "monospace" }}>Carregando...</div>;

  const createdAt = new Date(order.created_at);
  const dataHora = createdAt.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const maxEntrega = new Date(createdAt.getTime() + 45 * 60 * 1000);
  const horarioMax = maxEntrega.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const horarioSaida = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const complemento = order.address_complement || profile?.complement || "";
  const quadra = profile?.quadra || "";
  const lote = profile?.lote || "";
  // Formato: RUA/AV X, QUADRA X LOTE X (OU AP, BLOCO, NÚMERO), BAIRRO/SETOR
  const addressLine1 = order.address_street ? `${order.address_street}, ${order.address_number || "S/N"}` : "";
  const addressLine2 = [
    quadra ? `QUADRA ${quadra}` : null,
    lote ? `LOTE ${lote}` : null,
    complemento || null,
  ].filter(Boolean).join(" ");
  const addressLine3 = order.address_neighborhood || "";
  const addressFull = [addressLine1, addressLine2, addressLine3].filter(Boolean).join(", ");
  const address = addressFull || "Retirada no local";

  const deliveryLabel = order.delivery_type === "delivery" ? "DELIVERY" : order.delivery_type === "pickup" ? "RETIRADA" : order.delivery_type?.toUpperCase() || "DELIVERY";

  const total = Number(order.total);
  const isFiado = order.payment_method === "fiado";
  const isPaidOnline = order.payment_method === "pix" || order.payment_confirmed;
  const isPaidAtDelivery = !isPaidOnline && !isFiado;
  const discount = Number(order.discount) || 0;
  const changeFor = order.change_for ? Number(order.change_for) : 0;
  const totalReceber = (isPaidOnline || isFiado) ? 0 : total;
  const troco = isPaidAtDelivery && changeFor > total ? changeFor - total : 0;
  const paymentLabel = isFiado ? "FIADO" : isPaidOnline ? "PAGO ONLINE" : "PAGO NA ENTREGA";

  const clienteName = profile?.full_name || "Cliente";
  const customerCode = profile?.customer_code ? `T${String(profile.customer_code).padStart(5, '0')}` : "";

  const isCozinha = tipo === "cozinha";
  const isEntrega = tipo === "entrega";
  const isCliente = tipo === "cliente";

  const styles = `
    @page { size: 72mm auto; margin: 0 !important; padding: 0 !important; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; height: auto !important; width: 72mm !important; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Arial Black', 'Arial', Helvetica, sans-serif;
      font-size: 10px;
      font-weight: 900;
      width: 72mm;
      padding: 1.5mm 2mm;
      margin: 0;
      color: #000;
      background: #fff;
      -webkit-font-smoothing: none;
      -moz-osx-font-smoothing: unset;
      text-rendering: geometricPrecision;
      letter-spacing: 0.2px;
      line-height: 1.3;
    }
    .center { text-align: center; }
    .separator { border-top: 1.5px dashed #000; margin: 3px 0; }
    .item { display: flex; justify-content: space-between; margin: 1px 0; font-weight: 900; font-size: 10px; line-height: 1.4; }
    .addon { font-size: 9px; padding-left: 10px; font-weight: 900; line-height: 1.3; }
    .total-line { display: flex; justify-content: space-between; margin: 1px 0; font-weight: 900; font-size: 10px; }
    .grand-total { font-size: 12px; font-weight: 900; display: flex; justify-content: space-between; margin: 2px 0; }
    .info { font-size: 10px; margin: 1px 0; font-weight: 900; line-height: 1.35; }
    .footer { font-size: 9px; text-align: center; margin-top: 4px; font-weight: 900; line-height: 1.4; }
    .print-end { height: 10mm; min-height: 10mm; }
    .tipo-label {
      font-size: 24px; font-weight: 900; text-align: center;
      letter-spacing: 3px; margin: 3px 0; padding: 4px 0; border: 2.5px solid #000;
      text-transform: uppercase;
    }
    .tipo-label-big {
      font-size: 24px; font-weight: 900; text-align: center;
      letter-spacing: 3px; margin: 3px 0; padding: 4px 0; border: 2.5px solid #000;
      text-transform: uppercase;
    }
    .store-name { font-size: 9px; font-weight: 900; text-align: center; margin: 0; letter-spacing: 1px; }
    .highlight-delivery {
      font-size: 12px; font-weight: 900; text-align: center;
      margin: 3px 0; padding: 2px 0; letter-spacing: 2px;
    }
    .box-highlight {
      font-size: 11px; font-weight: 900; margin: 3px 0; padding: 4px 3px;
      border: 2.5px solid #000; line-height: 1.4;
    }
    .box-highlight-flex {
      font-size: 14px; font-weight: 900; display: flex; justify-content: space-between;
      margin: 3px 0; padding: 4px 3px; border: 2.5px solid #000;
    }
    .box-itens {
      border: 2.5px solid #000; padding: 3px; margin: 3px 0;
    }
    .pedido-destaque { font-size: 20px; font-weight: 900; text-align: center; margin: 3px 0; letter-spacing: 2px; }
    .msg-carinho { font-size: 9px; font-weight: 900; text-align: center; margin: 3px 0; font-style: italic; line-height: 1.4; }
  `;

  // Totais section (reused)
  const subtotal = Number(order.subtotal);
  const deliveryFee = Number(order.delivery_fee);

  const totaisSection = (showHighlightReceber = false) => (
    <>
      <div className="total-line"><span>SUBTOTAL</span><span>R$ {subtotal.toFixed(2).replace(".", ",")}</span></div>
      {discount > 0 && (
        <div className="total-line"><span>DESCONTO</span><span>- R$ {discount.toFixed(2).replace(".", ",")}</span></div>
      )}
      <div className="total-line"><span>ENTREGA</span><span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span></div>
      <div className="grand-total"><span>TOTAL</span><span>R$ {total.toFixed(2).replace(".", ",")}</span></div>
      <div className="total-line"><span>TOTAL PAGO</span><span>R$ {isPaidOnline ? total.toFixed(2).replace(".", ",") : "0,00"}</span></div>
      <div className={showHighlightReceber ? "box-highlight-flex" : "total-line"}><span>TOTAL A RECEBER</span><span>R$ {totalReceber.toFixed(2).replace(".", ",")}</span></div>
      {troco > 0 && <div className="total-line"><span>TROCO</span><span>R$ {troco.toFixed(2).replace(".", ",")}</span></div>}
      <div className="info">PAGAMENTO: {order.payment_method.toUpperCase()} - {paymentLabel}</div>
    </>
  );

  // Items section (reused)
  const itensSection = (
    <>
      <div style={{ fontWeight: 900 }}>ITENS:</div>
      {items.map((item) => {
        const lineTotal = Number(item.unit_price) * item.quantity;
        const addons = item.addons_json as any[] | null;
        return (
          <div key={item.id}>
            <div className="item">
              <span>{item.quantity}x {item.product_name}</span>
              <span>R$ {lineTotal.toFixed(2).replace(".", ",")}</span>
            </div>
            {addons && addons.length > 0 && addons.map((a: any, i: number) => (
              <div key={i} className="addon">+ {a.name}</div>
            ))}
            {item.observations && <div className="addon">Obs: {item.observations}</div>}
          </div>
        );
      })}
      <div className="separator" />
    </>
  );

  // ===== COMANDA COZINHA =====
  const itensCozinha = (
    <>
      <div style={{ fontWeight: 900, fontSize: 14 }}>ITENS:</div>
      {items.map((item) => {
        const addons = item.addons_json as any[] | null;
        return (
          <div key={item.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 14, margin: 0 }}>
              <span>{item.quantity}x {item.product_name}</span>
              <span>R$ {(Number(item.unit_price) * item.quantity).toFixed(2).replace(".", ",")}</span>
            </div>
            {addons && addons.length > 0 && addons.map((a: any, i: number) => (
              <div key={i} style={{ fontSize: 12, paddingLeft: 8, fontWeight: 900 }}>+ {a.name}</div>
            ))}
            {item.observations && <div style={{ fontSize: 12, paddingLeft: 8, fontWeight: 900 }}>Obs: {item.observations}</div>}
          </div>
        );
      })}
      <div className="separator" />
    </>
  );

  const comandaCozinha = (
    <div>
      <div className="store-name">TURBO DELIVERY LANCHES</div>
      <div className="tipo-label">COZINHA</div>
      <div className="separator" />
      <div style={{ fontWeight: 900, fontSize: 10 }}>PEDIDO #{String(order.order_number).padStart(5, '0')} {customerCode && `| CLIENTE: ${customerCode}`}</div>
      <div className="info">DATA E HORA PEDIDO: {dataHora}</div>
      <div className="info">HORÁRIO MÁXIMO PARA ENTREGA: {horarioMax}</div>
      <div className="separator" />
      {itensCozinha}
      <div className="grand-total"><span>TOTAL</span><span>R$ {total.toFixed(2).replace(".", ",")}</span></div>
      <div className="separator" />
      <div className="highlight-delivery">*** {deliveryLabel} ***</div>
      {order.observations && (
        <>
          <div className="separator" />
          <div className="info">OBS: {order.observations}</div>
        </>
      )}
      <div className="separator" />
      <div className="print-end" />
    </div>
  );

  // ===== COMANDA ENTREGA =====
  const comandaEntrega = (
    <div>
      <div className="store-name">TURBO DELIVERY LANCHES</div>
      <div className="tipo-label">ENTREGA</div>
      <div className="separator" />
      <div style={{ fontWeight: 900, fontSize: 10 }}>PEDIDO #{String(order.order_number).padStart(5, '0')} {customerCode && `| CLIENTE: ${customerCode}`}</div>
      <div className="info">DATA E HORA PEDIDO: {dataHora}</div>
      <div className="info">HORÁRIO MÁXIMO PARA ENTREGA: {horarioMax}</div>
      <div className="separator" />
      <div className="info">Cliente: {clienteName}</div>
      <div className="info">Telefone: {profile?.phone || ""}</div>
      <div className="box-highlight">{address}</div>
      {order.observations && <div className="info">OBS: {order.observations}</div>}
      <div className="separator" />
      <div className="total-line"><span>SUBTOTAL</span><span>R$ {subtotal.toFixed(2).replace(".", ",")}</span></div>
      {discount > 0 && (
        <div className="total-line"><span>DESCONTO</span><span>- R$ {discount.toFixed(2).replace(".", ",")}</span></div>
      )}
      <div className="total-line"><span>ENTREGA</span><span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span></div>
      <div className="grand-total"><span>TOTAL</span><span>R$ {total.toFixed(2).replace(".", ",")}</span></div>
      <div className="total-line"><span>TOTAL PAGO</span><span>R$ {isPaidOnline ? total.toFixed(2).replace(".", ",") : "0,00"}</span></div>
      <div className="box-highlight-flex"><span>TOTAL A RECEBER</span><span>R$ {totalReceber.toFixed(2).replace(".", ",")}</span></div>
      {troco > 0 && <div className="total-line"><span>TROCO</span><span>R$ {troco.toFixed(2).replace(".", ",")}</span></div>}
      <div className="info">PAGAMENTO: {order.payment_method.toUpperCase()} - {paymentLabel}</div>
      <div className="separator" />
      <div className="info">ENTREGADOR: ___________________</div>
      <div className="info">HORÁRIO DE SAÍDA PARA ENTREGA: {horarioSaida}</div>
      <div className="separator" />
      <div className="print-end" />
    </div>
  );

  // ===== COMANDA CLIENTE =====
  const comandaCliente = (
    <div>
      <div className="store-name">TURBO DELIVERY LANCHES</div>
      <div className="tipo-label-big">OBRIGADO!</div>
      <div className="separator" />
      <div className="pedido-destaque">PEDIDO #{String(order.order_number).padStart(5, '0')} {customerCode && `| CLIENTE: ${customerCode}`}</div>
      <div className="separator" />
      <div className="msg-carinho">{clienteName}, seu pedido foi preparado com muito carinho e higiene!</div>
      <div className="separator" />
      {itensSection}
      {totaisSection(false)}
      <div className="separator" />
      <div className="footer">Agradecemos a preferência!</div>
      <div className="print-end" />
    </div>
  );

  // Tipo "entrega" imprime entrega + cliente juntos
  const renderContent = () => {
    if (isCozinha) return comandaCozinha;
    if (isCliente) return comandaCliente;
    // "entrega" agora imprime só a comanda do entregador
    return comandaEntrega;
  };

  return (
    <>
      <style>{styles}</style>
      {renderContent()}
    </>
  );
};

export default AdminPrint;
