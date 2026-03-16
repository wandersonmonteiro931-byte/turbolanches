import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ScratchProgressBarProps {
  subtotal: number;
}

const ScratchProgressBar = ({ subtotal }: ScratchProgressBarProps) => {
  const [settings, setSettings] = useState<{
    is_enabled: boolean;
    min_order_value: number;
  } | null>(null);
  const [totalAwarded, setTotalAwarded] = useState(0);
  const [totalLimit, setTotalLimit] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: s } = await supabase
        .from("scratch_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (!s || !(s as any).is_enabled) {
        setLoading(false);
        return;
      }

      setSettings({
        is_enabled: (s as any).is_enabled,
        min_order_value: (s as any).min_order_value,
      });

      const { data: prizes } = await supabase
        .from("scratch_prizes")
        .select("total_quantity, remaining_quantity")
        .eq("is_active", true);

      if (prizes) {
        const total = prizes.reduce((sum, prize) => sum + (prize as any).total_quantity, 0);
        const remaining = prizes.reduce((sum, prize) => sum + (prize as any).remaining_quantity, 0);
        setTotalLimit(total);
        setTotalAwarded(total - remaining);
      }

      setLoading(false);
    };

    void fetch();
  }, []);

  if (loading || !settings || !settings.is_enabled) return null;
  if (totalLimit > 0 && totalAwarded >= totalLimit) return null;

  const minValue = settings.min_order_value;
  const isEligible = subtotal >= minValue;
  const remaining = Math.max(0, minValue - subtotal);
  const progressPercent = minValue > 0 ? Math.min(100, (subtotal / minValue) * 100) : 0;

  const fmt = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

  return (
    <AnimatePresence>
      <Dialog>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="rounded-xl border border-scratch-amber/30 bg-scratch-gradient-soft p-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <motion.div
              animate={isEligible ? { scale: [1, 1.08, 1], rotate: [0, -6, 6, 0] } : { y: [0, -2, 0] }}
              transition={{ duration: isEligible ? 1.8 : 1.4, repeat: Infinity, ease: "easeInOut" }}
            >
              {isEligible ? (
                <Sparkles size={18} className="text-scratch-amber" />
              ) : (
                <Gift size={18} className="text-scratch-amber" />
              )}
            </motion.div>

            <span className="text-sm font-bold text-foreground">
              {isEligible ? "Raspadinha garantida!" : "Raspadinha Premiada"}
            </span>
          </div>

          <DialogTrigger asChild>
            <button type="button" className="block w-full text-left" aria-label="Ver regras da raspadinha">
              <div className="relative mb-2 h-2.5 overflow-hidden rounded-full bg-scratch-surface-strong/70">
                <motion.div
                  className="bg-scratch-progress relative h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                >
                  <motion.div
                    className="scratch-progress-shine absolute inset-0"
                    animate={{ x: ["-140%", "220%"] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                  />
                </motion.div>
              </div>

              <p className="text-xs text-muted-foreground">
                {isEligible ? (
                  <span className="font-semibold text-foreground">
                    Parabéns! Você já garantiu uma raspadinha premiada! 🎊
                  </span>
                ) : (
                  <>
                    Faltam <span className="font-bold text-foreground">{fmt(remaining)}</span> para ganhar uma
                    raspadinha premiada!
                  </>
                )}
              </p>

              <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                Ver regras
              </p>
            </button>
          </DialogTrigger>
        </motion.div>

        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Regras da Raspadinha Premiada</DialogTitle>
            <DialogDescription>
              Confira como garantir e usar sua raspadinha antes de finalizar o pedido.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border border-border bg-card p-3">
              <ul className="space-y-2">
                <li>• O subtotal dos produtos precisa ser igual ou maior que <span className="font-semibold text-foreground">{fmt(minValue)}</span>.</li>
                <li>• A taxa de entrega não entra no cálculo da promoção.</li>
                <li>• A raspadinha só fica disponível quando o pedido for entregue com sucesso.</li>
                <li>• Cada pedido elegível dá direito a apenas uma raspadinha.</li>
                <li>• A promoção depende da disponibilidade de prêmios cadastrados.</li>
                <li>• Ao raspar, você recebe um cupom de desconto vinculado à sua conta.</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AnimatePresence>
  );
};

export default ScratchProgressBar;
