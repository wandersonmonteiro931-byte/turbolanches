import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Singleton background worker for delivery distance calculation.
 * Persists across route changes — once started, keeps running until done or cancelled.
 */

type Listener = (state: CalcState) => void;

interface CalcState {
  running: boolean;
  processed: number;
  remaining: number;
  failed: number;
  message: string;
}

let globalState: CalcState = { running: false, processed: 0, remaining: 0, failed: 0, message: "" };
let listeners = new Set<Listener>();
let abortFlag = false;
let isRunning = false;

function notify() {
  listeners.forEach((fn) => fn({ ...globalState }));
}

function setState(partial: Partial<CalcState>) {
  globalState = { ...globalState, ...partial };
  notify();
}

async function runLoop(recalcAll: boolean) {
  if (isRunning) return;
  isRunning = true;
  abortFlag = false;

  setState({ running: true, processed: 0, remaining: 999, failed: 0, message: "Iniciando cálculo..." });

  try {
    if (recalcAll) {
      await supabase.from("store_settings").update({ store_lat: null, store_lng: null } as any).not("id", "is", null);
      await supabase.from("delivery_zones").update({ distance_km: null, delivery_fee: 0 } as any).not("id", "is", null);
    }

    let remaining = 999;
    let totalProcessed = 0;
    let totalFailed = 0;

    while (remaining > 0) {
      if (abortFlag) {
        setState({ running: false, message: "⏹️ Cancelado" });
        break;
      }

      let data: any;
      let error: any;
      try {
        const r = await supabase.functions.invoke("calculate-delivery-distances");
        data = r.data;
        error = r.error;
      } catch {
        setState({ message: `${totalProcessed} processados — reconectando...` });
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      if (abortFlag) {
        setState({ running: false, message: "⏹️ Cancelado" });
        break;
      }

      if (error || !data?.success) {
        setState({ running: false, message: "❌ Erro no cálculo" });
        break;
      }

      totalProcessed += data.processed;
      remaining = data.remaining;
      totalFailed = data.failed || 0;

      const fMsg = totalFailed > 0 ? ` (${totalFailed} N/A)` : "";
      setState({
        processed: totalProcessed,
        remaining,
        failed: totalFailed,
        message:
          remaining > 0
            ? `${totalProcessed} processados, ${remaining} restantes...${fMsg}`
            : `✅ ${totalProcessed} bairros calculados!${fMsg}`,
      });

      if (remaining === 0 && data.processed === 0) break;
    }
  } catch {
    setState({ running: false, message: "❌ Erro inesperado" });
  } finally {
    isRunning = false;
    setState({ running: false });
  }
}

export function useDeliveryCalculation() {
  const [state, setLocalState] = useState<CalcState>(globalState);

  useEffect(() => {
    const listener: Listener = (s) => setLocalState(s);
    listeners.add(listener);
    // Sync current state on mount
    setLocalState({ ...globalState });
    return () => { listeners.delete(listener); };
  }, []);

  const start = (recalcAll = false) => {
    runLoop(recalcAll);
  };

  const cancel = () => {
    abortFlag = true;
  };

  return { state, start, cancel };
}
