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
  no_prize: boolean;
  fallback_message?: string;
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

    // Check if already scratched
    const { data: existing } = await supabase
      .from("scratch_wins")
      .select("id, coupon_code, discount_type, discount_value, expires_at, no_prize")
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

    // Check settings
    const { data: settings } = await supabase
      .from("scratch_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!settings || !(settings as any).is_enabled) {
      setLoading(false);
      return;
    }

    // Check if prizes are still available
    const { data: prizes } = await supabase
      .from("scratch_prizes")
      .select("remaining_quantity")
      .eq("is_active", true)
      .gt("remaining_quantity", 0);

    const hasStock = prizes && prizes.length > 0;

    if (orderSubtotal >= (settings as any).min_order_value && hasStock) {
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

    const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, "#FFD700");
    gradient.addColorStop(0.5, "#FFA500");
    gradient.addColorStop(1, "#FFD700");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = "#B8860B";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎁 RASPE AQUI!", rect.width / 2, rect.height / 2 - 10);
    ctx.font = "12px sans-serif";
    ctx.fillText("Arraste para revelar", rect.width / 2, rect.height / 2 + 14);
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
      const { data: prizes } = await supabase
        .from("scratch_prizes")
        .select("*")
        .eq("is_active", true)
        .gt("remaining_quantity", 0);

      const { data: settings } = await supabase
        .from("scratch_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (prizes && prizes.length > 0) {
        const prize = prizes[Math.floor(Math.random() * prizes.length)] as any;
        const code = `${prize.name}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + prize.validity_days);

        await supabase
          .from("scratch_prizes")
          .update({ remaining_quantity: prize.remaining_quantity - 1 })
          .eq("id", prize.id);

        const winData = {
          user_id: user.id,
          prize_id: prize.id,
          order_id: orderId,
          store_id: prize.store_id,
          coupon_code: code,
          discount_type: prize.discount_type,
          discount_value: prize.discount_value,
          expires_at: expiresAt.toISOString(),
          no_prize: false,
        };

        await supabase.from("scratch_wins").insert(winData);
        setResult({
          coupon_code: code,
          discount_type: prize.discount_type,
          discount_value: prize.discount_value,
          expires_at: expiresAt.toISOString(),
          no_prize: false,
        });
      } else {
        const expiresAt = new Date();
        const winData = {
          user_id: user.id,
          prize_id: null,
          order_id: orderId,
          store_id: (settings as any)?.store_id || null,
          coupon_code: "SEM_PREMIO",
          discount_type: "fixed",
          discount_value: 0,
          expires_at: expiresAt.toISOString(),
          no_prize: true,
        };
        await supabase.from("scratch_wins").insert(winData);
        setResult({
          coupon_code: "",
          discount_type: "fixed",
          discount_value: 0,
          expires_at: expiresAt.toISOString(),
          no_prize: true,
          fallback_message: (settings as any)?.fallback_message,
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-amber-400/20 via-yellow-300/10 to-orange-400/20 border border-amber-300/30 p-5 shadow-lg"
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={20} className="text-amber-500" />
        <h3 className="font-extrabold text-foreground text-base">
          {alreadyScratched ? "Sua Raspadinha" : "🎉 Você ganhou uma Raspadinha!"}
        </h3>
      </div>

      {!revealed ? (
        <div className="relative w-full h-40 rounded-xl overflow-hidden bg-card border border-border">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Gift size={32} className="mx-auto text-primary mb-2" />
              <p className="text-sm font-bold text-foreground">Revelando...</p>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-pointer touch-none"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerMove={handlePointerMove}
          />
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.5 }}
            className="rounded-xl bg-card border border-border p-5 text-center"
          >
            {scratching ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="text-4xl mx-auto w-fit"
              >
                🎁
              </motion.div>
            ) : result?.no_prize ? (
              <>
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-5xl block mb-3"
                >
                  😔
                </motion.span>
                <p className="text-sm text-muted-foreground">
                  {result.fallback_message || "Os prêmios acabaram! Tente na próxima promoção."}
                </p>
              </>
            ) : result ? (
              <>
                <motion.span
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", bounce: 0.6 }}
                  className="text-5xl block mb-3"
                >
                  🎉
                </motion.span>
                <p className="text-lg font-extrabold text-foreground mb-1">Parabéns!</p>
                <p className="text-sm text-muted-foreground mb-3">
                  Você ganhou um cupom de{" "}
                  <span className="font-bold text-primary">
                    {formatDiscount(result.discount_type, result.discount_value)}
                  </span>{" "}
                  de desconto!
                </p>
                <div className="flex items-center justify-center gap-2 bg-muted rounded-lg p-3 mb-3">
                  <span className="font-mono font-bold text-lg text-foreground tracking-wider">
                    {result.coupon_code}
                  </span>
                  <Button variant="ghost" size="icon" onClick={copyCode} className="shrink-0">
                    {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                  </Button>
                </div>
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
