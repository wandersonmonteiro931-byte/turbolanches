import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, Copy, Check, Sparkles } from "lucide-react";
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

const MyScratchCards = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [wins, setWins] = useState<ScratchWin[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("scratch_wins")
      .select("*")
      .eq("user_id", user.id)
      .order("found_at", { ascending: false })
      .then(({ data }) => {
        if (data) setWins(data as any[]);
        setLoading(false);
      });
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
    if (w.no_prize) return { label: "Sem prêmio", variant: "secondary" as const, emoji: "😔" };
    if (w.redeemed_at) return { label: "Resgatado ✅", variant: "default" as const, emoji: "🎁" };
    if (new Date(w.expires_at) < new Date()) return { label: "Expirado", variant: "destructive" as const, emoji: "⏰" };
    return { label: "Disponível", variant: "outline" as const, emoji: "🎉" };
  };

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
        ) : wins.length === 0 ? (
          <div className="text-center py-12">
            <Gift size={48} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Você ainda não tem raspadinhas</p>
            <p className="text-xs text-muted-foreground mt-1">
              Faça pedidos acima do valor mínimo para ganhar!
            </p>
          </div>
        ) : (
          wins.map((w, i) => {
            const status = getStatus(w);
            return (
              <motion.div
                key={w.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
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
                      <><Check size={14} className="text-green-500" /> Copiado!</>
                    ) : (
                      <><Copy size={14} /> Copiar código</>
                    )}
                  </Button>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default MyScratchCards;
