/**
 * Brasília timezone utilities.
 * All date/time operations in the app MUST use these helpers
 * to ensure consistency with America/Sao_Paulo timezone.
 *
 * The system synchronizes with an authoritative server time source on load,
 * so it does NOT rely on the local PC clock (which may be wrong/manipulated).
 */

const TZ = "America/Sao_Paulo";

// Offset (ms) between authoritative server time and local Date.now().
// serverNow = Date.now() + serverOffsetMs
let serverOffsetMs = 0;
let synced = false;
let syncPromise: Promise<void> | null = null;

/** Try to obtain authoritative UTC time (independent from PC clock). */
async function fetchAuthoritativeNow(): Promise<number | null> {
  // 1) Try worldtimeapi (returns ISO with TZ offset for São Paulo)
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch("https://worldtimeapi.org/api/timezone/America/Sao_Paulo", {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      if (j?.utc_datetime) return new Date(j.utc_datetime).getTime();
      if (j?.datetime) return new Date(j.datetime).getTime();
    }
  } catch { /* ignore */ }

  // 2) Fallback: HEAD to a reliable server and parse Date header
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch("https://www.google.com/generate_204", {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const dh = r.headers.get("date");
    if (dh) return new Date(dh).getTime();
  } catch { /* ignore */ }

  // 3) Last resort: use Supabase project endpoint Date header
  try {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL;
    if (url) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${url}/auth/v1/health`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const dh = r.headers.get("date");
      if (dh) return new Date(dh).getTime();
    }
  } catch { /* ignore */ }

  return null;
}

/** Sync the global clock offset with an authoritative source. */
export async function syncBrasiliaClock(): Promise<void> {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const t0 = Date.now();
    const serverUtc = await fetchAuthoritativeNow();
    const t1 = Date.now();
    if (serverUtc) {
      // Compensate roughly for round-trip latency
      const rtt = t1 - t0;
      const adjusted = serverUtc + Math.floor(rtt / 2);
      serverOffsetMs = adjusted - t1;
      synced = true;
    }
  })();
  try { await syncPromise; } finally { syncPromise = null; }
}

// Kick off sync immediately on module load (browser only)
if (typeof window !== "undefined") {
  syncBrasiliaClock();
  // Re-sync periodically (every 10 minutes) and when tab becomes visible
  setInterval(() => { syncPromise = null; syncBrasiliaClock(); }, 10 * 60 * 1000);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncPromise = null;
      syncBrasiliaClock();
    }
  });
}

/** Authoritative current UTC ms (independent of PC clock when synced). */
export function nowUtcMs(): number {
  return Date.now() + serverOffsetMs;
}

/** Returns true if the clock has been synced with an authoritative source. */
export function isClockSynced(): boolean {
  return synced;
}

/** Returns a Date object representing the authoritative current instant. */
export function nowBrasilia(): Date {
  return new Date(nowUtcMs());
}

/** Format a date string/Date to pt-BR with Brasília timezone */
export function formatDateTimeBR(date: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("pt-BR", { timeZone: TZ, ...opts });
}

/** Format time only (HH:mm) in Brasília */
export function formatTimeBR(date: string | Date | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** Format date only (dd/MM) in Brasília */
export function formatDateBR(date: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR", { timeZone: TZ, ...opts });
}

/** Format full clock HH:mm:ss in Brasília */
export function formatClockBR(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Format full date dd/MM/yyyy in Brasília */
export function formatFullDateBR(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
