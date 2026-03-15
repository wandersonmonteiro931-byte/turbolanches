/**
 * Brasília timezone utilities.
 * All date/time operations in the app MUST use these helpers
 * to ensure consistency with America/Sao_Paulo timezone.
 */

const TZ = "America/Sao_Paulo";

/** Returns a Date object representing the current Brasília time */
export function nowBrasilia(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
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
