import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CalcState {
  running: boolean;
  processed: number;
  remaining: number;
  failed: number;
  message: string;
}

const INITIAL: CalcState = { running: false, processed: 0, remaining: 0, failed: 0, message: "" };

export function useDeliveryCalculation() {
  const [state, setState] = useState<CalcState>(INITIAL);
  const runningRef = useRef(false);
  const abortRef = useRef(false);

  const start = useCallback(async (recalcAll = false) => {
    if (runningRef.current) return;
    runningRef.current = true;
    abortRef.current = false;

    setState({ running: true, processed: 0, remaining: 0, failed: 0, message: "Iniciando cálculo..." });

    try {
      if (recalcAll) {
        setState(s => ({ ...s, message: "Resetando distâncias..." }));
        await supabase.from("store_settings").update({ store_lat: null, store_lng: null } as any).not("id", "is", null);
        await supabase.from("delivery_zones").update({ distance_km: null, delivery_fee: 0 } as any).not("id", "is", null);
      }

      // Count total
      const { count: totalPending } = await supabase
        .from("delivery_zones")
        .select("id", { count: "exact", head: true })
        .is("distance_km", null);

      const total = totalPending || 0;
      if (total === 0) {
        setState({ running: false, processed: 0, remaining: 0, failed: 0, message: "✅ Nenhum bairro pendente." });
        runningRef.current = false;
        return;
      }

      let totalProcessed = 0;
      let consecutiveErrors = 0;

      setState(s => ({ ...s, remaining: total, message: `0 de ${total} processados...` }));

      while (true) {
        if (abortRef.current) {
          setState(s => ({ ...s, running: false, message: "⏹️ Cancelado" }));
          break;
        }

        let data: any;
        let error: any;
        try {
          const r = await supabase.functions.invoke("calculate-delivery-distances");
          data = r.data;
          error = r.error;
        } catch (e) {
          consecutiveErrors++;
          if (consecutiveErrors >= 8) {
            setState(s => ({ ...s, running: false, message: "❌ Muitos erros seguidos." }));
            break;
          }
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        if (error || !data?.success) {
          consecutiveErrors++;
          if (consecutiveErrors >= 8) {
            setState(s => ({ ...s, running: false, message: `❌ Erro: ${data?.error || "desconhecido"}` }));
            break;
          }
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        consecutiveErrors = 0;
        totalProcessed += data.processed || 0;
        const remaining = data.remaining || 0;
        const failed = data.failed || 0;
        const fMsg = failed > 0 ? ` (${failed} N/A)` : "";

        if (remaining === 0) {
          setState({
            running: false,
            processed: totalProcessed,
            remaining: 0,
            failed,
            message: `✅ ${totalProcessed} bairros calculados!${fMsg}`,
          });
          break;
        }

        setState({
          running: true,
          processed: totalProcessed,
          remaining,
          failed,
          message: `${totalProcessed} de ${totalProcessed + remaining} processados...${fMsg}`,
        });

        // Small delay between batches
        await new Promise(r => setTimeout(r, 500));
      }
    } catch {
      setState(s => ({ ...s, running: false, message: "❌ Erro inesperado" }));
    } finally {
      runningRef.current = false;
      setState(s => ({ ...s, running: false }));
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { state, start, cancel };
}
