import { useEffect, useState } from "react";
import { ShoppingBag, DollarSign, Clock, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    todayRevenue: 0,
    completedToday: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const today = new Date().toISOString().split("T")[0];

      const [ordersRes, pendingRes, todayRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("orders").select("total, status").gte("created_at", today),
      ]);

      const todayOrders = todayRes.data || [];
      const revenue = todayOrders.reduce((sum, o) => sum + Number(o.total), 0);
      const completed = todayOrders.filter((o) => o.status === "delivered").length;

      setStats({
        totalOrders: ordersRes.count || 0,
        pendingOrders: pendingRes.count || 0,
        todayRevenue: revenue,
        completedToday: completed,
      });
    };

    fetchStats();
  }, []);

  const cards = [
    { label: "Pedidos Hoje", value: stats.totalOrders, icon: ShoppingBag, color: "bg-primary" },
    { label: "Pendentes", value: stats.pendingOrders, icon: Clock, color: "bg-amber-500" },
    { label: "Faturamento Hoje", value: `R$ ${stats.todayRevenue.toFixed(2)}`, icon: DollarSign, color: "bg-emerald-500" },
    { label: "Entregues Hoje", value: stats.completedToday, icon: CheckCircle, color: "bg-blue-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-card p-4 shadow-sm border border-border">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
                <card.icon size={18} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-lg font-bold text-foreground">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
