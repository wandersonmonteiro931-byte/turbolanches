import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Copy, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScratchCardProps {
  orderId: string;
  orderSubtotal: number;
}

interface WinResult {
  coupon_code: string;
  discount_type: string;
  discount_value: number;
  expires_at: string;
}

const ScratchCard = ({ orderId, orderSubtotal }: ScratchCardProps) => {
  const { user } = useAuth();
  const [eligible, setEligible] = useState(false);
  const [alreadyScratched, setAlreadyScratched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scratching, setScratchting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<WinResult | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    checkEligibility();
  }, [orderId, user]);

  const checkEligibility = async () => {
    if (!user || !orderId) { setLoading(false); return; }

    const { data: existing } = await supabase
      .from("scratch_wins")
      .select("id, coupon_code, discount_type, discount_value, expires_at")
      .eq("order_id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      setAlreadyScratched(true);
      setResult(existing as any);
      setRevealed(true);
      setLoading(false);
      return;
    }

    const { data: settings } = await supabase
      .from("scratch_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!settings || !(settings as any).is_enabled) {
      setLoading(false);
      return;
    }

    // Check if at least one active prize exists (stock doesn't matter — always award)
    const { data: anyPrize } = await supabase
      .from("scratch_prizes")
      .select("id")
      .eq("is_active", true)
      .limit(1);

    if (orderSubtotal >= (settings as any).min_order_value && anyPrize && anyPrize.length > 0) {
      setEligible(true);
    }

    setLoading(false);
  };

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    // Vibrant red-to-orange gradient instead of yellow
    const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, "#E11D48");
    gradient.addColorStop(0.5, "#F97316");
    gradient.addColorStop(1, "#E11D48");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Sparkle dots
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 30; i++) {
      const sx = Math.random() * rect.width;
      const sy = Math.random() * rect.height;
      const sr = Math.random() * 3 + 1;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✨ RASPE AQUI! ✨", rect.width / 2, rect.height / 2 - 12);
    ctx.font = "13px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("Arraste o dedo para revelar", rect.width / 2, rect.height / 2 + 14);
  }, []);

  useEffect(() => {
    if (eligible && !revealed && canvasRef.current) {
      setTimeout(initCanvas, 100);
    }
  }, [eligible, revealed, initCanvas]);

  const scratch = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const cx = x - rect.left;
    const cy = y - rect.top;

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = 0;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] === 0) transparent++;
    }
    const progress = transparent / (imageData.data.length / 4);

    if (progress > 0.4 && !revealed) {
      revealPrize();
    }
  };

  const handlePointerDown = () => { isDrawing.current = true; };
  const handlePointerUp = () => { isDrawing.current = false; };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    scratch(e.clientX, e.clientY);
  };

  const revealPrize = async () => {
    if (revealed || !user) return;
    setRevealed(true);
    setScratchting(true);

    try {
      // Count how many previous wins this user has (not counting this order)
      const { count: previousWins } = await supabase
        .from("scratch_wins")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      const winCount = previousWins ?? 0;
      const isPremiumEligible = winCount < 2;

      // Try to get a prize from the appropriate tier
      let selectedPrize: any = null;

      if (isPremiumEligible) {
        // First 2 wins: try premium prizes first
        const { data: premiumPrizes } = await supabase
          .from("scratch_prizes")
          .select("*")
          .eq("is_active", true)
          .eq("tier", "premium")
          .gt("remaining_quantity", 0);

        if (premiumPrizes && premiumPrizes.length > 0) {
          selectedPrize = premiumPrizes[Math.floor(Math.random() * premiumPrizes.length)];
        }
      }

      // If no premium prize found (or not eligible), try regular
      if (!selectedPrize) {
        const { data: regularPrizes } = await supabase
          .from("scratch_prizes")
          .select("*")
          .eq("is_active", true)
          .eq("tier", "regular")
          .gt("remaining_quantity", 0);

        if (regularPrizes && regularPrizes.length > 0) {
          selectedPrize = regularPrizes[Math.floor(Math.random() * regularPrizes.length)];
        }
      }

      // Fallback: any active prize with stock
      if (!selectedPrize) {
        const { data: anyPrizes } = await supabase
          .from("scratch_prizes")
          .select("*")
          .eq("is_active", true)
          .gt("remaining_quantity", 0);

        if (anyPrizes && anyPrizes.length > 0) {
          selectedPrize = anyPrizes[Math.floor(Math.random() * anyPrizes.length)];
        }
      }

      // Last resort: pick lowest-value active prize even if stock is 0
      if (!selectedPrize) {
        const { data: fallbackPrizes } = await supabase
          .from("scratch_prizes")
          .select("*")
          .eq("is_active", true)
          .order("discount_value", { ascending: true })
          .limit(1);

        if (fallbackPrizes && fallbackPrizes.length > 0) {
          selectedPrize = fallbackPrizes[0];
        }
      }

      if (selectedPrize) {
        const code = `${selectedPrize.name}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + selectedPrize.validity_days);

        // Decrement stock only if > 0
        if (selectedPrize.remaining_quantity > 0) {
          await supabase
            .from("scratch_prizes")
            .update({ remaining_quantity: selectedPrize.remaining_quantity - 1 })
            .eq("id", selectedPrize.id);
        }

        const winData = {
          user_id: user.id,
          prize_id: selectedPrize.id,
          order_id: orderId,
          store_id: selectedPrize.store_id,
          coupon_code: code,
          discount_type: selectedPrize.discount_type,
          discount_value: selectedPrize.discount_value,
          expires_at: expiresAt.toISOString(),
          no_prize: false,
        };

        await supabase.from("scratch_wins").insert(winData);
        setResult({
          coupon_code: code,
          discount_type: selectedPrize.discount_type,
          discount_value: selectedPrize.discount_value,
          expires_at: expiresAt.toISOString(),
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao processar raspadinha");
    }

    setScratchting(false);
  };

  const copyCode = () => {
    if (result?.coupon_code) {
      navigator.clipboard.writeText(result.coupon_code);
      setCopied(true);
      toast.success("Código copiado!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return null;
  if (!eligible && !alreadyScratched) return null;

  const formatDiscount = (type: string, value: number) =>
    type === "percentage" ? `${value}%` : `R$ ${value.toFixed(2).replace(".", ",")}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="relative overflow-hidden rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,hsl(var(--scratch-amber)/0.35),transparent_32%),radial-gradient(circle_at_bottom_right,hsl(var(--primary)/0.18),transparent_35%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--scratch-surface)))] p-5 shadow-fire-lg"
    >
      <motion.div
        className="pointer-events-none absolute -left-10 top-6 h-20 w-20 rounded-full bg-scratch-amber/25 blur-2xl"
        animate={{ x: [0, 10, -6, 0], y: [0, -8, 4, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -right-6 bottom-4 h-24 w-24 rounded-full bg-primary/15 blur-2xl"
        animate={{ x: [0, -10, 4, 0], y: [0, 6, -6, 0], scale: [1, 0.95, 1.06, 1] }}
        transition={{ duration: 5.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        animate={{ opacity: [0.35, 0.9, 0.35] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mb-4 flex items-center gap-3">
        <motion.div
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-fire"
          animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkles size={20} />
        </motion.div>
        <div>
          <h3 className="text-base font-extrabold text-foreground">
            {alreadyScratched ? "Sua Raspadinha" : "Você ganhou uma Raspadinha!"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {revealed ? "Seu prêmio já foi revelado" : "Raspe e descubra seu prêmio agora"}
          </p>
        </div>
      </div>

      {!revealed ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative h-44 w-full overflow-hidden rounded-[24px] border border-primary/15 bg-[linear-gradient(135deg,hsl(var(--background)),hsl(var(--card)))] p-2"
        >
          <motion.div
            className="pointer-events-none absolute inset-3 rounded-[20px] border border-dashed border-primary/15"
            animate={{ opacity: [0.35, 0.7, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="text-center"
              animate={{ y: [0, -6, 0], scale: [1, 1.03, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <motion.div
                className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-scratch-amber/15 text-primary"
                animate={{ rotate: [0, -12, 12, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Gift size={28} />
              </motion.div>
              <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-foreground">
                Raspadinha premiada
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Arraste o dedo para revelar</p>
            </motion.div>
          </div>

          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full cursor-pointer touch-none rounded-[24px]"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerMove={handlePointerMove}
          />
        </motion.div>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ scale: 0.86, opacity: 0, rotate: -2 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.55, duration: 0.8 }}
            className="relative overflow-hidden rounded-[24px] border border-primary/15 bg-card p-5 text-center shadow-fire"
          >
            <motion.div
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-scratch-amber via-primary to-scratch-orange"
              animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              style={{ backgroundSize: "200% 200%" }}
            />

            {scratching ? (
              <div className="py-6">
                <motion.div
                  animate={{ rotate: 360, scale: [1, 1.15, 1] }}
                  transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
                  className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <Gift size={28} />
                </motion.div>
                <motion.p
                  className="text-sm font-bold text-foreground"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
                  Revelando seu prêmio...
                </motion.p>
              </div>
            ) : result ? (
              <>
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", bounce: 0.65, duration: 0.9 }}
                  className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-scratch-amber/15 text-primary"
                >
                  <Sparkles size={30} />
                </motion.div>
                <p className="mb-1 text-xl font-extrabold text-foreground">Parabéns!</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Você ganhou um cupom de{" "}
                  <span className="font-bold text-primary">
                    {formatDiscount(result.discount_type, result.discount_value)}
                  </span>{" "}
                  de desconto.
                </p>
                <motion.div
                  className="mb-3 flex items-center justify-center gap-2 rounded-2xl border border-primary/10 bg-muted/70 p-3"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                >
                  <span className="font-mono text-lg font-bold tracking-[0.2em] text-foreground">
                    {result.coupon_code}
                  </span>
                  <Button variant="ghost" size="icon" onClick={copyCode} className="shrink-0 rounded-xl">
                    {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
                  </Button>
                </motion.div>
                <p className="text-xs text-muted-foreground">
                  Válido até{" "}
                  {new Date(result.expires_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
};

export default ScratchCard;
