import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, Copy, Check, Clock, Lock, Info, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import ScratchCard from "@/components/ScratchCard";

interface ScratchWin {
  id: string;
  order_id: string | null;
  coupon_code: string;
  discount_type: string;
  discount_value: number;
  found_at: string;
  expires_at: string;
  redeemed_at: string | null;
  no_prize: boolean;
}

interface EligibleOrder {
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
  const [pendingOrders, setPendingOrders] = useState<EligibleOrder[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<EligibleOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [minOrderValue, setMinOrderValue] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const { data: settings } = await supabase
        .from("scratch_settings")
        .select("is_enabled, min_order_value")
        .limit(1)
        .maybeSingle();

      const { data: winsData } = await supabase
        .from("scratch_wins")
        .select("*")
        .eq("user_id", user.id)
        .order("found_at", { ascending: false });

      if (winsData) setWins(winsData as any[]);

      if (settings && (settings as any).is_enabled) {
        const minOrder = (settings as any).min_order_value || 0;
        setMinOrderValue(minOrder);
        const winOrderIds = (winsData || []).map((w: any) => w.order_id).filter(Boolean);

        // Fetch qualifying orders that don't have a scratch win yet
        const { data: orders } = await supabase
          .from("orders")
          .select("id, order_number, status, subtotal, created_at")
          .eq("user_id", user.id)
          .gte("subtotal", minOrder)
          .not("status", "eq", "cancelled")
          .order("created_at", { ascending: false });

        if (orders) {
          const unscratchedOrders = (orders as EligibleOrder[]).filter(
            (o) => !winOrderIds.includes(o.id)
          );
          setPendingOrders(unscratchedOrders.filter((o) => o.status !== "delivered"));
          setDeliveredOrders(unscratchedOrders.filter((o) => o.status === "delivered"));
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

  const fmt = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

  const getStatus = (w: ScratchWin) => {
    if (w.no_prize) return { label: "Sem prêmio", variant: "secondary" as const };
    if (w.redeemed_at) return { label: "Resgatado ✅", variant: "default" as const };
    const now = new Date();
    const expires = new Date(w.expires_at);
    if (expires < now) return { label: "CUPOM VENCIDO", variant: "destructive" as const };
    const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 5) return { label: "CUPOM VENCENDO", variant: "destructive" as const };
    return { label: "Disponível", variant: "outline" as const };
  };

  const hasContent = wins.length > 0 || pendingOrders.length > 0 || deliveredOrders.length > 0;

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

      <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
        {/* Rules section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-fire-orange/5 p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Info size={16} className="text-primary" />
            </div>
            <h2 className="text-sm font-bold text-foreground">Regras da Raspadinha Premiada</h2>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• O subtotal dos produtos precisa ser igual ou maior que <span className="font-semibold text-foreground">{fmt(minOrderValue)}</span>.</li>
            <li>• A taxa de entrega não entra no cálculo da promoção.</li>
            <li>• A raspadinha só fica disponível quando o pedido for entregue com sucesso.</li>
            <li>• Cada pedido elegível dá direito a apenas uma raspadinha.</li>
            <li>• A promoção depende da disponibilidade de prêmios cadastrados.</li>
            <li>• Ao raspar, você recebe um cupom de desconto vinculado à sua conta.</li>
            <li>• O cupom gerado é de uso único e possui validade.</li>
            <li>• O desconto do cupom não se aplica à taxa de entrega.</li>
          </ul>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !hasContent ? (
          <div className="text-center py-12">
            <Gift size={48} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Você ainda não tem presentes</p>
            <p className="text-xs text-muted-foreground mt-1">
              Faça pedidos acima de {fmt(minOrderValue)} para ganhar!
            </p>
          </div>
        ) : (
          <>
            {/* Scratchable cards - delivered orders without a win yet */}
            {deliveredOrders.map((order, i) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles size={14} className="text-primary" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    Pedido #{String(order.order_number).padStart(5, "0")} — Raspe agora!
                  </span>
                </div>
                <ScratchCard orderId={order.id} orderSubtotal={Number(order.subtotal)} />
              </motion.div>
            ))}

            {/* Pending scratch cards - orders not yet delivered */}
            {pendingOrders.map((order, i) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (deliveredOrders.length + i) * 0.05 }}
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
            {wins.length > 0 && (
              <div className="pt-2">
                <h2 className="text-sm font-bold text-muted-foreground mb-2">Raspadinhas anteriores</h2>
                {wins.map((w, i) => {
                  const status = getStatus(w);
                  return (
                    <motion.div
                      key={w.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (deliveredOrders.length + pendingOrders.length + i) * 0.05 }}
                      className="rounded-xl bg-card border border-border p-4 shadow-sm mb-3"
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
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default MyScratchCards;
