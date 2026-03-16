import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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

      // Check total prizes available
      const { data: prizes } = await supabase
        .from("scratch_prizes")
        .select("total_quantity, remaining_quantity")
        .eq("is_active", true);

      if (prizes) {
        const total = prizes.reduce((s, p) => s + (p as any).total_quantity, 0);
        const remaining = prizes.reduce((s, p) => s + (p as any).remaining_quantity, 0);
        setTotalLimit(total);
        setTotalAwarded(total - remaining);
      }

      setLoading(false);
    };
    fetch();
  }, []);

  if (loading || !settings || !settings.is_enabled) return null;

  // If all prizes are gone
  if (totalLimit > 0 && totalAwarded >= totalLimit) return null;

  const minValue = settings.min_order_value;
  const isEligible = subtotal >= minValue;
  const remaining = Math.max(0, minValue - subtotal);
  const progressPercent = Math.min(100, (subtotal / minValue) * 100);

  const fmt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl bg-gradient-to-r from-amber-500/10 via-yellow-400/10 to-orange-500/10 border border-amber-300/30 p-4"
      >
        <div className="flex items-center gap-2 mb-2">
          {isEligible ? (
            <Sparkles size={18} className="text-amber-500" />
          ) : (
            <Gift size={18} className="text-amber-500" />
          )}
          <span className="text-sm font-bold text-foreground">
            {isEligible ? "🎉 Raspadinha garantida!" : "🎁 Raspadinha Premiada"}
          </span>
        </div>

        <Progress value={progressPercent} className="h-2.5 mb-2 bg-amber-100 dark:bg-amber-900/30 [&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-orange-500" />

        <p className="text-xs text-muted-foreground">
          {isEligible ? (
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              Parabéns! Você já garantiu uma raspadinha premiada! 🎊
            </span>
          ) : (
            <>
              Faltam <span className="font-bold text-foreground">{fmt(remaining)}</span> para
              ganhar uma raspadinha premiada!
            </>
          )}
        </p>
      </motion.div>
    </AnimatePresence>
  );
};

export default ScratchProgressBar;
