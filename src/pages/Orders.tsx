import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Check, ChefHat, Truck, Package, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { formatDateTimeBR } from "@/lib/brasiliaTime";

interface Order {
  id: string;
  order_number: number;
  status: string;
  total: number;
  payment_method: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Confirmado", color: "bg-blue-100 text-blue-800", icon: Check },
  accepted: { label: "Aceito", color: "bg-blue-100 text-blue-800", icon: Check },
  preparing: { label: "Em Preparo", color: "bg-purple-100 text-purple-800", icon: ChefHat },
  ready: { label: "Pronto", color: "bg-emerald-100 text-emerald-800", icon: Package },
  delivering: { label: "Saiu p/ Entrega", color: "bg-cyan-100 text-cyan-800", icon: Truck },
  delivered: { label: "Entregue", color: "bg-green-100 text-green-800", icon: Check },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-800", icon: X },
};

const Orders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchOrders = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, status, total, payment_method, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (data) setOrders(data);
      setLoading(false);
    };

    fetchOrders();

    // Realtime updates
    const channel = supabase
      .channel("my-orders")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `user_id=eq.${user.id}`,
      }, () => fetchOrders())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const formatDate = (date: string) =>
    formatDateTimeBR(date, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-4 py-6">
        <div className="mx-auto max-w-md">
          <h1 className="text-3xl text-fire-gradient">PEDIDOS</h1>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4">
        {!user ? (
          <div className="flex flex-col items-center justify-center py-20">
            <span className="text-6xl">🔒</span>
            <h2 className="mt-4 text-xl font-semibold text-foreground">Faça login</h2>
            <p className="mt-2 text-sm text-muted-foreground text-center">Para ver seus pedidos</p>
            <button
              onClick={() => navigate("/auth")}
              className="mt-4 rounded-xl bg-fire-gradient px-6 py-3 font-bold text-primary-foreground shadow-fire"
            >
              Entrar
            </button>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-pulse text-muted-foreground">Carregando...</div>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <span className="text-6xl">📦</span>
            <h2 className="mt-4 text-xl font-semibold text-foreground">Nenhum pedido ainda</h2>
            <p className="mt-2 text-sm text-muted-foreground text-center">
              Seus pedidos aparecerão aqui. Que tal fazer o primeiro?
            </p>
            <button
              onClick={() => navigate("/")}
              className="mt-4 rounded-xl bg-fire-gradient px-6 py-3 font-bold text-primary-foreground shadow-fire"
            >
              Ver Cardápio
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const status = statusConfig[order.status] || statusConfig.pending;
              const StatusIcon = status.icon;
              return (
                <button
                  key={order.id}
                  onClick={() => navigate(`/pedido/${order.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left transition-all active:scale-[0.98]"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${status.color}`}>
                    <StatusIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">#{String(order.order_number).padStart(5, '0')}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                  </div>
                  <span className="text-sm font-bold text-primary">
                    R$ {Number(order.total).toFixed(2).replace(".", ",")}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Orders;
