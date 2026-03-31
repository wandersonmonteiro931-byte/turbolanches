import { useCallback, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CalcState {
  running: boolean;
  processed: number;
  remaining: number;
  failed: number;
  message: string;
}

let globalState: CalcState = { running: false, processed: 0, remaining: 0, failed: 0, message: "" };
let listeners: Array<() => void> = [];
let abortFlag = false;
let isRunning = false;

function emitChange() {
  for (const l of listeners) l();
}

function setState(partial: Partial<CalcState>) {
  globalState = { ...globalState, ...partial };
  emitChange();
}

function subscribe(cb: () => void) {
  listeners = [...listeners, cb];
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function getSnapshot(): CalcState {
  return globalState;
}

async function runLoop(recalcAll: boolean) {
  if (isRunning) return;
  isRunning = true;
  abortFlag = false;

  setState({ running: true, processed: 0, remaining: 0, failed: 0, message: "Iniciando cálculo..." });

  try {
    // If recalcAll, reset all distances
    if (recalcAll) {
      setState({ message: "Resetando distâncias..." });
      await supabase.from("store_settings").update({ store_lat: null, store_lng: null } as any).not("id", "is", null);
      await supabase.from("delivery_zones").update({ distance_km: null, delivery_fee: 0 } as any).not("id", "is", null);
    }

    // Count total pending
    const { count: totalPending } = await supabase
      .from("delivery_zones")
      .select("id", { count: "exact", head: true })
      .is("distance_km", null);

    const totalToProcess = totalPending || 0;
    let totalProcessed = 0;
    let totalFailed = 0;
    let consecutiveErrors = 0;

    setState({ remaining: totalToProcess, message: `0 de ${totalToProcess} processados...` });

    while (true) {
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
      } catch (e) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          setState({ running: false, message: `❌ Muitos erros seguidos. Tente novamente.` });
          break;
        }
        await new Promise((r) => setTimeout(r, 2000 * consecutiveErrors));
        continue;
      }

      if (abortFlag) {
        setState({ running: false, message: "⏹️ Cancelado" });
        break;
      }

      if (error || !data?.success) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          setState({ running: false, message: `❌ Erro: ${data?.error || "desconhecido"}` });
          break;
        }
        await new Promise((r) => setTimeout(r, 2000 * consecutiveErrors));
        continue;
      }

      // Success
      consecutiveErrors = 0;
      totalProcessed += data.processed;
      totalFailed = data.failed || 0;
      const remaining = data.remaining || 0;

      const fMsg = totalFailed > 0 ? ` (${totalFailed} N/A)` : "";

      if (remaining === 0) {
        setState({
          processed: totalProcessed,
          remaining: 0,
          failed: totalFailed,
          message: `✅ ${totalProcessed} bairros calculados!${fMsg}`,
        });
        break;
      }

      setState({
        processed: totalProcessed,
        remaining,
        failed: totalFailed,
        message: `${totalProcessed} de ${totalProcessed + remaining} processados...${fMsg}`,
      });
    }
  } catch {
    setState({ running: false, message: "❌ Erro inesperado" });
  } finally {
    isRunning = false;
    setState({ running: false });
  }
}

export function useDeliveryCalculation() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const start = useCallback((recalcAll = false) => {
    runLoop(recalcAll);
  }, []);

  const cancel = useCallback(() => {
    abortFlag = true;
  }, []);

  return { state, start, cancel };
}
