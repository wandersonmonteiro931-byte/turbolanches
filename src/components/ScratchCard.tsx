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

        // Auto-create a valid single-use coupon via secure function
        await supabase.rpc("create_scratch_coupon", {
          _code: code,
          _type: selectedPrize.discount_type,
          _value: selectedPrize.discount_value,
          _expires_at: expiresAt.toISOString(),
          _store_id: selectedPrize.store_id,
        });

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
      initial={{ opacity: 0, y: 28, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
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
            {alreadyScratched ? "🎊 Sua Raspadinha" : "🎉 Você ganhou uma Raspadinha!"}
          </motion.h3>
          <p className="text-xs text-muted-foreground">
            {revealed ? "Prêmio revelado!" : "Raspe e descubra seu prêmio"}
          </p>
        </div>
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles size={18} className="text-fire-orange" />
        </motion.div>
      </div>

      {!revealed ? (
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

          {/* Center content under scratch */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="text-center"
              animate={{ y: [0, -8, 0], scale: [1, 1.04, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <motion.div
                className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-fire-orange/20 text-primary"
                animate={{ rotate: [0, -15, 15, 0], scale: [1, 1.08, 0.95, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Gift size={30} />
              </motion.div>
              <p className="text-sm font-extrabold uppercase tracking-[0.15em] text-foreground">
                Prêmio surpresa!
              </p>
            </motion.div>
          </div>

          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full cursor-pointer touch-none rounded-[22px]"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerMove={handlePointerMove}
          />
        </motion.div>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ scale: 0.8, opacity: 0, rotate: -3 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.6, duration: 0.9 }}
            className="relative overflow-hidden rounded-[22px] border-2 border-primary/15 bg-card p-6 text-center shadow-fire"
          >
            {/* Animated rainbow top bar */}
            <motion.div
              className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-fire-orange to-fire-yellow"
              animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              style={{ backgroundSize: "200% 100%" }}
            />

            {scratching ? (
              <div className="py-8">
                <motion.div
                  animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                  className="mx-auto mb-3 flex h-18 w-18 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-fire-orange/15 text-primary"
                >
                  <Gift size={32} />
                </motion.div>
                <motion.p
                  className="text-base font-bold text-foreground"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  ✨ Revelando... ✨
                </motion.p>
              </div>
            ) : result ? (
              <>
                {/* Confetti-like floating emojis */}
                {["🎉", "🎊", "⭐", "✨", "🎁", "💥"].map((emoji, i) => (
                  <motion.span
                    key={i}
                    className="pointer-events-none absolute text-lg"
                    style={{ left: `${12 + i * 14}%`, top: "-10%" }}
                    initial={{ y: -20, opacity: 0, rotate: 0 }}
                    animate={{
                      y: ["-10%", "110%"],
                      opacity: [0, 1, 1, 0],
                      rotate: [0, 180 + i * 30],
                      x: [0, (i % 2 === 0 ? 15 : -15)],
                    }}
                    transition={{
                      duration: 2 + i * 0.3,
                      delay: i * 0.15,
                      repeat: Infinity,
                      repeatDelay: 3,
                      ease: "easeIn",
                    }}
                  >
                    {emoji}
                  </motion.span>
                ))}

                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", bounce: 0.7, duration: 1 }}
                  className="mx-auto mb-3 flex h-18 w-18 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-fire-orange/15 text-primary"
                >
                  <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    <Sparkles size={34} />
                  </motion.div>
                </motion.div>

                <motion.p
                  className="mb-1 text-xl font-extrabold text-foreground"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  🎉 Parabéns! 🎉
                </motion.p>
                <motion.p
                  className="mb-4 text-sm text-muted-foreground"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  Você ganhou um cupom de{" "}
                  <span className="font-bold text-primary">
                    {formatDiscount(result.discount_type, result.discount_value)}
                  </span>{" "}
                  de desconto!
                </motion.p>
                <motion.div
                  className="mb-3 flex items-center justify-center gap-2 rounded-2xl border-2 border-primary/10 bg-gradient-to-r from-muted/70 to-muted/50 p-3"
                  initial={{ y: 12, opacity: 0, scale: 0.95 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35, type: "spring", bounce: 0.4 }}
                >
                  <span className="font-mono text-lg font-bold tracking-[0.2em] text-foreground">
                    {result.coupon_code}
                  </span>
                  <Button variant="ghost" size="icon" onClick={copyCode} className="shrink-0 rounded-xl">
                    {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
                  </Button>
                </motion.div>
                <motion.p
                  className="text-xs text-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  Válido até{" "}
                  {new Date(result.expires_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </motion.p>
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
};

export default ScratchCard;
