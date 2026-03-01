/**
 * Business Day Logic
 * 
 * Orders placed until 03:00 AM are considered part of the PREVIOUS business day.
 * E.g., an order at 2026-03-02 01:30 belongs to business day 2026-03-01.
 * 
 * Business day range for a given date:
 *   Start: date at 03:00:00 (Brasília)
 *   End:   date+1 at 02:59:59.999 (Brasília)
 */

const BUSINESS_DAY_CUTOFF_HOUR = 3; // 3 AM

/**
 * Returns the business day (as a Date at midnight) for a given timestamp.
 * If the time is before 3 AM, it belongs to the previous calendar day.
 */
export function getBusinessDay(date: Date): Date {
  // Convert to Brasília time to check the hour
  const brasiliaStr = date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const brasilia = new Date(brasiliaStr);

  const result = new Date(brasilia);
  result.setHours(0, 0, 0, 0);

  if (brasilia.getHours() < BUSINESS_DAY_CUTOFF_HOUR) {
    result.setDate(result.getDate() - 1);
  }

  return result;
}

/**
 * Returns the UTC start and end timestamps for a business day.
 * 
 * For business day 2026-03-01:
 *   Start: 2026-03-01 03:00:00 Brasília (= UTC-3 → 2026-03-01 06:00:00 UTC)
 *   End:   2026-03-02 02:59:59.999 Brasília (= UTC-3 → 2026-03-02 05:59:59.999 UTC)
 */
export function getBusinessDayRange(selectedDate: Date): { start: string; end: string } {
  // We need to calculate based on Brasília timezone (UTC-3)
  // selectedDate is the business day (e.g., March 1st)
  
  // Start: selectedDate at 03:00 Brasília = selectedDate at 06:00 UTC
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const day = selectedDate.getDate();

  // Create dates in UTC, offset by +3 hours (Brasília = UTC-3)
  const start = new Date(Date.UTC(year, month, day, BUSINESS_DAY_CUTOFF_HOUR + 3, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, day + 1, BUSINESS_DAY_CUTOFF_HOUR + 3 - 1, 59, 59, 999));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Returns today's business day as a Date.
 */
export function getTodayBusinessDay(): Date {
  return getBusinessDay(new Date());
}

/**
 * Formats a date as the business day string (yyyy-MM-dd).
 */
export function formatBusinessDate(date: Date): string {
  const bd = getBusinessDay(date);
  const y = bd.getFullYear();
  const m = String(bd.getMonth() + 1).padStart(2, "0");
  const d = String(bd.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
