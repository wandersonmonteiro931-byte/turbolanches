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
        supabase.from("profiles").select("full_name, phone").eq("user_id", orderData.user_id).single(),
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

  const address = order.address_street
    ? `${order.address_street}, ${order.address_number || "S/N"} - ${order.address_neighborhood || ""}`
    : "Retirada no local";

  const deliveryLabel = order.delivery_type === "delivery" ? "DELIVERY" : order.delivery_type === "pickup" ? "RETIRADA" : order.delivery_type?.toUpperCase() || "DELIVERY";

  const total = Number(order.total);
  const paid = order.payment_method === "pix" || order.payment_method === "cartao" || order.payment_method === "credito" || order.payment_method === "debito";
  const changeFor = order.change_for ? Number(order.change_for) : 0;
  const totalReceber = paid ? 0 : (changeFor > 0 ? changeFor : total);
  const troco = changeFor > total ? changeFor - total : 0;

  const clienteName = profile?.full_name || "Cliente";

  const isCozinha = tipo === "cozinha";
  const isEntrega = tipo === "entrega";
  const isCliente = tipo === "cliente";

  const styles = `
    @page { size: 72mm auto; margin: 0 !important; padding: 0 !important; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; height: auto !important; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      font-weight: 900;
      width: 72mm;
      padding: 2mm;
      margin: 0;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .separator { border-top: 1px dashed #000; margin: 3px 0; }
    .item { display: flex; justify-content: space-between; margin: 1px 0; font-weight: 900; font-size: 11px; }
    .addon { font-size: 10px; padding-left: 10px; font-weight: 900; }
    .total-line { display: flex; justify-content: space-between; margin: 1px 0; font-weight: 900; font-size: 11px; }
    .grand-total { font-size: 13px; font-weight: 900; display: flex; justify-content: space-between; margin: 2px 0; }
    .info { font-size: 11px; margin: 0; font-weight: 900; }
    .footer { font-size: 10px; text-align: center; margin-top: 4px; font-weight: 900; padding-bottom: 2mm; }
    .tipo-label {
      font-size: 22px; font-weight: 900; text-align: center;
      letter-spacing: 2px; margin: 2px 0; padding: 3px 0; border: 2px solid #000;
    }
    .tipo-label-big {
      font-size: 28px; font-weight: 900; text-align: center;
      letter-spacing: 3px; margin: 3px 0; padding: 6px 0; border: 3px solid #000;
      text-transform: uppercase;
    }
    .store-name { font-size: 11px; font-weight: 900; text-align: center; margin: 1px 0; }
    .highlight-delivery {
      font-size: 13px; font-weight: 900; text-align: center;
      margin: 3px 0; padding: 2px 0; border: 1px solid #000; letter-spacing: 1px;
    }
    .box-highlight {
      font-size: 14px; font-weight: 900; margin: 3px 0; padding: 4px 3px;
      border: 2px solid #000;
    }
    .box-highlight-flex {
      font-size: 14px; font-weight: 900; display: flex; justify-content: space-between;
      margin: 3px 0; padding: 4px 3px; border: 2px solid #000;
    }
    .pedido-destaque { font-size: 20px; font-weight: 900; text-align: center; margin: 3px 0; letter-spacing: 1px; }
    .msg-carinho { font-size: 11px; font-weight: 900; text-align: center; margin: 2px 0; font-style: italic; }
  `;

  // Totais section (reused)
  const totaisSection = (showHighlightReceber = false) => (
    <>
      <div className="total-line"><span>ENTREGA</span><span>R$ {Number(order.delivery_fee).toFixed(2).replace(".", ",")}</span></div>
      <div className="grand-total"><span>TOTAL</span><span>R$ {total.toFixed(2).replace(".", ",")}</span></div>
      {Number(order.discount) > 0 && (
        <div className="total-line"><span>DESCONTO</span><span>R$ {Number(order.discount).toFixed(2).replace(".", ",")}</span></div>
      )}
      <div className="total-line"><span>TOTAL PAGO</span><span>R$ {paid ? total.toFixed(2).replace(".", ",") : "0,00"}</span></div>
      <div className={showHighlightReceber ? "box-highlight-flex" : "total-line"}><span>TOTAL A RECEBER</span><span>R$ {totalReceber.toFixed(2).replace(".", ",")}</span></div>
      {troco > 0 && <div className="total-line"><span>TROCO</span><span>R$ {troco.toFixed(2).replace(".", ",")}</span></div>}
      <div className="info">PAGAMENTO: {order.payment_method.toUpperCase()}</div>
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
  const comandaCozinha = (
    <div>
      <div className="store-name">TURBO DELIVERY LANCHES</div>
      <div className="tipo-label">COZINHA</div>
      <div className="separator" />
      <div style={{ fontWeight: 900, fontSize: 13 }}>PEDIDO #{String(order.order_number).padStart(5, '0')}</div>
      <div className="info">DATA E HORA PEDIDO: {dataHora}</div>
      <div className="info">HORÁRIO MÁX ENTREGA: {horarioMax}</div>
      <div className="separator" />
      <div className="info">Cliente: {clienteName}</div>
      <div className="info">Telefone: {profile?.phone || ""}</div>
      <div className="info">Endereço: {address}</div>
      <div className="separator" />
      {itensSection}
      {totaisSection(false)}
      <div className="separator" />
      <div className="highlight-delivery">*** {deliveryLabel} ***</div>
      {order.observations && (
        <>
          <div className="separator" />
          <div className="info">OBS: {order.observations}</div>
        </>
      )}
      <div className="separator" />
    </div>
  );

  // ===== COMANDA ENTREGA =====
  const comandaEntrega = (
    <div>
      <div className="store-name">TURBO DELIVERY LANCHES</div>
      <div className="tipo-label">ENTREGA</div>
      <div className="separator" />
      <div style={{ fontWeight: 900, fontSize: 13 }}>PEDIDO #{String(order.order_number).padStart(5, '0')}</div>
      <div className="info">DATA E HORA PEDIDO: {dataHora}</div>
      <div className="info">HORÁRIO MÁX ENTREGA: {horarioMax}</div>
      <div className="separator" />
      <div className="info">Cliente: {clienteName}</div>
      <div className="info">Telefone: {profile?.phone || ""}</div>
      <div className="box-highlight">Endereço: {address}</div>
      <div className="separator" />
      {totaisSection(true)}
      {order.observations && (
        <>
          <div className="separator" />
          <div className="info">OBS: {order.observations}</div>
        </>
      )}
      <div className="separator" />
      <div className="info">ENTREGADOR: ___________________</div>
      <div className="info">HORÁRIO DE SAÍDA: {horarioSaida}</div>
      <div className="separator" />
    </div>
  );

  // ===== COMANDA CLIENTE =====
  const comandaCliente = (
    <div>
      <div className="store-name">TURBO DELIVERY LANCHES</div>
      <div className="tipo-label-big">OBRIGADO!</div>
      <div className="separator" />
      <div className="pedido-destaque">PEDIDO #{String(order.order_number).padStart(5, '0')}</div>
      <div className="separator" />
      <div className="msg-carinho">{clienteName}, seu pedido foi preparado com muito carinho e higiene!</div>
      <div className="separator" />
      {itensSection}
      {totaisSection(false)}
      <div className="separator" />
      <div className="footer">Agradecemos a preferência!</div>
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
