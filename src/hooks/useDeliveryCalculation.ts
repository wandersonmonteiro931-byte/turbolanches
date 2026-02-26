import { useCallback, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Singleton background worker for delivery distance calculation.
 * Persists across route changes — once started, keeps running until done or cancelled.
 */

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

  setState({ running: true, processed: 0, remaining: 999, failed: 0, message: "Iniciando cálculo..." });

  try {
    if (recalcAll) {
      await supabase.from("store_settings").update({ store_lat: null, store_lng: null } as any).not("id", "is", null);
      await supabase.from("delivery_zones").update({ distance_km: null, delivery_fee: 0 } as any).not("id", "is", null);
    }

    let remaining = 999;
    let totalProcessed = 0;
    let totalFailed = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 8;

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
      } catch (e) {
        consecutiveErrors++;
        const waitMs = Math.min(2000 * consecutiveErrors, 10000);
        setState({ message: `${totalProcessed} processados — reconectando (${consecutiveErrors})...` });
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          setState({ running: false, message: `❌ Muitos erros seguidos (${consecutiveErrors}). Tente novamente.` });
          break;
        }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (abortFlag) {
        setState({ running: false, message: "⏹️ Cancelado" });
        break;
      }

      // Handle error/timeout: retry instead of breaking
      if (error || !data?.success) {
        consecutiveErrors++;
        const waitMs = Math.min(2000 * consecutiveErrors, 10000);
        const errMsg = data?.error || "timeout/erro";
        console.warn(`Edge function error (${consecutiveErrors}):`, errMsg);
        setState({
          processed: totalProcessed,
          remaining,
          failed: totalFailed,
          message: `${totalProcessed} processados — retentando após erro... (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`,
        });
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          setState({ running: false, message: `❌ Muitos erros seguidos. Tente novamente.` });
          break;
        }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // Success — reset error counter
      consecutiveErrors = 0;
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
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const start = useCallback((recalcAll = false) => {
    runLoop(recalcAll);
  }, []);

  const cancel = useCallback(() => {
    abortFlag = true;
  }, []);

  return { state, start, cancel };
}
