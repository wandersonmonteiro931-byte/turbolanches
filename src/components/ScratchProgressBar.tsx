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
  hasCoupon?: boolean;
}

const ScratchProgressBar = ({ subtotal, hasCoupon = false }: ScratchProgressBarProps) => {
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
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[22px] border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-fire-orange/12 p-3 shadow-fire"
        >
          <motion.div
            className="pointer-events-none absolute -left-7 -top-7 h-20 w-20 rounded-full bg-primary/15 blur-3xl"
            animate={{ x: [0, 12, -6, 0], y: [0, 8, -8, 0], scale: [1, 1.08, 0.96, 1] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute -bottom-8 -right-7 h-20 w-20 rounded-full bg-fire-orange/15 blur-3xl"
            animate={{ x: [0, -10, 8, 0], y: [0, -10, 6, 0], scale: [1, 0.92, 1.08, 1] }}
            transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative">
            <div className="mb-2.5 flex items-center gap-2.5">
              <motion.div
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-fire-gradient text-primary-foreground shadow-fire"
                animate={isEligible ? { rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] } : { y: [0, -3, 0], scale: [1, 1.04, 1] }}
                transition={{ duration: isEligible ? 1.8 : 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                {isEligible ? <Sparkles size={16} /> : <Gift size={16} />}
              </motion.div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-foreground">
                  {isEligible ? "Sua raspadinha foi liberada!" : "Desbloqueie sua raspadinha"}
                </p>
              </div>
            </div>

            <DialogTrigger asChild>
              <button type="button" className="group block w-full text-left" aria-label="Ver regras da raspadinha">
                <div className="relative overflow-hidden rounded-[18px] border border-primary/15 bg-background/85 p-2.5 backdrop-blur-sm">
                  <div className="relative mb-2.5 h-3 overflow-hidden rounded-full bg-secondary">
                    <motion.div
                      className="relative h-full rounded-full bg-fire-gradient"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                      <motion.div
                        className="scratch-progress-shine absolute inset-0"
                        animate={{ x: ["-140%", "220%"] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                      />
                    </motion.div>
                  </div>

                  <div className="flex items-end justify-between gap-2.5">
                    <p className="text-xs leading-snug text-muted-foreground">
                      {isEligible ? (
                        <span className="font-semibold text-foreground">
                          Parabéns! Seu pedido já garantiu uma raspadinha premiada. 🎉
                        </span>
                      ) : (
                        <>
                          Faltam <span className="font-extrabold text-foreground">{fmt(remaining)}</span> para liberar
                          sua raspadinha premiada.
                        </>
                      )}
                    </p>

                    <motion.span
                      className="shrink-0 rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Ver regras
                    </motion.span>
                  </div>
                </div>
              </button>
            </DialogTrigger>
          </div>
        </motion.div>

        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Regras da Raspadinha Premiada</DialogTitle>
            <DialogDescription>
              Confira como garantir e usar sua raspadinha antes de finalizar o pedido.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-xl border border-primary/10 bg-card p-3">
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
