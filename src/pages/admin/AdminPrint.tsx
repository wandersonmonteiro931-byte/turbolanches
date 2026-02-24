import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AdminPrint = () => {
  const { id } = useParams<{ id: string }>();
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
    }, 600);
    return () => clearTimeout(timer);
  }, [ready]);

  if (error) return <div style={{ padding: 20, fontFamily: "monospace" }}>{error}</div>;
  if (!ready || !order) return <div style={{ padding: 20, fontFamily: "monospace" }}>Carregando...</div>;

  const time = new Date(order.created_at).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  const subtotal = Number(order.total) - Number(order.delivery_fee);
  const address = `${order.address_street || ""}, ${order.address_number || ""} - ${order.address_neighborhood || ""}`;

  return (
    <>
      <style>{`
        @page {
          size: 72mm auto;
          margin: 0;
        }
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          width: 72mm;
          padding: 4mm;
          color: #000;
          background: #fff;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .title { font-size: 18px; font-weight: bold; }
        .subtitle { font-size: 11px; margin-bottom: 4px; }
        .separator { border-top: 1px dashed #000; margin: 6px 0; }
        .item { display: flex; justify-content: space-between; margin: 2px 0; }
        .addon { font-size: 10px; padding-left: 12px; color: #333; }
        .total-line { display: flex; justify-content: space-between; margin: 2px 0; }
        .grand-total { font-size: 16px; font-weight: bold; display: flex; justify-content: space-between; margin: 4px 0; }
        .info { font-size: 11px; margin: 1px 0; }
        .footer { font-size: 10px; text-align: center; margin-top: 8px; }
      `}</style>

      <div className="center">
        <div className="title">TURBO DELIVERY</div>
        <div className="subtitle">LANCHES</div>
      </div>
      <div className="separator" />

      <div className="bold">PEDIDO #{order.id.slice(0, 6).toUpperCase()}</div>
      <div className="info">Data: {time}</div>
      <div className="separator" />

      <div className="info">Cliente: {profile?.full_name || "Cliente"}</div>
      <div className="info">Tel: {profile?.phone || ""}</div>
      <div className="info">End: {address}</div>
      <div className="separator" />

      <div className="bold">ITENS:</div>
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

      <div className="total-line"><span>Subtotal</span><span>R$ {subtotal.toFixed(2).replace(".", ",")}</span></div>
      <div className="total-line"><span>Entrega</span><span>R$ {Number(order.delivery_fee).toFixed(2).replace(".", ",")}</span></div>
      <div className="grand-total"><span>TOTAL</span><span>R$ {Number(order.total).toFixed(2).replace(".", ",")}</span></div>
      <div className="info">Pagamento: {order.payment_method.toUpperCase()}</div>

      {order.observations && (
        <>
          <div className="separator" />
          <div className="info">OBS: {order.observations}</div>
        </>
      )}

      <div className="separator" />
      <div className="footer">Obrigado pela preferencia!</div>
    </>
  );
};

export default AdminPrint;
