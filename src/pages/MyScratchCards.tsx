import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, Copy, Check, Clock, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";

interface ScratchWin {
  id: string;
  coupon_code: string;
  discount_type: string;
  discount_value: number;
  found_at: string;
  expires_at: string;
  redeemed_at: string | null;
  no_prize: boolean;
}

interface PendingOrder {
  id: string;
  order_number: number;
  status: string;
  subtotal: number;
  created_at: string;
}

const MyScratchCards = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [wins, setWins] = useState<ScratchWin[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      // Fetch scratch settings to know min order value
      const { data: settings } = await supabase
        .from("scratch_settings")
        .select("is_enabled, min_order_value")
        .limit(1)
        .maybeSingle();

      // Fetch existing wins
      const { data: winsData } = await supabase
        .from("scratch_wins")
        .select("*")
        .eq("user_id", user.id)
        .order("found_at", { ascending: false });

      if (winsData) setWins(winsData as any[]);

      // Fetch orders that qualify for scratch but aren't delivered yet
      if (settings && (settings as any).is_enabled) {
        const minOrder = (settings as any).min_order_value || 0;
        const winOrderIds = (winsData || []).map((w: any) => w.order_id).filter(Boolean);

        const { data: orders } = await supabase
          .from("orders")
          .select("id, order_number, status, subtotal, created_at")
          .eq("user_id", user.id)
          .gte("subtotal", minOrder)
          .not("status", "in", '("delivered","cancelled")')
          .order("created_at", { ascending: false });

        if (orders) {
          // Filter out orders that already have a scratch win
          const pending = orders.filter(
            (o: any) => !winOrderIds.includes(o.id)
          );
          setPendingOrders(pending as PendingOrder[]);
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [user]);

  const copyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success("Código copiado!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDiscount = (type: string, value: number) =>
    type === "percentage" ? `${value}%` : `R$ ${value.toFixed(2).replace(".", ",")}`;

  const getStatus = (w: ScratchWin) => {
    if (w.no_prize) return { label: "Sem prêmio", variant: "secondary" as const };
    if (w.redeemed_at) return { label: "Resgatado ✅", variant: "default" as const };
    if (new Date(w.expires_at) < new Date()) return { label: "Expirado", variant: "destructive" as const };
    return { label: "Disponível", variant: "outline" as const };
  };

  const hasContent = wins.length > 0 || pendingOrders.length > 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/90 px-4 py-4 backdrop-blur-md border-b border-border">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <Gift size={20} className="text-primary" />
          <h1 className="text-lg font-extrabold text-foreground">Presentes</h1>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 pt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !hasContent ? (
          <div className="text-center py-12">
            <Gift size={48} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Você ainda não tem presentes</p>
            <p className="text-xs text-muted-foreground mt-1">
              Faça pedidos acima do valor mínimo para ganhar!
            </p>
          </div>
        ) : (
          <>
            {/* Pending scratch cards - orders not yet delivered */}
            {pendingOrders.map((order, i) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl bg-card border border-amber-500/30 p-4 shadow-sm relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
                <div className="relative flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                      <Lock size={18} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        🎁 Raspadinha Premiada
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pedido #{String(order.order_number).padStart(5, "0")}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-500/10">
                    <Clock size={12} className="mr-1" />
                    Pendente
                  </Badge>
                </div>
                <div className="relative mt-3 rounded-lg bg-amber-500/5 border border-amber-500/15 p-3 text-center">
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <p className="text-sm font-semibold text-amber-700">
                      ⏳ Aguardando finalizar o pedido para liberar o prêmio.
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            ))}

            {/* Already scratched wins */}
            {wins.map((w, i) => {
              const status = getStatus(w);
              return (
                <motion.div
                  key={w.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (pendingOrders.length + i) * 0.05 }}
                  className="rounded-xl bg-card border border-border p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{w.no_prize ? "😔" : "🎉"}</span>
                      <div>
                        {w.no_prize ? (
                          <p className="text-sm text-muted-foreground">Sem prêmio</p>
                        ) : (
                          <>
                            <p className="text-sm font-bold text-foreground">
                              {formatDiscount(w.discount_type, w.discount_value)} de desconto
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">{w.coupon_code}</p>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Encontrado em {new Date(w.found_at).toLocaleDateString("pt-BR")}
                    </span>
                    {!w.no_prize && (
                      <span>Válido até {new Date(w.expires_at).toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>

                  {!w.no_prize && !w.redeemed_at && new Date(w.expires_at) > new Date() && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3 gap-1.5"
                      onClick={() => copyCode(w.id, w.coupon_code)}
                    >
                      {copiedId === w.id ? (
                        <><Check size={14} className="text-primary" /> Copiado!</>
                      ) : (
                        <><Copy size={14} /> Copiar código</>
                      )}
                    </Button>
                  )}
                </motion.div>
              );
            })}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default MyScratchCards;
