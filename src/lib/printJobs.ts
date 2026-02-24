// Centralized, popup-blocker-safe printing helpers

export type PrintTipo = "cozinha" | "entrega" | "cliente";

export interface PrintJob {
  tipo: PrintTipo;
  /** Extra delay (ms) AFTER the print page is ready, before calling window.print() */
  delayMs?: number;
}

export interface PrintJobHandle {
  tipo: PrintTipo;
  delayMs?: number;
  w: Window;
}

export function preparePrintJobs(
  jobs: PrintJob[],
  onBlocked?: () => void
): PrintJobHandle[] {
  const handles: PrintJobHandle[] = [];

  for (const job of jobs) {
    const name = `print_${job.tipo}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const w = window.open("about:blank", name, "width=400,height=600");
    if (!w) {
      onBlocked?.();
      continue;
    }
    handles.push({ tipo: job.tipo, delayMs: job.delayMs, w });
  }

  return handles;
}

export function runPrintJobs(orderId: string, handles: PrintJobHandle[]) {
  for (const h of handles) {
    const delay = Math.max(0, Number(h.delayMs ?? 0));
    const qs = new URLSearchParams({ tipo: h.tipo });
    if (delay > 0) qs.set("delay", String(delay));

    h.w.location.href = `/admin/imprimir/${orderId}?${qs.toString()}`;
    try {
      h.w.focus();
    } catch {
      // ignore
    }
  }
}

export function cancelPrintJobs(handles: PrintJobHandle[]) {
  for (const h of handles) {
    try {
      h.w.close();
    } catch {
      // ignore
    }
  }
}
