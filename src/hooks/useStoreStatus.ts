import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ScheduleDay {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

/** Get current Brasília time parts */
const getBrasiliaTime = () => {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const h = parts.find((p) => p.type === "hour")!.value;
  const m = parts.find((p) => p.type === "minute")!.value;
  const hhmm = `${h}:${m}`;

  // Day of week in Brasília
  const brDate = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  return { hhmm, dayOfWeek: brDate.getDay() };
};

export const useStoreStatus = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    const [settingsRes, scheduleRes] = await Promise.all([
      supabase
        .from("store_settings")
        .select("is_open, use_schedule, closed_at, opened_at")
        .limit(1)
        .single(),
      supabase
        .from("store_schedule")
        .select("day_of_week, open_time, close_time, is_closed")
        .order("day_of_week"),
    ]);

    const settings = settingsRes.data;
    const schedule = (scheduleRes.data || []) as ScheduleDay[];

    if (!settings) {
      setLoading(false);
      return;
    }

    const { hhmm, dayOfWeek } = getBrasiliaTime();
    const todaySchedule = schedule.find((s) => s.day_of_week === dayOfWeek);

    // Helper: did admin explicitly close/open recently (within last 12h)?
    const wasExplicitlyClosed = (): boolean => {
      if (!settings.closed_at) return false;
      const closedAt = new Date(settings.closed_at as string).getTime();
      const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
      return closedAt > twelveHoursAgo && settings.is_open === false;
    };

    const wasExplicitlyOpened = (): boolean => {
      if (!settings.opened_at) return false;
      const openedAt = new Date(settings.opened_at as string).getTime();
      const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
      return openedAt > twelveHoursAgo && settings.is_open === true;
    };

    if (todaySchedule) {
      // Day marked as closed
      if (todaySchedule.is_closed) {
        // Admin can explicitly open even on closed days
        setIsOpen(wasExplicitlyOpened());
        setLoading(false);
        return;
      }

      // Check if current time is within schedule window
      const openT = todaySchedule.open_time?.slice(0, 5);
      const closeT = todaySchedule.close_time?.slice(0, 5);

      let inTimeWindow = false;
      if (openT && closeT) {
        if (closeT <= openT) {
          // Crosses midnight (e.g., 18:00 - 00:00)
          inTimeWindow = hhmm >= openT || hhmm <= closeT;
        } else {
          inTimeWindow = hhmm >= openT && hhmm <= closeT;
        }
      }

      if (inTimeWindow) {
        // Within schedule: OPEN by default, unless admin explicitly closed
        setIsOpen(!wasExplicitlyClosed());
      } else {
        // Outside schedule: CLOSED by default, unless admin explicitly opened
        setIsOpen(wasExplicitlyOpened());
      }
    } else {
      // No schedule entry, fall back to manual toggle
      setIsOpen(settings.is_open);
    }

    setLoading(false);
  };

  useEffect(() => {
    checkStatus();

    const interval = setInterval(checkStatus, 60_000);

    const channel1 = supabase
      .channel("store-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "store_settings" }, () => checkStatus())
      .subscribe();

    const channel2 = supabase
      .channel("store-schedule-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "store_schedule" }, () => checkStatus())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, []);

  return { isOpen, loading };
};
