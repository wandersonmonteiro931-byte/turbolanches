import { useState, useEffect, useCallback } from "react";
import { Copy, CheckCircle2, Loader2, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import TurboLoader from "@/components/TurboLoader";

interface PixPaymentModalProps {
  orderId: string;
  qrcode: string;
  qrcodeImage: string;
  total: number;
  expiracao: number;
  onConfirmed: () => void;
  onCancelled: () => void;
}

const PixPaymentModal = ({
  orderId,
  qrcode,
  qrcodeImage,
  total,
  expiracao,
  onConfirmed,
  onCancelled,
}: PixPaymentModalProps) => {
  const [confirmed, setConfirmed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(expiracao);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  // Polling: check payment status every 1s
  useEffect(() => {
    if (confirmed) return;

    const poll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/pix-efi/check-status`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ order_id: orderId }),
          }
        );
        // Order was deleted (client cancelled) — stop polling silently
        if (resp.status === 404) return;
        const data = await resp.json();
        if (data.confirmed) {
          setConfirmed(true);
          onConfirmed();
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [orderId, confirmed, projectId, onConfirmed]);

  // Countdown timer
  useEffect(() => {
    if (confirmed || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [confirmed, timeLeft]);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try {
      // Delete items first (FK dependency), then the order
      await supabase.from("order_items").delete().eq("order_id", orderId);
      await supabase.from("orders").delete().eq("id", orderId).eq("status", "pending");
      toast.info("Pedido cancelado.");
      onCancelled();
    } catch {
      toast.error("Erro ao cancelar pedido.");
    } finally {
      setCancelling(false);
    }
  }, [orderId, onCancelled]);

  const copyPix = () => {
    navigator.clipboard.writeText(qrcode);
    setCopied(true);
    toast.success("Código PIX copiado!");
    setTimeout(() => setCopied(false), 3000);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  if (confirmed) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center space-y-4 animate-in fade-in zoom-in">
          <CheckCircle2 size={64} className="mx-auto text-green-500" />
          <h2 className="text-xl font-bold text-foreground">Pagamento Confirmado! 🎉</h2>
          <p className="text-sm text-muted-foreground">
            Seu pedido foi recebido e está sendo preparado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-2">
          <QrCode size={20} className="text-primary" />
          <h2 className="text-lg font-bold text-foreground">Pagamento PIX</h2>
        </div>

        {/* Total */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Valor a pagar</p>
          <p className="text-2xl font-bold text-primary">
            R$ {total.toFixed(2).replace(".", ",")}
          </p>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          {qrcodeImage ? (
            <img
              src={qrcodeImage.startsWith("data:") ? qrcodeImage : `data:image/png;base64,${qrcodeImage}`}
              alt="QR Code PIX"
              className="w-48 h-48 rounded-lg"
            />
          ) : (
            <div className="flex w-48 h-48 items-center justify-center rounded-lg bg-muted">
              <TurboLoader size={110} />
            </div>
          )}
        </div>

        {/* Copy button */}
        <button
          onClick={copyPix}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold transition-all ${
            copied
              ? "bg-green-500/20 text-green-500 border border-green-500/30"
              : "bg-primary/10 text-primary border border-primary/20"
          }`}
        >
          {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
          {copied ? "Copiado!" : "Copiar código PIX"}
        </button>

        {/* Timer */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Aguardando pagamento...</span>
          </div>
          {timeLeft > 0 ? (
            <p className="text-xs text-muted-foreground">
              Expira em {minutes}:{seconds.toString().padStart(2, "0")}
            </p>
          ) : (
            <p className="text-xs text-destructive font-medium">
              QR Code expirado. Cancele e tente novamente.
            </p>
          )}
        </div>

        {/* Instructions */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-1">
          <p className="text-xs font-semibold text-foreground">Como pagar:</p>
          <p className="text-xs text-muted-foreground">1. Abra o app do seu banco</p>
          <p className="text-xs text-muted-foreground">2. Escaneie o QR Code ou cole o código</p>
          <p className="text-xs text-muted-foreground">3. Confirme o pagamento</p>
        </div>

        {/* Cancel button */}
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full rounded-xl border border-destructive/30 bg-destructive/10 py-3 font-semibold text-destructive transition-all hover:bg-destructive/20 disabled:opacity-50"
        >
          {cancelling ? "Cancelando..." : "Cancelar Pedido"}
        </button>
      </div>
    </div>
  );
};

export default PixPaymentModal;
