import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, Copy, Check, Clock, Lock, Info, Sparkles, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import ScratchCard from "@/components/ScratchCard";
import { renderScratchRule, useScratchRules } from "@/hooks/useScratchRules";

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
  const [rulesOpen, setRulesOpen] = useState(false);
  const [minOrderValue, setMinOrderValue] = useState(0);
  const { rules: scratchRules, howItWorks: scratchHowItWorks } = useScratchRules();

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
        {/* Collapsible rules section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-fire-orange/5 overflow-hidden"
        >
          <button
            onClick={() => setRulesOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 p-4"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Info size={16} className="text-primary" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Como funciona?</h2>
            </div>
            <motion.div animate={{ rotate: rulesOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={18} className="text-muted-foreground" />
            </motion.div>
          </button>
          {rulesOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-4"
            >
              {/* Como funciona */}
              <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-foreground">🎯 Como funciona</h4>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground mb-3">
                {scratchHowItWorks.map((step, i) => (
                  <li key={i}>{renderScratchRule(step, fmt(minOrderValue))}</li>
                ))}
              </ol>

              {/* Regras */}
              <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-foreground">📋 Regras</h4>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {scratchRules.map((rule, i) => (
                  <li key={i}>• {renderScratchRule(rule, fmt(minOrderValue))}</li>
                ))}
              </ul>
            </motion.div>
          )}
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

            {/* Pending scratch cards - orders not yet delivered (same visual as ScratchCard) */}
            {pendingOrders.map((order, i) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 28, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, delay: (deliveredOrders.length + i) * 0.08, ease: "easeOut" }}
                className="relative overflow-hidden rounded-[28px] border-2 border-primary/25 bg-gradient-to-br from-primary/10 via-card to-fire-orange/10 p-5 shadow-fire-lg"
              >
                {/* Animated floating blobs */}
                <motion.div
                  className="pointer-events-none absolute -left-8 -top-4 h-28 w-28 rounded-full bg-primary/20 blur-3xl"
                  animate={{ x: [0, 18, -10, 0], y: [0, -12, 8, 0], scale: [1, 1.2, 0.9, 1] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 rounded-full bg-fire-orange/20 blur-3xl"
                  animate={{ x: [0, -14, 8, 0], y: [0, 10, -10, 0], scale: [1, 0.85, 1.15, 1] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fire-yellow/10 blur-2xl"
                  animate={{ scale: [0.8, 1.3, 0.8], opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Shimmering top stripe */}
                <motion.div
                  className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-primary to-transparent"
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Header */}
                <div className="relative mb-4 flex items-center gap-3">
                  <motion.div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-fire-orange text-primary-foreground shadow-fire"
                    animate={{
                      rotate: [0, -8, 8, -4, 4, 0],
                      scale: [1, 1.1, 1, 1.05, 1],
                      y: [0, -3, 0, -1, 0],
                    }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Gift size={22} />
                  </motion.div>
                  <div className="flex-1">
                    <motion.h3
                      className="text-base font-extrabold text-foreground"
                      animate={{ x: [0, 2, -1, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      🎁 Raspadinha Premiada
                    </motion.h3>
                    <p className="text-xs text-muted-foreground">
                      Pedido #{String(order.order_number).padStart(5, "0")}
                    </p>
                  </div>
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles size={18} className="text-fire-orange" />
                  </motion.div>
                </div>

                {/* Locked scratch area */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="relative h-48 w-full overflow-hidden rounded-[22px] border-2 border-primary/15 bg-gradient-to-br from-background via-card to-background"
                >
                  {/* Corner decorations */}
                  <motion.div className="pointer-events-none absolute left-3 top-3 text-xl" animate={{ rotate: [0, 20, -20, 0], scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}>🎁</motion.div>
                  <motion.div className="pointer-events-none absolute right-3 top-3 text-xl" animate={{ rotate: [0, -20, 20, 0], scale: [1, 1.15, 1] }} transition={{ duration: 2.3, repeat: Infinity }}>⭐</motion.div>
                  <motion.div className="pointer-events-none absolute bottom-3 left-3 text-xl" animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>🎀</motion.div>
                  <motion.div className="pointer-events-none absolute bottom-3 right-3 text-xl" animate={{ rotate: [0, -15, 15, 0] }} transition={{ duration: 2.1, repeat: Infinity }}>🎊</motion.div>

                  {/* Pulsing dashed border */}
                  <motion.div
                    className="pointer-events-none absolute inset-4 rounded-[18px] border-2 border-dashed border-primary/20"
                    animate={{ opacity: [0.3, 0.8, 0.3], scale: [1, 1.005, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  />

                  {/* Lock overlay with gradient */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-fire-orange/5">
                    <motion.div
                      className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-fire-orange/20"
                      animate={{ rotate: [0, -15, 15, 0], scale: [1, 1.08, 0.95, 1] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Lock size={30} className="text-primary" />
                    </motion.div>
                    <motion.p
                      className="text-sm font-extrabold uppercase tracking-[0.1em] text-foreground"
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      ⏳ Aguardando entrega
                    </motion.p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Será liberada ao finalizar o pedido
                    </p>
                  </div>
                </motion.div>
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
